import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { api } from '../api/client'
import { useSettings } from '../SettingsContext'
import { useLogs } from '../LogContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Status {
  name: string; version: string
  onlinePlayers: number; maxPlayers: number; tps: number[]
  worldCount: number; pluginCount: number
}

interface Snap {
  timestamp: number
  tps1: number; tps5: number; tps15: number
  tickTimeMs: number
  memUsedMb: number; memMaxMb: number; memTotalMb: number
  uptimeMs: number
  cpuPercent?: number | null
  sysMemUsedMb?: number | null; sysMemTotalMb?: number | null
  diskUsedGb?: number | null; diskTotalGb?: number | null
  playerCount: number
  entityCount: number
  loadedChunks: number
  pingP50?: number | null
  pingP95?: number | null
}

interface PlayerEvent {
  ts: number; uuid: string; name: string; action: 'join' | 'leave'
}

interface LogLine { ts: number; line: string }

type Range = '1h' | '6h' | '24h' | '7d'
const RANGE_MINUTES: Record<Range, number> = { '1h': 60, '6h': 360, '24h': 1440, '7d': 10080 }
const RANGES: Range[] = ['1h', '6h', '24h', '7d']

// ── Helpers ───────────────────────────────────────────────────────────────────

function tpsClass(v: number) { return v >= 19 ? 'green' : v >= 15 ? 'yellow' : 'red' }
function memClass(p: number) { return p < 0.65 ? 'green' : p < 0.85 ? 'amber' : 'red' }
function cpuClass(p: number) { return p < 50 ? 'green' : p < 80 ? 'amber' : 'red' }
function tickClass(ms: number) { return ms <= 50 ? 'green' : ms <= 100 ? 'amber' : 'red' }
function diskClass(p: number) { return p < 0.75 ? 'green' : p < 0.9 ? 'amber' : 'red' }
function fmtMem(mb: number) { return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB` }
function fmtUptime(ms: number) {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}
function pad(n: number) { return n.toString().padStart(2, '0') }
function fmtTime(ts: number) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
function fmtTimeFull(ts: number) {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function fmtK(v: number) { return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)) }

const MAX_PTS = 400
function downsample<T extends { timestamp: number }>(data: T[]): T[] {
  if (data.length <= MAX_PTS) return data
  const step = Math.ceil(data.length / MAX_PTS)
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
}

function computeStats(values: (number | null)[]): { mean: number; std: number } | null {
  const valid = values.filter((v): v is number => v !== null && isFinite(v))
  if (valid.length < 3) return null
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length
  const std = Math.sqrt(valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length)
  return std < 0.0001 ? null : { mean, std }
}

function pearson(xs: (number | null)[], ys: (number | null)[]): number | null {
  const pairs = xs.map((x, i) => [x, ys[i]] as [number | null, number | null])
    .filter(([x, y]) => x !== null && y !== null && isFinite(x) && isFinite(y)) as [number, number][]
  if (pairs.length < 5) return null
  const n = pairs.length
  const mx = pairs.reduce((s, [x]) => s + x, 0) / n
  const my = pairs.reduce((s, [, y]) => s + y, 0) / n
  const num = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0)
  const dx = Math.sqrt(pairs.reduce((s, [x]) => s + (x - mx) ** 2, 0))
  const dy = Math.sqrt(pairs.reduce((s, [, y]) => s + (y - my) ** 2, 0))
  return dx * dy < 0.0001 ? null : num / (dx * dy)
}

// ── Mini chart ─────────────────────────────────────────────────────────────────

interface MiniChartProps {
  data: Snap[]
  dataKey: keyof Snap
  color: string
  label: string
  yDomain?: [number | 'auto', number | 'auto']
  yFmt?: (v: number) => string
  events?: PlayerEvent[]
  extraLine?: { key: keyof Snap; color: string; label: string }
}

function MiniChart({ data, dataKey, color, label, yDomain, yFmt, events, extraLine }: MiniChartProps) {
  const fmt = yFmt ?? ((v: number) => String(v))
  const current = data[data.length - 1]

  function ChartTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const snap = payload[0].payload as Snap
    return (
      <div className="glance-tooltip">
        <div className="glance-tooltip-time">{fmtTimeFull(snap.timestamp)}</div>
        <div className="glance-tooltip-metrics">
          <div className="tooltip-metric-row">
            <span className="tm-sigma" />
            <span className="tm-label">{label}</span>
            <span className="tm-value">{fmt(Number(snap[dataKey] ?? 0))}</span>
            {extraLine && <span className="tm-mean">{extraLine.label} {fmt(Number(snap[extraLine.key] ?? 0))}</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="glance-chart-card">
      <div className="glance-chart-header">
        <span className="glance-chart-title">{label}</span>
        {current && <span className="glance-chart-value" style={{ color }}>{fmt(Number(current[dataKey] ?? 0))}</span>}
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`fill-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']}
            tickFormatter={fmtTime}
            tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 9 }}
            tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={60} />
          <YAxis domain={yDomain ?? ['auto', 'auto']} width={38}
            tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 9 }}
            tickLine={false} axisLine={false} tickCount={3} tickFormatter={fmt} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border-hi)', strokeWidth: 1 }} />
          {events?.map(ev => (
            <ReferenceLine key={`${ev.ts}-${ev.uuid}`} x={ev.ts}
              stroke={ev.action === 'join' ? 'var(--green)' : 'var(--red)'}
              strokeWidth={1} strokeOpacity={0.55} strokeDasharray="2 3" />
          ))}
          <Area type="monotone" dataKey={String(dataKey)} stroke={color} strokeWidth={1.5}
            fill={`url(#fill-${String(dataKey)})`} dot={false}
            activeDot={{ r: 3, fill: color, stroke: 'var(--elevated)', strokeWidth: 1 }}
            isAnimationActive={false} connectNulls />
          {extraLine && (
            <Line type="monotone" dataKey={String(extraLine.key)} stroke={extraLine.color}
              strokeWidth={1} dot={false} isAnimationActive={false} strokeDasharray="3 2" connectNulls />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Z-Score Overlay ────────────────────────────────────────────────────────────

interface ZSeries {
  key: keyof Snap
  label: string
  color: string
  extract?: (s: Snap) => number | null
}

interface ZOverlayProps {
  data: Snap[]
  series: ZSeries[]
  title: string
  showMarkers: boolean
  threshold: number
  onAnomalyClick: (ts: number) => void
}

function ZOverlay({ data, series, title, showMarkers, threshold, onAnomalyClick }: ZOverlayProps) {
  // Precompute Z-scores for each series
  const zData = useMemo(() => {
    const extracted = series.map(s =>
      data.map(snap => s.extract ? s.extract(snap) : (snap[s.key] as number | null | undefined) ?? null)
    )
    const stats = extracted.map(vals => computeStats(vals))

    return data.map((snap, i) => {
      const obj: Record<string, unknown> = { timestamp: snap.timestamp, _snap: snap }
      series.forEach((s, si) => {
        const v = extracted[si][i]
        const st = stats[si]
        obj[`z_${String(s.key)}`] = (v !== null && st) ? (v - st.mean) / st.std : null
      })
      return obj as Record<string, unknown> & { timestamp: number; _snap: Snap }
    })
  }, [data, series])

  function getZVal(pt: Record<string, unknown>, key: keyof Snap): number | null {
    const v = pt[`z_${String(key)}`]
    return typeof v === 'number' && isFinite(v) ? v : null
  }

  // Find anomaly timestamps (any series exceeds threshold)
  const anomalyTs = useMemo(() => {
    if (!showMarkers) return []
    return zData
      .filter(pt => series.some(s => {
        const z = getZVal(pt, s.key)
        return z !== null && Math.abs(z) >= threshold
      }))
      .map(pt => pt.timestamp as number)
  }, [zData, series, showMarkers, threshold])

  function getZ(pt: Record<string, unknown>, key: keyof Snap): number | null {
    const v = pt[`z_${String(key)}`]
    return typeof v === 'number' && isFinite(v) ? v : null
  }

  function ZTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const pt = payload[0].payload as Record<string, unknown> & { _snap: Snap }
    const snap = pt._snap
    return (
      <div className="glance-tooltip">
        <div className="glance-tooltip-time">{fmtTimeFull(snap.timestamp)}</div>
        <div className="glance-tooltip-metrics">
          {series.map(s => {
            const z = getZ(pt, s.key)
            if (z === null) return null
            const isAnomaly = Math.abs(z) >= threshold
            return (
              <div key={String(s.key)} className={`tooltip-metric-row${isAnomaly ? ' anomaly' : ''}`}>
                <span className="tm-sigma" style={{ color: s.color }}>
                  {isAnomaly ? (z > 0 ? '+' : '') + z.toFixed(1) + 'σ' : ''}
                </span>
                <span className="tm-label">{s.label}</span>
                <span className="tm-value" style={{ color: isAnomaly ? s.color : undefined }}>
                  {z > 0 ? '+' : ''}{z.toFixed(2)}σ
                </span>
              </div>
            )
          })}
        </div>
        {showMarkers && series.some(s => {
          const z = getZ(pt, s.key)
          return z !== null && Math.abs(z) >= threshold
        }) && (
          <div className="glance-tooltip-logs-hint" onClick={() => onAnomalyClick(snap.timestamp)}>
            ⚡ Click to see nearby logs
          </div>
        )}
      </div>
    )
  }

  if (data.length < 3) return null

  return (
    <div className="glance-chart-card">
      <div className="glance-chart-header">
        <span className="glance-chart-title">{title}</span>
        <div className="z-legend">
          {series.map(s => (
            <span key={String(s.key)} className="z-legend-item">
              <span className="z-legend-dot" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={zData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          onClick={(e: any) => {
            const pt = e?.activePayload?.[0]?.payload as Record<string, unknown> | undefined
            if (pt && showMarkers) {
              const hasAnomaly = series.some(s => {
                const z = getZVal(pt, s.key)
                return z !== null && Math.abs(z) >= threshold
              })
              if (hasAnomaly) onAnomalyClick(pt.timestamp as number)
            }
          }}
        >
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']}
            tickFormatter={fmtTime}
            tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 9 }}
            tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={60} />
          <YAxis width={32}
            tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 9 }}
            tickLine={false} axisLine={false} tickCount={5}
            tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}σ`} />
          <Tooltip content={<ZTooltip />} cursor={{ stroke: 'var(--border-hi)', strokeWidth: 1 }} />

          {/* threshold bands */}
          <ReferenceLine y={threshold} stroke="var(--red)" strokeOpacity={0.25} strokeDasharray="3 3" strokeWidth={1} />
          <ReferenceLine y={-threshold} stroke="var(--red)" strokeOpacity={0.25} strokeDasharray="3 3" strokeWidth={1} />
          <ReferenceLine y={0} stroke="var(--border-hi)" strokeWidth={1} />

          {/* anomaly markers */}
          {anomalyTs.map(ts => (
            <ReferenceLine key={ts} x={ts}
              stroke="var(--amber)" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="1 4" />
          ))}

          {series.map(s => (
            <Line key={String(s.key)} type="monotone" dataKey={`z_${String(s.key)}`}
              stroke={s.color} strokeWidth={1.5} dot={false}
              isAnimationActive={false} connectNulls />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Correlation table ──────────────────────────────────────────────────────────

interface CorrMetric { key: keyof Snap; label: string; extract?: (s: Snap) => number | null }

const CORR_METRICS: CorrMetric[] = [
  { key: 'tps1',        label: 'TPS' },
  { key: 'tickTimeMs',  label: 'MSPT' },
  { key: 'memUsedMb',   label: 'JVM Mem' },
  { key: 'cpuPercent',  label: 'CPU',      extract: s => (s.cpuPercent != null && s.cpuPercent >= 0) ? s.cpuPercent : null },
  { key: 'playerCount', label: 'Players' },
  { key: 'entityCount', label: 'Entities' },
  { key: 'loadedChunks',label: 'Chunks' },
  { key: 'pingP50',     label: 'Ping P50', extract: s => (s.pingP50 != null && s.pingP50 > 0) ? s.pingP50 : null },
]

function rColor(r: number): string {
  const abs = Math.abs(r)
  if (abs < 0.2) return 'var(--ghost)'
  const sign = r > 0 ? 1 : -1
  if (abs > 0.7) return sign > 0 ? 'var(--green)' : 'var(--red)'
  if (abs > 0.4) return sign > 0 ? '#6ee7a0' : '#f9a8a8'
  return sign > 0 ? '#a7f3d0' : '#fecaca'
}

function rBg(r: number): string {
  const abs = Math.abs(r)
  if (abs < 0.2) return 'transparent'
  const opacity = Math.min(abs * 0.35, 0.25)
  return r > 0 ? `rgba(74,222,128,${opacity})` : `rgba(248,113,113,${opacity})`
}

interface CorrelationTableProps { data: Snap[] }

function CorrelationTable({ data }: CorrelationTableProps) {
  const matrix = useMemo(() => {
    const cols = CORR_METRICS.map(m =>
      data.map(s => m.extract ? m.extract(s) : (s[m.key] as number | null | undefined) ?? null)
    )
    const n = CORR_METRICS.length
    const grid: (number | null)[][] = Array.from({ length: n }, () => Array(n).fill(null))
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        grid[i][j] = pearson(cols[i], cols[j])
      }
    }
    return grid
  }, [data])

  // Check which metrics have any data
  const hasData = useMemo(() =>
    CORR_METRICS.map(m =>
      data.some(s => {
        const v = m.extract ? m.extract(s) : (s[m.key] as number | null | undefined)
        return v !== null && v !== undefined && isFinite(Number(v))
      })
    ), [data])

  const activeMetrics = CORR_METRICS.filter((_, i) => hasData[i])
  if (activeMetrics.length < 2) return null

  return (
    <div className="corr-wrap">
      <div className="glance-chart-header" style={{ paddingBottom: 8 }}>
        <span className="glance-chart-title">Metric Correlations (Pearson r)</span>
        <span className="corr-hint">|r| &gt; 0.7 strong · 0.4–0.7 moderate · &lt;0.2 negligible</span>
      </div>
      <div className="corr-table-scroll">
        <table className="corr-table">
          <thead>
            <tr>
              <th />
              {activeMetrics.slice(1).map(m => (
                <th key={m.label} className="corr-th">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeMetrics.slice(0, -1).map((rowM, ri) => {
              const globalRi = CORR_METRICS.findIndex(m => m.key === rowM.key)
              return (
                <tr key={rowM.label}>
                  <td className="corr-row-label">{rowM.label}</td>
                  {activeMetrics.slice(ri + 1).map(colM => {
                    const globalCi = CORR_METRICS.findIndex(m => m.key === colM.key)
                    const lo = Math.min(globalRi, globalCi)
                    const hi = Math.max(globalRi, globalCi)
                    const r = matrix[lo][hi]
                    return (
                      <td key={colM.label} className="corr-cell"
                        style={{ background: r !== null ? rBg(r) : undefined }}>
                        {r !== null
                          ? <span style={{ color: rColor(r) }}>{r.toFixed(2)}</span>
                          : <span style={{ color: 'var(--ghost)' }}>—</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Log panel ─────────────────────────────────────────────────────────────────

interface LogPanelProps {
  ts: number
  logs: LogLine[]
  onNavigate: () => void
  onClose: () => void
}

function LogPanel({ ts, logs, onNavigate, onClose }: LogPanelProps) {
  return (
    <div className="stats-log-panel">
      <div className="stats-log-panel-header">
        <span className="stats-log-panel-title">Logs near {fmtTimeFull(ts)}</span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button className="pill-btn" style={{ fontSize: 10, padding: '2px 8px', height: 22 }}
            onClick={onNavigate}>
            Go to Console
          </button>
          <button className="pill-btn" style={{ fontSize: 10, padding: '2px 8px', height: 22 }}
            onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      {logs.length === 0
        ? <div className="stats-log-empty">No log data available for this period — server log buffer holds recent entries only.</div>
        : logs.map((l, i) => (
          <div key={i} className="stats-log-line">{l.line}</div>
        ))
      }
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props { onNavigate?: (tab: string) => void }

export default function ServerStats({ onNavigate }: Props) {
  const { settings, update } = useSettings()
  const { getLogsAround } = useLogs()
  const ss = settings.stats
  const [range, setRange] = useState<Range>(ss.defaultRange)
  const [logPanelTs, setLogPanelTs] = useState<number | null>(null)

  const { data, isLoading } = useQuery<Status>({
    queryKey: ['status'],
    queryFn: () => api.get('/status').then(r => r.data),
    refetchInterval: 3000,
  })

  const { data: snap } = useQuery<Snap>({
    queryKey: ['glance-current'],
    queryFn: () => api.get('/glance/current').then(r => r.data),
    refetchInterval: 2000,
  })

  const windowMin = RANGE_MINUTES[range]

  const { data: historyRaw = [] } = useQuery<Snap[]>({
    queryKey: ['stats-history', windowMin],
    queryFn: () => api.get(`/glance/history?window=${windowMin}`).then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: eventsRaw = [] } = useQuery<PlayerEvent[]>({
    queryKey: ['player-events', windowMin],
    queryFn: () => api.get(`/stats/player-events?minutes=${windowMin}`).then(r => r.data),
    refetchInterval: 30_000,
    enabled: ss.showChartPlayers,
  })

  const history = useMemo(() => downsample(historyRaw), [historyRaw])

  const hasPingData = useMemo(
    () => history.some(s => s.pingP50 != null && s.pingP50 > 0),
    [history]
  )
  const hasCpuData = useMemo(
    () => history.some(s => s.cpuPercent != null && s.cpuPercent >= 0),
    [history]
  )

  const onAnomalyClick = useCallback((ts: number) => {
    setLogPanelTs(ts)
  }, [])

  const logPanelLogs = useMemo((): LogLine[] => {
    if (logPanelTs === null) return []
    return getLogsAround(logPanelTs, 30_000).map(l => ({ ts: l.ts, line: l.line }))
  }, [logPanelTs, getLogsAround])

  const perfSeries: ZSeries[] = useMemo(() => {
    const s: ZSeries[] = [
      { key: 'tps1',       label: 'TPS',    color: 'var(--green)' },
      { key: 'tickTimeMs', label: 'MSPT',   color: 'var(--amber)' },
      { key: 'memUsedMb',  label: 'JVM Mem',color: 'var(--blue)'  },
    ]
    if (hasCpuData) s.push({
      key: 'cpuPercent', label: 'CPU', color: 'var(--red)',
      extract: snap => (snap.cpuPercent != null && snap.cpuPercent >= 0) ? snap.cpuPercent : null,
    })
    return s
  }, [hasCpuData])

  const worldSeries: ZSeries[] = useMemo(() => {
    const s: ZSeries[] = [
      { key: 'playerCount',  label: 'Players',  color: 'var(--amber)' },
      { key: 'entityCount',  label: 'Entities', color: 'var(--blue)'  },
      { key: 'loadedChunks', label: 'Chunks',   color: 'var(--mist)'  },
    ]
    if (hasPingData) s.push({
      key: 'pingP50', label: 'Ping', color: 'var(--green)',
      extract: snap => (snap.pingP50 != null && snap.pingP50 > 0) ? snap.pingP50 : null,
    })
    return s
  }, [hasPingData])

  const changeRange = (r: Range) => {
    setRange(r)
    update({ stats: { defaultRange: r } })
  }

  if (isLoading || !data) return <div className="section-root"><div className="dim">Loading…</div></div>

  const [tps1, tps5, tps15] = data.tps
  const memPct = snap && snap.memMaxMb > 0 ? snap.memUsedMb / snap.memMaxMb : 0
  const sysMemPct = snap?.sysMemUsedMb && snap?.sysMemTotalMb ? snap.sysMemUsedMb / snap.sysMemTotalMb : null
  const diskPct = snap?.diskUsedGb && snap?.diskTotalGb ? snap.diskUsedGb / snap.diskTotalGb : null

  return (
    <div className="section-root">
      <div className="section-header">
        <span className="section-title">Server Stats</span>
        <div className="stats-range-sel">
          {RANGES.map(r => (
            <button key={r} className={`stats-range-btn${range === r ? ' active' : ''}`}
              onClick={() => changeRange(r)}>{r}</button>
          ))}
        </div>
      </div>

      <div className="server-name-display">{data.name}</div>
      <div className="server-version">{data.version}</div>

      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Players</div>
          <div className="stat-value amber">{data.onlinePlayers}</div>
          <div className="stat-sub">of {data.maxPlayers} max</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TPS · 1m</div>
          <div className={`stat-value ${tpsClass(tps1)}`}>{tps1?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">target 20.0</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TPS · 5m</div>
          <div className={`stat-value ${tpsClass(tps5)}`}>{tps5?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">5 min avg</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TPS · 15m</div>
          <div className={`stat-value ${tpsClass(tps15)}`}>{tps15?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">15 min avg</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tick Time</div>
          <div className={`stat-value ${snap ? tickClass(snap.tickTimeMs) : ''}`}>
            {snap ? `${Math.round(snap.tickTimeMs)}ms` : '—'}
          </div>
          <div className="stat-sub">healthy &lt;50ms</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">JVM Memory</div>
          <div className={`stat-value ${memClass(memPct)}`}>{snap ? fmtMem(snap.memUsedMb) : '—'}</div>
          <div className="stat-sub">{snap ? `of ${fmtMem(snap.memMaxMb)} max` : ''}</div>
        </div>
        {snap?.cpuPercent != null && snap.cpuPercent >= 0 && (
          <div className="stat-card">
            <div className="stat-label">Host CPU</div>
            <div className={`stat-value ${cpuClass(snap.cpuPercent)}`}>{snap.cpuPercent.toFixed(1)}%</div>
            <div className="stat-sub">system-wide</div>
          </div>
        )}
        {sysMemPct != null && snap?.sysMemUsedMb != null && snap?.sysMemTotalMb != null && (
          <div className="stat-card">
            <div className="stat-label">Host RAM</div>
            <div className={`stat-value ${memClass(sysMemPct)}`}>{fmtMem(snap.sysMemUsedMb)}</div>
            <div className="stat-sub">of {fmtMem(snap.sysMemTotalMb)}</div>
          </div>
        )}
        {diskPct != null && snap?.diskUsedGb != null && snap?.diskTotalGb != null && (
          <div className="stat-card">
            <div className="stat-label">Disk</div>
            <div className={`stat-value ${diskClass(diskPct)}`}>{snap.diskUsedGb} GB</div>
            <div className="stat-sub">of {snap.diskTotalGb} GB used</div>
          </div>
        )}
        {snap && (
          <div className="stat-card">
            <div className="stat-label">Entities</div>
            <div className="stat-value">{snap.entityCount.toLocaleString()}</div>
            <div className="stat-sub">all worlds</div>
          </div>
        )}
        {snap && (
          <div className="stat-card">
            <div className="stat-label">Chunks</div>
            <div className="stat-value">{snap.loadedChunks.toLocaleString()}</div>
            <div className="stat-sub">loaded</div>
          </div>
        )}
        {snap?.pingP50 != null && snap.pingP50 > 0 && (
          <div className="stat-card">
            <div className="stat-label">Ping P50</div>
            <div className="stat-value green">{snap.pingP50}ms</div>
            <div className="stat-sub">median latency</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">Uptime</div>
          <div className="stat-value">{snap ? fmtUptime(snap.uptimeMs) : '—'}</div>
          <div className="stat-sub">since last restart</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Worlds</div>
          <div className="stat-value amber">{data.worldCount}</div>
          <div className="stat-sub">loaded dimensions</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Plugins</div>
          <div className="stat-value">{data.pluginCount}</div>
          <div className="stat-sub">loaded</div>
        </div>
      </div>

      {history.length > 1 && (
        <div className="stats-charts">

          {/* ── Individual charts ──────────────────────────────────── */}
          {ss.showChartTps && (
            <MiniChart data={history} dataKey="tps1" color="var(--green)" label="TPS"
              yDomain={[0, 20]} yFmt={v => v.toFixed(1)}
              extraLine={{ key: 'tps5', color: 'var(--green)', label: '5m' }} />
          )}
          {ss.showChartMspt && (
            <MiniChart data={history} dataKey="tickTimeMs" color="var(--amber)" label="MSPT"
              yDomain={[0, 'auto']} yFmt={v => `${Math.round(v)}ms`} />
          )}
          {ss.showChartPlayers && (
            <MiniChart data={history} dataKey="playerCount" color="var(--amber)" label="Players"
              yDomain={[0, 'auto']} yFmt={v => String(Math.round(v))} events={eventsRaw} />
          )}
          {ss.showChartEntities && (
            <MiniChart data={history} dataKey="entityCount" color="var(--blue)" label="Entities"
              yFmt={fmtK} />
          )}
          {ss.showChartChunks && (
            <MiniChart data={history} dataKey="loadedChunks" color="var(--mist)" label="Loaded Chunks"
              yFmt={fmtK} />
          )}
          {ss.showChartPing && hasPingData && (
            <MiniChart data={history} dataKey="pingP50" color="var(--green)" label="Ping P50 / P95"
              yDomain={[0, 'auto']} yFmt={v => `${Math.round(v)}ms`}
              extraLine={{ key: 'pingP95', color: 'var(--yellow)', label: 'P95' }} />
          )}

          {/* ── Z-score overlays ───────────────────────────────────── */}
          {ss.showOverlayPerf && (
            <ZOverlay data={history} series={perfSeries}
              title="Performance Overlay (Z-score)"
              showMarkers={ss.overlayAnomalyMarkers}
              threshold={ss.overlayAnomalyThreshold}
              onAnomalyClick={onAnomalyClick} />
          )}
          {ss.showOverlayWorld && (
            <ZOverlay data={history} series={worldSeries}
              title="World Overlay (Z-score)"
              showMarkers={ss.overlayAnomalyMarkers}
              threshold={ss.overlayAnomalyThreshold}
              onAnomalyClick={onAnomalyClick} />
          )}

          {/* ── Log panel ─────────────────────────────────────────── */}
          {logPanelTs !== null && (
            <LogPanel
              ts={logPanelTs}
              logs={logPanelLogs}
              onNavigate={() => { onNavigate?.('console'); setLogPanelTs(null) }}
              onClose={() => setLogPanelTs(null)}
            />
          )}

          {/* ── Correlation table ─────────────────────────────────── */}
          {ss.showCorrelation && history.length >= 5 && (
            <CorrelationTable data={history} />
          )}
        </div>
      )}
    </div>
  )
}
