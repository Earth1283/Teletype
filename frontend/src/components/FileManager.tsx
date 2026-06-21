import { useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import { api, TOKEN_KEY } from '../api/client'
import {
  IconFolder, IconFile, IconUpload, IconDownload,
  IconFolderPlus, IconPencil, IconTrash, IconSave, IconX, IconGlobe, IconChevronRight
} from '../Icons'

interface FileEntry {
  name: string; path: string; isDirectory: boolean; size: number; lastModified: number
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

export default function FileManager() {
  const [cwd, setCwd] = useState('')
  const [editing, setEditing] = useState<{ path: string } | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState<Modal>(null)
  const [modalInput, setModalInput] = useState('')
  const [fetchUrl, setFetchUrl] = useState('')
  const [fetchName, setFetchName] = useState('')
  const [fetchLoading, setFetchLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const qKey = ['files', cwd]
  const { data: entries = [], isLoading, error } = useQuery<FileEntry[]>({
    queryKey: qKey,
    queryFn: () => api.get('/files/list', { params: { path: cwd } }).then((r) => r.data),
  })

  const breadcrumbs = cwd ? cwd.split('/').filter(Boolean) : []

  function navigate(path: string) { setCwd(path); setEditing(null) }
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

  async function deleteEntry(entry: FileEntry, e: React.MouseEvent) {
    e.stopPropagation()
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
      // Brief toast could go here; for now the file appears in the list
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

  return (
    <div className="fm-root" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {/* Top bar */}
      <div className="fm-topbar">
        <div className="fm-breadcrumbs">
          <span className="fm-crumb" onClick={() => navigate('')}>root</span>
          {breadcrumbs.map((seg, i) => {
            const path = breadcrumbs.slice(0, i + 1).join('/')
            return (
              <span key={path} style={{ display: 'flex', alignItems: 'center' }}>
                <span className="fm-sep"><IconChevronRight size={10} /></span>
                <span className={`fm-crumb${i === breadcrumbs.length - 1 ? ' current' : ''}`}
                  onClick={() => navigate(path)}>{seg}</span>
              </span>
            )
          })}
        </div>

        <div className="fm-actions">
          <button className="icon-btn" title="Fetch file from URL" onClick={() => { setFetchUrl(''); setFetchName(''); setModal({ type: 'fetch' }) }}>
            <IconGlobe size={14} />
          </button>
          <button className="icon-btn" title="New folder" onClick={() => openModal({ type: 'mkdir' })}>
            <IconFolderPlus size={14} />
          </button>
          <button className="icon-btn primary" title="Upload files" onClick={() => fileInputRef.current?.click()}>
            <IconUpload size={14} />
          </button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
      </div>

      {/* Inline forms */}
      {modal?.type === 'mkdir' && (
        <div className="fm-inline-form">
          <input className="text-input" autoFocus placeholder="New folder name"
            value={modalInput} onChange={(e) => setModalInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doMkdir(); if (e.key === 'Escape') setModal(null) }} />
          <button className="pill-btn primary" onClick={doMkdir}>Create</button>
          <button className="pill-btn" onClick={() => setModal(null)}>Cancel</button>
        </div>
      )}

      {/* Editor */}
      {editing ? (
        <div className="fm-editor-wrap">
          <div className="fm-editor-bar">
            <span className="fm-editor-path">{editing.path}</span>
            <button className="pill-btn primary" onClick={saveFile} disabled={saving}>
              <IconSave size={13} />
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="icon-btn" title="Close editor" onClick={() => setEditing(null)}>
              <IconX size={13} />
            </button>
          </div>
          <Editor
            height="100%"
            language={langFor(editing.path.split('/').pop() ?? '')}
            value={editorContent}
            onChange={(v) => setEditorContent(v ?? '')}
            theme="vs-dark"
            options={{
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              minimap: { enabled: false },
              wordWrap: 'on',
              lineHeight: 1.7,
              scrollBeyondLastLine: false,
              padding: { top: 12, bottom: 12 },
            }}
          />
        </div>
      ) : (
        <div className="fm-file-list">
          {isLoading && <div className="dim">Loading…</div>}
          {error && <div className="err">Failed to read directory</div>}

          {cwd && (
            <div className="fm-row" onClick={() => navigate(breadcrumbs.slice(0, -1).join('/'))}>
              <span className="fm-row-icon dir"><IconFolder size={14} /></span>
              <span className="fm-row-name">..</span>
            </div>
          )}

          {entries.map((entry) => (
            <div key={entry.path} className="fm-row"
              onClick={() => entry.isDirectory ? navigate(entry.path) : openFile(entry)}
            >
              <span className={`fm-row-icon${entry.isDirectory ? ' dir' : ''}`}>
                {entry.isDirectory ? <IconFolder size={14} /> : <IconFile size={14} />}
              </span>
              <span className="fm-row-name">{entry.name}</span>
              {!entry.isDirectory && <span className="fm-row-size">{fmtSize(entry.size)}</span>}
              <span className="fm-row-date">{fmtDate(entry.lastModified)}</span>
              <div className="fm-row-actions" onClick={(e) => e.stopPropagation()}>
                {!entry.isDirectory && (
                  <button className="row-action-btn" title="Download"
                    onClick={(e) => { e.stopPropagation(); downloadFile(entry) }}>
                    <IconDownload size={13} />
                  </button>
                )}
                <button className="row-action-btn" title="Rename"
                  onClick={(e) => { e.stopPropagation(); openModal({ type: 'rename', entry }, entry.name) }}>
                  <IconPencil size={13} />
                </button>
                <button className="row-action-btn del" title="Delete" onClick={(e) => deleteEntry(entry, e)}>
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rename modal */}
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

      {/* Fetch from URL modal */}
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
                <IconDownload size={13} />
                {fetchLoading ? 'Downloading…' : 'Download'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
