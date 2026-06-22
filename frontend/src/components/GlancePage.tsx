import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { api } from '../api/client'
import { useLogs, type TimestampedLog } from '../LogContext'
import { useSettings } from '../SettingsContext'

// ── Types ────────────────────────────────────────────────────────────────────

interface Snap {
  timestamp: number
  tps1: number; tps5: number; tps15: number
  tickTimeMs: number
  memUsedMb: number; memTotalMb: number; memMaxMb: number
  uptimeMs: number
  cpuPercent?: number | null
  sysMemUsedMb?: number | null
  sysMemTotalMb?: number | null
  diskUsedGb?: number | null
  diskTotalGb?: number | null
}

interface ProcessedSnap extends Snap { memPct: number }

interface SeriesStats { mean: number; std: number }
interface DataStats { tps1: SeriesStats; tickTimeMs: SeriesStats; memPct: SeriesStats }
interface AnomalyThresholds { tps: number; tick: number; mem: number }

type Status = 'nominal' | 'degraded' | 'incident'
type WindowMin = 1 | 5 | 15 | 60 | 360 | 1440

// ── Constants ────────────────────────────────────────────────────────────────

const WINDOWS: { v: WindowMin; label: string }[] = [
  { v: 1, label: '1m' }, { v: 5, label: '5m' }, { v: 15, label: '15m' },
  { v: 60, label: '1h' }, { v: 360, label: '6h' }, { v: 1440, label: '24h' },
]

const FOCUS_SEC: Record<number, number> = {
  1: 15, 5: 60, 15: 120, 60: 300, 360: 900, 1440: 1800,
}

const MAX_DISPLAY_PTS = 600

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeStats(values: number[]): SeriesStats {
  if (values.length < 2) return { mean: values[0] ?? 0, std: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return {
    mean,
    std: Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length),
  }
}

function downsample(data: ProcessedSnap[]): ProcessedSnap[] {
  if (data.length <= MAX_DISPLAY_PTS) return data
  const step = Math.ceil(data.length / MAX_DISPLAY_PTS)
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
}

function tpsColor(v: number): string {
  if (v >= 19) return 'var(--green)'
  if (v >= 15) return 'var(--amber)'
  return 'var(--red)'
}
function tickColor(v: number): string {
  if (v <= 50) return 'var(--green)'
  if (v <= 100) return 'var(--amber)'
  return 'var(--red)'
}
function memColor(pct: number): string {
  if (pct < 0.65) return 'var(--blue)'
  if (pct < 0.85) return 'var(--amber)'
  return 'var(--red)'
}

function tpsStatus(v: number): Status { return v >= 19 ? 'nominal' : v >= 15 ? 'degraded' : 'incident' }
function tickStatus(v: number): Status { return v <= 50 ? 'nominal' : v <= 100 ? 'degraded' : 'incident' }
function memStatus(pct: number): Status { return pct < 0.65 ? 'nominal' : pct < 0.85 ? 'degraded' : 'incident' }
function cpuColor(pct: number): string {
  if (pct < 50) return 'var(--green)'
  if (pct < 80) return 'var(--amber)'
  return 'var(--red)'
}
function cpuStatus(pct: number): Status { return pct < 50 ? 'nominal' : pct < 80 ? 'degraded' : 'incident' }
function diskStatus(pct: number): Status { return pct < 0.75 ? 'nominal' : pct < 0.9 ? 'degraded' : 'incident' }
function globalStatus(snap: Snap): Status {
  const p = snap.memMaxMb > 0 ? snap.memUsedMb / snap.memMaxMb : 0
  if (snap.tps1 < 15 || snap.tickTimeMs > 100 || p > 0.9) return 'incident'
  if (snap.tps1 < 19 || snap.tickTimeMs > 50 || p > 0.75) return 'degraded'
  return 'nominal'
}
function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}
function pad(n: number) { return n.toString().padStart(2, '0') }
function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function fmtTimeFull(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3, '0')}`
}
function logLevel(line: string): string {
  const u = line.toUpperCase()
  if (u.includes('[WARN]') || u.includes('[WARNING]')) return 'warn'
  if (u.includes('[ERROR]') || u.includes('[SEVERE]') || u.includes('[FATAL]')) return 'error'
  return ''
}

// ── Tooltips ─────────────────────────────────────────────────────────────────

function SimpleTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const snap = payload[0].payload as ProcessedSnap
  return (
    <div className="glance-tooltip">
      <div className="glance-tooltip-time">{fmtTimeFull(snap.timestamp)}</div>
      <div className="glance-tooltip-metrics">
        {[
          { label: 'TPS', val: snap.tps1.toFixed(2) },
          { label: 'Tick', val: `${snap.tickTimeMs.toFixed(1)}ms` },
          { label: 'Mem', val: `${Math.round(snap.memPct * 100)}%` },
        ].map(r => (
          <div key={r.label} className="tooltip-metric-row">
            <span className="tm-sigma" /><span className="tm-label">{r.label}</span>
            <span className="tm-value">{r.val}</span><span className="tm-mean" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface IncidentTooltipProps {
  active?: boolean
  payload?: any[]
  allStats: DataStats
  thresholds: AnomalyThresholds
  getLogsAround: (ts: number, windowMs: number) => TimestampedLog[]
  logWindowMs: number
  onJumpToTs?: (ts: number) => void
}

function IncidentTooltip({
  active, payload, allStats, thresholds, getLogsAround, logWindowMs, onJumpToTs,
}: IncidentTooltipProps) {
  if (!active || !payload?.length) return null
  const snap = payload[0].payload as ProcessedSnap

  type Anomaly = { label: string; z: number; val: string; mean: string; heuristic: string }
  const anomalies: Anomaly[] = []

  if (allStats.tps1.std > 0.05) {
    const z = (snap.tps1 - allStats.tps1.mean) / allStats.tps1.std
    if (z < -thresholds.tps) anomalies.push({
      label: 'TPS', z,
      val: snap.tps1.toFixed(1), mean: allStats.tps1.mean.toFixed(1),
      heuristic: snap.tps1 < 10 ? 'Server near-freeze' : snap.tps1 < 15 ? 'Significant lag event' : 'TPS below target',
    })
  }
  if (allStats.tickTimeMs.std > 0.5) {
    const z = (snap.tickTimeMs - allStats.tickTimeMs.mean) / allStats.tickTimeMs.std
    if (z > thresholds.tick) anomalies.push({
      label: 'Tick', z,
      val: `${Math.round(snap.tickTimeMs)}ms`, mean: `${Math.round(allStats.tickTimeMs.mean)}ms`,
      heuristic: snap.tickTimeMs > 100 ? 'Main thread stalled' : 'Server lag spike',
    })
  }
  if (allStats.memPct.std > 0.001) {
    const z = (snap.memPct - allStats.memPct.mean) / allStats.memPct.std
    if (z > thresholds.mem) anomalies.push({
      label: 'Mem', z,
      val: `${Math.round(snap.memPct * 100)}%`, mean: `${Math.round(allStats.memPct.mean * 100)}%`,
      heuristic: snap.memPct > 0.9 ? 'Memory pressure critical' : 'Memory surge detected',
    })
  }
  anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
  const isIncident = anomalies.length > 0
  const nearbyLogs = getLogsAround(snap.timestamp, logWindowMs)

  return (
    <div className="glance-tooltip">
      {isIncident ? (
        <div className="glance-tooltip-incident">
          <span className="incident-badge">⚠</span>
          <span className="incident-heuristic">{anomalies[0].heuristic}</span>
          <span className="incident-time">{fmtTimeFull(snap.timestamp)}</span>
        </div>
      ) : (
        <div className="glance-tooltip-time">{fmtTimeFull(snap.timestamp)}</div>
      )}
      <div className="glance-tooltip-metrics">
        {isIncident ? anomalies.map((a, i) => (
          <div key={i} className="tooltip-metric-row anomaly">
            <span className="tm-sigma">{a.z > 0 ? '+' : ''}{a.z.toFixed(1)}σ</span>
            <span className="tm-label">{a.label}</span>
            <span className="tm-value">{a.val}</span>
            <span className="tm-mean">μ {a.mean}</span>
          </div>
        )) : (
          <>
            <div className="tooltip-metric-row">
              <span className="tm-sigma" /><span className="tm-label">TPS</span>
              <span className="tm-value">{snap.tps1.toFixed(1)}</span><span className="tm-mean">/20</span>
            </div>
            <div className="tooltip-metric-row">
              <span className="tm-sigma" /><span className="tm-label">Tick</span>
              <span className="tm-value">{Math.round(snap.tickTimeMs)}ms</span><span className="tm-mean" />
            </div>
            <div className="tooltip-metric-row">
              <span className="tm-sigma" /><span className="tm-label">Mem</span>
              <span className="tm-value">{Math.round(snap.memPct * 100)}%</span><span className="tm-mean" />
            </div>
          </>
        )}
      </div>
      {nearbyLogs.length > 0 && (
        <div className="glance-tooltip-logs">
          <div className="tooltip-log-header">nearest log</div>
          {nearbyLogs.slice(0, 3).map((l, i) => (
            <div key={i} className={`tooltip-log-line ${logLevel(l.line)}`}>
              {l.line.length > 58 ? l.line.slice(0, 58) + '…' : l.line}
            </div>
          ))}
        </div>
      )}
      {(isIncident || nearbyLogs.length > 0) && onJumpToTs && (
        <button
          className="glance-tooltip-jump"
          onMouseDown={e => { e.stopPropagation(); onJumpToTs(snap.timestamp) }}
        >
          jump to log →
        </button>
      )}
    </div>
  )
}

// ── BifurcatedChart ───────────────────────────────────────────────────────────

interface GlanceChartProps {
  title: string
  data: ProcessedSnap[]
  dataKey: keyof ProcessedSnap
  color: string
  yDomain: [number | string, number | string]
  yFormatter: (v: number) => string
  stats: SeriesStats
  allStats: DataStats
  thresholds: AnomalyThresholds
  bifurTs: number
  chartId: string
  getLogsAround: (ts: number, windowMs: number) => TimestampedLog[]
  logWindowMs: number
  onPointClick: (ts: number) => void
  greyBeardMode: boolean
  showBifurcation: boolean
  logCorrelation: boolean
}

function GlanceChart({
  title, data, dataKey, color, yDomain, yFormatter,
  stats, allStats, thresholds, bifurTs, chartId,
  getLogsAround, logWindowMs, onPointClick,
  greyBeardMode, showBifurcation, logCorrelation,
}: GlanceChartProps) {
  const latest = data[data.length - 1]
  const currentVal = latest ? (latest[dataKey] as number) : 0

  const bifurIdx = data.findIndex(d => d.timestamp >= bifurTs)
  const bifurPct = bifurIdx < 0 ? 100 : (bifurIdx / data.length) * 100

  const sigmaStr = !greyBeardMode && stats.std > 0.01
    ? (() => { const z = (currentVal - stats.mean) / stats.std; return `${z > 0 ? '+' : ''}${z.toFixed(1)}σ` })()
    : null

  const renderDot = greyBeardMode ? false : (props: any) => {
    const { cx, cy, payload } = props
    if (cx == null || cy == null) return <g key="d-empty" />
    const v = payload[dataKey] as number
    if (stats.std < 0.01) return <g key={`d-${cx}`} />
    const z = (v - stats.mean) / stats.std
    const aboveThreshold = dataKey === 'tps1' ? z < -thresholds.tps
      : dataKey === 'memPct' ? z > thresholds.mem
      : z > thresholds.tick
    if (!aboveThreshold) return <g key={`d-${cx}`} />
    const dotColor = Math.abs(z) > (thresholds.tick + 1) ? 'var(--red)' : 'var(--amber)'
    return (
      <circle
        key={`a-${cx}-${cy}`}
        cx={cx} cy={cy} r={4}
        fill={dotColor} fillOpacity={0.85}
        style={{ filter: `drop-shadow(0 0 5px ${dotColor})` }}
      />
    )
  }

  const tooltipContent = greyBeardMode
    ? (props: any) => <SimpleTooltip {...props} />
    : (props: any) => (
        <IncidentTooltip
          {...props}
          allStats={allStats}
          thresholds={thresholds}
          getLogsAround={logCorrelation ? getLogsAround : () => []}
          logWindowMs={logWindowMs}
          onJumpToTs={onPointClick}
        />
      )

  const strokeProp = greyBeardMode
    ? color
    : `url(#${chartId}-stroke)`

  const fillProp = greyBeardMode ? 'none' : `url(#${chartId}-fill)`

  return (
    <div className="glance-chart-card">
      <div className="glance-chart-header">
        <span className="glance-chart-title">{title}</span>
        <span className="glance-chart-value" style={{ color }}>{yFormatter(currentVal)}</span>
        {sigmaStr && <span className="glance-chart-sigma">{sigmaStr}</span>}
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <ComposedChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          onClick={(e: any) => {
            const pt = e?.activePayload?.[0]?.payload as ProcessedSnap | undefined
            if (pt) onPointClick(pt.timestamp)
          }}
        >
          {!greyBeardMode && (
            <defs>
              <linearGradient id={`${chartId}-stroke`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={color} stopOpacity={0.12} />
                <stop offset={`${Math.max(0, bifurPct - 1)}%`} stopColor={color} stopOpacity={0.25} />
                <stop offset={`${bifurPct}%`} stopColor={color} stopOpacity={1} />
                <stop offset="100%" stopColor={color} stopOpacity={1} />
              </linearGradient>
              <linearGradient id={`${chartId}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.1} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
          )}

          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']}
            tickFormatter={fmtTime}
            tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 9 }}
            tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={60}
          />
          <YAxis
            domain={yDomain} width={38}
            tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 9 }}
            tickLine={false} axisLine={false} tickCount={3} tickFormatter={yFormatter}
          />
          <Tooltip content={tooltipContent} cursor={{ stroke: 'var(--border-hi)', strokeWidth: 1 }} />

          {!greyBeardMode && showBifurcation && bifurTs > (data[0]?.timestamp ?? 0) && bifurPct < 98 && (
            <>
              <ReferenceArea
                x1={bifurTs} x2={data[data.length - 1]?.timestamp}
                fill="rgba(255,255,255,0.018)" stroke="none"
              />
              <ReferenceLine
                x={bifurTs} stroke="var(--border-hi)" strokeDasharray="2 3" strokeWidth={1}
                label={{ value: 'focus', position: 'insideTopRight', fill: 'var(--ghost)', fontSize: 8, fontFamily: 'var(--mono)' }}
              />
            </>
          )}

          <Area
            type="monotone"
            dataKey={dataKey as string}
            stroke={strokeProp}
            strokeWidth={greyBeardMode ? 1 : 1.5}
            fill={fillProp}
            dot={renderDot as any}
            activeDot={{ r: 3, fill: color, stroke: 'var(--elevated)', strokeWidth: 1 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, status, barPct, sigma }: {
  label: string; value: string; sub?: string; color: string
  status: Status; barPct?: number; sigma?: number | null
}) {
  return (
    <div className={`glance-stat-card ${status}`}>
      <div className="glance-stat-label">{label}</div>
      <div className="glance-stat-value" style={{ color }}>{value}</div>
      {sub && <div className="glance-stat-sub">{sub}</div>}
      {barPct !== undefined && (
        <div className="health-bar-track">
          <div className="health-bar-fill" style={{ width: `${Math.max(0, Math.min(1, barPct)) * 100}%`, background: color }} />
        </div>
      )}
      {sigma != null && Math.abs(sigma) > 0.1 && (
        <div className="glance-stat-sigma">{sigma > 0 ? '+' : ''}{sigma.toFixed(1)}σ</div>
      )}
    </div>
  )
}

// ── Log Viewer ────────────────────────────────────────────────────────────────

function GlanceLogViewer({ tsLogs, clickedTs, onClear }: {
  tsLogs: TimestampedLog[]; clickedTs: number | null; onClear: () => void
}) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [highlightRange, setHighlightRange] = useState<{ from: number; to: number } | null>(null)

  useEffect(() => {
    if (clickedTs === null) { setHighlightRange(null); return }
    const W = 5000
    setHighlightRange({ from: clickedTs - W, to: clickedTs + W })
    const idx = tsLogs.findIndex(l => l.ts >= clickedTs - W)
    if (idx >= 0) {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({ index: Math.max(0, idx), behavior: 'smooth', align: 'center' })
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickedTs])

  return (
    <>
      <div className="glance-log-header">
        <span className="glance-log-title">Logs</span>
        {clickedTs !== null && (
          <>
            <span className="glance-log-ts-badge">{fmtTime(clickedTs)} ±5s</span>
            <button className="glance-log-clear" onClick={onClear} title="Clear highlight">×</button>
          </>
        )}
      </div>
      <Virtuoso
        ref={virtuosoRef}
        data={tsLogs}
        style={{ flex: 1, minHeight: 0 }}
        followOutput={clickedTs === null}
        itemContent={(_, log) => {
          const inRange = highlightRange !== null && log.ts >= highlightRange.from && log.ts <= highlightRange.to
          const isExact = clickedTs !== null && Math.abs(log.ts - clickedTs) <= 1000
          return (
            <div className={`glance-log-line ${logLevel(log.line)}${inRange ? ' highlighted' : ''}${isExact ? ' exact' : ''}`}>
              {log.line}
            </div>
          )
        }}
        components={{
          EmptyPlaceholder: () => <div className="glance-log-empty">waiting for logs…</div>,
        }}
      />
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GlancePage() {
  const [windowMin, setWindowMin] = useState<WindowMin>(5)
  const [clickedTs, setClickedTs] = useState<number | null>(null)
  const logCtx = useLogs()
  const { settings } = useSettings()
  const { greyBeardMode: gbm, glance: gs } = settings

  const { data: histData = [] } = useQuery<Snap[]>({
    queryKey: ['glance-history', windowMin],
    queryFn: () => api.get(`/glance/history?window=${windowMin}`).then(r => r.data),
    refetchInterval: windowMin <= 5 ? Math.max(gs.refreshIntervalMs, 2000) : 30_000,
    staleTime: 1_000,
  })

  const { data: current } = useQuery<Snap>({
    queryKey: ['glance-current'],
    queryFn: () => api.get('/glance/current').then(r => r.data),
    refetchInterval: gs.refreshIntervalMs,
  })

  const rawData = useMemo(() => {
    if (!current) return histData
    const lastTs = histData[histData.length - 1]?.timestamp ?? 0
    return current.timestamp > lastTs + 500 ? [...histData, current] : histData
  }, [histData, current])

  const data = useMemo(() =>
    downsample(rawData.map(d => ({ ...d, memPct: d.memMaxMb > 0 ? d.memUsedMb / d.memMaxMb : 0 }))),
    [rawData]
  )

  const allStats = useMemo<DataStats>(() => ({
    tps1:       computeStats(data.map(d => d.tps1)),
    tickTimeMs: computeStats(data.map(d => d.tickTimeMs)),
    memPct:     computeStats(data.map(d => d.memPct)),
  }), [data])

  const thresholds: AnomalyThresholds = {
    tps: gbm ? Infinity : gs.anomalyThresholdTps,
    tick: gbm ? Infinity : gs.anomalyThresholdTick,
    mem: gbm ? Infinity : gs.anomalyThresholdMem,
  }

  const bifurTs = useMemo(() => {
    if (data.length === 0) return Date.now()
    return data[data.length - 1].timestamp - (FOCUS_SEC[windowMin] ?? 60) * 1000
  }, [data, windowMin])

  const [uptimeStr, setUptimeStr] = useState('—')
  useEffect(() => {
    if (!current) return
    const base = current.uptimeMs, captured = Date.now()
    const tick = () => setUptimeStr(fmtUptime(base + (Date.now() - captured)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [current?.timestamp])

  const status = current ? globalStatus(current) : 'nominal'
  const memP = current && current.memMaxMb > 0 ? current.memUsedMb / current.memMaxMb : 0

  const sigmaOf = (val: number, s: SeriesStats) => s.std > 0.01 && !gbm ? (val - s.mean) / s.std : null
  const tpsSigma  = current ? sigmaOf(current.tps1, allStats.tps1) : null
  const tickSigma = current ? sigmaOf(current.tickTimeMs, allStats.tickTimeMs) : null
  const memSigma  = current ? sigmaOf(memP, allStats.memPct) : null

  const showLogPanel = !gbm && gs.showLogPanel

  const SHARED = {
    data,
    bifurTs,
    allStats,
    thresholds,
    getLogsAround: logCtx.getLogsAround,
    logWindowMs: gs.logCorrelationWindowMs,
    onPointClick: setClickedTs,
    greyBeardMode: gbm,
    showBifurcation: gs.showBifurcation,
    logCorrelation: gs.logCorrelation,
  }

  // Badge animation class
  const badgeClass = !gbm && gs.statusBadgePulse
    ? `glance-status-badge ${status}`
    : `glance-status-badge ${status} no-pulse`

  return (
    <div className="glance-root">
      <div className="glance-left">

        {/* Status bar */}
        <div className="glance-status-bar">
          <span className={badgeClass}>{status.toUpperCase()}{gbm ? ' (GBM)' : ''}</span>
          <span className="glance-status-uptime">up {uptimeStr}</span>
          <span style={{ flex: 1 }} />
          <span className="glance-live-badge">
            <span className="glance-live-dot" />
            {(gs.refreshIntervalMs / 1000).toFixed(1)}s
          </span>
        </div>

        {/* Stat rail */}
        <div className="glance-stat-rail">
          <StatCard label="TPS 1m" value={current ? current.tps1.toFixed(1) : '—'} sub="target 20.0"
            color={tpsColor(current?.tps1 ?? 20)} status={tpsStatus(current?.tps1 ?? 20)}
            barPct={current ? current.tps1 / 20 : undefined} sigma={tpsSigma} />
          <StatCard label="Tick Time" value={current ? `${Math.round(current.tickTimeMs)}ms` : '—'} sub="healthy <50ms"
            color={tickColor(current?.tickTimeMs ?? 0)} status={tickStatus(current?.tickTimeMs ?? 0)}
            barPct={current ? 1 - Math.min(current.tickTimeMs / 200, 1) : undefined} sigma={tickSigma} />
          <StatCard label="Memory" value={current ? `${Math.round(memP * 100)}%` : '—'}
            sub={current ? `${current.memUsedMb} / ${current.memMaxMb} MB` : ''}
            color={memColor(memP)} status={memStatus(memP)} barPct={memP} sigma={memSigma} />
          <StatCard label="Uptime" value={uptimeStr} color="var(--ash)" status="nominal" />
          {/* CPU */}
          {current?.cpuPercent != null && current.cpuPercent >= 0 ? (
            <StatCard label="CPU" value={`${current.cpuPercent.toFixed(1)}%`} sub="host load"
              color={cpuColor(current.cpuPercent)} status={cpuStatus(current.cpuPercent)}
              barPct={current.cpuPercent / 100} />
          ) : (
            <StatCard label="CPU" value={current?.cpuPercent === -1 ? '—' : '…'} sub={current?.cpuPercent === -1 ? 'unavailable' : undefined}
              color="var(--ash)" status="nominal" />
          )}
          {/* System RAM */}
          {current?.sysMemUsedMb != null && current.sysMemTotalMb != null ? (
            <StatCard label="Sys RAM"
              value={`${(current.sysMemUsedMb / 1024).toFixed(1)} GB`}
              sub={`${current.sysMemUsedMb} / ${current.sysMemTotalMb} MB`}
              color={memColor(current.sysMemUsedMb / current.sysMemTotalMb)}
              status={memStatus(current.sysMemUsedMb / current.sysMemTotalMb)}
              barPct={current.sysMemUsedMb / current.sysMemTotalMb} />
          ) : (
            <StatCard label="Sys RAM" value="…" color="var(--ash)" status="nominal" />
          )}
          {/* Disk */}
          {current?.diskUsedGb != null && current.diskTotalGb != null && current.diskTotalGb > 0 ? (
            <StatCard label="Disk"
              value={`${current.diskUsedGb} / ${current.diskTotalGb} GB`}
              sub={`${Math.round((current.diskUsedGb / current.diskTotalGb) * 100)}% used`}
              color={diskStatus(current.diskUsedGb / current.diskTotalGb) === 'incident' ? 'var(--red)' : diskStatus(current.diskUsedGb / current.diskTotalGb) === 'degraded' ? 'var(--amber)' : 'var(--ash)'}
              status={diskStatus(current.diskUsedGb / current.diskTotalGb)}
              barPct={current.diskUsedGb / current.diskTotalGb} />
          ) : (
            <StatCard label="Disk" value="…" color="var(--ash)" status="nominal" />
          )}
        </div>

        {/* Window selector */}
        <div className="glance-window-bar">
          {WINDOWS.map(w => (
            <button
              key={w.v}
              className={`glance-window-btn${windowMin === w.v ? ' active' : ''}`}
              onClick={() => setWindowMin(w.v)}
            >
              {w.label}
            </button>
          ))}
          {clickedTs !== null && (
            <span className="glance-selection-badge">
              ● {fmtTime(clickedTs)}
              <button onClick={() => setClickedTs(null)}>×</button>
            </span>
          )}
        </div>

        {/* Charts */}
        {data.length === 0 ? (
          <div className="glance-empty">Waiting for metrics…</div>
        ) : (
          <>
            {gs.showChartTps && (
              <GlanceChart {...SHARED} title="TPS" dataKey="tps1"
                color={tpsColor(current?.tps1 ?? 20)} yDomain={[0, 21]}
                yFormatter={v => v.toFixed(0)} stats={allStats.tps1} chartId="tps" />
            )}
            {gs.showChartTick && (
              <GlanceChart {...SHARED} title="Tick Time" dataKey="tickTimeMs"
                color={tickColor(current?.tickTimeMs ?? 0)} yDomain={[0, 'auto']}
                yFormatter={v => `${Math.round(v)}ms`} stats={allStats.tickTimeMs} chartId="tick" />
            )}
            {gs.showChartMem && (
              <GlanceChart {...SHARED} title="Memory" dataKey="memPct"
                color={memColor(memP)} yDomain={[0, 1]}
                yFormatter={v => `${Math.round(v * 100)}%`} stats={allStats.memPct} chartId="mem" />
            )}
          </>
        )}
      </div>

      {/* Log viewer */}
      {showLogPanel && (
        <div className="glance-right">
          <GlanceLogViewer
            tsLogs={logCtx.tsLogs}
            clickedTs={clickedTs}
            onClear={() => setClickedTs(null)}
          />
        </div>
      )}
    </div>
  )
}
