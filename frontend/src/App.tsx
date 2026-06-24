import { useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { api, TOKEN_KEY } from './api/client'
import { LogProvider } from './LogContext'
import { useContextMenu, type ContextMenuItem } from './ContextMenu'
import { ContextMenuProvider } from './ContextMenuProvider'
import { SettingsProvider, useSettings } from './SettingsContext'
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
import InsecureHttpBanner from './components/InsecureHttpBanner'
import type { Snippet } from './components/actions/actionTypes'
import { CONTEXT_WHEEL_ACTIONS } from './contextWheelActions'
import {
  TeletypeLogo, IconTerminal, IconUsers, IconCpu, IconFolder,
  IconLogOut, IconActivity, IconZap, IconSettings, IconList, IconNetwork,
  IconChevronLeft, IconChevronRight,
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
  const { settings } = useSettings()

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

  if (settings.fun) return <MacOSDesktop />

  return (
    <div className="shell">
      <PanelContextActions
        tab={tab}
        onNavigate={setTab}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <header className="mobile-header">
        <TeletypeLogo size={18} />
        <span className="mobile-header-title">Teletype</span>
        <span className="status-dot live" />
        <button
          className="sidebar-logout"
          title="Sign out"
          style={{ marginLeft: 'auto' }}
          onClick={() => { localStorage.removeItem(TOKEN_KEY); window.location.reload() }}
        >
          <IconLogOut size={14} />
        </button>
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
          <span className="status-dot live" />
          {sidebarOpen && <span className="status-label">server online</span>}
          {settings.palette.enabled && sidebarOpen && (
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
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={() => setSidebarOpen(o => !o)}
          >
            {sidebarOpen ? <IconChevronLeft size={13} /> : <IconChevronRight size={13} />}
          </button>
          <button className="sidebar-logout" title="Sign out" onClick={() => {
            localStorage.removeItem(TOKEN_KEY)
            window.location.reload()
          }}>
            <IconLogOut size={14} />
          </button>
        </div>
      </aside>

      <main className="main">
        {tab === 'glance'   && <GlancePage />}
        {tab === 'console'  && <Console />}
        {tab === 'players'  && <PlayerList />}
        {tab === 'stats'    && <ServerStats onNavigate={t => setTab(t as Tab)} />}
        {tab === 'files'    && <FileManager viewMode="list" />}
        {tab === 'actions'  && <ActionsPage />}
        {tab === 'audit'    && <AuditPage />}
        {tab === 'network'  && <NetworkPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>

      <nav className="mobile-nav">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`mobile-nav-btn${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
            title={label}
          >
            <Icon size={20} />
            <span className="mobile-nav-label">{label}</span>
          </button>
        ))}
      </nav>

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
            <InsecureHttpBanner />
            {authed ? <MainApp /> : <AuthSetup onAuth={() => setAuthed(true)} />}
          </ContextMenuProvider>
        </LogProvider>
      </SettingsProvider>
    </QueryClientProvider>
  )
}
