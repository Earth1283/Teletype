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
  IconChevronLeft, IconChevronRight, IconCommand, IconDots,
} from './Icons'

const qc = new QueryClient()

function ThemeApplier() {
  const { settings } = useSettings()
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme ?? DEFAULT_THEME_ID
  }, [settings.theme])
  return null
}

type Tab = 'glance' | 'console' | 'players' | 'stats' | 'files' | 'actions' | 'audit' | 'network' | 'settings'

const TABS: { id: Tab; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: 'glance',   label: 'Glance',   Icon: IconActivity  },
  { id: 'console',  label: 'Console',  Icon: IconTerminal  },
  { id: 'players',  label: 'Players',  Icon: IconUsers     },
  { id: 'stats',    label: 'Stats',    Icon: IconCpu       },
  { id: 'files',    label: 'Files',    Icon: IconFolder    },
  { id: 'actions',  label: 'Actions',  Icon: IconZap       },
  { id: 'audit',    label: 'Audit',    Icon: IconList      },
  { id: 'network',  label: 'Network',  Icon: IconNetwork   },
  { id: 'settings', label: 'Settings', Icon: IconSettings  },
]

const PRIMARY_MOBILE_TABS: Tab[] = ['glance', 'console', 'players', 'actions']
const SECONDARY_MOBILE_TABS: Tab[] = ['stats', 'files', 'audit', 'network', 'settings']

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

function MainApp() {
  const [tab, setTab] = useState<Tab>('glance')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [tpsHistory, setTpsHistory] = useState<number[]>([])
  const { settings, update } = useSettings()
  const { connected } = useLogs()
  const activeTab = TABS.find(t => t.id === tab)
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia('(hover: none) and (pointer: coarse)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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
    if (isMobile && settings.fun) update({ fun: false })
    if (!isMobile && settings.appleify) update({ appleify: false })
  }, [isMobile, settings.fun, settings.appleify, update])

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

  if (settings.fun && !isMobile) return <MacOSDesktop />
  if (settings.appleify && isMobile) return <AppleShell />

  return (
    <div className="shell">
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
                <button className="sidebar-logout" title="Sign out" onClick={() => {
                  localStorage.removeItem(TOKEN_KEY)
                  window.location.reload()
                }}>
                  <IconLogOut size={14} />
                </button>
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
              <button className="sidebar-logout" title="Sign out" onClick={() => {
                localStorage.removeItem(TOKEN_KEY)
                window.location.reload()
              }}>
                <IconLogOut size={14} />
              </button>
            </>
          )}
        </div>
      </aside>

      <main className="main">
        <ErrorBoundary key={tab} label={`${activeTab?.label ?? 'Page'} failed to render`}>
          <div className="page-content" style={{ display: 'contents' }}>
            {tab === 'glance'   && <GlancePage />}
            {tab === 'console'  && <Console />}
            {tab === 'players'  && <PlayerList />}
            {tab === 'stats'    && <ServerStats onNavigate={t => setTab(t as Tab)} />}
            {tab === 'files'    && <FileManager />}
            {tab === 'actions'  && <ActionsPage />}
            {tab === 'audit'    && <AuditPage />}
            {tab === 'network'  && <NetworkPage />}
            {tab === 'settings' && <SettingsPage />}
          </div>
        </ErrorBoundary>
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
            onClick={() => { localStorage.removeItem(TOKEN_KEY); window.location.reload() }}
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
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(TOKEN_KEY))

  return (
    <QueryClientProvider client={qc}>
      <SettingsProvider>
        <ThemeApplier />
        <LogProvider>
          <ContextMenuProvider>
            <ToastProvider>
              <InsecureHttpBanner />
              {authed ? <MainApp /> : <AuthSetup onAuth={() => setAuthed(true)} />}
            </ToastProvider>
          </ContextMenuProvider>
        </LogProvider>
      </SettingsProvider>
    </QueryClientProvider>
  )
}
