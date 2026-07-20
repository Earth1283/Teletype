import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { api } from '../api/client'
import { useLogs, type TimestampedLog } from '../LogContext'
import { useSettings, type TeletypeSettings } from '../SettingsContext'
import { IconChevronRight, IconChevronLeft } from '../Icons'

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

interface GcEvent {
  ts: number
  name: string
  action: string
  cause: string
  durationMs: number
}

interface SeriesStats { mean: number; std: number }
interface DataStats { tps1: SeriesStats; tickTimeMs: SeriesStats; memPct: SeriesStats; cpuPercent: SeriesStats }
interface AnomalyThresholds { tps: number; tick: number; mem: number; cpu: number }

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
const MAX_GC_MARKERS = 160
// Young-gen GC on G1/ZGC/Shenandoah fires constantly and is usually sub-millisecond —
// real noise, not signal. Drop it before capping so a wall of trivial markers doesn't
// crowd out (or get sampled over) the pauses that actually explain a lag spike.
const GC_NOISE_FLOOR_MS = 5
// Past this many markers, per-marker duration labels just overlap into unreadable text.
const MAX_GC_LABELS = 20

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

function cpuColor(pct: number): string {
  if (pct < 50) return 'var(--green)'
  if (pct < 80) return 'var(--amber)'
  return 'var(--red)'
}
function globalStatus(snap: Snap): Status {
  const p = snap.memMaxMb > 0 ? snap.memUsedMb / snap.memMaxMb : 0
  if (snap.tps1 < 15 || snap.tickTimeMs > 100 || p > 0.9) return 'incident'
  if (snap.tps1 < 19 || snap.tickTimeMs > 50 || p > 0.75) return 'degraded'
  return 'nominal'
}
function fmtMem(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`
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
function fmtGcDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}
function logLevel(line: string): string {
  const u = line.toUpperCase()
  if (u.includes('[WARN]') || u.includes('[WARNING]')) return 'warn'
  if (u.includes('[ERROR]') || u.includes('[SEVERE]') || u.includes('[FATAL]')) return 'error'
  return ''
}
function stripAnsi(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, '')
}
function stripLogPrefix(line: string): string {
  return line.replace(/^(?:\[[^\]]*\]\s*)+:?\s*/, '')
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
          { label: 'Mem', val: fmtMem(snap.memUsedMb) },
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
      val: fmtMem(snap.memUsedMb), mean: fmtMem(Math.round(allStats.memPct.mean * snap.memMaxMb)),
      heuristic: snap.memPct > 0.9 ? 'Memory pressure critical' : 'Memory surge detected',
    })
  }
  if (allStats.cpuPercent.std > 0.5 && snap.cpuPercent != null && snap.cpuPercent >= 0) {
    const z = (snap.cpuPercent - allStats.cpuPercent.mean) / allStats.cpuPercent.std
    if (z > thresholds.cpu) anomalies.push({
      label: 'CPU', z,
      val: `${snap.cpuPercent.toFixed(0)}%`, mean: `${allStats.cpuPercent.mean.toFixed(0)}%`,
      heuristic: snap.cpuPercent > 90 ? 'Host CPU saturated' : 'Host CPU spike',
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
              <span className="tm-value">{fmtMem(snap.memUsedMb)}</span><span className="tm-mean" />
            </div>
          </>
        )}
      </div>
      {nearbyLogs.length > 0 && (
        <div className="glance-tooltip-logs">
          <div className="tooltip-log-header">nearest log</div>
          {nearbyLogs.slice(0, 3).map((l, i) => {
            const clean = stripLogPrefix(stripAnsi(l.line))
            return (
              <div key={i} className={`tooltip-log-line ${logLevel(l.line)}`}>
                {clean.length > 58 ? clean.slice(0, 58) + '…' : clean}
              </div>
            )
          })}
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
  /** Field `stats`/`allStats` were computed over, when it differs from `dataKey`
   *  (e.g. memory is plotted in MB but its anomaly stats are over the 0-1 ratio).
   *  Defaults to `dataKey`. Mixing units here silently produces meaningless z-scores. */
  statsKey?: keyof ProcessedSnap
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
  gcEvents?: GcEvent[]
  showGcLabels?: boolean
  showGcHint?: boolean
}

const GlanceChart = memo(function GlanceChart({
  title, data, dataKey, statsKey, color, yDomain, yFormatter,
  stats, allStats, thresholds, bifurTs, chartId,
  getLogsAround, logWindowMs, onPointClick,
  greyBeardMode, showBifurcation, logCorrelation,
  gcEvents, showGcLabels = false, showGcHint = false,
}: GlanceChartProps) {
  const sKey = statsKey ?? dataKey
  const latest = data[data.length - 1]
  const currentVal = latest ? (latest[dataKey] as number) : 0
  const currentStatsVal = latest ? (latest[sKey] as number) : 0

  const bifurIdx = data.findIndex(d => d.timestamp >= bifurTs)
  const bifurPct = bifurIdx < 0 ? 100 : (bifurIdx / data.length) * 100

  const sigmaStr = !greyBeardMode && stats.std > 0.01
    ? (() => { const z = (currentStatsVal - stats.mean) / stats.std; return `${z > 0 ? '+' : ''}${z.toFixed(1)}σ` })()
    : null

  const renderDot = greyBeardMode ? false : (props: any) => {
    const { cx, cy, payload, index } = props
    if (cx == null || cy == null) return <g key={`d-empty-${index}`} />
    const v = payload[sKey] as number
    if (stats.std < 0.01) return <g key={`d-${cx}`} />
    const z = (v - stats.mean) / stats.std
    const aboveThreshold = sKey === 'tps1' ? z < -thresholds.tps
      : sKey === 'memPct' ? z > thresholds.mem
      : sKey === 'cpuPercent' ? z > thresholds.cpu
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
                fill="color-mix(in srgb, var(--text-primary) 2%, transparent)" stroke="none"
              />
              <ReferenceLine
                x={bifurTs} stroke="var(--border-hi)" strokeDasharray="2 3" strokeWidth={1}
                label={{ value: 'focus', position: 'insideTopRight', fill: 'var(--ghost)', fontSize: 8, fontFamily: 'var(--mono)' }}
              />
            </>
          )}

          {gcEvents && gcEvents.map(event => (
            <ReferenceLine
              key={`gc-${event.ts}-${event.name}-${event.durationMs}`}
              x={event.ts}
              stroke="var(--blue)"
              strokeDasharray="2 3"
              strokeWidth={1}
              strokeOpacity={0.5}
              label={showGcLabels ? {
                value: `GC ${fmtGcDuration(event.durationMs)}`,
                position: 'insideTopLeft',
                fill: 'var(--blue)',
                fontSize: 7,
                fontFamily: 'var(--mono)',
                opacity: 0.7,
              } : undefined}
            />
          ))}

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
      {showGcHint && gcEvents && gcEvents.length > 0 && !greyBeardMode && (
        <div className="glance-gc-hint">
          GC markers are JVM JMX events. Short windows label duration.
        </div>
      )}
    </div>
  )
})

// ── Speedo Gauge ─────────────────────────────────────────────────────────────

const SP = { cx: 50, cy: 46, r: 32, start: 240, sweep: 240 } as const

function g_xy(r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: SP.cx + r * Math.cos(rad), y: SP.cy + r * Math.sin(rad) }
}

function g_arc(startDeg: number, sweepDeg: number, r = SP.r): string {
  if (Math.abs(sweepDeg) < 0.01) return ''
  const s = g_xy(r, startDeg), e = g_xy(r, startDeg + sweepDeg)
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

interface GZone { from: number; to: number; color: string }

const G = 'var(--status-good)', Y = 'var(--status-warning)', O = 'var(--status-serious)', R = 'var(--status-critical)'

function buildZones(gs: TeletypeSettings['glance']) {
  return {
    tps: [
      { from: 0,                          to: gs.tpsRedBelow / 20,    color: R },
      { from: gs.tpsRedBelow / 20,        to: gs.tpsOrangeBelow / 20, color: O },
      { from: gs.tpsOrangeBelow / 20,     to: gs.tpsYellowBelow / 20, color: Y },
      { from: gs.tpsYellowBelow / 20,     to: 1,                      color: G },
    ] as GZone[],
    tick: [
      { from: 0,                              to: gs.msptYellowAbove / 200, color: G },
      { from: gs.msptYellowAbove / 200,       to: gs.msptOrangeAbove / 200, color: Y },
      { from: gs.msptOrangeAbove / 200,       to: gs.msptRedAbove / 200,    color: O },
      { from: gs.msptRedAbove / 200,          to: 1,                         color: R },
    ] as GZone[],
    mem: [
      { from: 0,                        to: gs.memYellowAbove / 100, color: G },
      { from: gs.memYellowAbove / 100,  to: gs.memOrangeAbove / 100, color: Y },
      { from: gs.memOrangeAbove / 100,  to: gs.memRedAbove / 100,    color: O },
      { from: gs.memRedAbove / 100,     to: 1,                        color: R },
    ] as GZone[],
    cpu: [
      { from: 0,                        to: gs.cpuYellowAbove / 100, color: G },
      { from: gs.cpuYellowAbove / 100,  to: gs.cpuOrangeAbove / 100, color: Y },
      { from: gs.cpuOrangeAbove / 100,  to: gs.cpuRedAbove / 100,    color: O },
      { from: gs.cpuRedAbove / 100,     to: 1,                        color: R },
    ] as GZone[],
    disk: [
      { from: 0,                         to: gs.diskYellowAbove / 100, color: G },
      { from: gs.diskYellowAbove / 100,  to: gs.diskOrangeAbove / 100, color: Y },
      { from: gs.diskOrangeAbove / 100,  to: gs.diskRedAbove / 100,    color: O },
      { from: gs.diskRedAbove / 100,     to: 1,                         color: R },
    ] as GZone[],
  }
}

function SpeedoGauge({ label, value, displayValue, subLine, min, max, zones, sigma }: {
  label: string; value: number | null; displayValue: string; subLine?: string
  min: number; max: number; zones: GZone[]; sigma?: number | null
}) {
  const t = value != null ? Math.max(0, Math.min(1, (value - min) / (max - min))) : null
  const activeColor = t == null ? 'var(--ghost)'
    : (zones.find(z => t >= z.from && t <= z.to + 0.001) ?? zones[zones.length - 1]).color
  const hasSubLine = Boolean(subLine)

  return (
    <div className="speedo-wrap">
      <svg viewBox="0 0 100 88" className="speedo-svg">
        {/* Background track */}
        <path d={g_arc(SP.start, SP.sweep)} fill="none"
          stroke="var(--border-hi)" strokeWidth="9" strokeLinecap="round" />

        {/* Zone arcs — VU-meter fill up to needle */}
        {zones.flatMap((z, i) => {
          const zs = SP.start + z.from * SP.sweep
          const zsw = (z.to - z.from) * SP.sweep
          if (t == null) {
            return [<path key={i} d={g_arc(zs, zsw)} fill="none"
              stroke={z.color} strokeWidth="9" strokeOpacity={0.13} strokeLinecap="butt" />]
          }
          if (t >= z.to) {
            return [<path key={i} d={g_arc(zs, zsw)} fill="none"
              stroke={z.color} strokeWidth="9" strokeLinecap="butt" />]
          }
          if (t <= z.from) {
            return [<path key={i} d={g_arc(zs, zsw)} fill="none"
              stroke={z.color} strokeWidth="9" strokeOpacity={0.13} strokeLinecap="butt" />]
          }
          const split = (t - z.from) / (z.to - z.from)
          const activeSw = split * zsw
          const inactiveSw = zsw - activeSw
          return [
            <path key={`${i}a`} d={g_arc(zs, activeSw)} fill="none"
              stroke={z.color} strokeWidth="9" strokeLinecap="butt" />,
            <path key={`${i}b`} d={g_arc(zs + activeSw, inactiveSw)} fill="none"
              stroke={z.color} strokeWidth="9" strokeOpacity={0.13} strokeLinecap="butt" />,
          ]
        })}


        {/* Value */}
        <text x={SP.cx} y={SP.cy - 2} textAnchor="middle" dominantBaseline="middle"
          fill={activeColor} fontSize="15" fontWeight="700"
          style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums lining-nums' }}>
          {displayValue}
        </text>

        {/* Sub line */}
        {subLine && (
          <text x={SP.cx} y={SP.cy + 10} textAnchor="middle" dominantBaseline="middle"
            fill="var(--ghost)" fontSize="5.5"
            style={{ fontFamily: 'var(--mono)' }}>
            {subLine}
          </text>
        )}

        {/* Label */}
        <text x={SP.cx} y={SP.cy + (hasSubLine ? 20 : 12)} textAnchor="middle" dominantBaseline="middle"
          fill="var(--mist)" fontSize="5.8" fontWeight="600" letterSpacing="0.08em"
          style={{ fontFamily: 'var(--mono)' }}>
          {label.toUpperCase()}
        </text>

        {/* Sigma */}
        {sigma != null && Math.abs(sigma) > 0.1 && (
          <text x={SP.cx} y={SP.cy + (hasSubLine ? 28 : 20)} textAnchor="middle" dominantBaseline="middle"
            fill="var(--ghost)" fontSize="5" style={{ fontFamily: 'var(--mono)' }}>
            {sigma > 0 ? '+' : ''}{sigma.toFixed(1)}σ
          </text>
        )}
      </svg>
    </div>
  )
}

function UptimeDisplay({ uptimeStr }: { uptimeStr: string }) {
  return (
    <div className="speedo-uptime">
      <div className="speedo-uptime-label">Uptime</div>
      <div className="speedo-uptime-value">{uptimeStr}</div>
    </div>
  )
}

// ── Log Viewer ────────────────────────────────────────────────────────────────

function GlanceLogViewer({ tsLogs, clickedTs, onClear, isOpen, onToggle }: {
  tsLogs: TimestampedLog[]
  clickedTs: number | null
  onClear: () => void
  isOpen: boolean
  onToggle: () => void
}) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [highlightRange, setHighlightRange] = useState<{ from: number; to: number } | null>(null)
  const [showAll, setShowAll] = useState(false)

  // Correlation view: all logs around clicked point. Default: WARN/ERROR only.
  const displayLogs = useMemo(() => {
    if (clickedTs !== null) return tsLogs
    if (showAll) return tsLogs
    return tsLogs.filter(l => logLevel(l.line) !== '')
  }, [tsLogs, clickedTs, showAll])

  useEffect(() => {
    if (clickedTs === null) { setHighlightRange(null); return }
    const W = 5000
    setHighlightRange({ from: clickedTs - W, to: clickedTs + W })
    const idx = displayLogs.findIndex(l => l.ts >= clickedTs - W)
    if (idx >= 0) {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({ index: Math.max(0, idx), behavior: 'smooth', align: 'center' })
      })
    }
  }, [clickedTs, displayLogs])

  const isFiltered = clickedTs === null && !showAll

  return (
    <>
      <div className="glance-log-header">
        <button
          className="glance-log-toggle-btn"
          onClick={onToggle}
          title={isOpen ? 'Collapse log panel' : 'Expand log panel'}
        >
          <IconChevronRight
            size={11}
            style={{
              transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 260ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </button>
        {isOpen && <>
          <span className="glance-log-title">{isFiltered ? 'Errors' : 'Logs'}</span>
          {clickedTs !== null ? (
            <>
              <span className="glance-log-ts-badge">{fmtTime(clickedTs)} ±5s</span>
              <button className="glance-log-clear" onClick={onClear} title="Clear highlight">×</button>
            </>
          ) : (
            <button
              className="glance-log-filter-btn"
              onClick={() => setShowAll(v => !v)}
              title={showAll ? 'Filter to warnings/errors' : 'Show all logs'}
            >
              {showAll ? 'errors' : 'all'}
            </button>
          )}
        </>}
      </div>
      <div className={`glance-log-body${isOpen ? '' : ' hidden'}`}>
        <Virtuoso
          ref={virtuosoRef}
          data={displayLogs}
          style={{ flex: 1, minHeight: 0, overflowX: 'visible' }}
          followOutput={clickedTs === null}
          itemContent={(_, log) => {
            const inRange = highlightRange !== null && log.ts >= highlightRange.from && log.ts <= highlightRange.to
            const isExact = clickedTs !== null && Math.abs(log.ts - clickedTs) <= 1000
            return (
              <div className={`glance-log-line ${logLevel(log.line)}${inRange ? ' highlighted' : ''}${isExact ? ' exact' : ''}`}>
                {stripAnsi(log.line)}
              </div>
            )
          }}
          components={{
            EmptyPlaceholder: () => (
              <div className="glance-log-empty">
                {isFiltered ? 'no warnings or errors' : 'waiting for logs…'}
              </div>
            ),
          }}
        />
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GlancePage() {
  const [windowMin, setWindowMin] = useState<WindowMin>(5)
  const [clickedTs, setClickedTs] = useState<number | null>(null)
  const [logPanelOpen, setLogPanelOpen] = useState(true)
  const logCtx = useLogs()
  const { settings } = useSettings()
  const { greyBeardMode: gbm, glance: gs } = settings

  const { data: histData = [], isError: histError, refetch: refetchHist } = useQuery<Snap[]>({
    queryKey: ['glance-history', windowMin],
    queryFn: () => api.get(`/glance/history?window=${windowMin}`).then(r => r.data),
    refetchInterval: windowMin <= 5 ? Math.max(gs.refreshIntervalMs, 2000) : 30_000,
    staleTime: 1_000,
  })

  const { data: current, isError: currentError, refetch: refetchCurrent } = useQuery<Snap>({
    queryKey: ['glance-current'],
    queryFn: () => api.get('/glance/current').then(r => r.data),
    refetchInterval: gs.refreshIntervalMs,
  })

  const { data: rawGcEvents = [], isError: gcError, refetch: refetchGc } = useQuery<GcEvent[]>({
    queryKey: ['glance-gc-events', windowMin],
    queryFn: () => api.get(`/glance/gc-events?window=${windowMin}`).then(r => r.data),
    refetchInterval: windowMin <= 5 ? Math.max(gs.refreshIntervalMs, 2000) : 30_000,
    staleTime: 1_000,
  })

  // Only merge the fast "current" tick into the chart array for the short windows that
  // are already polling histData at that same cadence (see refetchInterval above) — for
  // windowMin > 5, histData refreshes every 30s, and merging current here would force the
  // full data→allStats→gcEvents→4-chart recompute/repaint cascade every 2s for a change
  // that's invisible at 1h-24h zoom.
  const rawData = useMemo(() => {
    if (!current || windowMin > 5) return histData
    const lastTs = histData[histData.length - 1]?.timestamp ?? 0
    return current.timestamp > lastTs + 500 ? [...histData, current] : histData
  }, [histData, current, windowMin])

  const data = useMemo(() =>
    downsample(rawData.map(d => ({ ...d, memPct: d.memMaxMb > 0 ? d.memUsedMb / d.memMaxMb : 0 }))),
    [rawData]
  )

  const allStats = useMemo<DataStats>(() => {
    const cpuVals = data.filter(d => d.cpuPercent != null && (d.cpuPercent as number) >= 0).map(d => d.cpuPercent as number)
    return {
      tps1:       computeStats(data.map(d => d.tps1)),
      tickTimeMs: computeStats(data.map(d => d.tickTimeMs)),
      memPct:     computeStats(data.map(d => d.memPct)),
      cpuPercent: cpuVals.length > 1 ? computeStats(cpuVals) : { mean: 0, std: 0 },
    }
  }, [data])

  const memMaxMb = useMemo(() => {
    const mx = Math.max(...data.map(d => d.memMaxMb))
    return mx > 0 ? mx : 1
  }, [data])

  const hasCpuData = current?.cpuPercent != null && current.cpuPercent >= 0

  const thresholds: AnomalyThresholds = useMemo(() => ({
    tps: gbm ? Infinity : gs.anomalyThresholdTps,
    tick: gbm ? Infinity : gs.anomalyThresholdTick,
    mem: gbm ? Infinity : gs.anomalyThresholdMem,
    cpu: gbm ? Infinity : gs.anomalyThresholdCpu,
  }), [gbm, gs.anomalyThresholdTps, gs.anomalyThresholdTick, gs.anomalyThresholdMem, gs.anomalyThresholdCpu])

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
  }, [current])

  const status = current ? globalStatus(current) : 'nominal'
  const memP = current && current.memMaxMb > 0 ? current.memUsedMb / current.memMaxMb : 0

  const sigmaOf = (val: number, s: SeriesStats) => s.std > 0.01 && !gbm ? (val - s.mean) / s.std : null
  const tpsSigma  = current ? sigmaOf(current.tps1, allStats.tps1) : null
  const tickSigma = current ? sigmaOf(current.tickTimeMs, allStats.tickTimeMs) : null
  const memSigma  = current ? sigmaOf(memP, allStats.memPct) : null

  const showLogPanel = !gbm && gs.showLogPanel

  const gcEvents = useMemo(() => {
    if (data.length === 0) return []
    const from = data[0].timestamp
    const to = data[data.length - 1].timestamp
    const visible = rawGcEvents.filter(event =>
      event.ts >= from && event.ts <= to && event.durationMs >= GC_NOISE_FLOOR_MS)
    if (visible.length <= MAX_GC_MARKERS) return visible
    // Keep the longest (most diagnostically useful) pauses rather than an even stride,
    // which would sample noise and signal alike and could drop the one spike that matters.
    return [...visible]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, MAX_GC_MARKERS)
      .sort((a, b) => a.ts - b.ts)
  }, [data, rawGcEvents])

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

  const zones = useMemo(() => buildZones(gs), [gs])

  // Badge animation class
  const badgeClass = !gbm && gs.statusBadgePulse
    ? `glance-status-badge ${status}`
    : `glance-status-badge ${status} no-pulse`

  const hasError = histError || currentError || gcError
  const retryAll = () => { refetchHist(); refetchCurrent(); refetchGc() }

  return (
    <div className="glance-root">
      <div className="glance-left">

        {hasError && (
          <div className="glance-error-banner">
            <span>⚠ Failed to fetch metrics</span>
            <button className="btn-ghost btn-xs" onClick={retryAll}>Retry</button>
          </div>
        )}

        {/* Status bar */}
        <div className="glance-status-bar">
          <span className={badgeClass}>{status.toUpperCase()}{gbm ? ' (GBM)' : ''}</span>
          <span className="glance-status-uptime">up {uptimeStr}</span>
          <span style={{ flex: 1 }} />
          <span className="glance-live-badge">
            <span className="glance-live-dot" />
            {(gs.refreshIntervalMs / 1000).toFixed(1)}s
          </span>
          {showLogPanel && !logPanelOpen && (
            <button
              className="glance-show-logs-btn"
              onClick={() => setLogPanelOpen(true)}
              title="Show log panel"
            >
              <IconChevronLeft size={11} />
              logs
            </button>
          )}
        </div>

        {/* Speedo rail */}
        <div className="speedo-rail">
          <SpeedoGauge label="TPS 1m"
            value={current?.tps1 ?? null}
            displayValue={current ? current.tps1.toFixed(2) : '—'}
            subLine="/ 20"
            min={0} max={20} zones={zones.tps} sigma={tpsSigma} />
          <SpeedoGauge label="Tick Time"
            value={current?.tickTimeMs ?? null}
            displayValue={current ? `${Math.round(current.tickTimeMs)}ms` : '—'}
            subLine={`< ${gs.msptYellowAbove}ms good`}
            min={0} max={200} zones={zones.tick} sigma={tickSigma} />
          <SpeedoGauge label="Memory"
            value={current ? memP : null}
            displayValue={current ? `${Math.round(memP * 100)}%` : '—'}
            subLine={current ? `${fmtMem(current.memUsedMb)}/${fmtMem(current.memMaxMb)}` : undefined}
            min={0} max={1} zones={zones.mem} sigma={memSigma} />
          <SpeedoGauge label="CPU"
            value={current?.cpuPercent != null && current.cpuPercent >= 0 ? current.cpuPercent : null}
            displayValue={current?.cpuPercent != null && current.cpuPercent >= 0 ? `${current.cpuPercent.toFixed(1)}%` : '—'}
            min={0} max={100} zones={zones.cpu} />
          <SpeedoGauge label="Sys RAM"
            value={current?.sysMemUsedMb != null && current.sysMemTotalMb
              ? (current.sysMemUsedMb / current.sysMemTotalMb) * 100 : null}
            displayValue={current?.sysMemUsedMb != null && current.sysMemTotalMb
              ? `${Math.round((current.sysMemUsedMb / current.sysMemTotalMb) * 100)}%` : '—'}
            subLine={current?.sysMemUsedMb != null && current.sysMemTotalMb
              ? `${fmtMem(current.sysMemUsedMb)}/${fmtMem(current.sysMemTotalMb)}` : undefined}
            min={0} max={100} zones={zones.mem} />
          <SpeedoGauge label="Disk"
            value={current?.diskUsedGb != null && current.diskTotalGb && current.diskTotalGb > 0
              ? (current.diskUsedGb / current.diskTotalGb) * 100 : null}
            displayValue={current?.diskUsedGb != null && current.diskTotalGb && current.diskTotalGb > 0
              ? `${Math.round((current.diskUsedGb / current.diskTotalGb) * 100)}%` : '—'}
            subLine={current?.diskUsedGb != null && current.diskTotalGb
              ? `${current.diskUsedGb}/${current.diskTotalGb}G` : undefined}
            min={0} max={100} zones={zones.disk} />
          <UptimeDisplay uptimeStr={uptimeStr} />
        </div>

        <div className="tape-divider" />

        {/* Window selector */}
        <div className="mac-seg-ctrl" style={{ alignSelf: 'center' }}>
          {WINDOWS.map(w => (
            <button
              key={w.v}
              className={`mac-seg-btn${windowMin === w.v ? ' active' : ''}`}
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
              <GlanceChart {...SHARED} title="Memory" dataKey="memUsedMb" statsKey="memPct"
                color={memColor(memP)} yDomain={[0, memMaxMb]}
                yFormatter={fmtMem} stats={allStats.memPct} chartId="mem"
                gcEvents={!gbm ? gcEvents : undefined}
                showGcLabels={windowMin <= 15 && gcEvents.length <= MAX_GC_LABELS} showGcHint />
            )}
            {gs.showChartCpu && hasCpuData && (
              <GlanceChart {...SHARED} title="Host CPU" dataKey="cpuPercent"
                color={cpuColor(current!.cpuPercent!)} yDomain={[0, 100]}
                yFormatter={v => `${v.toFixed(0)}%`} stats={allStats.cpuPercent} chartId="cpu" />
            )}
          </>
        )}
      </div>

      {/* Log viewer */}
      {showLogPanel && (
        <div className={`glance-right${logPanelOpen ? '' : ' collapsed'}`}>
          <GlanceLogViewer
            tsLogs={logCtx.tsLogs}
            clickedTs={clickedTs}
            onClear={() => setClickedTs(null)}
            isOpen={logPanelOpen}
            onToggle={() => setLogPanelOpen(o => !o)}
          />
        </div>
      )}
    </div>
  )
}
