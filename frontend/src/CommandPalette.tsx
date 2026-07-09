import { useEffect, useRef, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api/client'
import { useLogs } from './LogContext'
import { IconTerminal, IconZap, IconPlay, IconSearch, IconCommand } from './Icons'
import { TABS, type Tab } from './shell/tabs'
import { cx } from './design'
import type { Snippet } from './components/actions/actionTypes'

interface PaletteItem {
  id: string
  label: string
  sub?: string
  category: string
  icon: React.ReactNode
  run: () => void
}

type Recent =
  | { kind: 'console'; cmd: string }
  | { kind: 'snippet'; id: string; name: string }

const RECENTS_KEY = 'teletype-palette-recents-v1'
const RECENTS_MAX = 6

function loadRecents(): Recent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function sameRecent(a: Recent, b: Recent): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === 'console'
    ? a.cmd === (b as { cmd: string }).cmd
    : a.id === (b as { id: string }).id
}

function pushRecent(r: Recent) {
  const next = [r, ...loadRecents().filter(x => !sameRecent(x, r))].slice(0, RECENTS_MAX)
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
}

function scoreMatch(text: string, query: string): number {
  if (!query) return 1
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (t === q) return 3
  if (t.startsWith(q)) return 2
  if (t.includes(q)) return 1
  return 0
}

function matches(item: PaletteItem, query: string): boolean {
  const q = query.toLowerCase()
  return (
    scoreMatch(item.label, q) > 0 ||
    scoreMatch(item.sub ?? '', q) > 0 ||
    scoreMatch(item.category, q) > 0
  )
}

interface Props {
  open: boolean
  onClose: () => void
  onNavigate: (tab: Tab) => void
}

export default function CommandPalette({ open, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recents, setRecents] = useState<Recent[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { send } = useLogs()

  const { data: snippets = [] } = useQuery<Snippet[]>({
    queryKey: ['snippets'],
    queryFn: () => api.get('/actions/snippets').then(r => r.data),
    staleTime: 60_000,
    enabled: open,
  })

  // Detect console command intent
  const consoleCmd = useMemo(() => {
    const m = query.match(/^(?:run|console)\s+(.+)$/i)
    return m ? m[1].trim() : null
  }, [query])

  // Build the full item list
  const allItems = useMemo((): PaletteItem[] => {
    if (consoleCmd) {
      return [{
        id: '__console__',
        label: `Execute: ${consoleCmd}`,
        sub: 'send to server console',
        category: 'Console',
        icon: <IconTerminal size={14} />,
        run: () => {
          send(consoleCmd)
          pushRecent({ kind: 'console', cmd: consoleCmd })
          onClose()
        },
      }]
    }

    const recent: PaletteItem[] = recents.flatMap(r => {
      if (r.kind === 'console') {
        return [{
          id: `recent-cmd-${r.cmd}`,
          label: r.cmd,
          sub: 'run again',
          category: 'Recent',
          icon: <IconTerminal size={14} />,
          run: () => {
            send(r.cmd)
            pushRecent(r)
            onClose()
          },
        }]
      }
      const s = snippets.find(x => x.id === r.id)
      if (!s) return []
      return [{
        id: `recent-snip-${s.id}`,
        label: s.name,
        sub: s.cmds[0],
        category: 'Recent',
        icon: <IconZap size={14} />,
        run: () => {
          api.post(`/actions/execute/${s.id}`, { vars: {} }).catch(() => {})
          pushRecent(r)
          onClose()
        },
      }]
    })

    const nav: PaletteItem[] = TABS.map(t => ({
      id: `nav-${t.id}`,
      label: t.label,
      category: 'Navigate',
      icon: <t.Icon size={14} />,
      run: () => { onNavigate(t.id); onClose() },
    }))

    const qa = snippets
      .filter(s => s.categoryId === 'quick-actions')
      .map(s => ({
        id: `qa-${s.id}`,
        label: s.name,
        sub: s.cmds[0],
        category: 'Quick Actions',
        icon: <IconZap size={14} />,
        run: () => {
          if (s.vars.length > 0) {
            onNavigate('actions')
          } else {
            api.post(`/actions/execute/${s.id}`, { vars: {} }).catch(() => {})
            pushRecent({ kind: 'snippet', id: s.id, name: s.name })
          }
          onClose()
        },
      }))

    const other = snippets
      .filter(s => s.categoryId !== 'quick-actions')
      .map(s => ({
        id: `snip-${s.id}`,
        label: s.name,
        sub: s.cmds[0],
        category: 'Snippets',
        icon: <IconPlay size={14} />,
        run: () => {
          if (s.vars.length > 0) {
            onNavigate('actions')
          } else {
            api.post(`/actions/execute/${s.id}`, { vars: {} }).catch(() => {})
            pushRecent({ kind: 'snippet', id: s.id, name: s.name })
          }
          onClose()
        },
      }))

    return [...recent, ...nav, ...qa, ...other]
  }, [snippets, recents, consoleCmd, onNavigate, onClose, send])

  const filtered = useMemo(() => {
    if (consoleCmd) return allItems
    if (!query) return allItems
    return allItems.filter(i => matches(i, query))
  }, [allItems, query, consoleCmd])

  // Group items by category
  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>()
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, [])
      map.get(item.category)!.push(item)
    }
    return map
  }, [filtered])

  // Flat index mapping for keyboard nav
  const flatItems = useMemo(() => filtered, [filtered])

  useEffect(() => { setSelectedIndex(0) }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setRecents(loadRecents())
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        flatItems[selectedIndex]?.run()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, flatItems, selectedIndex, onClose])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  let flatIdx = 0

  return (
    <div className="fixed inset-0 z-palette flex items-start justify-center bg-scrim pt-[12vh] backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="animate-[palette-in_180ms_cubic-bezier(0.16,1,0.3,1)] w-[90vw] max-w-[560px] overflow-hidden rounded-lg border border-border-hi bg-surface shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <IconSearch size={15} className="shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent font-sans text-[13.5px] text-text-primary placeholder:text-text-muted focus:outline-none"
            placeholder="Search commands, snippets, or type run <cmd>…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-muted">Esc</kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2" ref={listRef}>
          {flatItems.length === 0 ? (
            <div className="px-3 py-6 text-center font-sans text-[13px] text-text-muted">No results for &ldquo;{query}&rdquo;</div>
          ) : (
            Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category}>
                <div className="px-2.5 pb-1 pt-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">{category}</div>
                {items.map(item => {
                  const idx = flatIdx++
                  const active = idx === selectedIndex
                  return (
                    <button
                      key={item.id}
                      data-idx={idx}
                      className={cx(
                        'flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left font-sans text-[13px]',
                        active ? 'bg-accent/10 text-text-primary' : 'text-text-secondary',
                      )}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => item.run()}
                    >
                      <span className={cx('shrink-0', active ? 'text-accent' : 'text-text-muted')}>{item.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.sub && <span className="truncate font-mono text-[11px] text-text-muted">{item.sub}</span>}
                      {active && <span className="shrink-0 text-accent">↵</span>}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border px-4 py-2 font-mono text-[10px] text-text-muted">
          <span className="flex items-center gap-1"><kbd className="rounded-sm border border-border px-1">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="rounded-sm border border-border px-1">↵</kbd> run</span>
          <span className="flex items-center gap-1"><kbd className="rounded-sm border border-border px-1">Esc</kbd> close</span>
          <span className="ml-auto flex items-center gap-1">
            <IconCommand size={11} />
            <span>K</span>
          </span>
        </div>
      </div>
    </div>
  )
}
