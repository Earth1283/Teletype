import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useContextMenu } from '../ContextMenu'
import { useToast } from '../ToastContext'
import { writeClipboard } from '../clipboard'
import { Skeleton } from '../Skeleton'
import { Eyebrow } from '../design'

interface AuditEntry {
  id: number
  ts: number
  actor: string
  ip: string
  action: string
  detail: string
}

const ACTION_COLORS: Record<string, string> = {
  execute_command:  'var(--amber)',
  run_snippet:      'var(--green)',
  file_write:       'var(--amber)',
  file_delete:      'var(--red)',
  file_rename:      'var(--ash)',
  file_upload:      'var(--ash)',
  schedule_create:  'var(--green)',
  schedule_delete:  'var(--red)',
  category_create:  'var(--ash)',
  category_delete:  'var(--ash)',
}

const KNOWN_ACTIONS = [
  'execute_command', 'run_snippet',
  'file_write', 'file_delete', 'file_rename', 'file_upload',
  'schedule_create', 'schedule_delete',
  'category_create', 'category_delete',
]

const PAGE_SIZE = 100

function pad(n: number) { return n.toString().padStart(2, '0') }
function fmtTs(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function AuditPage() {
  const [actorFilter, setActorFilter]   = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [sinceInput, setSinceInput]     = useState('')
  const [offset, setOffset]             = useState(0)
  const { openContextMenu } = useContextMenu()
  const toast = useToast()

  // Validate sinceInput — don't send NaN to backend
  const sinceMs = (() => {
    if (!sinceInput) return undefined
    const t = new Date(sinceInput).getTime()
    return isNaN(t) ? undefined : t
  })()

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
  if (actorFilter)  params.set('actor', actorFilter)
  if (actionFilter) params.set('action', actionFilter)
  if (sinceMs)      params.set('since', String(sinceMs))

  const { data: entries = [], dataUpdatedAt, isFetching } = useQuery<AuditEntry[]>({
    queryKey: ['audit', actorFilter, actionFilter, sinceMs, offset],
    queryFn: () => api.get(`/audit?${params}`).then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 5_000,
  })

  const exportCsv = () => {
    const header = 'Timestamp,Actor,IP,Action,Detail'
    const rows = entries.map(e => [
      fmtTs(e.ts), e.actor, e.ip, e.action,
      `"${e.detail.replace(/"/g, '""')}"`,
    ].join(','))
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `teletype-audit-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => { setActorFilter(''); setActionFilter(''); setSinceInput(''); setOffset(0) }

  const openCtx = (e: React.MouseEvent, entry: AuditEntry) => {
    openContextMenu(e, [
      { label: 'Copy Detail', action: async () => { if (!await writeClipboard(entry.detail)) toast.error('Copy failed') } },
      {
        label: 'Copy Row',
        action: async () => {
          const line = [fmtTs(entry.ts), entry.actor, entry.ip, entry.action, entry.detail].join('\t')
          if (!await writeClipboard(line)) toast.error('Copy failed')
        },
      },
      { type: 'separator' },
      { label: 'Filter by Actor', action: () => { setActorFilter(entry.actor); setOffset(0) } },
      { label: 'Filter by Action', action: () => { setActionFilter(entry.action); setOffset(0) } },
    ], { kind: 'auditEntry', id: entry.id })
  }

  const hasMore = entries.length === PAGE_SIZE
  const hasPrev = offset > 0

  const kpis = useMemo(() => {
    if (entries.length === 0) return null
    const actorCounts = new Map<string, number>()
    const actionCounts = new Map<string, number>()
    for (const e of entries) {
      actorCounts.set(e.actor, (actorCounts.get(e.actor) ?? 0) + 1)
      actionCounts.set(e.action, (actionCounts.get(e.action) ?? 0) + 1)
    }
    const topActor = [...actorCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    const topAction = [...actionCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    return { total: entries.length, topActor, topAction }
  }, [entries])

  return (
    <div className="audit-root">
      {kpis && (
        <div className="grid grid-cols-3 gap-3 px-4 pt-3">
          <div className="rounded-md border border-border bg-surface p-3">
            <Eyebrow>Entries (page)</Eyebrow>
            <div className="mt-1 font-mono text-xl text-text-primary">{kpis.total}</div>
          </div>
          <div className="rounded-md border border-border bg-surface p-3">
            <Eyebrow>Top Actor</Eyebrow>
            <div className="mt-1 truncate font-mono text-xl text-text-primary">{kpis.topActor[0]}</div>
            <div className="font-mono text-[11px] text-text-muted">{kpis.topActor[1]} actions</div>
          </div>
          <div className="rounded-md border border-border bg-surface p-3">
            <Eyebrow>Top Action</Eyebrow>
            <div className="mt-1 truncate font-mono text-xl" style={{ color: ACTION_COLORS[kpis.topAction[0]] ?? 'var(--ash)' }}>
              {kpis.topAction[0]}
            </div>
            <div className="font-mono text-[11px] text-text-muted">{kpis.topAction[1]} times</div>
          </div>
        </div>
      )}
      <div className="audit-toolbar">
        <span className="audit-title">Audit Log</span>
        <span className="audit-meta">
          {isFetching ? 'Refreshing…' : `${entries.length} entries`}
          {dataUpdatedAt ? ` · ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}
        </span>

        <input
          className="audit-filter-input"
          placeholder="Filter by actor…"
          value={actorFilter}
          onChange={e => { setActorFilter(e.target.value); setOffset(0) }}
        />
        <select
          className="audit-filter-select"
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setOffset(0) }}
        >
          <option value="">All actions</option>
          {KNOWN_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          type="datetime-local"
          className="audit-filter-input"
          value={sinceInput}
          onChange={e => { setSinceInput(e.target.value); setOffset(0) }}
        />
        {(actorFilter || actionFilter || sinceInput) && (
          <button className="audit-reset-btn" onClick={reset}>Reset</button>
        )}
        <span style={{ flex: 1 }} />
        <button className="audit-export-btn" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="data-table-wrap" style={{ borderRadius: 0, border: 'none', flex: 1 }}>
        <table className="data-table">
          <thead>
            <tr>
              {['Timestamp', 'Actor', 'IP', 'Action', 'Detail'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && isFetching ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td><Skeleton width={130} height={11} /></td>
                  <td><Skeleton width={60} height={11} /></td>
                  <td><Skeleton width={80} height={11} /></td>
                  <td><Skeleton width={100} height={11} /></td>
                  <td><Skeleton width="70%" height={11} /></td>
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="audit-empty-state">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'var(--ghost)', marginBottom: 8 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mist)' }}>No audit entries</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ghost)', marginTop: 4 }}>
                      {actorFilter || actionFilter || sinceInput ? 'Try clearing the filters' : 'Actions you take will appear here'}
                    </div>
                  </div>
                </td>
              </tr>
            ) : entries.map(e => (
              <tr key={e.id} onContextMenu={ev => openCtx(ev, e)}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtTs(e.ts)}</td>
                <td style={{ fontWeight: 500 }}>{e.actor}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mist)' }}>{e.ip}</td>
                <td>
                  <span style={{ color: ACTION_COLORS[e.action] ?? 'var(--ash)', fontWeight: 500 }}>
                    {e.action}
                  </span>
                </td>
                <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--mist)' }}
                  title={e.detail}>
                  {e.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(hasPrev || hasMore) && (
        <div className="audit-pagination">
          <button className="btn-ghost btn-sm" disabled={!hasPrev} onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}>
            ← Previous
          </button>
          <span className="audit-meta">
            {offset + 1}–{offset + entries.length}
          </span>
          <button className="btn-ghost btn-sm" disabled={!hasMore} onClick={() => setOffset(o => o + PAGE_SIZE)}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
