import { useState, useRef, useEffect, useCallback } from 'react'
import { TOKEN_KEY, api } from '../api/client'
import { useSettings } from '../SettingsContext'
import { useContextMenu, type ContextMenuItem, type ContextMenuTarget } from '../ContextMenu'
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

type Tab = 'glance' | 'console' | 'players' | 'stats' | 'files' | 'actions' | 'audit' | 'network' | 'settings' | 'thread-dump'

interface WinState {
  id: Tab
  x: number; y: number
  w: number; h: number
  z: number
  min: boolean; max: boolean
}

interface AppDef {
  id: Tab
  label: string
  dw: number; dh: number
}

const APPS: AppDef[] = [
  { id: 'glance',      label: 'Glance',       dw: 920,  dh: 620 },
  { id: 'console',     label: 'Console',       dw: 820,  dh: 520 },
  { id: 'players',     label: 'Players',       dw: 720,  dh: 540 },
  { id: 'stats',       label: 'Stats',         dw: 1020, dh: 660 },
  { id: 'files',       label: 'Finder',        dw: 900,  dh: 600 },
  { id: 'actions',     label: 'Actions',       dw: 680,  dh: 500 },
  { id: 'audit',       label: 'Audit',         dw: 780,  dh: 540 },
  { id: 'network',     label: 'Network',       dw: 740,  dh: 500 },
  { id: 'settings',    label: 'Settings',      dw: 620,  dh: 740 },
  { id: 'thread-dump', label: 'Thread Dump',   dw: 900,  dh: 580 },
]

const DOCK_APPS = APPS.filter(a => a.id !== 'thread-dump')

// ── App icons ──────────────────────────────────────────────────────────────

const APP_ICONS: Record<Tab, { bg: string; icon: React.ReactNode }> = {
  glance: {
    bg: 'linear-gradient(145deg, #6366f1 0%, #3730a3 100%)',
    icon: <>
      <rect x="18" y="57" width="17" height="26" rx="4" fill="white"/>
      <rect x="42" y="39" width="17" height="44" rx="4" fill="white"/>
      <rect x="65" y="22" width="17" height="61" rx="4" fill="white"/>
    </>
  },
  console: {
    bg: 'linear-gradient(145deg, #1a3d2b 0%, #0d2018 100%)',
    icon: <>
      <polyline points="22,37 41,50 22,63" stroke="#4ade80" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <line x1="49" y1="63" x2="76" y2="63" stroke="#4ade80" strokeWidth="8" strokeLinecap="round"/>
    </>
  },
  players: {
    bg: 'linear-gradient(145deg, #34d399 0%, #059669 100%)',
    icon: <>
      <circle cx="63" cy="36" r="12" fill="rgba(255,255,255,0.65)"/>
      <path d="M45,79 Q45,58 63,58 Q81,58 81,79 Z" fill="rgba(255,255,255,0.65)"/>
      <circle cx="37" cy="36" r="12" fill="white"/>
      <path d="M19,79 Q19,58 37,58 Q55,58 55,79 Z" fill="white"/>
    </>
  },
  stats: {
    bg: 'linear-gradient(145deg, #f97316 0%, #c2410c 100%)',
    icon: <>
      <polyline points="15,72 34,54 52,62 70,36 85,43" stroke="white" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="70" cy="36" r="7" fill="white"/>
    </>
  },
  files: {
    bg: 'linear-gradient(145deg, #3b82f6 0%, #1d4ed8 100%)',
    icon: <>
      <path d="M16,50 L16,42 Q16,36 22,36 L40,36 L45,43 L84,43 L84,50 Z" fill="rgba(255,255,255,0.45)"/>
      <rect x="16" y="48" width="68" height="34" rx="6" fill="rgba(255,255,255,0.9)"/>
      <line x1="50" y1="54" x2="50" y2="78" stroke="rgba(29,78,216,0.3)" strokeWidth="2.5"/>
      <line x1="26" y1="66" x2="74" y2="66" stroke="rgba(29,78,216,0.3)" strokeWidth="2.5"/>
    </>
  },
  actions: {
    bg: 'linear-gradient(145deg, #f43f5e 0%, #be123c 100%)',
    icon: <>
      <path d="M59,12 L31,52 L49,52 L41,88 L69,48 L51,48 Z" fill="white"/>
    </>
  },
  audit: {
    bg: 'linear-gradient(145deg, #64748b 0%, #334155 100%)',
    icon: <>
      <rect x="26" y="30" width="48" height="50" rx="6" fill="rgba(255,255,255,0.9)"/>
      <rect x="36" y="22" width="28" height="14" rx="4" fill="rgba(255,255,255,0.9)"/>
      <rect x="40" y="26" width="20" height="6" rx="2" fill="rgba(0,0,0,0.14)"/>
      <line x1="34" y1="48" x2="66" y2="48" stroke="rgba(51,65,85,0.3)" strokeWidth="4" strokeLinecap="round"/>
      <line x1="34" y1="58" x2="66" y2="58" stroke="rgba(51,65,85,0.3)" strokeWidth="4" strokeLinecap="round"/>
      <line x1="34" y1="68" x2="54" y2="68" stroke="rgba(51,65,85,0.3)" strokeWidth="4" strokeLinecap="round"/>
    </>
  },
  network: {
    bg: 'linear-gradient(145deg, #22d3ee 0%, #0891b2 100%)',
    icon: <>
      <circle cx="50" cy="50" r="32" stroke="white" strokeWidth="6" fill="none"/>
      <ellipse cx="50" cy="50" rx="16" ry="32" stroke="white" strokeWidth="6" fill="none"/>
      <line x1="18" y1="50" x2="82" y2="50" stroke="white" strokeWidth="6" strokeLinecap="round"/>
    </>
  },
  settings: {
    bg: 'linear-gradient(145deg, #9ca3af 0%, #4b5563 100%)',
    icon: <>
      <line x1="20" y1="34" x2="80" y2="34" stroke="rgba(255,255,255,0.5)" strokeWidth="6.5" strokeLinecap="round"/>
      <circle cx="62" cy="34" r="9" fill="white"/>
      <line x1="20" y1="54" x2="80" y2="54" stroke="rgba(255,255,255,0.5)" strokeWidth="6.5" strokeLinecap="round"/>
      <circle cx="34" cy="54" r="9" fill="white"/>
      <line x1="20" y1="74" x2="80" y2="74" stroke="rgba(255,255,255,0.5)" strokeWidth="6.5" strokeLinecap="round"/>
      <circle cx="58" cy="74" r="9" fill="white"/>
    </>
  },
  'thread-dump': {
    bg: 'linear-gradient(145deg, #374151 0%, #111827 100%)',
    icon: <>
      <line x1="22" y1="28" x2="78" y2="28" stroke="rgba(255,255,255,0.82)" strokeWidth="6" strokeLinecap="round"/>
      <line x1="22" y1="42" x2="78" y2="42" stroke="rgba(255,255,255,0.82)" strokeWidth="6" strokeLinecap="round"/>
      <line x1="22" y1="56" x2="78" y2="56" stroke="rgba(255,255,255,0.82)" strokeWidth="6" strokeLinecap="round"/>
      <line x1="22" y1="70" x2="55" y2="70" stroke="rgba(255,255,255,0.82)" strokeWidth="6" strokeLinecap="round"/>
      <circle cx="72" cy="72" r="14" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="5"/>
      <line x1="80" y1="80" x2="90" y2="90" stroke="rgba(255,255,255,0.6)" strokeWidth="5" strokeLinecap="round"/>
    </>
  },
}

function AppIcon({ id }: { id: Tab }) {
  const { bg, icon } = APP_ICONS[id]
  return (
    <div className="mac-app-icon" style={{ background: bg }}>
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        {icon}
      </svg>
    </div>
  )
}

// ── Menu types ─────────────────────────────────────────────────────────────

type MenuItem = {
  label: string
  shortcut?: string
  action?: () => void
  disabled?: boolean
  danger?: boolean
  checked?: boolean
} | null

// ── Menu dropdown ──────────────────────────────────────────────────────────

function MenuDropdown({ items }: { items: MenuItem[] }) {
  return (
    <div className="mac-menu-dropdown">
      {items.map((item, i) =>
        item === null
          ? <div key={i} className="mac-menu-sep" />
          : <button
              key={i}
              className={`mac-menu-item${item.danger ? ' danger' : ''}`}
              disabled={item.disabled}
              onClick={item.action}
            >
              <span className="mac-menu-item-check">{item.checked ? '✓' : ''}</span>
              <span className="mac-menu-item-label">{item.label}</span>
              {item.shortcut && <span className="mac-menu-item-shortcut">{item.shortcut}</span>}
            </button>
      )}
    </div>
  )
}

// ── Context menu ────────────────────────────────────────────────────────────

type CtxItem = ContextMenuItem

// ── Types ───────────────────────────────────────────────────────────────────

type Interaction = {
  type: 'drag' | 'resize'; id: Tab
  sx: number; sy: number; ox: number; oy: number; ow: number; oh: number
}

// ── Main desktop ────────────────────────────────────────────────────────────

export default function MacOSDesktop() {
  const [wins, setWins] = useState<WinState[]>([])
  const [, setTopZ] = useState(10)
  const [activeId, setActiveId] = useState<Tab | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [finderViewMode, setFinderViewMode] = useState<'icons' | 'list'>('icons')
  const [threadDumpText, setThreadDumpText] = useState('')
  const [showAbout, setShowAbout] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const iRef = useRef<Interaction | null>(null)
  const menuBarRef = useRef<HTMLDivElement>(null)
  const { settings, update } = useSettings()
  const { openContextMenu } = useContextMenu()

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = iRef.current
      if (!r) return
      const dx = e.clientX - r.sx
      const dy = e.clientY - r.sy
      setWins(prev => prev.map(w => {
        if (w.id !== r.id) return w
        if (r.type === 'drag') return { ...w, x: r.ox + dx, y: Math.max(0, r.oy + dy) }
        return { ...w, w: Math.max(420, r.ow + dx), h: Math.max(280, r.oh + dy) }
      }))
    }
    const onUp = () => { iRef.current = null; document.body.style.cursor = '' }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === ' ')) {
        e.preventDefault()
        setPaletteOpen(p => !p)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // Close menu bar dropdowns on outside click
  useEffect(() => {
    if (!activeMenu) return
    const h = (e: MouseEvent) => {
      if (!menuBarRef.current?.contains(e.target as Node)) setActiveMenu(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [activeMenu])

  const openCtx = useCallback((e: React.MouseEvent, items: CtxItem[], target?: ContextMenuTarget) => {
    openContextMenu(e, items, target)
  }, [openContextMenu])

  function toggleMenu(name: string) {
    setActiveMenu(m => m === name ? null : name)
  }

  function openApp(id: Tab) {
    setTopZ(z => {
      const nz = z + 1
      setWins(prev => {
        const ex = prev.find(w => w.id === id)
        if (ex) return prev.map(w => w.id === id ? { ...w, min: false, z: nz } : w)
        const app = APPS.find(a => a.id === id)!
        const offset = (prev.length % 9) * 22
        const vw = window.innerWidth
        const vh = window.innerHeight - 28 - 84
        const x = Math.min(80 + offset, vw - app.dw - 20)
        const y = Math.min(30 + offset, vh - app.dh - 20)
        return [...prev, { id, x: Math.max(10, x), y: Math.max(10, y), w: app.dw, h: app.dh, z: nz, min: false, max: false }]
      })
      return nz
    })
    setActiveId(id)
  }

  function focusWin(id: Tab) {
    setTopZ(z => {
      const nz = z + 1
      setWins(prev => prev.map(w => w.id === id ? { ...w, z: nz } : w))
      return nz
    })
    setActiveId(id)
  }

  function closeWin(id: Tab) {
    setWins(prev => {
      const next = prev.filter(w => w.id !== id)
      if (activeId === id) setActiveId(next.length ? next.reduce((a, b) => a.z > b.z ? a : b).id : null)
      return next
    })
  }

  function minWin(id: Tab) {
    setWins(prev => prev.map(w => w.id === id ? { ...w, min: true } : w))
    if (activeId === id) {
      const others = wins.filter(w => w.id !== id && !w.min)
      setActiveId(others.length ? others.reduce((a, b) => a.z > b.z ? a : b).id : null)
    }
  }

  function maxWin(id: Tab) {
    setWins(prev => prev.map(w => w.id === id ? { ...w, max: !w.max } : w))
  }

  function startDrag(e: React.MouseEvent, id: Tab) {
    e.preventDefault()
    const win = wins.find(w => w.id === id)
    if (!win) return
    iRef.current = { type: 'drag', id, sx: e.clientX, sy: e.clientY, ox: win.x, oy: win.y, ow: win.w, oh: win.h }
    document.body.style.cursor = 'grabbing'
    focusWin(id)
  }

  function startResize(e: React.MouseEvent, id: Tab) {
    e.preventDefault()
    e.stopPropagation()
    const win = wins.find(w => w.id === id)
    if (!win) return
    iRef.current = { type: 'resize', id, sx: e.clientX, sy: e.clientY, ox: win.x, oy: win.y, ow: win.w, oh: win.h }
    document.body.style.cursor = 'se-resize'
    focusWin(id)
  }

  function dockCtx(e: React.MouseEvent, app: AppDef) {
    const win = wins.find(w => w.id === app.id)
    const items: CtxItem[] = !win
      ? [{ label: `Open ${app.label}`, action: () => openApp(app.id) }]
      : win.min
        ? [
            { label: 'Show Window', action: () => openApp(app.id) },
            { type: 'separator' },
            { label: 'Close', action: () => closeWin(app.id), danger: true },
          ]
        : [
            { label: 'Bring to Front', action: () => focusWin(app.id) },
            { label: 'Minimize', shortcut: '⌘M', action: () => minWin(app.id) },
            { type: 'separator' },
            { label: 'Close', shortcut: '⌘W', action: () => closeWin(app.id), danger: true },
          ]
    openCtx(e, items, { kind: 'dockApp', id: app.id })
  }

  function winTitleCtx(e: React.MouseEvent, id: Tab) {
    const win = wins.find(w => w.id === id)
    if (!win) return
    openCtx(e, [
      { label: 'Minimize', shortcut: '⌘M', action: () => minWin(id) },
      { label: win.max ? 'Restore' : 'Zoom', shortcut: '⌘⇧F', action: () => maxWin(id) },
      { type: 'separator' },
      { label: 'Close', shortcut: '⌘W', action: () => closeWin(id), danger: true },
    ], { kind: 'window', id })
  }

  function desktopCtx(e: React.MouseEvent) {
    openCtx(e, [
      { label: 'Bring All to Front', disabled: wins.filter(w => !w.min).length === 0, action: bringAllToFront },
      { type: 'separator' },
      { label: 'Exit Fun Mode', action: () => update({ fun: false }) },
    ], { kind: 'desktop' })
  }

  function bringAllToFront() {
    setTopZ(z => {
      let nz = z
      setWins(prev => prev.map(w => w.min ? w : { ...w, z: ++nz }))
      return nz
    })
  }

  function minimizeAll() {
    setWins(prev => prev.map(w => ({ ...w, min: true })))
    setActiveId(null)
  }

  function closeAll() {
    setWins([])
    setActiveId(null)
  }

  // ── Thread dump ────────────────────────────────────────────────────────

  async function triggerThreadDump() {
    setActiveMenu(null)
    try {
      const res = await api.get('/system/thread-dump', { responseType: 'text' })
      const text = res.data as string
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `thread-dump-${Date.now()}.txt`
      a.click()
      URL.revokeObjectURL(url)
      setThreadDumpText(text)
      openApp('thread-dump')
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Thread dump failed')
    }
  }

  async function doRestart() {
    setShowRestartConfirm(false)
    try {
      await api.post('/system/restart')
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Restart request failed')
    }
  }

  // ── Menu content ───────────────────────────────────────────────────────

  const activeWin = wins.find(w => w.id === activeId)
  const openWins = wins.filter(w => !w.min)
  const finderWinOpen = wins.some(w => w.id === 'files')

  function fileMenuItems(): MenuItem[] {
    return [
      { label: 'New Finder Window', shortcut: '⌘N', action: () => { setActiveMenu(null); openApp('files') } },
      { label: 'New Console Window', action: () => { setActiveMenu(null); openApp('console') } },
      null,
      { label: 'Restart Server…', action: () => { setActiveMenu(null); setShowRestartConfirm(true) } },
      { label: 'Thread Dump', action: triggerThreadDump },
      null,
      { label: 'Exit Fun Mode', action: () => { setActiveMenu(null); update({ fun: false }) }, danger: true },
    ]
  }

  function viewMenuItems(): MenuItem[] {
    const items: MenuItem[] = []
    if (finderWinOpen) {
      items.push({ label: 'as Icons', checked: finderViewMode === 'icons', action: () => { setActiveMenu(null); setFinderViewMode('icons') } })
      items.push({ label: 'as List', checked: finderViewMode === 'list', action: () => { setActiveMenu(null); setFinderViewMode('list') } })
      items.push(null)
    }
    items.push({
      label: activeWin?.max ? 'Exit Full Screen' : 'Enter Full Screen',
      shortcut: '⌘⇧F',
      disabled: !activeWin,
      action: () => { setActiveMenu(null); if (activeId) maxWin(activeId) },
    })
    return items
  }

  function windowMenuItems(): MenuItem[] {
    const items: MenuItem[] = [
      {
        label: 'Minimize',
        shortcut: '⌘M',
        disabled: !activeWin,
        action: () => { setActiveMenu(null); if (activeId) minWin(activeId) },
      },
      {
        label: 'Minimize All',
        disabled: openWins.length === 0,
        action: () => { setActiveMenu(null); minimizeAll() },
      },
      null,
      {
        label: 'Bring All to Front',
        disabled: openWins.length === 0,
        action: () => { setActiveMenu(null); bringAllToFront() },
      },
      {
        label: 'Close All',
        disabled: wins.length === 0,
        action: () => { setActiveMenu(null); closeAll() },
        danger: true,
      },
    ]
    if (wins.length > 0) {
      items.push(null)
      wins.forEach(w => {
        const app = APPS.find(a => a.id === w.id)!
        items.push({
          label: app.label,
          checked: w.id === activeId && !w.min,
          disabled: false,
          action: () => { setActiveMenu(null); openApp(w.id) },
        })
      })
    }
    return items
  }

  function helpMenuItems(): MenuItem[] {
    return [
      { label: 'About Teletype', action: () => { setActiveMenu(null); setShowAbout(true) } },
      null,
      { label: 'Keyboard Shortcuts', shortcut: '⌘K', action: () => { setActiveMenu(null); setPaletteOpen(true) } },
      null,
      {
        label: 'GitHub',
        action: () => { setActiveMenu(null); window.open('https://github.com/Earth1283/Teletype', '_blank') },
      },
    ]
  }

  const MENU_DEFS: { name: string; items: () => MenuItem[] }[] = [
    { name: 'File',   items: fileMenuItems },
    { name: 'View',   items: viewMenuItems },
    { name: 'Window', items: windowMenuItems },
    { name: 'Help',   items: helpMenuItems },
  ]

  const dateStr = clock.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="mac-desktop" onContextMenu={desktopCtx}>
      {/* ── Menu bar ────────────────────────────────────────────────────── */}
      <div className="mac-menubar" onContextMenu={e => e.stopPropagation()}>
        <span className="mac-menubar-apple">
          <svg width="13" height="16" viewBox="0 0 814 1000" fill="currentColor">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.2-49.3 188.4-49.3 30.3 0 130.2 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
          </svg>
        </span>
        <span className="mac-menubar-appname">
          {activeId ? (APPS.find(a => a.id === activeId)?.label ?? 'Teletype') : 'Teletype'}
        </span>

        <div ref={menuBarRef} style={{ display: 'flex', alignItems: 'center' }}>
          {MENU_DEFS.map(({ name, items }) => (
            <div key={name} className="mac-menu-trigger">
              <button
                className={`mac-menu-btn${activeMenu === name ? ' open' : ''}`}
                onMouseDown={e => { e.stopPropagation(); toggleMenu(name) }}
                onMouseEnter={() => { if (activeMenu && activeMenu !== name) setActiveMenu(name) }}
              >
                {name}
              </button>
              {activeMenu === name && <MenuDropdown items={items()} />}
            </div>
          ))}
        </div>

        <div className="mac-menubar-right">
          <button className="mac-menubar-spotlight" onClick={() => setPaletteOpen(true)} title="Spotlight (⌘K)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <span className="mac-menubar-clock">{dateStr}&nbsp;&nbsp;{timeStr}</span>
          <button className="mac-menubar-signout" title="Sign out" onClick={() => { localStorage.removeItem(TOKEN_KEY); window.location.reload() }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Desktop area ─────────────────────────────────────────────────── */}
      <div className="mac-desktop-area" onClick={() => setActiveId(null)}>
        {wins.length === 0 && (
          <div className="mac-desktop-hint">Double-click an icon in the dock to open an app</div>
        )}
        {wins.map(win => (
          <MacWindow
            key={win.id}
            win={win}
            isActive={win.id === activeId}
            onFocus={focusWin}
            onStartDrag={startDrag}
            onStartResize={startResize}
            onClose={closeWin}
            onMin={minWin}
            onMax={maxWin}
            onNavigate={(t) => openApp(t as Tab)}
            onTitleCtx={winTitleCtx}
            finderViewMode={finderViewMode}
            threadDumpText={threadDumpText}
          />
        ))}
      </div>

      {/* ── Dock ──────────────────────────────────────────────────────────── */}
      <MacDock apps={DOCK_APPS} wins={wins} activeId={activeId} onOpen={openApp} onCtx={dockCtx} />

      {/* ── Spotlight ─────────────────────────────────────────────────────── */}
      <CommandPalette
        open={paletteOpen && settings.palette.enabled}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(t) => { setPaletteOpen(false); openApp(t as Tab) }}
      />

      {/* ── About Teletype ────────────────────────────────────────────────── */}
      {showAbout && (
        <div className="mac-system-overlay" onClick={() => setShowAbout(false)}>
          <div className="mac-system-card" onClick={e => e.stopPropagation()}>
            <div className="mac-about-app-icon">
              <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
                <polyline points="22,37 41,50 22,63" stroke="white" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <line x1="49" y1="63" x2="76" y2="63" stroke="white" strokeWidth="9" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="mac-about-name">Teletype</div>
            <div className="mac-about-subtitle">Minecraft Server Management<br/>Open-source · Fun mode active</div>
            <div style={{ marginTop: 12 }}>
              <button className="pill-btn" style={{ minWidth: 100 }} onClick={() => setShowAbout(false)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Restart confirm ───────────────────────────────────────────────── */}
      {showRestartConfirm && (
        <div className="mac-system-overlay" onClick={() => setShowRestartConfirm(false)}>
          <div className="mac-system-card" onClick={e => e.stopPropagation()}>
            <div className="mac-system-title">Restart Minecraft Server?</div>
            <div className="mac-system-body">All connected players will be disconnected. The server will attempt to restart automatically.</div>
            <div className="mac-system-footer">
              <button className="pill-btn" onClick={() => setShowRestartConfirm(false)}>Cancel</button>
              <button
                className="pill-btn"
                style={{ background: 'rgba(255,59,48,0.15)', borderColor: 'rgba(255,59,48,0.4)', color: '#FF3B30' }}
                onClick={doRestart}
              >
                Restart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Window ─────────────────────────────────────────────────────────────────

interface MacWindowProps {
  win: WinState
  isActive: boolean
  onFocus: (id: Tab) => void
  onStartDrag: (e: React.MouseEvent, id: Tab) => void
  onStartResize: (e: React.MouseEvent, id: Tab) => void
  onClose: (id: Tab) => void
  onMin: (id: Tab) => void
  onMax: (id: Tab) => void
  onNavigate: (t: string) => void
  onTitleCtx: (e: React.MouseEvent, id: Tab) => void
  finderViewMode: 'icons' | 'list'
  threadDumpText: string
}

function MacWindow({ win, isActive, onFocus, onStartDrag, onStartResize, onClose, onMin, onMax, onNavigate, onTitleCtx, finderViewMode, threadDumpText }: MacWindowProps) {
  const app = APPS.find(a => a.id === win.id)!
  const posStyle = win.max
    ? { zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }

  return (
    <div
      className={`mac-window${win.min ? ' mac-win-min' : ''}${win.max ? ' mac-win-max' : ''}${isActive ? ' mac-win-active' : ''}`}
      style={posStyle}
      onMouseDown={e => { e.stopPropagation(); onFocus(win.id) }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onTitleCtx(e, win.id) }}
    >
      <div
        className={`mac-titlebar${win.max ? ' nodrag' : ''}`}
        onMouseDown={e => { if (!win.max) onStartDrag(e, win.id) }}
        onContextMenu={e => { e.preventDefault(); onTitleCtx(e, win.id) }}
      >
        <div className={`mac-traffic${isActive ? '' : ' inactive'}`} onMouseDown={e => e.stopPropagation()}>
          <span className="mac-tl mac-tl-close" onClick={() => onClose(win.id)} />
          <span className="mac-tl mac-tl-min"   onClick={() => onMin(win.id)} />
          <span className="mac-tl mac-tl-max"   onClick={() => onMax(win.id)} />
        </div>
        <span className="mac-titlebar-title">{app.label}</span>
      </div>
      <div className="mac-window-content">
        <PageContent id={win.id} onNavigate={onNavigate} finderViewMode={finderViewMode} threadDumpText={threadDumpText} />
      </div>
      {!win.max && (
        <div className="mac-resize-handle" onMouseDown={e => onStartResize(e, win.id)} />
      )}
    </div>
  )
}

function PageContent({ id, onNavigate, finderViewMode, threadDumpText }: {
  id: Tab
  onNavigate: (t: string) => void
  finderViewMode: 'icons' | 'list'
  threadDumpText: string
}) {
  switch (id) {
    case 'glance':      return <GlancePage />
    case 'console':     return <Console />
    case 'players':     return <PlayerList />
    case 'stats':       return <ServerStats onNavigate={onNavigate} />
    case 'files':       return <FileManager viewMode={finderViewMode} />
    case 'actions':     return <ActionsPage />
    case 'audit':       return <AuditPage />
    case 'network':     return <NetworkPage />
    case 'settings':    return <SettingsPage />
    case 'thread-dump': return <div className="thread-dump-view">{threadDumpText || 'No thread dump loaded.'}</div>
  }
}

// ── Dock ───────────────────────────────────────────────────────────────────

interface MacDockProps {
  apps: AppDef[]
  wins: WinState[]
  activeId: Tab | null
  onOpen: (id: Tab) => void
  onCtx: (e: React.MouseEvent, app: AppDef) => void
}

function MacDock({ apps, wins, activeId, onOpen, onCtx }: MacDockProps) {
  return (
    <div className="mac-dock-container" onContextMenu={e => e.stopPropagation()}>
      <div className="mac-dock">
        {apps.map(app => {
          const win = wins.find(w => w.id === app.id)
          const isActive = activeId === app.id
          return (
            <button
              key={app.id}
              className={`mac-dock-icon${isActive ? ' dock-active' : ''}`}
              onClick={() => onOpen(app.id)}
              onContextMenu={e => { e.preventDefault(); onCtx(e, app) }}
              title={app.label}
            >
              <AppIcon id={app.id} />
              <span className="mac-dock-label">{app.label}</span>
              {win && !win.min && <span className="mac-dock-dot" />}
              {win?.min && <span className="mac-dock-dot minimized" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
