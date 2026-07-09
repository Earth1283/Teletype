import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
} from 'recharts'
import { api, TOKEN_KEY } from '../api/client'
import { useToast } from '../ToastContext'
import {
  IconFlightRecorder, IconDownload, IconTrash, IconX, IconRefresh, IconPlay,
} from '../Icons'

// ── Types ─────────────────────────────────────────────────────────────────────

interface JfrRecording {
  id: string
  name: string
  type: 'CONTINUOUS_DUMP' | 'MANUAL'
  status: 'RUNNING' | 'COMPLETE' | 'FAILED'
  startTimeMs: number
  endTimeMs?: number
  sizeBytes?: number
  path: string
  template: string
}

interface ContinuousConfig {
  maxDiskMb: number
  maxAgeSec: number
  template: string
  dumpOnExit: boolean
  outputDir: string
}

interface RecordingsInfo {
  outputDir: string
  maxTotalDiskMb: number
  totalSizeBytes: number
}

interface ProfilingStatus {
  jfrAvailable: boolean
  profilingEnabled: boolean
  continuousEnabled: boolean
  continuousRunning: boolean
  config: ContinuousConfig
  recordings: RecordingsInfo
}

interface GcPause { startMs: number; durationMs: number; cause: string }
interface CpuSample { timeMs: number; machineTotal: number; jvmUser: number }
interface LockStat { className: string; totalBlockedMs: number; count: number }
interface HeapSummary { reservedMb: number; usedMb: number }
interface ParsedProfile {
  durationMs: number
  gcPauses: GcPause[]
  cpuSamples: CpuSample[]
  topLocks: LockStat[]
  heapSummary?: HeapSummary
  threadCount: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes?: number | null) {
  if (bytes == null) return '—'
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function fmtDuration(ms: number) {
  if (ms <= 0) return '0s'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  if (s > 0) return `${s}s`
  return `${ms}ms`
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString()
}

function fmtMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  if (ms >= 1) return `${ms.toFixed(1)}ms`
  return `${(ms * 1000).toFixed(0)}µs`
}

function shortClass(name: string) {
  const parts = name.split('.')
  return parts.length > 2 ? `…${parts.slice(-2).join('.')}` : name
}

// ── Event Summary Modal ────────────────────────────────────────────────────────

function EventSummaryModal({ recording, onClose }: { recording: JfrRecording; onClose: () => void }) {
  const { data: profile, isLoading, error } = useQuery<ParsedProfile>({
    queryKey: ['jfr-events', recording.id],
    queryFn: () => api.get(`/profiling/recording/${recording.id}/events`).then(r => r.data),
    staleTime: 300_000,
  })

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="prof-event-modal">
        <div className="modal-title">
          <span>Event Summary — {recording.name}</span>
          <button className="btn-ghost btn-xs" onClick={onClose}><IconX size={12} /></button>
        </div>

        {isLoading && (
          <div className="prof-events-loading">
            <IconFlightRecorder size={28} />
            <span>Parsing JFR events…</span>
            <span style={{ color: 'var(--ghost)', fontSize: '12px' }}>Large files may take a moment</span>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--red)', fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>
            {(error as any).response?.data?.error ?? 'Failed to parse recording'}
          </div>
        )}

        {profile && (
          <div className="prof-event-body">
            <div className="prof-event-stats">
              <div className="prof-stat-chip">
                <span className="prof-stat-label">Duration</span>
                <span className="prof-stat-value">{fmtDuration(profile.durationMs)}</span>
              </div>
              <div className="prof-stat-chip">
                <span className="prof-stat-label">GC Pauses</span>
                <span className="prof-stat-value">{profile.gcPauses.length}</span>
              </div>
              <div className="prof-stat-chip">
                <span className="prof-stat-label">Peak Threads</span>
                <span className="prof-stat-value">{profile.threadCount || '—'}</span>
              </div>
              {profile.heapSummary && (
                <>
                  <div className="prof-stat-chip">
                    <span className="prof-stat-label">Heap Used</span>
                    <span className="prof-stat-value">{profile.heapSummary.usedMb.toFixed(0)} MB</span>
                  </div>
                  <div className="prof-stat-chip">
                    <span className="prof-stat-label">Heap Reserved</span>
                    <span className="prof-stat-value">{profile.heapSummary.reservedMb.toFixed(0)} MB</span>
                  </div>
                </>
              )}
            </div>

            {profile.cpuSamples.length > 0 && (
              <div className="prof-event-section">
                <div className="prof-event-section-title">CPU Load</div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={profile.cpuSamples.filter((_, i) => i % Math.max(1, Math.floor(profile.cpuSamples.length / 120)) === 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="timeMs" hide />
                    <YAxis
                      tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                      domain={[0, 1]}
                      tick={{ fontSize: 10, fill: 'var(--ghost)' }}
                      width={36}
                    />
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}>
                            {payload.map((p: any) => (
                              <div key={p.dataKey} style={{ color: p.color }}>
                                {p.dataKey === 'machineTotal' ? 'System' : 'JVM'}: {((p.value || 0) * 100).toFixed(1)}%
                              </div>
                            ))}
                          </div>
                        )
                      }}
                    />
                    <Line type="monotone" dataKey="machineTotal" stroke="var(--mist)" dot={false} strokeWidth={1.2} name="machineTotal" />
                    <Line type="monotone" dataKey="jvmUser" stroke="var(--amber)" dot={false} strokeWidth={1.5} name="jvmUser" />
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--mist)', marginTop: 4 }}>
                  <span><span style={{ color: 'var(--amber)' }}>——</span> JVM user</span>
                  <span><span style={{ color: 'var(--mist)' }}>——</span> System total</span>
                </div>
              </div>
            )}

            {profile.gcPauses.length > 0 && (
              <div className="prof-event-section">
                <div className="prof-event-section-title">GC Pauses ({profile.gcPauses.length} events)</div>
                <ResponsiveContainer width="100%" height={110}>
                  <BarChart
                    data={profile.gcPauses.filter((_, i) => i % Math.max(1, Math.floor(profile.gcPauses.length / 200)) === 0)}
                    barSize={2}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="startMs" hide />
                    <YAxis
                      tickFormatter={v => `${v.toFixed(0)}ms`}
                      tick={{ fontSize: 10, fill: 'var(--ghost)' }}
                      width={40}
                    />
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--ash)' }}>
                            Pause: {Number(payload[0]?.value || 0).toFixed(2)}ms
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="durationMs" fill="var(--blue)" opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ fontSize: 11, color: 'var(--ghost)', marginTop: 4 }}>
                  Total pause time: {fmtMs(profile.gcPauses.reduce((s, p) => s + p.durationMs, 0))}
                  {' · '}Max pause: {fmtMs(Math.max(...profile.gcPauses.map(p => p.durationMs)))}
                </div>
              </div>
            )}

            {profile.topLocks.length > 0 && (() => {
              const topLocks = profile.topLocks.slice(0, 10).map(l => ({ ...l, shortName: shortClass(l.className) }))
              return (
                <div className="prof-event-section">
                  <div className="prof-event-section-title">Top Lock Contention</div>
                  <ResponsiveContainer width="100%" height={Math.max(90, topLocks.length * 26)}>
                    <BarChart layout="vertical" data={topLocks} margin={{ top: 4, right: 52, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="shortName"
                        width={130}
                        tick={{ fontSize: 10, fill: 'var(--mist)', fontFamily: 'var(--mono)' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0].payload
                          return (
                            <div className="rounded-sm border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-text-primary">
                              <div className="mb-0.5" title={d.className}>{d.shortName}</div>
                              <div className="text-text-muted">{fmtMs(d.totalBlockedMs)} · {d.count.toLocaleString()} events</div>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="totalBlockedMs" fill="var(--chart-seq-400)" radius={[0, 4, 4, 0]} barSize={14}>
                        <LabelList
                          dataKey="totalBlockedMs"
                          position="right"
                          formatter={(v: unknown) => fmtMs(Number(v))}
                          style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--mist)' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <details className="mt-2">
                    <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wide text-text-muted hover:text-text-secondary">
                      View exact counts
                    </summary>
                    <table className="prof-lock-table mt-1.5">
                      <thead>
                        <tr>
                          <th>Class</th>
                          <th>Total Blocked</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topLocks.map((lock, i) => (
                          <tr key={i}>
                            <td className="prof-lock-class" title={lock.className}>{lock.shortName}</td>
                            <td>{fmtMs(lock.totalBlockedMs)}</td>
                            <td>{lock.count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </div>
              )
            })()}

            {profile.gcPauses.length === 0 && profile.cpuSamples.length === 0 && profile.topLocks.length === 0 && (
              <div style={{ color: 'var(--ghost)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
                No event data found — recording may use a template that does not include these event types.
              </div>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Start Manual Recording Modal ───────────────────────────────────────────────

function StartRecordingModal({ onClose, onStart }: {
  onClose: () => void
  onStart: (req: { name: string; template: string; maxDurationSec: number; maxSizeMb: number }) => void
}) {
  const [form, setForm] = useState({ name: '', template: 'default', maxDurationSec: 60, maxSizeMb: 0 })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-title">
          Start Manual Recording
          <button className="btn-ghost btn-xs" onClick={onClose}><IconX size={12} /></button>
        </div>

        <div className="modal-field">
          <div className="modal-label">Name</div>
          <input
            className="modal-input"
            placeholder="e.g. lag-spike-diagnosis"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>

        <div className="modal-field">
          <div className="modal-label">Template</div>
          <select
            className="modal-select modal-select-full"
            value={form.template}
            onChange={e => set('template', e.target.value)}
          >
            <option value="default">default — low overhead (&lt;1%)</option>
            <option value="profile">profile — detailed (~2-5% overhead)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">Max Duration (sec)</div>
            <input
              className="modal-input mono-input"
              type="number"
              min={0}
              style={{ width: '100%' }}
              value={form.maxDurationSec}
              onChange={e => set('maxDurationSec', Number(e.target.value))}
            />
            <div className="prof-field-hint">0 = no limit</div>
          </div>
          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">Max Size (MB)</div>
            <input
              className="modal-input mono-input"
              type="number"
              min={0}
              style={{ width: '100%' }}
              value={form.maxSizeMb}
              onChange={e => set('maxSizeMb', Number(e.target.value))}
            />
            <div className="prof-field-hint">0 = no limit</div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { onStart(form); onClose() }}>
            Start Recording
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Continuous Config Modal ────────────────────────────────────────────────────

function ContinuousConfigModal({ current, onClose, onApply }: {
  current: ContinuousConfig
  onClose: () => void
  onApply: (cfg: { maxDiskMb: number; maxAgeSec: number; template: string; dumpOnExit: boolean }) => void
}) {
  const [form, setForm] = useState({
    maxDiskMb: current.maxDiskMb,
    maxAgeSec: current.maxAgeSec,
    template: current.template,
    dumpOnExit: current.dumpOnExit,
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-title">
          Configure Continuous Recording
          <button className="btn-ghost btn-xs" onClick={onClose}><IconX size={12} /></button>
        </div>

        <div className="modal-field">
          <div className="modal-label">Template</div>
          <select
            className="modal-select modal-select-full"
            value={form.template}
            onChange={e => set('template', e.target.value)}
          >
            <option value="default">default — low overhead (&lt;1%)</option>
            <option value="profile">profile — detailed (~2-5% overhead)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">Max Disk (MB)</div>
            <input
              className="modal-input mono-input"
              type="number"
              min={32}
              max={4096}
              style={{ width: '100%' }}
              value={form.maxDiskMb}
              onChange={e => set('maxDiskMb', Number(e.target.value))}
            />
          </div>
          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">Max Age (sec)</div>
            <input
              className="modal-input mono-input"
              type="number"
              min={60}
              style={{ width: '100%' }}
              value={form.maxAgeSec}
              onChange={e => set('maxAgeSec', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="modal-field">
          <label className="net-toggle">
            <input
              type="checkbox"
              checked={form.dumpOnExit}
              onChange={e => set('dumpOnExit', e.target.checked)}
            />
            <span style={{ fontSize: '12.5px', color: 'var(--ash)' }}>
              Dump to disk on JVM exit (crash protection)
            </span>
          </label>
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--ghost)', marginBottom: 16, lineHeight: 1.5 }}>
          Changes take effect immediately — the continuous recording restarts with the new settings.
          Unsaved buffer data is lost.
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { onApply(form); onClose() }}>
            Apply &amp; Restart
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProfilingPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [viewEvents, setViewEvents] = useState<JfrRecording | null>(null)
  const [showStartModal, setShowStartModal] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dumpName, setDumpName] = useState('')

  const { data: status, isLoading: statusLoading } = useQuery<ProfilingStatus>({
    queryKey: ['profiling-status'],
    queryFn: () => api.get('/profiling/status').then(r => r.data),
    refetchInterval: 5_000,
  })

  const { data: recordings = [], isLoading: recsLoading } = useQuery<JfrRecording[]>({
    queryKey: ['profiling-recordings'],
    queryFn: () => api.get('/profiling/recordings').then(r => r.data),
    refetchInterval: 8_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['profiling-status'] })
    qc.invalidateQueries({ queryKey: ['profiling-recordings'] })
  }

  const startContinuousMut = useMutation({
    mutationFn: (req: object) => api.post('/profiling/continuous/start', req),
    onSuccess: () => { invalidate(); toast.success('Continuous recording started') },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to start recording'),
  })

  const stopContinuousMut = useMutation({
    mutationFn: () => api.post('/profiling/continuous/stop'),
    onSuccess: () => { invalidate(); toast.success('Continuous recording stopped') },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to stop recording'),
  })

  const dumpMut = useMutation({
    mutationFn: (name: string) => api.post('/profiling/continuous/dump', { name }),
    onSuccess: () => { invalidate(); toast.success('Buffer dumped to disk'); setDumpName('') },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to dump buffer'),
  })

  const startNamedMut = useMutation({
    mutationFn: (req: object) => api.post('/profiling/recording/start', req),
    onSuccess: () => { invalidate(); toast.success('Recording started') },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to start recording'),
  })

  const stopNamedMut = useMutation({
    mutationFn: (id: string) => api.post(`/profiling/recording/${id}/stop`),
    onSuccess: () => { invalidate(); toast.success('Recording stopped') },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to stop recording'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/profiling/recording/${id}`),
    onSuccess: () => { setDeletingId(null); invalidate(); toast.success('Recording deleted') },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to delete recording'),
  })

  const handleDownload = (rec: JfrRecording) => {
    const a = document.createElement('a')
    a.href = `/api/profiling/recording/${rec.id}/download`
    a.download = `${rec.name}.jfr`
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      // Fetch with auth header and create blob URL
      fetch(`/api/profiling/recording/${rec.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `${rec.name}.jfr`
          link.click()
          URL.revokeObjectURL(url)
        })
        .catch(() => toast.error('Failed to download recording'))
    }
  }

  const isLoading = statusLoading && recsLoading

  const jfrOk = status?.jfrAvailable ?? false
  const contRunning = status?.continuousRunning ?? false
  const cfg = status?.config
  const recInfo = status?.recordings

  const activeRecordings = recordings.filter(r => r.status === 'RUNNING')
  const savedRecordings = recordings.filter(r => r.status !== 'RUNNING')

  return (
    <div className="prof-page">
      <div className="prof-header">
        <div className="prof-title-row">
          <IconFlightRecorder size={16} />
          <span className="prof-title">Profiling</span>
          {!isLoading && (
            <span className={`prof-avail-pill ${jfrOk ? 'ok' : 'unavail'}`}>
              <span className="prof-avail-dot" />
              {jfrOk ? 'JFR available' : 'JFR unavailable'}
            </span>
          )}
        </div>
        {!jfrOk && !statusLoading && (
          <div className="prof-banner prof-banner-warn">
            Java Flight Recorder is not available on this JVM. JFR requires HotSpot JDK 9 or later.
            All recording endpoints are disabled.
          </div>
        )}
      </div>

      {/* ── Continuous Recording ─────────────────────────── */}
      <div className="prof-section">
        <div className="prof-section-header">
          <span className="prof-section-title">Continuous Recording</span>
          <span className={`prof-status-pill ${contRunning ? 'running' : 'stopped'}`}>
            <span className="prof-status-dot" />
            {contRunning ? 'recording' : 'stopped'}
          </span>
        </div>

        {cfg && (
          <div className="prof-cfg-grid">
            <div className="prof-cfg-item">
              <span className="prof-cfg-label">Max Disk</span>
              <span className="prof-cfg-val">{cfg.maxDiskMb} MB</span>
            </div>
            <div className="prof-cfg-item">
              <span className="prof-cfg-label">Max Age</span>
              <span className="prof-cfg-val">{fmtDuration(cfg.maxAgeSec * 1000)}</span>
            </div>
            <div className="prof-cfg-item">
              <span className="prof-cfg-label">Template</span>
              <span className="prof-cfg-val">{cfg.template}</span>
            </div>
            <div className="prof-cfg-item">
              <span className="prof-cfg-label">Dump on Exit</span>
              <span className="prof-cfg-val">{cfg.dumpOnExit ? 'yes' : 'no'}</span>
            </div>
            {recInfo && (() => {
              const usedMb = recInfo.totalSizeBytes / 1_048_576
              const pct = recInfo.maxTotalDiskMb > 0 ? Math.min(1, usedMb / recInfo.maxTotalDiskMb) : 0
              const color = pct > 0.9 ? 'var(--status-critical)' : pct > 0.75 ? 'var(--status-serious)' : pct > 0.5 ? 'var(--status-warning)' : 'var(--status-good)'
              return (
                <div className="prof-cfg-item">
                  <span className="prof-cfg-label">Total Saved</span>
                  <span className="prof-cfg-val">{fmtBytes(recInfo.totalSizeBytes)} / {recInfo.maxTotalDiskMb} MB</span>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border/50">
                    <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: color }} />
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        <div className="prof-actions-row">
          {!contRunning ? (
            <button
              className="btn-primary btn-sm"
              disabled={!jfrOk || startContinuousMut.isPending}
              onClick={() => startContinuousMut.mutate({})}
            >
              <IconPlay size={12} /> Start
            </button>
          ) : (
            <button
              className="btn-ghost btn-sm"
              disabled={stopContinuousMut.isPending}
              onClick={() => stopContinuousMut.mutate()}
            >
              Stop
            </button>
          )}

          <button
            className="btn-ghost btn-sm"
            disabled={!jfrOk || !cfg}
            onClick={() => setShowConfigModal(true)}
          >
            Configure
          </button>

          <div className="prof-dump-row">
            <input
              className="modal-input prof-dump-input"
              placeholder="Dump name (optional)"
              value={dumpName}
              onChange={e => setDumpName(e.target.value)}
              disabled={!contRunning}
            />
            <button
              className="btn-ghost btn-sm"
              disabled={!contRunning || dumpMut.isPending}
              onClick={() => dumpMut.mutate(dumpName)}
              title="Snapshot the rolling buffer to disk now"
            >
              <IconDownload size={12} /> Dump Now
            </button>
          </div>
        </div>
      </div>

      {/* ── Manual Recording ─────────────────────────────── */}
      <div className="prof-section">
        <div className="prof-section-header">
          <span className="prof-section-title">Manual Recordings</span>
          <button
            className="btn-primary btn-sm"
            disabled={!jfrOk}
            onClick={() => setShowStartModal(true)}
          >
            + New Recording
          </button>
        </div>

        {activeRecordings.length === 0 ? (
          <div className="prof-empty-hint">No recordings currently running.</div>
        ) : (
          <div className="prof-active-list">
            {activeRecordings.map(rec => (
              <div key={rec.id} className="prof-active-card">
                <div className="prof-active-info">
                  <span className="prof-active-name">{rec.name}</span>
                  <span className="prof-active-meta">
                    {rec.template} · started {fmtTime(rec.startTimeMs)}
                  </span>
                </div>
                <span className="prof-status-pill running" style={{ marginLeft: 'auto' }}>
                  <span className="prof-status-dot" />recording
                </span>
                <button
                  className="btn-ghost btn-sm"
                  disabled={stopNamedMut.isPending}
                  onClick={() => stopNamedMut.mutate(rec.id)}
                >
                  Stop
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Saved Recordings ─────────────────────────────── */}
      <div className="prof-section prof-section-grow">
        <div className="prof-section-header">
          <span className="prof-section-title">Saved Recordings</span>
          <button
            className="btn-ghost btn-xs"
            onClick={invalidate}
            title="Refresh"
          >
            <IconRefresh size={12} />
          </button>
        </div>

        {recsLoading && savedRecordings.length === 0 ? (
          <div className="prof-empty-hint">Loading…</div>
        ) : savedRecordings.length === 0 ? (
          <div className="prof-empty-state">
            <IconFlightRecorder size={28} />
            <span>No saved recordings</span>
            <span style={{ color: 'var(--ghost)', fontSize: 12 }}>
              Dump the buffer or stop a manual recording to see it here
            </span>
          </div>
        ) : (
          <div className="prof-table-wrap">
            {(() => {
              const dumpBytes = savedRecordings.filter(r => r.type === 'CONTINUOUS_DUMP').reduce((s, r) => s + (r.sizeBytes ?? 0), 0)
              const manualBytes = savedRecordings.filter(r => r.type !== 'CONTINUOUS_DUMP').reduce((s, r) => s + (r.sizeBytes ?? 0), 0)
              const total = dumpBytes + manualBytes
              if (total <= 0) return null
              const dumpPct = (dumpBytes / total) * 100
              return (
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-2 flex-1 overflow-hidden rounded-full">
                    {dumpBytes > 0 && <div className="rounded-l-full" style={{ width: `${dumpPct}%`, background: 'var(--chart-cat-1)' }} />}
                    {dumpBytes > 0 && manualBytes > 0 && <div className="w-0.5 shrink-0 bg-surface" />}
                    {manualBytes > 0 && <div className="rounded-r-full" style={{ width: `${100 - dumpPct}%`, background: 'var(--chart-cat-2)' }} />}
                  </div>
                  <span className="flex shrink-0 items-center gap-3 whitespace-nowrap font-mono text-[10px] text-text-muted">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--chart-cat-1)' }} />dump {fmtBytes(dumpBytes)}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--chart-cat-2)' }} />manual {fmtBytes(manualBytes)}</span>
                  </span>
                </div>
              )
            })()}
            <table className="prof-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Size</th>
                  <th>Template</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {savedRecordings.map(rec => (
                  <tr key={rec.id}>
                    <td>
                      <span className="prof-rec-name">{rec.name}</span>
                    </td>
                    <td>
                      <span className={`prof-type-badge ${rec.type === 'CONTINUOUS_DUMP' ? 'dump' : 'manual'}`}>
                        {rec.type === 'CONTINUOUS_DUMP' ? 'dump' : 'manual'}
                      </span>
                    </td>
                    <td>
                      <span className="prof-time">{fmtTime(rec.startTimeMs)}</span>
                    </td>
                    <td>
                      <span className="prof-mono">
                        {rec.endTimeMs ? fmtDuration(rec.endTimeMs - rec.startTimeMs) : '—'}
                      </span>
                    </td>
                    <td>
                      <span className="prof-mono">{fmtBytes(rec.sizeBytes)}</span>
                    </td>
                    <td>
                      <span className="prof-mono" style={{ color: 'var(--mist)' }}>{rec.template}</span>
                    </td>
                    <td>
                      <div className="net-actions">
                        <button
                          className="btn-ghost btn-xs"
                          title="View event summary"
                          onClick={() => setViewEvents(rec)}
                        >
                          View
                        </button>
                        <button
                          className="btn-ghost btn-xs"
                          title="Download .jfr file"
                          onClick={() => handleDownload(rec)}
                        >
                          <IconDownload size={12} />
                        </button>
                        {deletingId === rec.id ? (
                          <>
                            <button
                              className="btn-ghost btn-xs"
                              style={{ color: 'var(--red)' }}
                              onClick={() => deleteMut.mutate(rec.id)}
                            >
                              Confirm
                            </button>
                            <button className="btn-ghost btn-xs" onClick={() => setDeletingId(null)}>
                              <IconX size={10} />
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn-ghost btn-xs"
                            title="Delete recording"
                            onClick={() => setDeletingId(rec.id)}
                          >
                            <IconTrash size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}
      {viewEvents && (
        <EventSummaryModal recording={viewEvents} onClose={() => setViewEvents(null)} />
      )}

      {showStartModal && (
        <StartRecordingModal
          onClose={() => setShowStartModal(false)}
          onStart={req => startNamedMut.mutate(req)}
        />
      )}

      {showConfigModal && cfg && (
        <ContinuousConfigModal
          current={cfg}
          onClose={() => setShowConfigModal(false)}
          onApply={config => startContinuousMut.mutate(config)}
        />
      )}
    </div>
  )
}
