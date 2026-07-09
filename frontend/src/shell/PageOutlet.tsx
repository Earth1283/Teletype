import { ErrorBoundary } from '../ErrorBoundary'
import Console from '../components/Console'
import PlayerList from '../components/PlayerList'
import ServerStats from '../components/ServerStats'
import FileManager from '../components/FileManager'
import GlancePage from '../components/GlancePage'
import ActionsPage from '../components/actions/ActionsPage'
import SettingsPage from '../components/SettingsPage'
import AuditPage from '../components/AuditPage'
import NetworkPage from '../components/NetworkPage'
import ProfilingPage from '../components/ProfilingPage'
import { TABS, type Tab } from './tabs'

/** Renders a single page's content for a tab id — shared by every shell. */
export function renderPage(id: Tab, onNavigate: (tab: Tab) => void) {
  switch (id) {
    case 'glance':    return <GlancePage />
    case 'console':   return <Console />
    case 'players':   return <PlayerList />
    case 'stats':     return <ServerStats onNavigate={t => onNavigate(t as Tab)} />
    case 'files':     return <FileManager />
    case 'actions':   return <ActionsPage />
    case 'audit':     return <AuditPage />
    case 'network':   return <NetworkPage />
    case 'profiling': return <ProfilingPage />
    case 'settings':  return <SettingsPage />
  }
}

export interface PageOutletProps {
  activeTab: Tab
  visitedTabs: Set<Tab>
  onNavigate: (tab: Tab) => void
}

/** Keep-alive stack: every visited tab stays mounted, hidden via display:none. */
export function PageOutlet({ activeTab, visitedTabs, onNavigate }: PageOutletProps) {
  return (
    <>
      {TABS.map(({ id, label }) => {
        if (!visitedTabs.has(id)) return null
        const active = id === activeTab
        return (
          <div key={id} style={{ display: active ? 'contents' : 'none' }}>
            <ErrorBoundary label={`${label} failed to render`}>
              {renderPage(id, onNavigate)}
            </ErrorBoundary>
          </div>
        )
      })}
    </>
  )
}
