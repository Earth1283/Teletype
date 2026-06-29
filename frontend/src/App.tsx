import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { api, TOKEN_KEY } from './api/client'
import { LogProvider, useLogs } from './LogContext'
import { useContextMenu, type ContextMenuItem } from './ContextMenu'
import { ContextMenuProvider } from './ContextMenuProvider'
import { SettingsProvider, useSettings } from './SettingsContext'
import { ToastProvider } from './ToastContext'
import { ErrorBoundary } from './ErrorBoundary'
import { DEFAULT_THEME_ID } from './themes'
import AuthSetup from './components/AuthSetup'
import Console from './components/Console'
import PlayerList from './components/PlayerList'
import ServerStats from './components/ServerStats'
import FileManager from './components/FileManager'
import GlancePage from './components/GlancePage'
import ActionsPage from './components/actions/ActionsPage'
import SettingsPage from './components/SettingsPage'
import AuditPage from './components/AuditPage'
import NetworkPage from './components/NetworkPage'
import ProfilingPage from './components/ProfilingPage'
import CommandPalette from './CommandPalette'
import MacOSDesktop from './components/MacOSDesktop'
import AppleShell from './components/AppleShell'
import InsecureHttpBanner from './components/InsecureHttpBanner'
import type { Snippet } from './components/actions/actionTypes'
import { CONTEXT_WHEEL_ACTIONS } from './contextWheelActions'
import { useToast } from './ToastContext'
import {
  TeletypeLogo, IconTerminal, IconUsers, IconCpu, IconFolder,
  IconLogOut, IconActivity, IconZap, IconSettings, IconList, IconNetwork,
  IconChevronLeft, IconChevronRight, IconCommand, IconDots, IconFlightRecorder,
} from './Icons'

function ThemeApplier() {
  const { settings } = useSettings()
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme ?? DEFAULT_THEME_ID
  }, [settings.theme])
  return null
}

type Tab = 'glance' | 'console' | 'players' | 'stats' | 'files' | 'actions' | 'audit' | 'network' | 'profiling' | 'settings'

const TABS: { id: Tab; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: 'glance',    label: 'Glance',    Icon: IconActivity        },
  { id: 'console',   label: 'Console',   Icon: IconTerminal        },
  { id: 'players',   label: 'Players',   Icon: IconUsers           },
  { id: 'stats',     label: 'Stats',     Icon: IconCpu             },
  { id: 'files',     label: 'Files',     Icon: IconFolder          },
  { id: 'actions',   label: 'Actions',   Icon: IconZap             },
  { id: 'audit',     label: 'Audit',     Icon: IconList            },
  { id: 'network',   label: 'Network',   Icon: IconNetwork         },
  { id: 'profiling', label: 'Profiling', Icon: IconFlightRecorder  },
  { id: 'settings',  label: 'Settings',  Icon: IconSettings        },
]

const PRIMARY_MOBILE_TABS: Tab[] = ['glance', 'console', 'players', 'actions']
const SECONDARY_MOBILE_TABS: Tab[] = ['stats', 'files', 'audit', 'network', 'profiling', 'settings']
const PHONE_VIEWPORT_QUERY = '(max-width: 640px)'
const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)'
const MAX_PHONE_SCREEN_SIDE = 500
const MAX_PHONE_SCREEN_LONG_SIDE = 1000

function hasTouchInput() {
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window
}

function hasMobileUserAgentData() {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  return nav.userAgentData?.mobile === true
}

function hasPhoneUserAgent() {
  const ua = navigator.userAgent
  return /\b(iPhone|iPod)\b/i.test(ua)
    || (/\bAndroid\b/i.test(ua) && /\bMobile\b/i.test(ua))
    || /\b(IEMobile|Windows Phone|BlackBerry|BB10|Opera Mini)\b/i.test(ua)
}

function getIsPhoneViewport() {
  if (hasPhoneUserAgent() || hasMobileUserAgentData()) return true
  if (window.matchMedia(PHONE_VIEWPORT_QUERY).matches) return true

  const shortSide = Math.min(window.screen.width, window.screen.height)
  const longSide = Math.max(window.screen.width, window.screen.height)
  // Guard: zero means unreported dimensions (some headless/embedded envs) — not a phone
  if (shortSide <= 0) return false
  const hasPhoneSizedScreen = shortSide <= MAX_PHONE_SCREEN_SIDE && longSide <= MAX_PHONE_SCREEN_LONG_SIDE
  return hasTouchInput()
    && window.matchMedia(COARSE_POINTER_QUERY).matches
    && hasPhoneSizedScreen
}

function useIsPhoneViewport() {
  const [isPhoneViewport, setIsPhoneViewport] = useState(getIsPhoneViewport)

  useEffect(() => {
    const phoneMq = window.matchMedia(PHONE_VIEWPORT_QUERY)
    const pointerMq = window.matchMedia(COARSE_POINTER_QUERY)
    const update = () => setIsPhoneViewport(getIsPhoneViewport())

    update()
    phoneMq.addEventListener('change', update)
    pointerMq.addEventListener('change', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)

    return () => {
      phoneMq.removeEventListener('change', update)
      pointerMq.removeEventListener('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return isPhoneViewport
}

// Heartbeat sparkline: renders last N TPS readings as a miniature SVG line
function TpsSparkline({ tpsHistory }: { tpsHistory: number[] }) {
  if (tpsHistory.length < 2) return null
  const W = 60, H = 16, PAD = 1
  const min = 0, max = 20
  const pts = tpsHistory.slice(-20)
  const xStep = (W - PAD * 2) / (pts.length - 1)
  const toY = (v: number) => PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2)
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(PAD + i * xStep).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  const lastTps = pts[pts.length - 1]
  const lineColor = lastTps >= 19 ? 'var(--green)' : lastTps >= 15 ? 'var(--amber)' : 'var(--red)'

  return (
    <svg
      className="tps-sparkline"
      width={W} height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-label={`TPS ${lastTps.toFixed(1)}`}
    >
      <path d={d} fill="none" stroke={lineColor} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PanelContextActions({ tab, onNavigate, onOpenPalette }: {
  tab: Tab
  onNavigate: (tab: Tab) => void
  onOpenPalette: () => void
}) {
  const { setFallbackContextMenu } = useContextMenu()
  const { settings } = useSettings()
  const { data: snippets = [] } = useQuery<Snippet[]>({
    queryKey: ['snippets'],
    queryFn: () => api.get('/actions/snippets').then(r => r.data),
    staleTime: 60_000,
  })

  const items = useMemo<ContextMenuItem[]>(() => {
    const selected = settings.contextWheel.actions.length > 0
      ? settings.contextWheel.actions
      : CONTEXT_WHEEL_ACTIONS.map(a => a.id)
    const quickActions = snippets.filter(s => s.categoryId === 'quick-actions')

    const next = selected.flatMap<ContextMenuItem>(id => {
      if (id === 'palette') {
        return [{ label: 'Command Palette', shortcut: '⌘K', action: onOpenPalette }]
      }
      if (id === 'quick-actions') {
        return quickActions.map(snippet => ({
          label: snippet.name,
          action: () => {
            if (snippet.vars.length > 0) {
              onNavigate('actions')
            } else {
              api.post(`/actions/execute/${snippet.id}`, { vars: {} }).catch(() => {})
            }
          },
        }))
      }
      const tabDef = TABS.find(t => t.id === id)
      if (!tabDef) return []
      return [{
        label: `Open ${tabDef.label}`,
        disabled: tab === tabDef.id,
        action: () => onNavigate(tabDef.id),
      }]
    })

    return next
  }, [onNavigate, onOpenPalette, settings.contextWheel.actions, snippets, tab])

  useEffect(() => {
    setFallbackContextMenu(items)
    return () => setFallbackContextMenu([])
  }, [items, setFallbackContextMenu])

  return null
}

function LogoutButton({ onLogout, className = 'sidebar-logout', title = 'Sign out', size = 14 }: {
  onLogout: () => void
  className?: string
  title?: string
  size?: number
}) {
  return (
    <button className={className} title={title} onClick={onLogout}>
      <IconLogOut size={size} />
    </button>
  )
}

function MainApp({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('glance')
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set<Tab>(['glance']))
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [tpsHistory, setTpsHistory] = useState<number[]>([])
  const [forceMobile, setForceMobile] = useState(false)
  const { settings, update } = useSettings()
  const { connected } = useLogs()
  const isPhoneViewport = useIsPhoneViewport()

  // Poll current TPS for sparkline
  const { data: glanceCurrent } = useQuery<{ tps1: number }>({
    queryKey: ['glance-current'],
    queryFn: () => api.get('/glance/current').then(r => r.data),
    refetchInterval: 5000,
  })
  useEffect(() => {
    if (glanceCurrent?.tps1 != null) {
      setTpsHistory(h => [...h.slice(-19), glanceCurrent.tps1])
    }
  }, [glanceCurrent])

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

  useEffect(() => {
    if (!mobileMoreOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMoreOpen(false)
    }
    document.body.classList.add('mobile-nav-open')
    window.addEventListener('keydown', handler)
    return () => {
      document.body.classList.remove('mobile-nav-open')
      window.removeEventListener('keydown', handler)
    }
  }, [mobileMoreOpen])

  useEffect(() => {
    setVisitedTabs(prev => prev.has(tab) ? prev : new Set([...prev, tab]))
  }, [tab])

  useEffect(() => {
    if (isPhoneViewport && settings.fun) update({ fun: false })
  }, [isPhoneViewport, settings.fun, update])

  const tapCountRef = useRef(0)
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toast = useToast()

  const handleLogoTap = useCallback(() => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
    tapCountRef.current += 1
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0
      update({ appleify: true })
      toast.success('Appleify activated')
    } else {
      tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0 }, 2000)
    }
  }, [update, toast])

  const openPalette = () => {
    setMobileMoreOpen(false)
    setPaletteOpen(true)
  }

  if (settings.fun && !isPhoneViewport) return <MacOSDesktop />
  if (settings.appleify) return <AppleShell />

  return (
    <div className={`shell${forceMobile ? ' force-mobile' : ''}`}>
      <PanelContextActions
        tab={tab}
        onNavigate={setTab}
        onOpenPalette={openPalette}
      />
      <header className="mobile-header">
        <button
          type="button"
          className="mobile-brand"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'default', WebkitTapHighlightColor: 'transparent' }}
          onClick={handleLogoTap}
          aria-label="Teletype"
        >
          <TeletypeLogo size={17} />
          <span className="mobile-brand-name">Teletype</span>
        </button>
        <span className={`mobile-status-chip${connected ? ' live' : ''}`}>
          <span className="mobile-status-dot" />
          {connected ? 'online' : 'offline'}
        </span>
        {forceMobile && (
          <button
            className="mobile-quick-btn"
            type="button"
            title="Exit mobile view"
            aria-label="Exit mobile view"
            onClick={() => setForceMobile(false)}
          >
            🖥️
          </button>
        )}
        {!isPhoneViewport && !forceMobile && (
          <button
            className="mobile-quick-btn force-mobile-btn"
            type="button"
            title="Switch to mobile view"
            aria-label="Switch to mobile view"
            onClick={() => setForceMobile(true)}
          >
            📱
          </button>
        )}
        {settings.palette.enabled && (
          <button
            className="mobile-quick-btn"
            type="button"
            title="Command palette"
            aria-label="Open command palette"
            onClick={openPalette}
          >
            <IconCommand size={17} />
          </button>
        )}
      </header>

      <aside className={`sidebar${sidebarOpen ? '' : ' collapsed'}`}>
        <div className="sidebar-logo">
          <TeletypeLogo />
          {sidebarOpen && <span className="sidebar-logo-text">Teletype</span>}
        </div>

        <nav className="sidebar-nav">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-btn${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
              title={!sidebarOpen ? label : undefined}
            >
              <Icon size={15} />
              {sidebarOpen && <span className="nav-label">{label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {sidebarOpen ? (
            <>
              <div className="footer-status">
                <span className={`status-dot${connected ? ' live' : ' offline'}`} />
                <span className="status-label">{connected ? 'connected' : 'offline'}</span>
                <TpsSparkline tpsHistory={tpsHistory} />
              </div>
              <div className="footer-controls">
                {settings.palette.enabled && (
                  <button
                    className="sidebar-palette-hint"
                    onClick={() => setPaletteOpen(true)}
                    title="Command palette (⌘K)"
                  >
                    ⌘K
                  </button>
                )}
                <button
                  className="sidebar-collapse-btn"
                  title="Collapse sidebar"
                  onClick={() => setSidebarOpen(o => !o)}
                >
                  <IconChevronLeft size={13} />
                </button>
                <LogoutButton onLogout={onLogout} />
              </div>
            </>
          ) : (
            <>
              <span className={`status-dot${connected ? ' live' : ' offline'}`} />
              <button
                className="sidebar-collapse-btn"
                title="Expand sidebar"
                onClick={() => setSidebarOpen(o => !o)}
              >
                <IconChevronRight size={13} />
              </button>
              <LogoutButton onLogout={onLogout} />
            </>
          )}
        </div>
      </aside>

      <main className="main">
        {TABS.map(({ id, label }) => {
          if (!visitedTabs.has(id)) return null
          const active = id === tab
          return (
            <div key={id} style={{ display: active ? 'contents' : 'none' }}>
              <ErrorBoundary label={`${label} failed to render`}>
                {id === 'glance'   && <GlancePage />}
                {id === 'console'  && <Console />}
                {id === 'players'  && <PlayerList />}
                {id === 'stats'    && <ServerStats onNavigate={t => setTab(t as Tab)} />}
                {id === 'files'    && <FileManager />}
                {id === 'actions'  && <ActionsPage />}
                {id === 'audit'    && <AuditPage />}
                {id === 'network'   && <NetworkPage />}
                {id === 'profiling' && <ProfilingPage />}
                {id === 'settings'  && <SettingsPage />}
              </ErrorBoundary>
            </div>
          )
        })}
      </main>

      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        {PRIMARY_MOBILE_TABS.map(tabId => {
          const t = TABS.find(t => t.id === tabId)!
          return (
            <button
              key={tabId}
              type="button"
              className={`mobile-tab-btn${tab === tabId ? ' active' : ''}`}
              onClick={() => { setTab(tabId); setMobileMoreOpen(false) }}
            >
              <t.Icon size={22} />
              <span className="mobile-tab-label">{t.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          className={`mobile-tab-btn${SECONDARY_MOBILE_TABS.includes(tab) ? ' active' : ''}`}
          onClick={() => setMobileMoreOpen(o => !o)}
        >
          <IconDots size={22} />
          <span className="mobile-tab-label">More</span>
        </button>
      </nav>

      {mobileMoreOpen && (
        <button
          type="button"
          className="mobile-sheet-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileMoreOpen(false)}
        />
      )}
      <div className={`mobile-more-sheet${mobileMoreOpen ? ' open' : ''}`} aria-hidden={!mobileMoreOpen}>
        <div className="mobile-sheet-handle" aria-hidden="true" />
        <div className="mobile-sheet-list">
          {SECONDARY_MOBILE_TABS.map(tabId => {
            const t = TABS.find(t => t.id === tabId)!
            return (
              <button
                key={tabId}
                type="button"
                className={`mobile-sheet-item${tab === tabId ? ' active' : ''}`}
                onClick={() => { setTab(tabId); setMobileMoreOpen(false) }}
              >
                <t.Icon size={20} />
                <span className="mobile-sheet-item-label">{t.label}</span>
                {tab === tabId && <span className="mobile-sheet-active-dot" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        <div className="mobile-sheet-footer">
          <button
            type="button"
            className="mobile-sheet-signout"
            onClick={onLogout}
          >
            <IconLogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(t) => setTab(t as Tab)}
      />
    </div>
  )
}

export default function App() {
  const [qc] = useState(() => new QueryClient())
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(TOKEN_KEY))

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    qc.clear()
    setAuthed(false)
  }, [qc])

  return (
    <QueryClientProvider client={qc}>
      <SettingsProvider>
        <ThemeApplier />
        <LogProvider>
          <ContextMenuProvider>
            <ToastProvider>
              <InsecureHttpBanner />
              {authed ? <MainApp onLogout={handleLogout} /> : <AuthSetup onAuth={() => setAuthed(true)} />}
            </ToastProvider>
          </ContextMenuProvider>
        </LogProvider>
      </SettingsProvider>
    </QueryClientProvider>
  )
}
