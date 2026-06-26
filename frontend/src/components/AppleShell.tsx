import { useState, useCallback, useEffect, useRef } from 'react'
import { api, TOKEN_KEY } from '../api/client'
import { useSettings } from '../SettingsContext'
import { useLogs } from '../LogContext'
import { useToast } from '../ToastContext'
import { ErrorBoundary } from '../ErrorBoundary'
import Console from './Console'
import PlayerList from './PlayerList'
import ServerStats from './ServerStats'
import FileManager from './FileManager'
import GlancePage from './GlancePage'
import ActionsPage from './actions/ActionsPage'
import SettingsPage from './SettingsPage'
import AuditPage from './AuditPage'
import NetworkPage from './NetworkPage'
import CommandPalette from '../CommandPalette'
import {
  IconTerminal, IconUsers, IconCpu, IconFolder,
  IconLogOut, IconActivity, IconZap, IconSettings, IconList, IconNetwork,
  IconCommand,
} from '../Icons'

type Tab = 'glance' | 'console' | 'players' | 'stats' | 'files' | 'actions' | 'audit' | 'network' | 'settings'

const TABS: { id: Tab; label: string; Icon: React.FC<{ size?: number }>; iconColor: string }[] = [
  { id: 'glance',   label: 'Glance',   Icon: IconActivity, iconColor: 'apple-row-icon--blue'   },
  { id: 'console',  label: 'Console',  Icon: IconTerminal, iconColor: 'apple-row-icon--indigo' },
  { id: 'players',  label: 'Players',  Icon: IconUsers,    iconColor: 'apple-row-icon--green'  },
  { id: 'stats',    label: 'Stats',    Icon: IconCpu,      iconColor: 'apple-row-icon--purple' },
  { id: 'files',    label: 'Files',    Icon: IconFolder,   iconColor: 'apple-row-icon--orange' },
  { id: 'actions',  label: 'Actions',  Icon: IconZap,      iconColor: 'apple-row-icon--teal'   },
  { id: 'audit',    label: 'Audit',    Icon: IconList,     iconColor: 'apple-row-icon--indigo' },
  { id: 'network',  label: 'Network',  Icon: IconNetwork,  iconColor: 'apple-row-icon--blue'   },
  { id: 'settings', label: 'Settings', Icon: IconSettings, iconColor: ''                        },
]

const PRIMARY_TABS: Tab[]   = ['glance', 'console', 'players', 'actions']
const SECONDARY_TABS: Tab[] = ['stats', 'files', 'audit', 'network', 'settings']

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

export default function AppleShell() {
  const [tab, setTab]               = useState<Tab>('glance')
  const [moreOpen, setMoreOpen]     = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [pressingTab, setPressingTab] = useState<Tab | null>(null)
  const [pillsCollapsed, setPillsCollapsed] = useState(false)
  const { settings, update } = useSettings()
  const { connected } = useLogs()
  const toast = useToast()

  const mainRef      = useRef<HTMLElement>(null)
  const navPillRef   = useRef<HTMLDivElement>(null)
  const tabBarRef    = useRef<HTMLElement>(null)
  const lastTapRef   = useRef<{ id: Tab; time: number } | null>(null)
  const pressTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired    = useRef(false)

  const activeTab = TABS.find(t => t.id === tab)!

  useEffect(() => {
    if (!moreOpen) return
    document.body.classList.add('mobile-nav-open')
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', handler)
    return () => {
      document.body.classList.remove('mobile-nav-open')
      window.removeEventListener('keydown', handler)
    }
  }, [moreOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (settings.palette.enabled) setPaletteOpen(p => !p)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [settings.palette.enabled])

  const navigate = useCallback((t: Tab) => {
    setTab(t)
    setMoreOpen(false)
  }, [])

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

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY)
    api.post('/auth/logout').catch(() => {})
    window.location.reload()
  }

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
                onClick={() => setPaletteOpen(true)}
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
        <ErrorBoundary key={tab} label={`${activeTab.label} failed to render`}>
          {tab === 'glance'   && <GlancePage />}
          {tab === 'console'  && <Console />}
          {tab === 'players'  && <PlayerList />}
          {tab === 'stats'    && <ServerStats onNavigate={t => setTab(t as Tab)} />}
          {tab === 'files'    && <FileManager />}
          {tab === 'actions'  && <ActionsPage />}
          {tab === 'audit'    && <AuditPage />}
          {tab === 'network'  && <NetworkPage />}
          {tab === 'settings' && <SettingsPage />}
        </ErrorBoundary>
      </main>

      {/* ── Floating pill tab bar ──────────────────────────────── */}
      <nav
        ref={tabBarRef}
        className={`apple-tab-bar${pillsCollapsed ? ' apple-pill-hidden' : ''}`}
        aria-label="Navigation"
      >
        {PRIMARY_TABS.map(tabId => {
          const t      = TABS.find(t => t.id === tabId)!
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
            SECONDARY_TABS.includes(tab) ? 'active' : '',
          ].filter(Boolean).join(' ')}
          onPointerDown={() => setPressingTab('settings')}
          onPointerUp={handleTabUp}
          onPointerCancel={handleTabUp}
          onClick={() => { haptic(5); setMoreOpen(o => !o) }}
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
          {SECONDARY_TABS.map(tabId => {
            const t = TABS.find(t => t.id === tabId)!
            const active = tab === tabId
            return (
              <button
                key={tabId}
                type="button"
                className="apple-list-row"
                onClick={() => navigate(tabId)}
              >
                <div className={`apple-row-icon${active ? ' apple-row-icon--blue' : ` ${t.iconColor}`}`}>
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

          <button type="button" className="apple-list-row" onClick={signOut}>
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
        onNavigate={t => setTab(t as Tab)}
      />
    </div>
  )
}
