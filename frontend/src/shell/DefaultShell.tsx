import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useToast } from '../ToastContext'
import type { Snippet } from '../components/actions/actionTypes'
import { useSettings } from '../SettingsContext'
import { useShell } from './ShellKernel'
import { PageOutlet } from './PageOutlet'
import { TABS, PRIMARY_MOBILE_TABS, SECONDARY_MOBILE_TABS, tabDef, type Tab } from './tabs'
import { Tabs, cx } from '../design'
import CommandPalette from '../CommandPalette'
import KeyboardHelp from '../components/KeyboardHelp'
import {
  TeletypeLogo, IconLogOut, IconChevronLeft, IconChevronRight, IconCommand, IconDots,
  IconSearch, IconZap,
} from '../Icons'

function LogoutButton({ onLogout }: { onLogout: () => void }) {
  return (
    <button
      className="flex h-7 w-7 items-center justify-center rounded-sm text-text-muted transition-colors hover:text-status-critical hover:bg-status-critical/10"
      title="Sign out"
      onClick={onLogout}
    >
      <IconLogOut size={14} />
    </button>
  )
}

/* Up to three parameterless quick-action snippets, one click from anywhere */
function TopbarQuickActions() {
  const toast = useToast()
  const { data: snippets = [] } = useQuery<Snippet[]>({
    queryKey: ['snippets'],
    queryFn: () => api.get('/actions/snippets').then(r => r.data),
    staleTime: 60_000,
  })
  const pinned = snippets.filter(s => s.categoryId === 'quick-actions' && s.vars.length === 0).slice(0, 3)
  if (pinned.length === 0) return null
  return (
    <span className="flex items-center gap-1.5">
      {pinned.map(s => (
        <button
          key={s.id}
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 font-sans text-[11.5px] text-text-secondary transition-colors hover:border-accent/50 hover:text-accent"
          title={s.cmds[0]}
          onClick={() => {
            api.post(`/actions/execute/${s.id}`, { vars: {} })
              .then(() => toast.success(s.name))
              .catch(() => toast.error(`${s.name} failed`))
          }}
        >
          <IconZap size={11} />
          <span className="max-w-[110px] truncate">{s.name}</span>
        </button>
      ))}
    </span>
  )
}

function TpsSparkline({ history }: { history: number[] }) {
  const w = 52
  const h = 16
  const pts = history.length > 1 ? history : [20, 20]
  const min = Math.min(...pts, 15)
  const max = Math.max(...pts, 20)
  const span = max - min || 1
  const points = pts
    .map((v, i) => `${((i / (pts.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={w} height={h} aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function DefaultShell({ onLogout }: { onLogout: () => void }) {
  const { settings } = useSettings()
  const {
    tab, setTab, visitedTabs, paletteOpen, setPaletteOpen, openPalette,
    helpOpen, setHelpOpen, mobileMoreOpen, setMobileMoreOpen,
    forceMobile, setForceMobile, isPhoneViewport, connected, tpsHistory, onLogoTap,
  } = useShell()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const lastTps = tpsHistory[tpsHistory.length - 1]

  const navItems = useMemo(() => TABS.map((t, i) => ({
    id: t.id,
    label: sidebarOpen ? t.label : '',
    icon: <t.Icon size={15} />,
    hint: `Alt+${i === 9 ? 0 : i + 1}`,
  })), [sidebarOpen])

  return (
    <div className={cx('shell flex h-full w-full bg-void', forceMobile && 'force-mobile')}>
      {/* ── Mobile header ─────────────────────────────────────────────── */}
      <header className="mobile-header fixed inset-x-0 top-0 z-mobile-header flex h-12 items-center gap-3 border-b border-border bg-surface px-3 sm:hidden">
        <button
          type="button"
          className="flex items-center gap-2 bg-transparent border-none p-0"
          onClick={onLogoTap}
          aria-label="Teletype"
        >
          <TeletypeLogo size={17} />
          <span className="font-sans text-[13px] font-semibold text-text-primary">Teletype</span>
        </button>
        <span
          className={cx(
            'ml-auto flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide',
            connected ? 'border-live/30 text-live' : 'border-border text-text-muted',
          )}
        >
          <span className={cx('h-1.5 w-1.5 rounded-full', connected ? 'bg-live animate-[blink_2s_steps(1)_infinite]' : 'bg-text-muted')} />
          {connected ? 'online' : 'offline'}
        </span>
        {forceMobile && (
          <button
            className="flex h-7 w-7 items-center justify-center rounded-sm text-text-secondary"
            title="Exit mobile view"
            aria-label="Exit mobile view"
            onClick={() => setForceMobile(false)}
          >
            🖥️
          </button>
        )}
        {!isPhoneViewport && !forceMobile && (
          <button
            className="force-mobile-btn flex h-7 w-7 items-center justify-center rounded-sm text-text-secondary"
            title="Switch to mobile view"
            aria-label="Switch to mobile view"
            onClick={() => setForceMobile(true)}
          >
            📱
          </button>
        )}
        {settings.palette.enabled && (
          <button
            className="flex h-7 w-7 items-center justify-center rounded-sm text-text-secondary"
            title="Command palette"
            aria-label="Open command palette"
            onClick={openPalette}
          >
            <IconCommand size={17} />
          </button>
        )}
      </header>

      {/* ── Desktop sidebar ───────────────────────────────────────────── */}
      <aside
        className={cx(
          'sidebar hidden sm:flex sticky top-0 z-sidebar h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150',
          sidebarOpen ? 'w-[204px]' : 'w-[52px]',
        )}
      >
        <div className={cx('flex items-center gap-2 px-4 py-4', !sidebarOpen && 'justify-center px-0')}>
          <TeletypeLogo />
          {sidebarOpen && <span className="font-sans text-[14px] font-semibold text-text-primary">Teletype</span>}
        </div>

        <Tabs
          items={navItems}
          active={tab}
          onChange={setTab}
          className={cx('flex-1 overflow-y-auto px-2', !sidebarOpen && 'items-stretch px-1.5')}
        />

        <div className={cx('flex items-center p-3', sidebarOpen ? 'justify-between' : 'justify-center px-1.5')}>
          {sidebarOpen && settings.palette.enabled && (
            <button
              className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-muted hover:border-border-hi hover:text-text-secondary"
              onClick={() => setPaletteOpen(true)}
              title="Command palette (⌘K)"
            >
              ⌘K
            </button>
          )}
          <button
            className="flex h-6 w-6 items-center justify-center rounded-sm text-text-muted hover:bg-surface-raised hover:text-text-secondary"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <IconChevronLeft size={13} /> : <IconChevronRight size={13} />}
          </button>
        </div>
      </aside>

      {/* ── Desktop column: cockpit strip + page ──────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="topbar hidden h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:flex">
          <h1 className="font-sans text-[13px] font-semibold text-text-primary">{tabDef(tab).label}</h1>

          <div className="flex-1" />

          <TopbarQuickActions />

          {settings.palette.enabled && (
            <button
              type="button"
              className="flex h-8 w-[280px] items-center gap-2 rounded-md border border-border bg-void px-3 text-left font-sans text-[12px] text-text-muted transition-colors hover:border-border-hi hover:text-text-secondary"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
            >
              <IconSearch size={13} />
              <span className="flex-1 truncate">Search or run a command</span>
              <kbd className="rounded-sm border border-border px-1 font-mono text-[10px]">⌘K</kbd>
            </button>
          )}

          <span
            className="flex h-8 items-center gap-2 rounded-md border border-border px-2.5"
            title="TPS, last 100 seconds"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">tps</span>
            <TpsSparkline history={tpsHistory} />
            <span className="font-mono text-[12px] tabular-nums text-text-primary">
              {lastTps != null ? lastTps.toFixed(1) : '—'}
            </span>
          </span>

          <span
            className={cx(
              'flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide',
              connected ? 'border-live/30 text-live' : 'border-border text-text-muted',
            )}
          >
            <span className={cx('h-1.5 w-1.5 rounded-full', connected ? 'bg-live animate-[blink_2s_steps(1)_infinite]' : 'bg-text-muted')} />
            {connected ? 'online' : 'offline'}
          </span>

          <LogoutButton onLogout={onLogout} />
        </header>

        {/* ── Page content ──────────────────────────────────────────────── */}
        <main className="main mt-12 min-w-0 flex-1 overflow-y-auto pb-16 sm:mt-0 sm:pb-0">
          <PageOutlet activeTab={tab} visitedTabs={visitedTabs} onNavigate={(t: Tab) => setTab(t)} />
        </main>
      </div>

      {/* ── Mobile bottom nav ─────────────────────────────────────────── */}
      <nav
        className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-mobile-nav flex items-stretch border-t border-border bg-surface sm:hidden"
        aria-label="Primary navigation"
      >
        {PRIMARY_MOBILE_TABS.map(tabId => {
          const t = tabDef(tabId)
          const active = tab === tabId
          return (
            <button
              key={tabId}
              type="button"
              className={cx(
                'flex flex-1 flex-col items-center gap-0.5 py-2 font-sans text-[10px]',
                active ? 'text-accent' : 'text-text-muted',
              )}
              onClick={() => { setTab(tabId); setMobileMoreOpen(false) }}
            >
              <t.Icon size={22} />
              <span>{t.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          className={cx(
            'flex flex-1 flex-col items-center gap-0.5 py-2 font-sans text-[10px]',
            SECONDARY_MOBILE_TABS.includes(tab) ? 'text-accent' : 'text-text-muted',
          )}
          onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
        >
          <IconDots size={22} />
          <span>More</span>
        </button>
      </nav>

      {mobileMoreOpen && (
        <button
          type="button"
          className="fixed inset-0 z-mobile-nav bg-scrim"
          aria-label="Close menu"
          onClick={() => setMobileMoreOpen(false)}
        />
      )}
      <div
        className={cx(
          'fixed inset-x-0 bottom-0 z-mobile-nav rounded-t-lg border-t border-border bg-surface transition-transform duration-200 sm:hidden',
          mobileMoreOpen ? 'translate-y-0' : 'translate-y-full',
        )}
        aria-hidden={!mobileMoreOpen}
      >
        <div className="mx-auto mt-2 h-1 w-8 rounded-full bg-border" aria-hidden="true" />
        <div className="grid grid-cols-3 gap-1 p-3">
          {SECONDARY_MOBILE_TABS.map(tabId => {
            const t = tabDef(tabId)
            const active = tab === tabId
            return (
              <button
                key={tabId}
                type="button"
                className={cx(
                  'relative flex flex-col items-center gap-1 rounded-sm py-3 font-sans text-[11px]',
                  active ? 'bg-accent/10 text-accent' : 'text-text-secondary',
                )}
                onClick={() => { setTab(tabId); setMobileMoreOpen(false) }}
              >
                <t.Icon size={20} />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>
        <div className="border-t border-border p-3">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-sm py-2 font-sans text-[13px] text-status-critical"
            onClick={onLogout}
          >
            <IconLogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={(t) => setTab(t as Tab)} />
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
