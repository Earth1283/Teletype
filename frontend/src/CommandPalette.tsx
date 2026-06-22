import { useEffect, useRef, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api/client'
import { useLogs } from './LogContext'
import {
  IconActivity, IconTerminal, IconUsers, IconCpu,
  IconFolder, IconZap, IconSettings, IconPlay, IconSearch, IconCommand,
} from './Icons'
import type { Snippet } from './components/actions/actionTypes'

type Tab = 'glance' | 'console' | 'players' | 'stats' | 'files' | 'actions' | 'settings'

interface PaletteItem {
  id: string
  label: string
  sub?: string
  category: string
  icon: React.ReactNode
  run: () => void
}

const NAV_ITEMS: Array<{ tab: Tab; label: string; icon: React.ReactNode }> = [
  { tab: 'glance',   label: 'Glance',   icon: <IconActivity size={14} /> },
  { tab: 'console',  label: 'Console',  icon: <IconTerminal size={14} /> },
  { tab: 'players',  label: 'Players',  icon: <IconUsers size={14} /> },
  { tab: 'stats',    label: 'Stats',    icon: <IconCpu size={14} /> },
  { tab: 'files',    label: 'Files',    icon: <IconFolder size={14} /> },
  { tab: 'actions',  label: 'Actions',  icon: <IconZap size={14} /> },
  { tab: 'settings', label: 'Settings', icon: <IconSettings size={14} /> },
]

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
        run: () => { send(consoleCmd); onClose() },
      }]
    }

    const nav: PaletteItem[] = NAV_ITEMS.map(n => ({
      id: `nav-${n.tab}`,
      label: n.label,
      category: 'Navigate',
      icon: n.icon,
      run: () => { onNavigate(n.tab); onClose() },
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
          }
          onClose()
        },
      }))

    return [...nav, ...qa, ...other]
  }, [snippets, consoleCmd, onNavigate, onClose, send])

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
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-dialog" onClick={e => e.stopPropagation()}>

        <div className="palette-search-row">
          <IconSearch size={15} className="palette-search-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search commands, snippets, or type run <cmd>…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="palette-esc-hint">Esc</kbd>
        </div>

        <div className="palette-results" ref={listRef}>
          {flatItems.length === 0 ? (
            <div className="palette-empty">No results for "{query}"</div>
          ) : (
            Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category}>
                <div className="palette-group-label">{category}</div>
                {items.map(item => {
                  const idx = flatIdx++
                  const active = idx === selectedIndex
                  return (
                    <button
                      key={item.id}
                      data-idx={idx}
                      className={`palette-item${active ? ' active' : ''}`}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => item.run()}
                    >
                      <span className="palette-item-icon">{item.icon}</span>
                      <span className="palette-item-label">{item.label}</span>
                      {item.sub && <span className="palette-item-sub">{item.sub}</span>}
                      {active && <span className="palette-item-enter">↵</span>}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="palette-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>Esc</kbd> close</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconCommand size={11} />
            <span>K</span>
          </span>
        </div>
      </div>
    </div>
  )
}
