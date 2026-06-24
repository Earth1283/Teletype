import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useContextMenu } from '../ContextMenu'

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

function pad(n: number) { return n.toString().padStart(2, '0') }
function fmtTs(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function AuditPage() {
  const [actorFilter, setActorFilter]   = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [sinceInput, setSinceInput]     = useState('')
  const { openContextMenu } = useContextMenu()

  const since = sinceInput ? new Date(sinceInput).getTime() || undefined : undefined

  const params = new URLSearchParams({ limit: '200' })
  if (actorFilter)  params.set('actor', actorFilter)
  if (actionFilter) params.set('action', actionFilter)
  if (since)        params.set('since', String(since))

  const { data: entries = [], dataUpdatedAt } = useQuery<AuditEntry[]>({
    queryKey: ['audit', actorFilter, actionFilter, since],
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

  const reset = () => { setActorFilter(''); setActionFilter(''); setSinceInput('') }

  const openCtx = (e: React.MouseEvent, entry: AuditEntry) => {
    openContextMenu(e, [
      { label: 'Copy Detail', action: () => navigator.clipboard.writeText(entry.detail) },
      {
        label: 'Copy Row',
        action: () => {
          const line = [fmtTs(entry.ts), entry.actor, entry.ip, entry.action, entry.detail].join('\t')
          navigator.clipboard.writeText(line)
        },
      },
      { type: 'separator' },
      { label: 'Filter by Actor', action: () => setActorFilter(entry.actor) },
      { label: 'Filter by Action', action: () => setActionFilter(entry.action) },
    ], { kind: 'auditEntry', id: entry.id })
  }

  return (
    <div className="audit-root">
      <div className="audit-toolbar">
        <span className="audit-title">Audit Log</span>
        <span className="audit-meta">
          {entries.length} entries · refreshes every 30s
          {dataUpdatedAt ? ` · ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}
        </span>

        <input
          className="audit-filter-input"
          placeholder="Filter by actor…"
          value={actorFilter}
          onChange={e => setActorFilter(e.target.value)}
        />
        <select
          className="audit-filter-select"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
        >
          <option value="">All actions</option>
          {KNOWN_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          type="datetime-local"
          className="audit-filter-input"
          value={sinceInput}
          onChange={e => setSinceInput(e.target.value)}
        />
        {(actorFilter || actionFilter || sinceInput) && (
          <button className="audit-reset-btn" onClick={reset}>Reset</button>
        )}
        <span style={{ flex: 1 }} />
        <button className="audit-export-btn" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="mac-tbl-wrap" style={{ borderRadius: 0, border: 'none', flex: 1 }}>
        <table className="mac-tbl">
          <thead>
            <tr>
              {['Timestamp', 'Actor', 'IP', 'Action', 'Detail'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--mist)' }}>
                  No audit entries found
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

    </div>
  )
}
