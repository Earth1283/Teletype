import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Editor, { useMonaco } from '@monaco-editor/react'
import { api, TOKEN_KEY } from '../api/client'
import { useSettings } from '../SettingsContext'
import { getTheme } from '../themes'
import {
  IconFolder, IconFile, IconUpload, IconDownload,
  IconFolderPlus, IconPencil, IconTrash, IconSave, IconX, IconGlobe,
  IconChevronRight, IconChevronLeft, IconSearch, IconList,
} from '../Icons'

interface FileEntry {
  name: string; path: string; isDirectory: boolean; size: number; lastModified: number
}

interface SidebarFav {
  id: string; label: string; path: string
}

interface FileCtxMenu { x: number; y: number; entry: FileEntry }

const DEFAULT_FAVS: SidebarFav[] = [
  { id: 'root',    label: 'Server Root', path: '' },
  { id: 'plugins', label: 'Plugins',     path: 'plugins' },
  { id: 'worlds',  label: 'Worlds',      path: 'worlds' },
  { id: 'logs',    label: 'Logs',        path: 'logs' },
  { id: 'config',  label: 'Config',      path: 'config' },
  { id: 'mods',    label: 'Mods',        path: 'mods' },
]

const FAVS_KEY = 'teletype_finder_favs'

function loadFavs(): SidebarFav[] {
  try {
    const raw = localStorage.getItem(FAVS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return DEFAULT_FAVS
}

function saveFavs(favs: SidebarFav[]) {
  localStorage.setItem(FAVS_KEY, JSON.stringify(favs))
}

// ── Icon grid helpers ─────────────────────────────────────────────────────────

type FileVisual = { bg: string; icon: React.ReactNode }

function fileVisual(name: string, isDir: boolean): FileVisual {
  if (isDir) return {
    bg: 'linear-gradient(145deg, #3b82f6 0%, #1d4ed8 100%)',
    icon: <>
      <path d="M14,52 L14,42 Q14,36 20,36 L38,36 L44,44 L86,44 L86,52 Z" fill="rgba(255,255,255,0.38)"/>
      <rect x="14" y="50" width="72" height="38" rx="7" fill="rgba(255,255,255,0.88)"/>
      <line x1="14" y1="50" x2="86" y2="50" stroke="rgba(29,78,216,0.12)" strokeWidth="2"/>
    </>,
  }
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jar', 'class', 'war'].includes(ext)) return {
    bg: 'linear-gradient(145deg, #f97316 0%, #c2410c 100%)',
    icon: <>
      <circle cx="50" cy="44" r="18" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="7"/>
      <circle cx="50" cy="44" r="7" fill="rgba(255,255,255,0.9)"/>
      <line x1="50" y1="66" x2="50" y2="80" stroke="rgba(255,255,255,0.6)" strokeWidth="6" strokeLinecap="round"/>
    </>,
  }
  if (['json', 'yml', 'yaml', 'toml', 'xml', 'properties', 'conf', 'cfg', 'ini'].includes(ext)) return {
    bg: 'linear-gradient(145deg, #64748b 0%, #334155 100%)',
    icon: <>
      <rect x="28" y="22" width="44" height="56" rx="6" fill="rgba(255,255,255,0.88)"/>
      <line x1="36" y1="38" x2="64" y2="38" stroke="rgba(51,65,85,0.35)" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="36" y1="48" x2="64" y2="48" stroke="rgba(51,65,85,0.35)" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="36" y1="58" x2="55" y2="58" stroke="rgba(51,65,85,0.35)" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="36" y1="68" x2="60" y2="68" stroke="rgba(51,65,85,0.35)" strokeWidth="3.5" strokeLinecap="round"/>
    </>,
  }
  if (['log', 'out', 'err'].includes(ext)) return {
    bg: 'linear-gradient(145deg, #1a3d2b 0%, #0d2018 100%)',
    icon: <>
      <polyline points="22,37 41,50 22,63" stroke="#4ade80" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <line x1="49" y1="63" x2="76" y2="63" stroke="#4ade80" strokeWidth="7" strokeLinecap="round"/>
    </>,
  }
  if (['sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1'].includes(ext)) return {
    bg: 'linear-gradient(145deg, #166534 0%, #052e16 100%)',
    icon: <>
      <polyline points="18,35 44,50 18,65" stroke="#86efac" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <line x1="50" y1="65" x2="80" y2="65" stroke="#86efac" strokeWidth="8" strokeLinecap="round"/>
    </>,
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) return {
    bg: 'linear-gradient(145deg, #0d9488 0%, #0f766e 100%)',
    icon: <>
      <rect x="18" y="26" width="64" height="48" rx="6" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth="3.5"/>
      <circle cx="34" cy="42" r="8" fill="rgba(255,255,255,0.7)"/>
      <polyline points="18,62 36,44 50,56 62,42 82,58 82,74 18,74" fill="rgba(255,255,255,0.55)"/>
    </>,
  }
  if (['zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'tgz'].includes(ext)) return {
    bg: 'linear-gradient(145deg, #7c3aed 0%, #4c1d95 100%)',
    icon: <>
      <rect x="24" y="22" width="52" height="60" rx="6" fill="rgba(255,255,255,0.85)"/>
      <rect x="38" y="22" width="24" height="60" fill="rgba(109,40,217,0.12)"/>
      <line x1="50" y1="30" x2="50" y2="74" stroke="rgba(109,40,217,0.2)" strokeWidth="2.5" strokeDasharray="5,4"/>
      <rect x="38" y="44" width="24" height="12" rx="4" fill="rgba(109,40,217,0.4)"/>
    </>,
  }
  if (['md', 'txt', 'rtf', 'csv', 'tsv'].includes(ext)) return {
    bg: 'linear-gradient(145deg, #e2e8f0 0%, #94a3b8 100%)',
    icon: <>
      <rect x="28" y="20" width="44" height="60" rx="5" fill="rgba(0,0,0,0.06)"/>
      <line x1="36" y1="34" x2="64" y2="34" stroke="rgba(0,0,0,0.28)" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="36" y1="44" x2="64" y2="44" stroke="rgba(0,0,0,0.28)" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="36" y1="54" x2="64" y2="54" stroke="rgba(0,0,0,0.28)" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="36" y1="64" x2="52" y2="64" stroke="rgba(0,0,0,0.28)" strokeWidth="3.5" strokeLinecap="round"/>
    </>,
  }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'kt', 'java', 'go', 'rs', 'cpp', 'c', 'cs', 'php', 'rb'].includes(ext)) return {
    bg: 'linear-gradient(145deg, #6366f1 0%, #3730a3 100%)',
    icon: <>
      <polyline points="25,38 14,50 25,62" stroke="rgba(255,255,255,0.85)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <polyline points="75,38 86,50 75,62" stroke="rgba(255,255,255,0.85)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <line x1="58" y1="24" x2="42" y2="76" stroke="rgba(255,255,255,0.6)" strokeWidth="5" strokeLinecap="round"/>
    </>,
  }
  return {
    bg: 'linear-gradient(145deg, #374151 0%, #1f2937 100%)',
    icon: <>
      <rect x="28" y="22" width="44" height="56" rx="6" fill="rgba(255,255,255,0.82)"/>
      <path d="M56,22 L56,38 L72,38" fill="none" stroke="rgba(55,65,81,0.3)" strokeWidth="3"/>
      <path d="M56,22 L72,38 L72,22 Z" fill="rgba(55,65,81,0.12)"/>
    </>,
  }
}

function SidebarFolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 100 100" fill="none">
      <path d="M10,56 L10,44 Q10,36 18,36 L38,36 L44,44 L90,44 L90,56 Z" fill="currentColor" opacity="0.45"/>
      <rect x="10" y="53" width="80" height="36" rx="8" fill="currentColor" opacity="0.9"/>
    </svg>
  )
}

function SidebarRootIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 100 100" fill="none">
      <rect x="12" y="28" width="76" height="54" rx="8" stroke="currentColor" strokeWidth="7" fill="none"/>
      <line x1="12" y1="46" x2="88" y2="46" stroke="currentColor" strokeWidth="7"/>
      <circle cx="28" cy="37" r="4" fill="currentColor"/>
      <circle cx="40" cy="37" r="4" fill="currentColor"/>
    </svg>
  )
}

function SidebarLogIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 100 100" fill="none">
      <rect x="18" y="14" width="64" height="72" rx="7" fill="none" stroke="currentColor" strokeWidth="7"/>
      <line x1="32" y1="36" x2="68" y2="36" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
      <line x1="32" y1="50" x2="68" y2="50" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
      <line x1="32" y1="64" x2="52" y2="64" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
    </svg>
  )
}

const EXT_LANG: Record<string, string> = {
  js: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
  json: 'json', yml: 'yaml', yaml: 'yaml', xml: 'xml', html: 'html',
  css: 'css', scss: 'scss', sh: 'shell', bash: 'shell',
  py: 'python', kt: 'kotlin', java: 'java', rs: 'rust', go: 'go',
  toml: 'toml', md: 'markdown', txt: 'plaintext', properties: 'ini',
  conf: 'ini', cfg: 'ini', log: 'plaintext',
}

function langFor(name: string) {
  return EXT_LANG[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 ** 2).toFixed(1)} MB`
}

function fmtDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

type Modal = { type: 'rename'; entry: FileEntry } | { type: 'mkdir' } | { type: 'fetch' } | null

interface FileManagerProps {
  viewMode: 'icons' | 'list'
}

export default function FileManager({ viewMode }: FileManagerProps) {
  const [cwd, setCwd] = useState('')
  const [history, setHistory] = useState<string[]>([''])
  const [historyIdx, setHistoryIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ path: string } | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState<Modal>(null)
  const [modalInput, setModalInput] = useState('')
  const [fetchUrl, setFetchUrl] = useState('')
  const [fetchName, setFetchName] = useState('')
  const [fetchLoading, setFetchLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchScope, setSearchScope] = useState<'local' | 'global'>('local')
  const [fuzzyLevel, setFuzzyLevel] = useState(0)
  const [favs, setFavs] = useState<SidebarFav[]>(loadFavs)
  const [fileCtx, setFileCtx] = useState<FileCtxMenu | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const { settings } = useSettings()
  const monacoInst = useMonaco()

  const effectiveView = editing ? 'list' : viewMode

  useEffect(() => {
    if (!monacoInst) return
    const on = settings.editor.validate
    const langs = monacoInst.languages as any
    langs.json?.jsonDefaults?.setDiagnosticsOptions({ validate: on, allowComments: true })
    langs.typescript?.typescriptDefaults?.setDiagnosticsOptions({ noSemanticValidation: !on, noSyntaxValidation: !on })
    langs.typescript?.javascriptDefaults?.setDiagnosticsOptions({ noSemanticValidation: !on, noSyntaxValidation: !on })
  }, [monacoInst, settings.editor.validate])

  const qKey = ['files', cwd]
  const { data: entries = [], isLoading, error } = useQuery<FileEntry[]>({
    queryKey: qKey,
    queryFn: () => api.get('/files/list', { params: { path: cwd } }).then((r) => r.data),
  })

  const { data: searchResults = [], isFetching: searching } = useQuery<FileEntry[]>({
    queryKey: ['file-search', searchQuery, searchScope, fuzzyLevel, cwd],
    queryFn: () => api.get('/files/search', {
      params: { q: searchQuery, scope: searchScope, path: cwd, fuzzyLevel }
    }).then(r => r.data),
    enabled: searchOpen && searchQuery.trim().length > 0,
    staleTime: 5_000,
  })

  const breadcrumbs = cwd ? cwd.split('/').filter(Boolean) : []
  const canGoBack = historyIdx > 0
  const canGoForward = historyIdx < history.length - 1

  function navigate(path: string) {
    setCwd(path)
    setEditing(null)
    setSelected(null)
    setHistory(prev => [...prev.slice(0, historyIdx + 1), path])
    setHistoryIdx(prev => prev + 1)
  }

  function goBack() {
    const idx = historyIdx - 1
    setHistoryIdx(idx)
    setCwd(history[idx])
    setEditing(null)
    setSelected(null)
  }

  function goForward() {
    const idx = historyIdx + 1
    setHistoryIdx(idx)
    setCwd(history[idx])
    setEditing(null)
    setSelected(null)
  }

  function invalidate() { qc.invalidateQueries({ queryKey: qKey }) }

  async function openFile(entry: FileEntry) {
    try {
      const res = await api.get('/files/read', { params: { path: entry.path } })
      setEditing({ path: entry.path })
      setEditorContent(res.data)
    } catch (e: any) {
      if (e.response?.status === 415) downloadFile(entry)
      else alert(e.response?.data?.error ?? 'Cannot open file')
    }
  }

  function downloadFile(entry: FileEntry) {
    const token = localStorage.getItem(TOKEN_KEY) ?? ''
    fetch(`/api/files/download?path=${encodeURIComponent(entry.path)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = entry.name
        a.click()
        URL.revokeObjectURL(a.href)
      })
  }

  async function saveFile() {
    if (!editing) return
    setSaving(true)
    try {
      await api.put('/files/write', editorContent, {
        params: { path: editing.path },
        headers: { 'Content-Type': 'text/plain' },
      })
    } catch (e: any) { alert(e.response?.data?.error ?? 'Save failed') }
    finally { setSaving(false) }
  }

  async function deleteEntry(entry: FileEntry) {
    if (!confirm(`Delete "${entry.name}"?`)) return
    await api.delete('/files', { params: { path: entry.path } })
    invalidate()
  }

  async function doRename() {
    if (modal?.type !== 'rename' || !modalInput.trim()) return
    const parentDir = modal.entry.path.split('/').slice(0, -1).join('/')
    const to = parentDir ? `${parentDir}/${modalInput.trim()}` : modalInput.trim()
    try {
      await api.patch('/files/rename', { from: modal.entry.path, to })
      setModal(null); invalidate()
    } catch (e: any) { alert(e.response?.data?.error ?? 'Rename failed') }
  }

  async function doMkdir() {
    if (!modalInput.trim()) return
    const path = cwd ? `${cwd}/${modalInput.trim()}` : modalInput.trim()
    try {
      await api.post('/files/mkdir', null, { params: { path } })
      setModal(null); invalidate()
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed') }
  }

  async function doFetch() {
    if (!fetchUrl.trim()) return
    setFetchLoading(true)
    try {
      await api.post('/files/fetch', {
        url: fetchUrl.trim(),
        destPath: cwd,
        fileName: fetchName.trim() || undefined,
      })
      setModal(null); setFetchUrl(''); setFetchName(''); invalidate()
    } catch (e: any) { alert(e.response?.data?.error ?? 'Fetch failed') }
    finally { setFetchLoading(false) }
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    const fd = new FormData()
    for (const f of Array.from(files)) fd.append('file', f)
    try {
      await api.post('/files/upload', fd, {
        params: { path: cwd },
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      invalidate()
    } catch (e: any) { alert(e.response?.data?.error ?? 'Upload failed') }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); upload(e.dataTransfer.files)
  }, [cwd])

  function openModal(m: Modal, initial = '') {
    setModal(m); setModalInput(initial)
  }

  // ── Sidebar favorites ────────────────────────────────────────────────────

  function addFav(label: string, path: string) {
    const id = `fav-${Date.now()}`
    const next = [...favs, { id, label, path }]
    setFavs(next); saveFavs(next)
  }

  function removeFav(id: string) {
    const next = favs.filter(f => f.id !== id)
    setFavs(next); saveFavs(next)
  }

  // ── Right-click context menu ─────────────────────────────────────────────

  function openFileCtx(e: React.MouseEvent, entry: FileEntry) {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 220)
    const y = Math.min(e.clientY, window.innerHeight - 200)
    setFileCtx({ x, y, entry })
  }

  useEffect(() => {
    if (!fileCtx) return
    const h = () => setFileCtx(null)
    const t = setTimeout(() => document.addEventListener('mousedown', h), 30)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h) }
  }, [fileCtx])

  // ── Icon grid double-click ────────────────────────────────────────────────

  function handleIconActivate(entry: FileEntry) {
    if (entry.isDirectory) navigate(entry.path)
    else openFile(entry)
  }

  const editorOptions = {
    fontSize: settings.editor.fontSize,
    fontFamily: "'JetBrains Mono', monospace",
    minimap: { enabled: false },
    wordWrap: (settings.editor.wordWrap ? 'on' : 'off') as 'on' | 'off',
    lineHeight: 1.7,
    scrollBeyondLastLine: false,
    padding: { top: 12, bottom: 12 },
    cursorSmoothCaretAnimation: (settings.editor.smoothCaret ? 'on' : 'off') as 'on' | 'off',
    quickSuggestions: settings.editor.suggestions,
    suggestOnTriggerCharacters: settings.editor.suggestions,
    parameterHints: { enabled: settings.editor.suggestions },
    lineNumbers: (settings.editor.lineNumbers ? 'on' : 'off') as 'on' | 'off',
    renderWhitespace: (settings.editor.renderWhitespace ? 'boundary' : 'none') as 'boundary' | 'none',
    bracketPairColorization: { enabled: true },
    automaticLayout: true,
  }

  const displayEntries = searchOpen && searchQuery.trim() ? searchResults : entries

  return (
    <div className="fm-root" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>

      {/* ── Finder toolbar ────────────────────────────────────────────── */}
      <div className="finder-toolbar">
        <button className="finder-nav-btn" disabled={!canGoBack} onClick={goBack} title="Back">
          <IconChevronLeft size={11} />
        </button>
        <button className="finder-nav-btn" disabled={!canGoForward} onClick={goForward} title="Forward">
          <IconChevronRight size={11} />
        </button>

        <div className="finder-breadcrumbs">
          <span className="fm-crumb" onClick={() => navigate('')}>Server Root</span>
          {breadcrumbs.map((seg, i) => {
            const path = breadcrumbs.slice(0, i + 1).join('/')
            return (
              <span key={path} style={{ display: 'flex', alignItems: 'center' }}>
                <span className="fm-sep"><IconChevronRight size={10} /></span>
                <span
                  className={`fm-crumb${i === breadcrumbs.length - 1 ? ' current' : ''}`}
                  onClick={() => navigate(path)}
                >{seg}</span>
              </span>
            )
          })}
        </div>

        <div className="finder-view-toggle">
          <button
            className={`finder-view-btn${effectiveView === 'icons' ? ' active' : ''}`}
            title="Icon view"
            onClick={() => {}}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
          </button>
          <button
            className={`finder-view-btn${effectiveView === 'list' ? ' active' : ''}`}
            title="List view"
            onClick={() => {}}
          >
            <IconList size={13} />
          </button>
        </div>

        <button
          className={`icon-btn${searchOpen ? ' active' : ''}`}
          title="Search files"
          onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQuery('') }}
        >
          <IconSearch size={13} />
        </button>
        <button className="pill-btn" onClick={() => { setFetchUrl(''); setFetchName(''); setModal({ type: 'fetch' }) }}>
          <IconGlobe size={13} />Fetch
        </button>
        <button className="pill-btn" onClick={() => openModal({ type: 'mkdir' })}>
          <IconFolderPlus size={13} />New Folder
        </button>
        <button className="pill-btn primary" onClick={() => fileInputRef.current?.click()}>
          <IconUpload size={13} />Upload
        </button>
        <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>

      {/* ── Inline mkdir form ──────────────────────────────────────────── */}
      {modal?.type === 'mkdir' && (
        <div className="fm-inline-form">
          <input className="text-input" autoFocus placeholder="New folder name"
            value={modalInput} onChange={(e) => setModalInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doMkdir(); if (e.key === 'Escape') setModal(null) }} />
          <button className="pill-btn primary" onClick={doMkdir}>Create</button>
          <button className="pill-btn" onClick={() => setModal(null)}>Cancel</button>
        </div>
      )}

      {/* ── Search panel ───────────────────────────────────────────────── */}
      {searchOpen && (
        <div className="fm-search-panel">
          <div className="fm-search-row">
            <IconSearch size={13} />
            <input
              className="text-input fm-search-input"
              autoFocus
              placeholder="Search filenames…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              spellCheck={false}
            />
            <div className="fm-scope-toggle">
              <button className={`scope-btn${searchScope === 'local' ? ' active' : ''}`} onClick={() => setSearchScope('local')}>Local</button>
              <button className={`scope-btn${searchScope === 'global' ? ' active' : ''}`} onClick={() => setSearchScope('global')}>Global</button>
            </div>
          </div>
          <div className="fuzzy-slider-wrap fm-fuzzy">
            <span className="fuzzy-label">Precise</span>
            <input type="range" min={0} max={100} value={fuzzyLevel}
              onChange={e => setFuzzyLevel(+e.target.value)} className="fuzzy-slider" />
            <span className="fuzzy-label">Fuzzy</span>
          </div>
        </div>
      )}

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div className="finder-body">

        {/* Sidebar */}
        {!editing && (
          <div className="finder-sidebar">
            <div className="finder-sidebar-header">Favorites</div>
            {favs.map(fav => (
              <div
                key={fav.id}
                className={`finder-sidebar-item${cwd === fav.path ? ' active' : ''}`}
                onClick={() => navigate(fav.path)}
                onContextMenu={e => {
                  e.preventDefault()
                  if (!DEFAULT_FAVS.find(d => d.id === fav.id)) {
                    removeFav(fav.id)
                  }
                }}
                title={fav.path || 'Server Root'}
              >
                <span className="finder-sidebar-icon">
                  {fav.id === 'root' ? <SidebarRootIcon /> :
                   fav.id === 'logs' ? <SidebarLogIcon /> :
                   <SidebarFolderIcon />}
                </span>
                <span className="finder-sidebar-label">{fav.label}</span>
                {!DEFAULT_FAVS.find(d => d.id === fav.id) && (
                  <button
                    className="finder-sidebar-remove"
                    onClick={e => { e.stopPropagation(); removeFav(fav.id) }}
                    title="Remove from Favorites"
                  >✕</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* File area */}
        <div className="finder-main">

          {/* Loading / error */}
          {isLoading && <div className="dim" style={{ padding: 12 }}>Loading…</div>}
          {error && <div className="err" style={{ padding: 12 }}>Failed to read directory</div>}

          {/* Search results always use list view */}
          {searchOpen && searchQuery.trim() ? (
            <div className="fm-file-list" style={{ flex: 1 }}>
              {searching && <div className="dim" style={{ padding: '8px 10px' }}>Searching…</div>}
              {!searching && searchResults.length === 0 && (
                <div className="dim" style={{ padding: '8px 10px' }}>No results for "{searchQuery}"</div>
              )}
              {searchResults.map(entry => (
                <div key={entry.path} className="fm-row"
                  onClick={() => setSelected(entry.path)}
                  onDoubleClick={() => {
                    if (entry.isDirectory) { navigate(entry.path); setSearchOpen(false); setSearchQuery('') }
                    else { navigate(entry.path.split('/').slice(0, -1).join('/')); openFile(entry); setSearchOpen(false); setSearchQuery('') }
                  }}
                >
                  <span className={`fm-row-icon${entry.isDirectory ? ' dir' : ''}`}>
                    {entry.isDirectory ? <IconFolder size={14} /> : <IconFile size={14} />}
                  </span>
                  <span className="fm-row-name">{entry.name}</span>
                  <span className="fm-row-path">{entry.path}</span>
                  {!entry.isDirectory && <span className="fm-row-size">{fmtSize(entry.size)}</span>}
                  <div className="fm-row-actions" onClick={(e) => e.stopPropagation()}>
                    {!entry.isDirectory && (
                      <button className="row-action-btn" title="Download" onClick={() => downloadFile(entry)}>
                        <IconDownload size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

          ) : effectiveView === 'icons' ? (
            /* ── Icon grid ──────────────────────────────────────────── */
            <div className="finder-icon-grid" onClick={() => setSelected(null)}>
              {cwd && (
                <div
                  className={`finder-icon-item${selected === '..' ? ' selected' : ''}`}
                  onClick={e => { e.stopPropagation(); setSelected('..') }}
                  onDoubleClick={e => { e.stopPropagation(); goBack() }}
                  title="Parent folder"
                >
                  <div className="finder-icon-squircle" style={{ background: 'linear-gradient(145deg, #6b7280, #374151)' }}>
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14,52 L14,42 Q14,36 20,36 L38,36 L44,44 L86,44 L86,52 Z" fill="rgba(255,255,255,0.38)"/>
                      <rect x="14" y="50" width="72" height="38" rx="7" fill="rgba(255,255,255,0.7)"/>
                      <polyline points="52,36 36,50 52,64" fill="none" stroke="rgba(55,65,81,0.6)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="finder-icon-name">..</span>
                </div>
              )}
              {displayEntries.map(entry => {
                const v = fileVisual(entry.name, entry.isDirectory)
                return (
                  <div
                    key={entry.path}
                    className={`finder-icon-item${selected === entry.path ? ' selected' : ''}`}
                    onClick={e => { e.stopPropagation(); setSelected(entry.path) }}
                    onDoubleClick={e => { e.stopPropagation(); handleIconActivate(entry) }}
                    onContextMenu={e => openFileCtx(e, entry)}
                    title={entry.name}
                  >
                    <div className="finder-icon-squircle" style={{ background: v.bg }}>
                      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                        {v.icon}
                      </svg>
                    </div>
                    <span className="finder-icon-name">{entry.name}</span>
                  </div>
                )
              })}
            </div>

          ) : (
            /* ── List view ──────────────────────────────────────────── */
            <div className={`fm-file-list${editing ? ' compact' : ''}`}>
              {cwd && (
                <div className="fm-row"
                  onClick={() => setSelected('..')}
                  onDoubleClick={() => goBack()}
                >
                  <span className="fm-row-icon dir"><IconFolder size={14} /></span>
                  <span className="fm-row-name">..</span>
                </div>
              )}
              {displayEntries.map(entry => (
                <div key={entry.path} className="fm-row"
                  onClick={() => setSelected(entry.path)}
                  onDoubleClick={() => handleIconActivate(entry)}
                  onContextMenu={e => openFileCtx(e, entry)}
                >
                  <span className={`fm-row-icon${entry.isDirectory ? ' dir' : ''}`}>
                    {entry.isDirectory ? <IconFolder size={14} /> : <IconFile size={14} />}
                  </span>
                  <span className="fm-row-name">{entry.name}</span>
                  {!entry.isDirectory && !editing && <span className="fm-row-size">{fmtSize(entry.size)}</span>}
                  {!editing && <span className="fm-row-date">{fmtDate(entry.lastModified)}</span>}
                  <div className="fm-row-actions" onClick={e => e.stopPropagation()}>
                    {!entry.isDirectory && (
                      <button className="row-action-btn" title="Download" onClick={() => downloadFile(entry)}>
                        <IconDownload size={12} />
                      </button>
                    )}
                    <button className="row-action-btn" title="Rename" onClick={() => openModal({ type: 'rename', entry }, entry.name)}>
                      <IconPencil size={12} />
                    </button>
                    <button className="row-action-btn del" title="Delete" onClick={() => deleteEntry(entry)}>
                      <IconTrash size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Editor side panel */}
        {editing && (
          <div className="fm-editor-panel">
            <div className="fm-editor-bar">
              <span className="fm-editor-path">{editing.path}</span>
              <button className="pill-btn primary" onClick={saveFile} disabled={saving}>
                <IconSave size={13} />{saving ? 'Saving…' : 'Save'}
              </button>
              <button className="pill-btn" onClick={() => setEditing(null)}>
                <IconX size={13} />Close
              </button>
            </div>
            <Editor
              height="100%"
              language={langFor(editing.path.split('/').pop() ?? '')}
              value={editorContent}
              onChange={(v) => setEditorContent(v ?? '')}
              theme={getTheme(settings.theme).base === 'light' ? 'vs' : 'vs-dark'}
              options={editorOptions}
            />
          </div>
        )}
      </div>

      {/* ── Right-click context menu ────────────────────────────────────── */}
      {fileCtx && (
        <div className="mac-ctx" style={{ left: fileCtx.x, top: fileCtx.y }} onMouseDown={e => e.stopPropagation()}>
          <button className="mac-ctx-item" onClick={() => { handleIconActivate(fileCtx.entry); setFileCtx(null) }}>
            <span className="mac-ctx-label">Open</span>
          </button>
          {!fileCtx.entry.isDirectory && (
            <button className="mac-ctx-item" onClick={() => { downloadFile(fileCtx.entry); setFileCtx(null) }}>
              <span className="mac-ctx-label">Download</span>
            </button>
          )}
          <div className="mac-ctx-sep" />
          {fileCtx.entry.isDirectory && (
            <button className="mac-ctx-item" onClick={() => {
              addFav(fileCtx.entry.name, fileCtx.entry.path)
              setFileCtx(null)
            }}>
              <span className="mac-ctx-label">Add to Favorites</span>
            </button>
          )}
          <button className="mac-ctx-item" onClick={() => { openModal({ type: 'rename', entry: fileCtx.entry }, fileCtx.entry.name); setFileCtx(null) }}>
            <span className="mac-ctx-label">Rename</span>
          </button>
          <div className="mac-ctx-sep" />
          <button className="mac-ctx-item danger" onClick={() => { deleteEntry(fileCtx.entry); setFileCtx(null) }}>
            <span className="mac-ctx-label">Delete</span>
          </button>
        </div>
      )}

      {/* ── Rename modal ─────────────────────────────────────────────────── */}
      {modal?.type === 'rename' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Rename "{modal.entry.name}"</div>
            <div className="modal-label">New name</div>
            <input className="text-input" style={{ width: '100%' }} autoFocus
              value={modalInput} onChange={(e) => setModalInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setModal(null) }} />
            <div className="modal-footer">
              <button className="pill-btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="pill-btn primary" onClick={doRename}>Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fetch from URL modal ──────────────────────────────────────────── */}
      {modal?.type === 'fetch' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <IconGlobe size={15} />
              <div className="modal-title" style={{ margin: 0 }}>Download file from URL</div>
            </div>
            <div className="modal-label">URL</div>
            <input className="text-input" style={{ width: '100%', marginBottom: 12 }}
              autoFocus type="url" placeholder="https://example.com/file.jar"
              value={fetchUrl} onChange={(e) => setFetchUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doFetch(); if (e.key === 'Escape') setModal(null) }} />
            <div className="modal-label">Save as (optional)</div>
            <input className="text-input" style={{ width: '100%' }}
              placeholder="Leave blank to use filename from URL"
              value={fetchName} onChange={(e) => setFetchName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doFetch(); if (e.key === 'Escape') setModal(null) }} />
            <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mist)' }}>
              Destination: /{cwd || '(root)'}
            </div>
            <div className="modal-footer">
              <button className="pill-btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="pill-btn primary" onClick={doFetch} disabled={fetchLoading || !fetchUrl.trim()}>
                <IconDownload size={13} />{fetchLoading ? 'Downloading…' : 'Download'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
