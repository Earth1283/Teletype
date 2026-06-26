import { useState, useCallback, useEffect } from 'react'
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

export default function AppleShell() {
  const [tab, setTab]           = useState<Tab>('glance')
  const [moreOpen, setMoreOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { settings, update } = useSettings()
  const { connected } = useLogs()
  const toast = useToast()

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

  const disable = useCallback(() => {
    update({ appleify: false })
    toast.info('Appleify deactivated')
  }, [update, toast])

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY)
    api.post('/auth/logout').catch(() => {})
    window.location.reload()
  }

  return (
    <div className="appleify-root">
      {/* ── Floating pill navigation bar ───────────────────────── */}
      <header className="apple-nav-bar">
        <div className="apple-nav-pill">
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

      {/* ── Page content ───────────────────────────────────────── */}
      <main className="apple-main">
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

      {/* ── iOS Tab Bar ────────────────────────────────────────── */}
      <nav className="apple-tab-bar" aria-label="Navigation">
        {PRIMARY_TABS.map(tabId => {
          const t = TABS.find(t => t.id === tabId)!
          const active = tab === tabId
          return (
            <button
              key={tabId}
              type="button"
              className={`apple-tab-btn${active ? ' active' : ''}`}
              onClick={() => navigate(tabId)}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
            >
              <div className="apple-tab-icon"><t.Icon size={24} /></div>
              <span className="apple-tab-label">{t.label}</span>
            </button>
          )
        })}

        {/* More tab */}
        <button
          type="button"
          className={`apple-tab-btn${SECONDARY_TABS.includes(tab) ? ' active' : ''}`}
          onClick={() => setMoreOpen(o => !o)}
          aria-label="More"
          aria-expanded={moreOpen}
        >
          <div className="apple-tab-icon"><EllipsisCircle size={24} /></div>
          <span className="apple-tab-label">More</span>
        </button>
      </nav>

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
