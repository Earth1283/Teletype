import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useSettings } from '../SettingsContext'
import { useContextMenu, type ContextMenuItem, type ContextMenuTarget } from '../ContextMenu'
import CommandPalette from '../CommandPalette'
import PromptModal, { type PromptVariant } from '../components/PromptModal'
import { useShell } from './ShellKernel'
import { renderPage } from './PageOutlet'
import { TABS, type Tab } from './tabs'

type MacTab = Tab | 'thread-dump'

interface WinState {
  id: MacTab
  x: number; y: number
  w: number; h: number
  z: number
  min: boolean; max: boolean
  /* Genie target: offset (relative to the window's own center) that points at
     its dock icon, captured at the moment it was minimized. */
  gx?: number; gy?: number
}

interface AppDef {
  id: MacTab
  label: string
  dw: number; dh: number
}

const WIN_W: Partial<Record<Tab, number>> = { glance: 920, console: 820, players: 720, stats: 1020, files: 900, actions: 680, audit: 780, network: 740, profiling: 860 }
const WIN_H: Partial<Record<Tab, number>> = { glance: 620, console: 520, players: 540, stats: 660, files: 600, actions: 500, audit: 540, network: 500, profiling: 600 }

const APPS: AppDef[] = [
  ...TABS.filter(t => t.id !== 'settings').map(t => ({
    id: t.id,
    label: t.label,
    dw: WIN_W[t.id] ?? 800,
    dh: WIN_H[t.id] ?? 560,
  })),
  { id: 'settings',    label: 'Settings',    dw: 620, dh: 740 },
  { id: 'thread-dump', label: 'Thread Dump', dw: 900, dh: 580 },
]

const DOCK_APPS = APPS.filter(a => a.id !== 'thread-dump')

// ── App icons — flat, single-accent glyphs (monochrome currentColor) ───────

const APP_ICONS: Record<MacTab, React.ReactNode> = {
  glance: <>
    <rect x="18" y="57" width="17" height="26" rx="4" fill="currentColor"/>
    <rect x="42" y="39" width="17" height="44" rx="4" fill="currentColor"/>
    <rect x="65" y="22" width="17" height="61" rx="4" fill="currentColor"/>
  </>,
  console: <>
    <polyline points="22,37 41,50 22,63" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <line x1="49" y1="63" x2="76" y2="63" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/>
  </>,
  players: <>
    <circle cx="63" cy="36" r="12" fill="currentColor" fillOpacity={0.55}/>
    <path d="M45,79 Q45,58 63,58 Q81,58 81,79 Z" fill="currentColor" fillOpacity={0.55}/>
    <circle cx="37" cy="36" r="12" fill="currentColor"/>
    <path d="M19,79 Q19,58 37,58 Q55,58 55,79 Z" fill="currentColor"/>
  </>,
  stats: <>
    <polyline points="15,72 34,54 52,62 70,36 85,43" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="70" cy="36" r="7" fill="currentColor"/>
  </>,
  files: <>
    <path d="M16,50 L16,42 Q16,36 22,36 L40,36 L45,43 L84,43 L84,50 Z" fill="currentColor" fillOpacity={0.45}/>
    <rect x="16" y="48" width="68" height="34" rx="6" fill="currentColor" fillOpacity={0.85}/>
  </>,
  actions: <>
    <path d="M59,12 L31,52 L49,52 L41,88 L69,48 L51,48 Z" fill="currentColor"/>
  </>,
  audit: <>
    <rect x="26" y="30" width="48" height="50" rx="6" fill="currentColor" fillOpacity={0.85}/>
    <rect x="36" y="22" width="28" height="14" rx="4" fill="currentColor" fillOpacity={0.85}/>
    <line x1="34" y1="48" x2="66" y2="48" stroke="var(--surface-raised)" strokeWidth="4" strokeLinecap="round"/>
    <line x1="34" y1="58" x2="66" y2="58" stroke="var(--surface-raised)" strokeWidth="4" strokeLinecap="round"/>
    <line x1="34" y1="68" x2="54" y2="68" stroke="var(--surface-raised)" strokeWidth="4" strokeLinecap="round"/>
  </>,
  network: <>
    <circle cx="50" cy="50" r="32" stroke="currentColor" strokeWidth="6" fill="none"/>
    <ellipse cx="50" cy="50" rx="16" ry="32" stroke="currentColor" strokeWidth="6" fill="none"/>
    <line x1="18" y1="50" x2="82" y2="50" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
  </>,
  profiling: <>
    <polyline points="12,60 30,60 38,32 50,78 62,45 72,60 88,60" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </>,
  settings: <>
    <line x1="20" y1="34" x2="80" y2="34" stroke="currentColor" strokeOpacity={0.55} strokeWidth="6.5" strokeLinecap="round"/>
    <circle cx="62" cy="34" r="9" fill="currentColor"/>
    <line x1="20" y1="54" x2="80" y2="54" stroke="currentColor" strokeOpacity={0.55} strokeWidth="6.5" strokeLinecap="round"/>
    <circle cx="34" cy="54" r="9" fill="currentColor"/>
    <line x1="20" y1="74" x2="80" y2="74" stroke="currentColor" strokeOpacity={0.55} strokeWidth="6.5" strokeLinecap="round"/>
    <circle cx="58" cy="74" r="9" fill="currentColor"/>
  </>,
  'thread-dump': <>
    <line x1="22" y1="28" x2="78" y2="28" stroke="currentColor" strokeOpacity={0.82} strokeWidth="6" strokeLinecap="round"/>
    <line x1="22" y1="42" x2="78" y2="42" stroke="currentColor" strokeOpacity={0.82} strokeWidth="6" strokeLinecap="round"/>
    <line x1="22" y1="56" x2="78" y2="56" stroke="currentColor" strokeOpacity={0.82} strokeWidth="6" strokeLinecap="round"/>
    <line x1="22" y1="70" x2="55" y2="70" stroke="currentColor" strokeOpacity={0.82} strokeWidth="6" strokeLinecap="round"/>
    <circle cx="72" cy="72" r="14" fill="none" stroke="currentColor" strokeOpacity={0.4} strokeWidth="5"/>
    <line x1="80" y1="80" x2="90" y2="90" stroke="currentColor" strokeOpacity={0.6} strokeWidth="5" strokeLinecap="round"/>
  </>,
}

function AppIcon({ id }: { id: MacTab }) {
  return (
    <div className="mac-app-icon">
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        {APP_ICONS[id]}
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

type CtxItem = ContextMenuItem

type Interaction = {
  type: 'drag' | 'resize'; id: MacTab
  sx: number; sy: number; ox: number; oy: number; ow: number; oh: number
}

type PromptState = {
  title: string
  message: React.ReactNode
  variant?: PromptVariant
} | null

// ── Main desktop ────────────────────────────────────────────────────────────

export default function MacShell({ onLogout }: { onLogout: () => void }) {
  const { setTab: setKernelTab, paletteOpen, setPaletteOpen } = useShell()
  const [wins, setWins] = useState<WinState[]>([])
  const [, setTopZ] = useState(10)
  const [activeId, setActiveId] = useState<MacTab | null>(null)
  const [clock, setClock] = useState(() => new Date())
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [finderViewMode, setFinderViewMode] = useState<'icons' | 'list'>('icons')
  const [threadDumpText, setThreadDumpText] = useState('')
  const [showAbout, setShowAbout] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [prompt, setPrompt] = useState<PromptState>(null)
  const [launchingId, setLaunchingId] = useState<MacTab | null>(null)
  const iRef = useRef<Interaction | null>(null)
  const menuBarRef = useRef<HTMLDivElement>(null)
  const desktopAreaRef = useRef<HTMLDivElement>(null)
  const dockIconRefs = useRef<Map<MacTab, HTMLButtonElement>>(new Map())
  const [reducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const { settings, update } = useSettings()
  const { openContextMenu } = useContextMenu()

  const registerDockIcon = useCallback((id: MacTab, el: HTMLButtonElement | null) => {
    if (el) dockIconRefs.current.set(id, el)
    else dockIconRefs.current.delete(id)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Keep the shared kernel's tab in sync so switching back to another shell
  // (Default/Apple) lands on whichever app was last focused here.
  useEffect(() => {
    if (activeId && activeId !== 'thread-dump') setKernelTab(activeId)
  }, [activeId, setKernelTab])

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
        setPaletteOpen(!paletteOpen)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [paletteOpen, setPaletteOpen])

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

  function openApp(id: MacTab) {
    setTopZ(z => {
      const nz = z + 1
      setWins(prev => {
        const ex = prev.find(w => w.id === id)
        if (ex) return prev.map(w => w.id === id ? { ...w, min: false, z: nz } : w)
        // Real launch, not a refocus — bounce the dock icon like macOS does.
        if (!reducedMotion) {
          setLaunchingId(id)
          setTimeout(() => setLaunchingId(cur => cur === id ? null : cur), 640)
        }
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

  function focusWin(id: MacTab) {
    setTopZ(z => {
      const nz = z + 1
      setWins(prev => prev.map(w => w.id === id ? { ...w, z: nz } : w))
      return nz
    })
    setActiveId(id)
  }

  function closeWin(id: MacTab) {
    setWins(prev => {
      const next = prev.filter(w => w.id !== id)
      if (activeId === id) setActiveId(next.length ? next.reduce((a, b) => a.z > b.z ? a : b).id : null)
      return next
    })
  }

  // Genie target: how far (in unscaled px) the window's own center sits from
  // its dock icon's center, right now. Captured once at minimize-time so a
  // later dock-magnification hover doesn't jitter the already-shrinking window.
  function genieOffset(win: WinState): { gx: number; gy: number } {
    const deskEl = desktopAreaRef.current
    const iconEl = dockIconRefs.current.get(win.id)
    if (!deskEl || !iconEl) return { gx: 0, gy: 260 }
    const deskRect = deskEl.getBoundingClientRect()
    const iconRect = iconEl.getBoundingClientRect()
    const curCenterX = win.max ? deskRect.width / 2 : win.x + win.w / 2
    const curCenterY = win.max ? deskRect.height / 2 : win.y + win.h / 2
    const targetX = iconRect.left + iconRect.width / 2 - deskRect.left
    const targetY = iconRect.top + iconRect.height / 2 - deskRect.top
    return { gx: targetX - curCenterX, gy: targetY - curCenterY }
  }

  function minWin(id: MacTab) {
    setWins(prev => prev.map(w => {
      if (w.id !== id) return w
      const { gx, gy } = reducedMotion ? { gx: 0, gy: 0 } : genieOffset(w)
      return { ...w, min: true, gx, gy }
    }))
    if (activeId === id) {
      const others = wins.filter(w => w.id !== id && !w.min)
      setActiveId(others.length ? others.reduce((a, b) => a.z > b.z ? a : b).id : null)
    }
  }

  function maxWin(id: MacTab) {
    setWins(prev => prev.map(w => w.id === id ? { ...w, max: !w.max } : w))
  }

  function startDrag(e: React.MouseEvent, id: MacTab) {
    e.preventDefault()
    const win = wins.find(w => w.id === id)
    if (!win) return
    iRef.current = { type: 'drag', id, sx: e.clientX, sy: e.clientY, ox: win.x, oy: win.y, ow: win.w, oh: win.h }
    document.body.style.cursor = 'grabbing'
    focusWin(id)
  }

  function startResize(e: React.MouseEvent, id: MacTab) {
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

  function winTitleCtx(e: React.MouseEvent, id: MacTab) {
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
      setPrompt({
        title: 'Thread dump failed',
        message: e.response?.data?.error ?? 'The thread dump could not be generated.',
        variant: 'error',
      })
    }
  }

  async function doRestart() {
    setShowRestartConfirm(false)
    try {
      await api.post('/system/restart')
    } catch (e: any) {
      setPrompt({
        title: 'Restart request failed',
        message: e.response?.data?.error ?? 'The restart command could not be dispatched.',
        variant: 'error',
      })
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
          <svg width="13" height="16" viewBox="0 0 22 22" fill="none">
            <rect x="1" y="1" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 7l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="15" x2="18" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
          <button className="mac-menubar-signout" title="Sign out" onClick={onLogout}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Desktop area ─────────────────────────────────────────────────── */}
      <div className="mac-desktop-area" ref={desktopAreaRef} onClick={() => setActiveId(null)}>
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
            onNavigate={(t) => openApp(t as MacTab)}
            onTitleCtx={winTitleCtx}
            threadDumpText={threadDumpText}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>

      {/* ── Dock ──────────────────────────────────────────────────────────── */}
      <MacDock
        apps={DOCK_APPS}
        wins={wins}
        activeId={activeId}
        onOpen={openApp}
        onCtx={dockCtx}
        launchingId={launchingId}
        registerIcon={registerDockIcon}
        reducedMotion={reducedMotion}
      />

      {/* ── Spotlight ─────────────────────────────────────────────────────── */}
      <CommandPalette
        open={paletteOpen && settings.palette.enabled}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(t) => { setPaletteOpen(false); openApp(t as MacTab) }}
      />

      {/* ── About Teletype ────────────────────────────────────────────────── */}
      {showAbout && (
        <div className="mac-system-overlay" onClick={() => setShowAbout(false)}>
          <div className="mac-system-card" onClick={e => e.stopPropagation()}>
            <div className="mac-about-app-icon">
              <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
                <polyline points="22,37 41,50 22,63" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <line x1="49" y1="63" x2="76" y2="63" stroke="currentColor" strokeWidth="9" strokeLinecap="round"/>
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
                style={{ background: 'var(--accent-15, rgba(212,37,52,0.15))', borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}
                onClick={doRestart}
              >
                Restart
              </button>
            </div>
          </div>
        </div>
      )}

      <PromptModal
        open={!!prompt}
        title={prompt?.title ?? ''}
        message={prompt?.message}
        variant={prompt?.variant}
        onClose={() => setPrompt(null)}
      />
    </div>
  )
}

// ── Window ─────────────────────────────────────────────────────────────────

interface MacWindowProps {
  win: WinState
  isActive: boolean
  onFocus: (id: MacTab) => void
  onStartDrag: (e: React.MouseEvent, id: MacTab) => void
  onStartResize: (e: React.MouseEvent, id: MacTab) => void
  onClose: (id: MacTab) => void
  onMin: (id: MacTab) => void
  onMax: (id: MacTab) => void
  onNavigate: (t: string) => void
  onTitleCtx: (e: React.MouseEvent, id: MacTab) => void
  threadDumpText: string
  reducedMotion: boolean
}

function MacWindow({ win, isActive, onFocus, onStartDrag, onStartResize, onClose, onMin, onMax, onNavigate, onTitleCtx, threadDumpText, reducedMotion }: MacWindowProps) {
  const app = APPS.find(a => a.id === win.id)!
  const posStyle: React.CSSProperties = win.max
    ? { zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }
  // Genie: shrink toward the real dock icon instead of a generic fixed point.
  if (win.min && !reducedMotion) {
    posStyle.transform = `translate(${win.gx ?? 0}px, ${win.gy ?? 260}px) scale(0.05)`
  }

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
        {win.id === 'thread-dump'
          ? <div className="thread-dump-view">{threadDumpText || 'No thread dump loaded.'}</div>
          : renderPage(win.id as Tab, onNavigate as (t: Tab) => void)}
      </div>
      {!win.max && (
        <div className="mac-resize-handle" onMouseDown={e => onStartResize(e, win.id)} />
      )}
    </div>
  )
}

// ── Dock ───────────────────────────────────────────────────────────────────

interface MacDockProps {
  apps: AppDef[]
  wins: WinState[]
  activeId: MacTab | null
  onOpen: (id: MacTab) => void
  onCtx: (e: React.MouseEvent, app: AppDef) => void
  launchingId: MacTab | null
  registerIcon: (id: MacTab, el: HTMLButtonElement | null) => void
  reducedMotion: boolean
}

// Real dock magnification: continuous cursor-distance falloff, with neighbors
// physically displaced (not just scaled) so grown icons don't overlap —
// exactly what macOS does and a static CSS :hover rule can't.
const DOCK_MAX_SCALE = 1.7
const DOCK_RADIUS = 90 // px — gaussian falloff half-width

function MacDock({ apps, wins, activeId, onOpen, onCtx, launchingId, registerIcon, reducedMotion }: MacDockProps) {
  const dockRef = useRef<HTMLDivElement>(null)
  // Magnification transform lands on this inner wrapper, not the outer button —
  // the tooltip label is an untransformed sibling of it, so it doesn't fly off
  // to a scaled, mispositioned spot when its icon magnifies.
  const innerRefs = useRef<Map<MacTab, HTMLDivElement>>(new Map())
  const rafRef = useRef<number | null>(null)
  const canMagnify = !reducedMotion && typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

  const relax = useCallback(() => {
    apps.forEach(app => {
      const el = innerRefs.current.get(app.id)
      if (el) { el.classList.add('dock-relax'); el.style.transform = '' }
    })
  }, [apps])

  const applyAt = useCallback((mouseX: number) => {
    if (!dockRef.current) return
    const els = apps.map(a => innerRefs.current.get(a.id))
    const rects = els.map(el => el?.getBoundingClientRect())
    const baseWidth = rects.find(r => r)?.width ?? 52
    const scales = rects.map(r => {
      if (!r) return 1
      const center = r.left + r.width / 2 // viewport space, same as mouseX (clientX)
      const dist = Math.abs(mouseX - center)
      const influence = Math.exp(-(dist * dist) / (2 * DOCK_RADIUS * DOCK_RADIUS))
      return 1 + (DOCK_MAX_SCALE - 1) * influence
    })
    let peak = 0
    for (let i = 1; i < scales.length; i++) if (scales[i] > scales[peak]) peak = i
    const shifts = new Array(scales.length).fill(0)
    for (let i = peak + 1; i < scales.length; i++) {
      shifts[i] = shifts[i - 1] + (baseWidth / 2) * (scales[i - 1] + scales[i] - 2)
    }
    for (let i = peak - 1; i >= 0; i--) {
      shifts[i] = shifts[i + 1] - (baseWidth / 2) * (scales[i + 1] + scales[i] - 2)
    }
    els.forEach((el, i) => {
      if (!el) return
      el.classList.remove('dock-relax')
      const lift = -((scales[i] - 1) / (DOCK_MAX_SCALE - 1)) * 22
      el.style.transform = `translate3d(${shifts[i]}px, ${lift}px, 0) scale(${scales[i]})`
    })
  }, [apps])

  function onMouseMove(e: React.MouseEvent) {
    if (!canMagnify) return
    const x = e.clientX
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => applyAt(x))
  }

  function onMouseLeave() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    relax()
  }

  return (
    <div className="mac-dock-container" onContextMenu={e => e.stopPropagation()}>
      <div className="mac-dock" ref={dockRef} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
        {apps.map(app => {
          const win = wins.find(w => w.id === app.id)
          const isActive = activeId === app.id
          return (
            <button
              key={app.id}
              ref={el => registerIcon(app.id, el)}
              className={`mac-dock-icon${isActive ? ' dock-active' : ''}`}
              onClick={() => onOpen(app.id)}
              onContextMenu={e => { e.preventDefault(); onCtx(e, app) }}
              title={app.label}
            >
              <div
                className={`mac-dock-icon-inner${launchingId === app.id ? ' launching' : ''}`}
                ref={el => {
                  if (el) innerRefs.current.set(app.id, el)
                  else innerRefs.current.delete(app.id)
                }}
              >
                <AppIcon id={app.id} />
              </div>
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
