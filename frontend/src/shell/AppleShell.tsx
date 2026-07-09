import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '../SettingsContext'
import { useToast } from '../ToastContext'
import { useShell } from './ShellKernel'
import { PageOutlet } from './PageOutlet'
import { PRIMARY_MOBILE_TABS, SECONDARY_MOBILE_TABS, tabDef, type Tab } from './tabs'
import CommandPalette from '../CommandPalette'
import { IconLogOut, IconCommand } from '../Icons'

const ROW_ICON_COLOR: Partial<Record<Tab, string>> = {
  glance: 'apple-row-icon--blue',
  console: 'apple-row-icon--indigo',
  players: 'apple-row-icon--green',
  stats: 'apple-row-icon--purple',
  files: 'apple-row-icon--orange',
  actions: 'apple-row-icon--teal',
  audit: 'apple-row-icon--indigo',
  network: 'apple-row-icon--blue',
  profiling: 'apple-row-icon--purple',
}

function EllipsisCircle({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="8"  cy="12" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg className="apple-chevron" width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true">
      <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Short haptic pattern — works on Android; silently no-ops on iOS/desktop
function haptic(pattern: VibratePattern = 6) {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

export default function AppleShell({ onLogout }: { onLogout: () => void }) {
  const {
    tab, setTab, visitedTabs, paletteOpen, setPaletteOpen, openPalette,
    mobileMoreOpen: moreOpen, setMobileMoreOpen: setMoreOpen, connected,
  } = useShell()
  const [pressingTab, setPressingTab] = useState<Tab | null>(null)
  const [pillsCollapsed, setPillsCollapsed] = useState(false)
  const { settings, update } = useSettings()
  const toast = useToast()

  const mainRef      = useRef<HTMLElement>(null)
  const navPillRef   = useRef<HTMLDivElement>(null)
  const tabBarRef    = useRef<HTMLElement>(null)
  const lastTapRef   = useRef<{ id: Tab; time: number } | null>(null)
  const pressTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired    = useRef(false)

  const activeTab = tabDef(tab)

  useEffect(() => {
    if (!moreOpen) return
    document.body.classList.add('mobile-nav-open')
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', handler)
    return () => {
      document.body.classList.remove('mobile-nav-open')
      window.removeEventListener('keydown', handler)
    }
  }, [moreOpen, setMoreOpen])

  const navigate = useCallback((t: Tab) => {
    setTab(t)
    setMoreOpen(false)
  }, [setTab, setMoreOpen])

  // Scroll whichever element inside <main> is scrolled, back to top
  const scrollToTop = useCallback(() => {
    if (!mainRef.current) return
    const els = Array.from(mainRef.current.querySelectorAll('*')) as HTMLElement[]
    for (const el of els) {
      if (el.scrollTop > 4) { el.scrollTo({ top: 0, behavior: 'smooth' }); return }
    }
  }, [])

  // Pointer down: start long-press timer (480ms), track pressing state
  const handleTabDown = useCallback((tabId: Tab) => {
    longFired.current = false
    setPressingTab(tabId)
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      longFired.current = true
      setPressingTab(null)
      haptic([8, 60, 14])       // stronger "thud" pattern for long press
      if (tabId === tab) scrollToTop()
    }, 480)
  }, [tab, scrollToTop])

  // Pointer up/cancel: clear timer, clear pressing state
  const handleTabUp = useCallback(() => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null }
    setPressingTab(null)
  }, [])

  // Click: haptic + double-tap detection + navigate
  const handleTabTap = useCallback((tabId: Tab) => {
    if (longFired.current) { longFired.current = false; return } // already handled by long press
    haptic(5)
    const now  = Date.now()
    const last = lastTapRef.current
    if (last?.id === tabId && now - last.time < 360) {
      // Double-tap: scroll to top (or close More sheet if already open)
      lastTapRef.current = null
      haptic([4, 30, 4])
      if (tabId === tab) scrollToTop()
      else navigate(tabId)
      return
    }
    lastTapRef.current = { id: tabId, time: now }
    navigate(tabId)
  }, [tab, navigate, scrollToTop])

  const disable = useCallback(() => {
    update({ appleify: false })
    toast.info('Appleify deactivated')
  }, [update, toast])

  const expandPills = useCallback(() => {
    setPillsCollapsed(false)
    haptic(6)
  }, [])

  // Swipe left/right on either pill → collapse both to dots
  useEffect(() => {
    if (pillsCollapsed) return
    const THRESHOLD = 55

    const addSwipe = (el: HTMLElement | null) => {
      if (!el) return () => {}
      let startX = 0, startY = 0, fired = false

      const onStart = (e: TouchEvent) => {
        startX = e.touches[0].clientX
        startY = e.touches[0].clientY
        fired = false
      }
      const onMove = (e: TouchEvent) => {
        if (fired) return
        const dx = Math.abs(e.touches[0].clientX - startX)
        const dy = Math.abs(e.touches[0].clientY - startY)
        if (dx > THRESHOLD && dx > dy * 1.5) {
          fired = true
          setPillsCollapsed(true)
          haptic([4, 40, 4])
        }
      }
      el.addEventListener('touchstart', onStart, { passive: true })
      el.addEventListener('touchmove',  onMove,  { passive: true })
      return () => {
        el.removeEventListener('touchstart', onStart)
        el.removeEventListener('touchmove',  onMove)
      }
    }

    const c1 = addSwipe(navPillRef.current)
    const c2 = addSwipe(tabBarRef.current)
    return () => { c1(); c2() }
  }, [pillsCollapsed])

  return (
    <div className="appleify-root">
      {/* ── Floating pill navigation bar ───────────────────────── */}
      <header className="apple-nav-bar">
        <div ref={navPillRef} className={`apple-nav-pill${pillsCollapsed ? ' apple-pill-hidden' : ''}`}>
          {/* Left — connection status */}
          <div className="apple-nav-left">
            {connected
              ? <div className="apple-live-badge"><span className="apple-live-dot" />Live</div>
              : <div className="apple-offline-badge">Offline</div>
            }
          </div>

          {/* Center — page title */}
          <span className="apple-nav-title">{activeTab.label}</span>

          {/* Right — palette button */}
          <div className="apple-nav-right">
            {settings.palette.enabled && (
              <button
                className="apple-nav-icon-btn"
                type="button"
                aria-label="Search"
                onClick={openPalette}
              >
                <IconCommand size={17} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Nav collapsed dot — tap to restore both pills */}
      {pillsCollapsed && (
        <button className="apple-nav-dot" onClick={expandPills} aria-label="Expand navigation">
          {connected
            ? <span className="apple-live-dot" style={{ width: 7, height: 7 }} />
            : <span className="apple-dot-gray" />}
        </button>
      )}

      {/* ── Page content ───────────────────────────────────────── */}
      <main className="apple-main" ref={mainRef}>
        <PageOutlet activeTab={tab} visitedTabs={visitedTabs} onNavigate={navigate} />
      </main>

      {/* ── Floating pill tab bar ──────────────────────────────── */}
      <nav
        ref={tabBarRef}
        className={`apple-tab-bar${pillsCollapsed ? ' apple-pill-hidden' : ''}`}
        aria-label="Navigation"
      >
        {PRIMARY_MOBILE_TABS.map(tabId => {
          const t      = tabDef(tabId)
          const active = tab === tabId
          return (
            <button
              key={tabId}
              type="button"
              className={[
                'apple-tab-btn',
                active          ? 'active'           : '',
                pressingTab === tabId ? 'apple-tab-pressing' : '',
              ].filter(Boolean).join(' ')}
              onPointerDown={() => handleTabDown(tabId)}
              onPointerUp={handleTabUp}
              onPointerCancel={handleTabUp}
              onClick={() => handleTabTap(tabId)}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
            >
              <div className="apple-tab-icon"><t.Icon size={22} /></div>
              <span className="apple-tab-label">{t.label}</span>
            </button>
          )
        })}

        {/* More tab — simpler: haptic + toggle, no double-tap needed */}
        <button
          type="button"
          className={[
            'apple-tab-btn',
            SECONDARY_MOBILE_TABS.includes(tab) ? 'active' : '',
          ].filter(Boolean).join(' ')}
          onPointerDown={() => setPressingTab('settings')}
          onPointerUp={handleTabUp}
          onPointerCancel={handleTabUp}
          onClick={() => { haptic(5); setMoreOpen(!moreOpen) }}
          aria-label="More"
          aria-expanded={moreOpen}
        >
          <div className="apple-tab-icon"><EllipsisCircle size={22} /></div>
          <span className="apple-tab-label">More</span>
        </button>
      </nav>

      {/* Tab collapsed dot — tap to restore both pills */}
      {pillsCollapsed && (
        <button className="apple-tab-dot" onClick={expandPills} aria-label="Expand tab bar">
          <activeTab.Icon size={20} />
        </button>
      )}

      {/* ── More sheet ─────────────────────────────────────────── */}
      {moreOpen && (
        <button
          type="button"
          className="apple-sheet-scrim"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
        />
      )}

      <div
        className={`apple-more-sheet${moreOpen ? ' open' : ''}`}
        aria-hidden={!moreOpen}
        role="dialog"
        aria-label="More options"
      >
        <div className="apple-sheet-handle" aria-hidden="true" />
        <div className="apple-sheet-header">
          <span className="apple-sheet-title">More</span>
        </div>

        {/* Secondary nav items */}
        <div className="apple-list-section">
          {SECONDARY_MOBILE_TABS.map(tabId => {
            const t = tabDef(tabId)
            const active = tab === tabId
            return (
              <button
                key={tabId}
                type="button"
                className="apple-list-row"
                onClick={() => navigate(tabId)}
              >
                <div className={`apple-row-icon${active ? ' apple-row-icon--blue' : ` ${ROW_ICON_COLOR[tabId] ?? ''}`}`}>
                  <t.Icon size={17} />
                </div>
                <span className={`apple-row-label${active ? ' apple-row-label--blue' : ''}`}>
                  {t.label}
                </span>
                <ChevronRight />
              </button>
            )
          })}
        </div>

        {/* Actions section */}
        <div className="apple-list-section">
          <button type="button" className="apple-list-row" onClick={disable}>
            <div className="apple-row-icon" style={{ fontSize: 17, background: 'rgba(0,122,255,0.10)' }}>
              🍎
            </div>
            <span className="apple-row-label">Disable Appleify</span>
            <ChevronRight />
          </button>

          <button type="button" className="apple-list-row" onClick={onLogout}>
            <div className="apple-row-icon apple-row-icon--red">
              <IconLogOut size={17} />
            </div>
            <span className="apple-row-label apple-row-label--red">Sign Out</span>
          </button>
        </div>
      </div>

      {/* ── Command palette ────────────────────────────────────── */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={setTab}
      />
    </div>
  )
}
