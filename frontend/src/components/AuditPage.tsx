import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

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
      fmtTs(e.ts),
      e.actor, e.ip, e.action,
      `"${e.detail.replace(/"/g, '""')}"`,
    ].join(','))
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `teletype-audit-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => { setActorFilter(''); setActionFilter(''); setSinceInput('') }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px', gap: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexShrink: 0 }}>
        <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ash)' }}>
          Audit Log
        </span>
        <span style={{ fontSize: '11px', color: 'var(--mist)', fontFamily: 'var(--mono)' }}>
          {entries.length} entries · refreshes every 30s
          {dataUpdatedAt ? ` · updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={exportCsv} style={{
          background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: '4px',
          color: 'var(--ash)', padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
          fontFamily: 'var(--mono)',
        }}>
          Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
        <input
          placeholder="Filter by actor…"
          value={actorFilter}
          onChange={e => setActorFilter(e.target.value)}
          style={inputStyle}
        />
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          style={{ ...inputStyle, color: actionFilter ? 'var(--ash)' : 'var(--mist)' }}
        >
          <option value="">All actions</option>
          {KNOWN_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          type="datetime-local"
          value={sinceInput}
          onChange={e => setSinceInput(e.target.value)}
          style={inputStyle}
        />
        {(actorFilter || actionFilter || sinceInput) && (
          <button onClick={reset} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: '4px',
            color: 'var(--mist)', padding: '4px 8px', fontSize: '11px', cursor: 'pointer',
          }}>
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', borderRadius: '6px', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: 'var(--elevated)', position: 'sticky', top: 0, zIndex: 1 }}>
              {['Timestamp', 'Actor', 'IP', 'Action', 'Detail'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
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
              <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={tdStyle}>{fmtTs(e.ts)}</td>
                <td style={{ ...tdStyle, color: 'var(--ash)' }}>{e.actor}</td>
                <td style={{ ...tdStyle, color: 'var(--mist)' }}>{e.ip}</td>
                <td style={tdStyle}>
                  <span style={{
                    color: ACTION_COLORS[e.action] ?? 'var(--ash)',
                    fontWeight: 500,
                  }}>
                    {e.action}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: 'var(--mist)', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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

const inputStyle: React.CSSProperties = {
  background: 'var(--elevated)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--ash)',
  padding: '4px 8px',
  fontSize: '11px',
  fontFamily: 'var(--mono)',
  outline: 'none',
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--mist)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 12px',
  color: 'var(--ash)',
}
