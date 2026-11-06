import { useState, useMemo, useCallback, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { api } from '../api/client'
import { fetchHistory, historyQueryKey } from '../api/history'
import { useSettings } from '../SettingsContext'
import { useLogApi } from '../LogContext'
import { pointAtActiveIndex, type ChartTooltipProps } from './charts/chartTypes'
import { usePollInterval } from '../shell/PageActivity'

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

interface GuideContent {
  title: string
  intro: string
  sections: Array<{ title: string; body: string[] }>
}

type TFn = (key: string, options?: Record<string, unknown>) => string
type GuideId = 'tps' | 'mspt' | 'players' | 'entities' | 'chunks' | 'ping' | 'perfOverlay' | 'worldOverlay' | 'correlation'

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
function fmtPct(v: number) { return `${Math.round(v * 100)}%` }
function finiteNumbers(values: Array<number | null | undefined>): number[] {
  return values.filter((v): v is number => typeof v === 'number' && isFinite(v))
}
function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}
function min(values: number[]): number | null {
  return values.length ? Math.min(...values) : null
}
function max(values: number[]): number | null {
  return values.length ? Math.max(...values) : null
}

const MAX_PTS = 400
function downsample<T extends { timestamp: number }>(data: T[]): T[] {
  if (data.length <= MAX_PTS) return data
  const step = Math.ceil(data.length / MAX_PTS)
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
}

// Each event renders as its own SVG ReferenceLine — thousands of markers (a busy
// server over 7d) freezes the chart on layout/paint. Cap it; a dense cluster of
// join/leave markers is unreadable anyway.
const MAX_EVENT_MARKERS = 150
function downsampleEvents(events?: PlayerEvent[]): PlayerEvent[] {
  if (!events || events.length <= MAX_EVENT_MARKERS) return events ?? []
  const step = Math.ceil(events.length / MAX_EVENT_MARKERS)
  return events.filter((_, i) => i % step === 0)
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

function Sparkline({ values, color = 'var(--amber)' }: { values: Array<number | null | undefined>; color?: string }) {
  const pts = values
    .filter((v): v is number => typeof v === 'number' && isFinite(v))
    .slice(-72)
  if (pts.length < 2) return null

  const lo = Math.min(...pts)
  const hi = Math.max(...pts)
  const span = hi - lo || 1
  const w = 120
  const h = 28
  const pad = 2
  const d = pts.map((v, i) => {
    const x = pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * w
    const y = h - pad - ((v - lo) / span) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg className="stat-sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ── Data guide helpers ───────────────────────────────────────────────────────

function HelpIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9.75 9.15a2.45 2.45 0 0 1 4.65 1.1c0 1.7-2.4 2.05-2.4 3.85" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  )
}

function HelpButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useTranslation('stats')
  return (
    <button className="stats-help-btn" title={t('explainLabel', { label })} aria-label={t('explainLabel', { label })} onClick={onClick}>
      <HelpIcon />
    </button>
  )
}

function GuideModal({ guide, onClose }: { guide: GuideContent; onClose: () => void }) {
  const { t } = useTranslation('stats')
  return (
    <div className="stats-guide-overlay" onClick={onClose}>
      <div className="stats-guide-card" onClick={e => e.stopPropagation()}>
        <div className="stats-guide-head">
          <div>
            <div className="stats-guide-kicker">{t('dataGuideKicker')}</div>
            <div className="stats-guide-title">{guide.title}</div>
          </div>
          <button className="stats-guide-close" onClick={onClose} aria-label={t('closeGuide')}>×</button>
        </div>
        <p className="stats-guide-intro">{guide.intro}</p>
        <div className="stats-guide-body">
          {guide.sections.map(section => (
            <section key={section.title} className="stats-guide-section">
              <h3>{section.title}</h3>
              {section.body.map((p, i) => <p key={i}>{p}</p>)}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function buildGuides(t: TFn): Record<GuideId, GuideContent> {
  const guide = (id: string): GuideContent => ({
    title: t(`guide.${id}.title`),
    intro: t(`guide.${id}.intro`),
    sections: [1, 2, 3].map(n => ({
      title: t(`guide.${id}.section${n}.title`),
      body: [t(`guide.${id}.section${n}.body1`), t(`guide.${id}.section${n}.body2`)],
    })),
  })
  return {
    tps: guide('tps'),
    mspt: guide('mspt'),
    players: guide('players'),
    entities: guide('entities'),
    chunks: guide('chunks'),
    ping: guide('ping'),
    perfOverlay: guide('perfOverlay'),
    worldOverlay: guide('worldOverlay'),
    correlation: guide('correlation'),
  }
}

// ── Mini chart ─────────────────────────────────────────────────────────────────

interface MiniChartProps {
  data: Snap[]
  dataKey: keyof Snap
  color: string
  label: string
  guideId: GuideId
  guides: Record<GuideId, GuideContent>
  onGuide: (guide: GuideContent) => void
  yDomain?: [number | 'auto', number | 'auto']
  yFmt?: (v: number) => string
  events?: PlayerEvent[]
  extraLine?: { key: keyof Snap; color: string; label: string }
}

interface MiniChartTooltipProps extends ChartTooltipProps<Snap> {
  label: string
  dataKey: keyof Snap
  fmt: (v: number) => string
  extraLine?: MiniChartProps['extraLine']
}

function MiniChartTooltip({ active, payload, label, dataKey, fmt, extraLine }: MiniChartTooltipProps) {
  const snap = payload?.[0]?.payload
  if (!active || !snap) return null
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

const MiniChart = memo(function MiniChart({ data, dataKey, color, label, guideId, guides, onGuide, yDomain, yFmt, events, extraLine }: MiniChartProps) {
  const fmt = yFmt ?? ((v: number) => String(v))
  const current = data[data.length - 1]
  const markers = useMemo(() => downsampleEvents(events), [events])

  return (
    <div className="glance-chart-card">
      <div className="glance-chart-header">
        <span className="glance-chart-title">{label}</span>
        {current && <span className="glance-chart-value" style={{ color }}>{fmt(Number(current[dataKey] ?? 0))}</span>}
        <HelpButton label={label} onClick={() => onGuide(guides[guideId])} />
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
          <Tooltip content={props => <MiniChartTooltip {...props} label={label} dataKey={dataKey} fmt={fmt} extraLine={extraLine} />} cursor={{ stroke: 'var(--border-hi)', strokeWidth: 1 }} />
          {markers.map(ev => (
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
})

// ── Z-Score Overlay ────────────────────────────────────────────────────────────

interface ZSeries {
  key: keyof Snap
  label: string
  color: string
  extract?: (s: Snap) => number | null
}

function zScoreOf(pt: Record<string, unknown>, key: keyof Snap): number | null {
  const v = pt[`z_${String(key)}`]
  return typeof v === 'number' && isFinite(v) ? v : null
}

interface ZScoreTooltipProps extends ChartTooltipProps<Record<string, unknown> & { _snap: Snap }> {
  series: ZSeries[]
  threshold: number
  showMarkers: boolean
  onAnomalyClick: (ts: number) => void
}

function ZScoreTooltip({ active, payload, series, threshold, showMarkers, onAnomalyClick }: ZScoreTooltipProps) {
  const { t } = useTranslation('stats')
  const pt = payload?.[0]?.payload
  if (!active || !pt) return null
  const snap = pt._snap
  return (
    <div className="glance-tooltip">
      <div className="glance-tooltip-time">{fmtTimeFull(snap.timestamp)}</div>
      <div className="glance-tooltip-metrics">
        {series.map(s => {
          const z = zScoreOf(pt, s.key)
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
        const z = zScoreOf(pt, s.key)
        return z !== null && Math.abs(z) >= threshold
      }) && (
        <div className="glance-tooltip-logs-hint" onClick={() => onAnomalyClick(snap.timestamp)}>
          {t('clickToSeeLogs')}
        </div>
      )}
    </div>
  )
}

interface ZOverlayProps {
  data: Snap[]
  series: ZSeries[]
  title: string
  guideId: GuideId
  guides: Record<GuideId, GuideContent>
  showMarkers: boolean
  threshold: number
  onAnomalyClick: (ts: number) => void
  onGuide: (guide: GuideContent) => void
}

const ZOverlay = memo(function ZOverlay({ data, series, title, guideId, guides, showMarkers, threshold, onAnomalyClick, onGuide }: ZOverlayProps) {
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

  // Find anomaly timestamps (any series exceeds threshold)
  const anomalyTs = useMemo(() => {
    if (!showMarkers) return []
    return zData
      .filter(pt => series.some(s => {
        const z = zScoreOf(pt, s.key)
        return z !== null && Math.abs(z) >= threshold
      }))
      .map(pt => pt.timestamp as number)
  }, [zData, series, showMarkers, threshold])

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
        <HelpButton label={title} onClick={() => onGuide(guides[guideId])} />
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={zData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          onClick={(state) => {
            const pt = pointAtActiveIndex(zData, state)
            if (pt && showMarkers) {
              const hasAnomaly = series.some(s => {
                const z = zScoreOf(pt, s.key)
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
          <Tooltip content={props => <ZScoreTooltip {...props} series={series} threshold={threshold} showMarkers={showMarkers} onAnomalyClick={onAnomalyClick} />} cursor={{ stroke: 'var(--border-hi)', strokeWidth: 1 }} />

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
})

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

// Diverging pair (blue <-> red) + neutral gray midpoint — the dataviz-skill
// chart palette, not the status/categorical scale, since polarity (not
// identity or severity) is what a correlation sign encodes.
function rPole(r: number): string {
  return r > 0 ? 'var(--chart-div-pos)' : 'var(--chart-div-neg)'
}

function rColor(r: number): string {
  if (Math.abs(r) < 0.2) return 'var(--ghost)'
  return rPole(r)
}

function rBg(r: number): string {
  const abs = Math.abs(r)
  if (abs < 0.2) return 'color-mix(in srgb, var(--chart-div-mid) 25%, transparent)'
  const pct = Math.round(Math.min(0.12 + abs * 0.28, 0.4) * 100)
  return `color-mix(in srgb, ${rPole(r)} ${pct}%, transparent)`
}

interface CorrelationTableProps {
  data: Snap[]
  guides: Record<GuideId, GuideContent>
  onGuide: (guide: GuideContent) => void
}

const CorrelationTable = memo(function CorrelationTable({ data, guides, onGuide }: CorrelationTableProps) {
  const { t } = useTranslation('stats')
  const metricLabel = (key: keyof Snap) => t(`corrMetric.${String(key)}`)
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
        <span className="glance-chart-title">{t('correlationTableTitle')}</span>
        <span className="corr-hint">{t('correlationHint')}</span>
        <HelpButton label={t('guide.correlation.title')} onClick={() => onGuide(guides.correlation)} />
      </div>
      <div className="corr-table-scroll">
        <table className="corr-table">
          <thead>
            <tr>
              <th />
              {activeMetrics.slice(1).map(m => (
                <th key={m.label} className="corr-th">{metricLabel(m.key)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeMetrics.slice(0, -1).map((rowM, ri) => {
              const globalRi = CORR_METRICS.findIndex(m => m.key === rowM.key)
              return (
                <tr key={rowM.label}>
                  <td className="corr-row-label">{metricLabel(rowM.key)}</td>
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
})

// ── Log panel ─────────────────────────────────────────────────────────────────

interface LogPanelProps {
  ts: number
  logs: LogLine[]
  onNavigate: () => void
  onClose: () => void
}

function LogPanel({ ts, logs, onNavigate, onClose }: LogPanelProps) {
  const { t } = useTranslation('stats')
  return (
    <div className="stats-log-panel">
      <div className="stats-log-panel-header">
        <span className="stats-log-panel-title">{t('logsNear', { time: fmtTimeFull(ts) })}</span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button className="pill-btn" style={{ fontSize: 10, padding: '2px 8px', height: 22 }}
            onClick={onNavigate}>
            {t('goToConsole')}
          </button>
          <button className="pill-btn" style={{ fontSize: 10, padding: '2px 8px', height: 22 }}
            onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      {logs.length === 0
        ? <div className="stats-log-empty">{t('noLogData')}</div>
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
  const { t } = useTranslation(['stats', 'common'])
  const guides = useMemo(() => buildGuides(t), [t])
  const { settings, update } = useSettings()
  const { getLogsAround } = useLogApi()
  const qc = useQueryClient()
  const ss = settings.stats
  const [range, setRange] = useState<Range>(ss.defaultRange)
  const [logPanelTs, setLogPanelTs] = useState<number | null>(null)
  const [guide, setGuide] = useState<GuideContent | null>(null)

  const { data, isLoading } = useQuery<Status>({
    queryKey: ['status'],
    queryFn: () => api.get('/status').then(r => r.data),
    refetchInterval: usePollInterval(3000),
  })

  const { data: snap } = useQuery<Snap>({
    queryKey: ['glance-current'],
    queryFn: () => api.get('/glance/current').then(r => r.data),
    refetchInterval: usePollInterval(2000),
  })

  const windowMin = RANGE_MINUTES[range]

  const { data: historyRaw = [] } = useQuery<Snap[]>({
    queryKey: historyQueryKey(windowMin),
    queryFn: () => fetchHistory<Snap>(qc, windowMin),
    refetchInterval: usePollInterval(30_000),
  })

  const { data: eventsRaw = [] } = useQuery<PlayerEvent[]>({
    queryKey: ['player-events', windowMin],
    queryFn: () => api.get(`/stats/player-events?minutes=${windowMin}`).then(r => r.data),
    refetchInterval: usePollInterval(30_000),
    enabled: ss.showChartPlayers,
  })

  // Sparklines/summary want the freshest point (cheap: tiny SVGs, plain reduces).
  // Merged every 2s tick on the "current" poll.
  const historyRawWithCurrent = useMemo(() => {
    if (!snap) return historyRaw
    const lastTs = historyRaw[historyRaw.length - 1]?.timestamp ?? 0
    return snap.timestamp > lastTs + 500 ? [...historyRaw, snap] : historyRaw
  }, [historyRaw, snap])

  // Big Recharts charts (MiniChart/ZOverlay/CorrelationTable) derive from historyRaw
  // only, so they recompute/repaint on the 30s history poll instead of every 2s
  // snap tick — merging one live point is invisible at 1h-7d zoom anyway, and doing
  // it here forced a full repaint of 9 chart components 15x more often than needed.
  const history = useMemo(() => downsample(historyRaw), [historyRaw])

  const rangeSummary = useMemo(() => {
    const rows = historyRawWithCurrent
    const tps = finiteNumbers(rows.map(s => s.tps1))
    const mspt = finiteNumbers(rows.map(s => s.tickTimeMs))
    const players = finiteNumbers(rows.map(s => s.playerCount))
    const cpu = finiteNumbers(rows.map(s => s.cpuPercent != null && s.cpuPercent >= 0 ? s.cpuPercent : null))
    const jvmPct = finiteNumbers(rows.map(s => s.memMaxMb > 0 ? s.memUsedMb / s.memMaxMb : null))
    const ping95 = finiteNumbers(rows.map(s => s.pingP95 != null && s.pingP95 > 0 ? s.pingP95 : null))
    const firstTs = rows[0]?.timestamp ?? null
    const lastTs = rows[rows.length - 1]?.timestamp ?? null

    return {
      samples: rows.length,
      coverageMin: firstTs !== null && lastTs !== null ? Math.max(0, (lastTs - firstTs) / 60_000) : null,
      avgTps: avg(tps),
      minTps: min(tps),
      avgMspt: avg(mspt),
      maxMspt: max(mspt),
      avgPlayers: avg(players),
      peakPlayers: max(players),
      avgCpu: avg(cpu),
      peakJvmPct: max(jvmPct),
      maxPingP95: max(ping95),
    }
  }, [historyRawWithCurrent])

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
      { key: 'tps1',       label: t('series.tps'),    color: 'var(--green)' },
      { key: 'tickTimeMs', label: t('series.mspt'),   color: 'var(--amber)' },
      { key: 'memUsedMb',  label: t('series.jvmMem'), color: 'var(--blue)'  },
    ]
    if (hasCpuData) s.push({
      key: 'cpuPercent', label: t('series.cpu'), color: 'var(--red)',
      extract: snap => (snap.cpuPercent != null && snap.cpuPercent >= 0) ? snap.cpuPercent : null,
    })
    return s
  }, [hasCpuData, t])

  const worldSeries: ZSeries[] = useMemo(() => {
    const s: ZSeries[] = [
      { key: 'playerCount',  label: t('series.players'),  color: 'var(--amber)' },
      { key: 'entityCount',  label: t('series.entities'), color: 'var(--blue)'  },
      { key: 'loadedChunks', label: t('series.chunks'),   color: 'var(--mist)'  },
    ]
    if (hasPingData) s.push({
      key: 'pingP50', label: t('series.ping'), color: 'var(--green)',
      extract: snap => (snap.pingP50 != null && snap.pingP50 > 0) ? snap.pingP50 : null,
    })
    return s
  }, [hasPingData, t])

  const changeRange = (r: Range) => {
    setRange(r)
    update({ stats: { defaultRange: r } })
  }

  if (isLoading || !data) return <div className="section-root"><div className="dim">{t('common:loading')}</div></div>

  const [tps1, tps5, tps15] = data.tps
  const memPct = snap && snap.memMaxMb > 0 ? snap.memUsedMb / snap.memMaxMb : 0
  const sysMemPct = snap?.sysMemUsedMb && snap?.sysMemTotalMb ? snap.sysMemUsedMb / snap.sysMemTotalMb : null
  const diskPct = snap?.diskUsedGb && snap?.diskTotalGb ? snap.diskUsedGb / snap.diskTotalGb : null

  return (
    <div className="section-root">
      <div className="section-header">
        <span className="section-title">{t('sectionTitle')}</span>
        <div className="mac-seg-ctrl">
          {RANGES.map(r => (
            <button key={r} className={`mac-seg-btn${range === r ? ' active' : ''}`}
              onClick={() => changeRange(r)}>{r}</button>
          ))}
        </div>
      </div>

      <div className="server-name-display">{data.name}</div>
      <div className="server-version">{data.version}</div>

      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">{t('statLabel.players')}</div>
          <div className="stat-value amber">{data.onlinePlayers}</div>
          <div className="stat-sub">{t('statSub.ofMax', { max: data.maxPlayers })}</div>
          <Sparkline values={historyRawWithCurrent.map(s => s.playerCount)} color="var(--amber)" />
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statLabel.tps1m')}</div>
          <div className={`stat-value ${tpsClass(tps1)}`}>{tps1?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">{t('statSub.targetTps')}</div>
          <Sparkline values={historyRawWithCurrent.map(s => s.tps1)} color="var(--green)" />
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statLabel.tps5m')}</div>
          <div className={`stat-value ${tpsClass(tps5)}`}>{tps5?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">{t('statSub.avg5m')}</div>
          <Sparkline values={historyRawWithCurrent.map(s => s.tps5)} color="var(--green)" />
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statLabel.tps15m')}</div>
          <div className={`stat-value ${tpsClass(tps15)}`}>{tps15?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">{t('statSub.avg15m')}</div>
          <Sparkline values={historyRawWithCurrent.map(s => s.tps15)} color="var(--green)" />
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statLabel.tickTime')}</div>
          <div className={`stat-value ${snap ? tickClass(snap.tickTimeMs) : ''}`}>
            {snap ? `${Math.round(snap.tickTimeMs)}ms` : '—'}
          </div>
          <div className="stat-sub">{t('statSub.healthyTick')}</div>
          <Sparkline values={historyRawWithCurrent.map(s => s.tickTimeMs)} color="var(--amber)" />
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statLabel.jvmMemory')}</div>
          <div className={`stat-value ${memClass(memPct)}`}>{snap ? fmtMem(snap.memUsedMb) : '—'}</div>
          <div className="stat-sub">{snap ? t('statSub.ofMax', { max: fmtMem(snap.memMaxMb) }) : ''}</div>
          <Sparkline values={historyRawWithCurrent.map(s => s.memUsedMb)} color="var(--blue)" />
        </div>
        {snap?.cpuPercent != null && snap.cpuPercent >= 0 && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.hostCpu')}</div>
            <div className={`stat-value ${cpuClass(snap.cpuPercent)}`}>{snap.cpuPercent.toFixed(1)}%</div>
            <div className="stat-sub">{t('statSub.systemWide')}</div>
            <Sparkline values={historyRawWithCurrent.map(s => s.cpuPercent != null && s.cpuPercent >= 0 ? s.cpuPercent : null)} color="var(--red)" />
          </div>
        )}
        {sysMemPct != null && snap?.sysMemUsedMb != null && snap?.sysMemTotalMb != null && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.hostRam')}</div>
            <div className={`stat-value ${memClass(sysMemPct)}`}>{fmtMem(snap.sysMemUsedMb)}</div>
            <div className="stat-sub">{t('statSub.of', { value: fmtMem(snap.sysMemTotalMb) })}</div>
            <Sparkline values={historyRawWithCurrent.map(s => s.sysMemUsedMb)} color="var(--blue)" />
          </div>
        )}
        {diskPct != null && snap?.diskUsedGb != null && snap?.diskTotalGb != null && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.disk')}</div>
            <div className={`stat-value ${diskClass(diskPct)}`}>{snap.diskUsedGb} GB</div>
            <div className="stat-sub">{t('statSub.ofGbUsed', { total: snap.diskTotalGb })}</div>
            <Sparkline values={historyRawWithCurrent.map(s => s.diskUsedGb)} color="var(--mist)" />
          </div>
        )}
        {snap && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.entities')}</div>
            <div className="stat-value">{snap.entityCount.toLocaleString()}</div>
            <div className="stat-sub">{t('statSub.allWorlds')}</div>
            <Sparkline values={historyRawWithCurrent.map(s => s.entityCount)} color="var(--blue)" />
          </div>
        )}
        {snap && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.chunks')}</div>
            <div className="stat-value">{snap.loadedChunks.toLocaleString()}</div>
            <div className="stat-sub">{t('statSub.loaded')}</div>
            <Sparkline values={historyRawWithCurrent.map(s => s.loadedChunks)} color="var(--mist)" />
          </div>
        )}
        {snap?.pingP50 != null && snap.pingP50 > 0 && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.pingP50')}</div>
            <div className="stat-value green">{snap.pingP50}ms</div>
            <div className="stat-sub">{t('statSub.medianLatency')}</div>
            <Sparkline values={historyRawWithCurrent.map(s => s.pingP50 != null && s.pingP50 > 0 ? s.pingP50 : null)} color="var(--green)" />
          </div>
        )}
        {rangeSummary.samples > 0 && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.windowData')}</div>
            <div className="stat-value">{rangeSummary.coverageMin != null ? `${Math.round(rangeSummary.coverageMin)}m` : '—'}</div>
            <div className="stat-sub">{t('statSub.samplesInRange', { count: rangeSummary.samples.toLocaleString(), range })}</div>
          </div>
        )}
        {rangeSummary.avgTps != null && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.avgTps')}</div>
            <div className={`stat-value ${tpsClass(rangeSummary.avgTps)}`}>{rangeSummary.avgTps.toFixed(1)}</div>
            <div className="stat-sub">{t('statSub.selectedWindow')}</div>
          </div>
        )}
        {rangeSummary.minTps != null && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.lowestTps')}</div>
            <div className={`stat-value ${tpsClass(rangeSummary.minTps)}`}>{rangeSummary.minTps.toFixed(1)}</div>
            <div className="stat-sub">{t('statSub.selectedWindow')}</div>
          </div>
        )}
        {rangeSummary.avgMspt != null && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.avgMspt')}</div>
            <div className={`stat-value ${tickClass(rangeSummary.avgMspt)}`}>{Math.round(rangeSummary.avgMspt)}ms</div>
            <div className="stat-sub">{t('statSub.selectedWindow')}</div>
          </div>
        )}
        {rangeSummary.maxMspt != null && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.peakMspt')}</div>
            <div className={`stat-value ${tickClass(rangeSummary.maxMspt)}`}>{Math.round(rangeSummary.maxMspt)}ms</div>
            <div className="stat-sub">{t('statSub.selectedWindow')}</div>
          </div>
        )}
        {rangeSummary.peakPlayers != null && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.peakPlayers')}</div>
            <div className="stat-value amber">{Math.round(rangeSummary.peakPlayers)}</div>
            <div className="stat-sub">{rangeSummary.avgPlayers != null ? t('statSub.avgValue', { value: rangeSummary.avgPlayers.toFixed(1) }) : t('statSub.selectedWindow')}</div>
          </div>
        )}
        {rangeSummary.avgCpu != null && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.avgCpu')}</div>
            <div className={`stat-value ${cpuClass(rangeSummary.avgCpu)}`}>{rangeSummary.avgCpu.toFixed(1)}%</div>
            <div className="stat-sub">{t('statSub.selectedWindow')}</div>
          </div>
        )}
        {rangeSummary.peakJvmPct != null && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.peakJvm')}</div>
            <div className={`stat-value ${memClass(rangeSummary.peakJvmPct)}`}>{fmtPct(rangeSummary.peakJvmPct)}</div>
            <div className="stat-sub">{t('statSub.heapUsed')}</div>
          </div>
        )}
        {rangeSummary.maxPingP95 != null && (
          <div className="stat-card">
            <div className="stat-label">{t('statLabel.worstPingP95')}</div>
            <div className="stat-value">{Math.round(rangeSummary.maxPingP95)}ms</div>
            <div className="stat-sub">{t('statSub.selectedWindow')}</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">{t('statLabel.uptime')}</div>
          <div className="stat-value">{snap ? fmtUptime(snap.uptimeMs) : '—'}</div>
          <div className="stat-sub">{t('statSub.sinceLastRestart')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statLabel.worlds')}</div>
          <div className="stat-value amber">{data.worldCount}</div>
          <div className="stat-sub">{t('statSub.loadedDimensions')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statLabel.plugins')}</div>
          <div className="stat-value">{data.pluginCount}</div>
          <div className="stat-sub">{t('statSub.loaded')}</div>
        </div>
      </div>

      {history.length > 1 && (
        <div className="stats-charts">

          {/* ── Individual charts ──────────────────────────────────── */}
          {ss.showChartTps && (
            <MiniChart data={history} dataKey="tps1" color="var(--green)" label={t('chart.tps')}
              guideId="tps" guides={guides} onGuide={setGuide}
              yDomain={[0, 20]} yFmt={v => v.toFixed(1)}
              extraLine={{ key: 'tps5', color: 'var(--green)', label: t('chart.5m') }} />
          )}
          {ss.showChartMspt && (
            <MiniChart data={history} dataKey="tickTimeMs" color="var(--amber)" label={t('chart.mspt')}
              guideId="mspt" guides={guides} onGuide={setGuide}
              yDomain={[0, 'auto']} yFmt={v => `${Math.round(v)}ms`} />
          )}
          {ss.showChartPlayers && (
            <MiniChart data={history} dataKey="playerCount" color="var(--amber)" label={t('chart.players')}
              guideId="players" guides={guides} onGuide={setGuide}
              yDomain={[0, 'auto']} yFmt={v => String(Math.round(v))} events={eventsRaw} />
          )}
          {ss.showChartEntities && (
            <MiniChart data={history} dataKey="entityCount" color="var(--blue)" label={t('chart.entities')}
              guideId="entities" guides={guides} onGuide={setGuide}
              yFmt={fmtK} />
          )}
          {ss.showChartChunks && (
            <MiniChart data={history} dataKey="loadedChunks" color="var(--mist)" label={t('chart.loadedChunks')}
              guideId="chunks" guides={guides} onGuide={setGuide}
              yFmt={fmtK} />
          )}
          {ss.showChartPing && hasPingData && (
            <MiniChart data={history} dataKey="pingP50" color="var(--green)" label={t('chart.pingP50P95')}
              guideId="ping" guides={guides} onGuide={setGuide}
              yDomain={[0, 'auto']} yFmt={v => `${Math.round(v)}ms`}
              extraLine={{ key: 'pingP95', color: 'var(--yellow)', label: t('chart.p95') }} />
          )}

          {/* ── Z-score overlays ───────────────────────────────────── */}
          {ss.showOverlayPerf && (
            <ZOverlay data={history} series={perfSeries}
              title={t('chart.perfOverlay')}
              guideId="perfOverlay"
              showMarkers={ss.overlayAnomalyMarkers}
              threshold={ss.overlayAnomalyThreshold}
              onAnomalyClick={onAnomalyClick}
              guides={guides} onGuide={setGuide} />
          )}
          {ss.showOverlayWorld && (
            <ZOverlay data={history} series={worldSeries}
              title={t('chart.worldOverlay')}
              guideId="worldOverlay"
              showMarkers={ss.overlayAnomalyMarkers}
              threshold={ss.overlayAnomalyThreshold}
              onAnomalyClick={onAnomalyClick}
              guides={guides} onGuide={setGuide} />
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
            <CorrelationTable data={history} guides={guides} onGuide={setGuide} />
          )}
        </div>
      )}
      {guide && <GuideModal guide={guide} onClose={() => setGuide(null)} />}
    </div>
  )
}
