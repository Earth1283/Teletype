import { lazy, Suspense } from 'react'
import { ErrorBoundary } from '../ErrorBoundary'
import { Skeleton } from '../Skeleton'
import { PageActiveProvider } from './PageActivity'
import { TABS, type Tab } from './tabs'

const Console = lazy(() => import('../components/Console'))
const PlayerList = lazy(() => import('../components/PlayerList'))
const ServerStats = lazy(() => import('../components/ServerStats'))
const FileManager = lazy(() => import('../components/FileManager'))
const GlancePage = lazy(() => import('../components/GlancePage'))
const ActionsPage = lazy(() => import('../components/actions/ActionsPage'))
const SettingsPage = lazy(() => import('../components/SettingsPage'))
const AuditPage = lazy(() => import('../components/AuditPage'))
const NetworkPage = lazy(() => import('../components/NetworkPage'))
const ProfilingPage = lazy(() => import('../components/ProfilingPage'))

function pageContent(id: Tab, onNavigate: (tab: Tab) => void) {
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

function PageFallback() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }}>
      <Skeleton height={28} width="40%" />
      <Skeleton height={160} />
      <Skeleton height={160} />
    </div>
  )
}

/** Renders a single page's content for a tab id — shared by every shell. */
export function renderPage(id: Tab, onNavigate: (tab: Tab) => void, active = true) {
  return (
    <PageActiveProvider value={active}>
      <Suspense fallback={<PageFallback />}>
        {pageContent(id, onNavigate)}
      </Suspense>
    </PageActiveProvider>
  )
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
              {renderPage(id, onNavigate, active)}
            </ErrorBoundary>
          </div>
        )
      })}
    </>
  )
}
