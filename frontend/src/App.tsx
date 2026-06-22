import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TOKEN_KEY } from './api/client'
import { LogProvider } from './LogContext'
import { SettingsProvider, useSettings } from './SettingsContext'
import AuthSetup from './components/AuthSetup'
import Console from './components/Console'
import PlayerList from './components/PlayerList'
import ServerStats from './components/ServerStats'
import FileManager from './components/FileManager'
import GlancePage from './components/GlancePage'
import ActionsPage from './components/actions/ActionsPage'
import SettingsPage from './components/SettingsPage'
import CommandPalette from './CommandPalette'
import {
  TeletypeLogo, IconTerminal, IconUsers, IconCpu, IconFolder,
  IconLogOut, IconActivity, IconZap, IconSettings,
} from './Icons'

const qc = new QueryClient()

type Tab = 'glance' | 'console' | 'players' | 'stats' | 'files' | 'actions' | 'settings'

const TABS: { id: Tab; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: 'glance',   label: 'Glance',   Icon: IconActivity  },
  { id: 'console',  label: 'Console',  Icon: IconTerminal  },
  { id: 'players',  label: 'Players',  Icon: IconUsers     },
  { id: 'stats',    label: 'Stats',    Icon: IconCpu       },
  { id: 'files',    label: 'Files',    Icon: IconFolder    },
  { id: 'actions',  label: 'Actions',  Icon: IconZap       },
  { id: 'settings', label: 'Settings', Icon: IconSettings  },
]

function MainApp() {
  const [tab, setTab] = useState<Tab>('glance')
  const [paletteOpen, setPaletteOpen] = useState(false)
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

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <TeletypeLogo />
          <span className="sidebar-logo-text">Teletype</span>
        </div>

        <nav className="sidebar-nav">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-btn${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot live" />
          <span className="status-label">server online</span>
          {settings.palette.enabled && (
            <button
              className="sidebar-palette-hint"
              onClick={() => setPaletteOpen(true)}
              title="Command palette (⌘K)"
            >
              ⌘K
            </button>
          )}
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
        {tab === 'stats'    && <ServerStats />}
        {tab === 'files'    && <FileManager />}
        {tab === 'actions'  && <ActionsPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>

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
        <LogProvider>
          {authed ? <MainApp /> : <AuthSetup onAuth={() => setAuthed(true)} />}
        </LogProvider>
      </SettingsProvider>
    </QueryClientProvider>
  )
}
