import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
} from 'recharts'
import { api, apiError, downloadViaToken } from '../api/client'
import { useToast } from '../ToastContext'
import {
  IconFlightRecorder, IconDownload, IconTrash, IconX, IconRefresh, IconPlay,
} from '../Icons'
import { usePollInterval } from '../shell/PageActivity'
import type { ChartTooltipProps } from './charts/chartTypes'

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
  const { t } = useTranslation(['profiling', 'common'])
  const { data: profile, isLoading, error } = useQuery<ParsedProfile>({
    queryKey: ['jfr-events', recording.id],
    queryFn: () => api.get(`/profiling/recording/${recording.id}/events`).then(r => r.data),
    staleTime: 300_000,
  })

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="prof-event-modal">
        <div className="modal-title">
          <span>{t('eventModal.title', { name: recording.name })}</span>
          <button className="btn-ghost btn-xs" onClick={onClose}><IconX size={12} /></button>
        </div>

        {isLoading && (
          <div className="prof-events-loading">
            <IconFlightRecorder size={28} />
            <span>{t('eventModal.parsingEvents')}</span>
            <span style={{ color: 'var(--ghost)', fontSize: '12px' }}>{t('eventModal.largeFileHint')}</span>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--red)', fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>
            {apiError(error, t('eventModal.failedToParse'))}
          </div>
        )}

        {profile && (
          <div className="prof-event-body">
            <div className="prof-event-stats">
              <div className="prof-stat-chip">
                <span className="prof-stat-label">{t('eventModal.duration')}</span>
                <span className="prof-stat-value">{fmtDuration(profile.durationMs)}</span>
              </div>
              <div className="prof-stat-chip">
                <span className="prof-stat-label">{t('eventModal.gcPauses')}</span>
                <span className="prof-stat-value">{profile.gcPauses.length}</span>
              </div>
              <div className="prof-stat-chip">
                <span className="prof-stat-label">{t('eventModal.peakThreads')}</span>
                <span className="prof-stat-value">{profile.threadCount || '—'}</span>
              </div>
              {profile.heapSummary && (
                <>
                  <div className="prof-stat-chip">
                    <span className="prof-stat-label">{t('eventModal.heapUsed')}</span>
                    <span className="prof-stat-value">{profile.heapSummary.usedMb.toFixed(0)} MB</span>
                  </div>
                  <div className="prof-stat-chip">
                    <span className="prof-stat-label">{t('eventModal.heapReserved')}</span>
                    <span className="prof-stat-value">{profile.heapSummary.reservedMb.toFixed(0)} MB</span>
                  </div>
                </>
              )}
            </div>

            {profile.cpuSamples.length > 0 && (
              <div className="prof-event-section">
                <div className="prof-event-section-title">{t('eventModal.cpuLoad')}</div>
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
                      content={({ active, payload }: ChartTooltipProps<unknown>) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}>
                            {payload.map(p => (
                              <div key={String(p.dataKey)} style={{ color: p.color }}>
                                {p.dataKey === 'machineTotal' ? t('eventModal.systemLabel') : t('eventModal.jvmLabel')}: {(Number(p.value || 0) * 100).toFixed(1)}%
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
                  <span><span style={{ color: 'var(--amber)' }}>——</span> {t('eventModal.jvmUserLegend')}</span>
                  <span><span style={{ color: 'var(--mist)' }}>——</span> {t('eventModal.systemTotalLegend')}</span>
                </div>
              </div>
            )}

            {profile.gcPauses.length > 0 && (
              <div className="prof-event-section">
                <div className="prof-event-section-title">{t('eventModal.gcPausesTitle', { count: profile.gcPauses.length })}</div>
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
                      content={({ active, payload }: ChartTooltipProps<unknown>) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--ash)' }}>
                            {t('eventModal.pauseTooltip', { value: Number(payload[0]?.value || 0).toFixed(2) })}
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="durationMs" fill="var(--blue)" opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ fontSize: 11, color: 'var(--ghost)', marginTop: 4 }}>
                  {t('eventModal.totalPauseTime', { value: fmtMs(profile.gcPauses.reduce((s, p) => s + p.durationMs, 0)) })}
                  {' · '}{t('eventModal.maxPause', { value: fmtMs(Math.max(...profile.gcPauses.map(p => p.durationMs))) })}
                </div>
              </div>
            )}

            {profile.topLocks.length > 0 && (() => {
              const topLocks = profile.topLocks.slice(0, 10).map(l => ({ ...l, shortName: shortClass(l.className) }))
              return (
                <div className="prof-event-section">
                  <div className="prof-event-section-title">{t('eventModal.topLockContention')}</div>
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
                        content={({ active, payload }: ChartTooltipProps<(typeof topLocks)[number]>) => {
                          const d = payload?.[0]?.payload
                          if (!active || !d) return null
                          return (
                            <div className="rounded-sm border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-text-primary">
                              <div className="mb-0.5" title={d.className}>{d.shortName}</div>
                              <div className="text-text-muted">{t('eventModal.lockEventsCount', { value: fmtMs(d.totalBlockedMs), count: d.count.toLocaleString() })}</div>
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
                      {t('eventModal.viewExactCounts')}
                    </summary>
                    <table className="prof-lock-table mt-1.5">
                      <thead>
                        <tr>
                          <th>{t('eventModal.classHeader')}</th>
                          <th>{t('eventModal.totalBlockedHeader')}</th>
                          <th>{t('eventModal.countHeader')}</th>
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
                {t('eventModal.noEventData')}
              </div>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>{t('common:close')}</button>
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
  const { t } = useTranslation(['profiling', 'common'])
  const [form, setForm] = useState({ name: '', template: 'default', maxDurationSec: 60, maxSizeMb: 0 })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-title">
          {t('startModal.title')}
          <button className="btn-ghost btn-xs" onClick={onClose}><IconX size={12} /></button>
        </div>

        <div className="modal-field">
          <div className="modal-label">{t('startModal.nameLabel')}</div>
          <input
            className="modal-input"
            placeholder={t('startModal.namePlaceholder')}
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>

        <div className="modal-field">
          <div className="modal-label">{t('startModal.templateLabel')}</div>
          <select
            className="modal-select modal-select-full"
            value={form.template}
            onChange={e => set('template', e.target.value)}
          >
            <option value="default">{t('startModal.templateDefaultOption')}</option>
            <option value="profile">{t('startModal.templateProfileOption')}</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">{t('startModal.maxDurationLabel')}</div>
            <input
              className="modal-input mono-input"
              type="number"
              min={0}
              style={{ width: '100%' }}
              value={form.maxDurationSec}
              onChange={e => set('maxDurationSec', Number(e.target.value))}
            />
            <div className="prof-field-hint">{t('startModal.noLimitHint')}</div>
          </div>
          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">{t('startModal.maxSizeLabel')}</div>
            <input
              className="modal-input mono-input"
              type="number"
              min={0}
              style={{ width: '100%' }}
              value={form.maxSizeMb}
              onChange={e => set('maxSizeMb', Number(e.target.value))}
            />
            <div className="prof-field-hint">{t('startModal.noLimitHint')}</div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>{t('common:cancel')}</button>
          <button className="btn-primary" onClick={() => { onStart(form); onClose() }}>
            {t('startModal.startButton')}
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
  const { t } = useTranslation(['profiling', 'common'])
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
          {t('configModal.title')}
          <button className="btn-ghost btn-xs" onClick={onClose}><IconX size={12} /></button>
        </div>

        <div className="modal-field">
          <div className="modal-label">{t('configModal.templateLabel')}</div>
          <select
            className="modal-select modal-select-full"
            value={form.template}
            onChange={e => set('template', e.target.value)}
          >
            <option value="default">{t('configModal.templateDefaultOption')}</option>
            <option value="profile">{t('configModal.templateProfileOption')}</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">{t('configModal.maxDiskLabel')}</div>
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
            <div className="modal-label">{t('configModal.maxAgeLabel')}</div>
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
              {t('configModal.dumpOnExitLabel')}
            </span>
          </label>
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--ghost)', marginBottom: 16, lineHeight: 1.5 }}>
          {t('configModal.restartNotice')}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>{t('common:cancel')}</button>
          <button className="btn-primary" onClick={() => { onApply(form); onClose() }}>
            {t('configModal.applyButton')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProfilingPage() {
  const { t } = useTranslation(['profiling', 'common'])
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
    refetchInterval: usePollInterval(5_000),
  })

  const { data: recordings = [], isLoading: recsLoading } = useQuery<JfrRecording[]>({
    queryKey: ['profiling-recordings'],
    queryFn: () => api.get('/profiling/recordings').then(r => r.data),
    refetchInterval: usePollInterval(8_000),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['profiling-status'] })
    qc.invalidateQueries({ queryKey: ['profiling-recordings'] })
  }

  const startContinuousMut = useMutation({
    mutationFn: (req: object) => api.post('/profiling/continuous/start', req),
    onSuccess: () => { invalidate(); toast.success(t('toastContinuousStarted')) },
    onError: (e: unknown) => toast.error(apiError(e, t('toastStartFailed'))),
  })

  const stopContinuousMut = useMutation({
    mutationFn: () => api.post('/profiling/continuous/stop'),
    onSuccess: () => { invalidate(); toast.success(t('toastContinuousStopped')) },
    onError: (e: unknown) => toast.error(apiError(e, t('toastStopFailed'))),
  })

  const dumpMut = useMutation({
    mutationFn: (name: string) => api.post('/profiling/continuous/dump', { name }),
    onSuccess: () => { invalidate(); toast.success(t('toastBufferDumped')); setDumpName('') },
    onError: (e: unknown) => toast.error(apiError(e, t('toastDumpFailed'))),
  })

  const startNamedMut = useMutation({
    mutationFn: (req: object) => api.post('/profiling/recording/start', req),
    onSuccess: () => { invalidate(); toast.success(t('toastRecordingStarted')) },
    onError: (e: unknown) => toast.error(apiError(e, t('toastStartFailed'))),
  })

  const stopNamedMut = useMutation({
    mutationFn: (id: string) => api.post(`/profiling/recording/${id}/stop`),
    onSuccess: () => { invalidate(); toast.success(t('toastRecordingStopped')) },
    onError: (e: unknown) => toast.error(apiError(e, t('toastStopFailed'))),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/profiling/recording/${id}`),
    onSuccess: () => { setDeletingId(null); invalidate(); toast.success(t('toastRecordingDeleted')) },
    onError: (e: unknown) => toast.error(apiError(e, t('toastDeleteFailed'))),
  })

  const handleDownload = (rec: JfrRecording) => {
    downloadViaToken(`/profiling/recording/${rec.id}/download-token`)
      .catch(() => toast.error(t('toastDownloadFailed')))
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
          <span className="prof-title">{t('pageTitle')}</span>
          {!isLoading && (
            <span className={`prof-avail-pill ${jfrOk ? 'ok' : 'unavail'}`}>
              <span className="prof-avail-dot" />
              {jfrOk ? t('jfrAvailable') : t('jfrUnavailable')}
            </span>
          )}
        </div>
        {!jfrOk && !statusLoading && (
          <div className="prof-banner prof-banner-warn">
            {t('jfrUnavailableBanner')}
          </div>
        )}
      </div>

      {/* ── Continuous Recording ─────────────────────────── */}
      <div className="prof-section">
        <div className="prof-section-header">
          <span className="prof-section-title">{t('continuousRecordingTitle')}</span>
          <span className={`prof-status-pill ${contRunning ? 'running' : 'stopped'}`}>
            <span className="prof-status-dot" />
            {contRunning ? t('statusRecording') : t('statusStopped')}
          </span>
        </div>

        {cfg && (
          <div className="prof-cfg-grid">
            <div className="prof-cfg-item">
              <span className="prof-cfg-label">{t('maxDisk')}</span>
              <span className="prof-cfg-val">{cfg.maxDiskMb} MB</span>
            </div>
            <div className="prof-cfg-item">
              <span className="prof-cfg-label">{t('maxAge')}</span>
              <span className="prof-cfg-val">{fmtDuration(cfg.maxAgeSec * 1000)}</span>
            </div>
            <div className="prof-cfg-item">
              <span className="prof-cfg-label">{t('template')}</span>
              <span className="prof-cfg-val">{cfg.template}</span>
            </div>
            <div className="prof-cfg-item">
              <span className="prof-cfg-label">{t('dumpOnExit')}</span>
              <span className="prof-cfg-val">{cfg.dumpOnExit ? t('common:yes') : t('common:no')}</span>
            </div>
            {recInfo && (() => {
              const usedMb = recInfo.totalSizeBytes / 1_048_576
              const pct = recInfo.maxTotalDiskMb > 0 ? Math.min(1, usedMb / recInfo.maxTotalDiskMb) : 0
              const color = pct > 0.9 ? 'var(--status-critical)' : pct > 0.75 ? 'var(--status-serious)' : pct > 0.5 ? 'var(--status-warning)' : 'var(--status-good)'
              return (
                <div className="prof-cfg-item">
                  <span className="prof-cfg-label">{t('totalSaved')}</span>
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
              <IconPlay size={12} /> {t('startButton')}
            </button>
          ) : (
            <button
              className="btn-ghost btn-sm"
              disabled={stopContinuousMut.isPending}
              onClick={() => stopContinuousMut.mutate()}
            >
              {t('stopButton')}
            </button>
          )}

          <button
            className="btn-ghost btn-sm"
            disabled={!jfrOk || !cfg}
            onClick={() => setShowConfigModal(true)}
          >
            {t('configureButton')}
          </button>

          <div className="prof-dump-row">
            <input
              className="modal-input prof-dump-input"
              placeholder={t('dumpNamePlaceholder')}
              value={dumpName}
              onChange={e => setDumpName(e.target.value)}
              disabled={!contRunning}
            />
            <button
              className="btn-ghost btn-sm"
              disabled={!contRunning || dumpMut.isPending}
              onClick={() => dumpMut.mutate(dumpName)}
              title={t('dumpNowTitle')}
            >
              <IconDownload size={12} /> {t('dumpNowButton')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Manual Recording ─────────────────────────────── */}
      <div className="prof-section">
        <div className="prof-section-header">
          <span className="prof-section-title">{t('manualRecordingsTitle')}</span>
          <button
            className="btn-primary btn-sm"
            disabled={!jfrOk}
            onClick={() => setShowStartModal(true)}
          >
            {t('newRecordingButton')}
          </button>
        </div>

        {activeRecordings.length === 0 ? (
          <div className="prof-empty-hint">{t('noRecordingsRunning')}</div>
        ) : (
          <div className="prof-active-list">
            {activeRecordings.map(rec => (
              <div key={rec.id} className="prof-active-card">
                <div className="prof-active-info">
                  <span className="prof-active-name">{rec.name}</span>
                  <span className="prof-active-meta">
                    {t('activeMeta', { template: rec.template, time: fmtTime(rec.startTimeMs) })}
                  </span>
                </div>
                <span className="prof-status-pill running" style={{ marginLeft: 'auto' }}>
                  <span className="prof-status-dot" />{t('statusRecording')}
                </span>
                <button
                  className="btn-ghost btn-sm"
                  disabled={stopNamedMut.isPending}
                  onClick={() => stopNamedMut.mutate(rec.id)}
                >
                  {t('stopButton')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Saved Recordings ─────────────────────────────── */}
      <div className="prof-section prof-section-grow">
        <div className="prof-section-header">
          <span className="prof-section-title">{t('savedRecordingsTitle')}</span>
          <button
            className="btn-ghost btn-xs"
            onClick={invalidate}
            title={t('common:refresh')}
          >
            <IconRefresh size={12} />
          </button>
        </div>

        {recsLoading && savedRecordings.length === 0 ? (
          <div className="prof-empty-hint">{t('common:loading')}</div>
        ) : savedRecordings.length === 0 ? (
          <div className="prof-empty-state">
            <IconFlightRecorder size={28} />
            <span>{t('noSavedRecordings')}</span>
            <span style={{ color: 'var(--ghost)', fontSize: 12 }}>
              {t('noSavedRecordingsHint')}
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
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--chart-cat-1)' }} />{t('dumpLegend', { size: fmtBytes(dumpBytes) })}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--chart-cat-2)' }} />{t('manualLegend', { size: fmtBytes(manualBytes) })}</span>
                  </span>
                </div>
              )
            })()}
            <table className="prof-table">
              <thead>
                <tr>
                  <th>{t('tableName')}</th>
                  <th>{t('tableType')}</th>
                  <th>{t('tableStarted')}</th>
                  <th>{t('tableDuration')}</th>
                  <th>{t('tableSize')}</th>
                  <th>{t('tableTemplate')}</th>
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
                        {rec.type === 'CONTINUOUS_DUMP' ? t('typeDump') : t('typeManual')}
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
                          title={t('viewEventSummaryTitle')}
                          onClick={() => setViewEvents(rec)}
                        >
                          {t('viewButton')}
                        </button>
                        <button
                          className="btn-ghost btn-xs"
                          title={t('downloadTitle')}
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
                              {t('common:confirm')}
                            </button>
                            <button className="btn-ghost btn-xs" onClick={() => setDeletingId(null)}>
                              <IconX size={10} />
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn-ghost btn-xs"
                            title={t('deleteTitle')}
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
