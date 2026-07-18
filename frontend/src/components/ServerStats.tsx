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

interface GuideContent {
  title: string
  intro: string
  sections: Array<{ title: string; body: string[] }>
}

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
  return (
    <button className="stats-help-btn" title={`Explain ${label}`} aria-label={`Explain ${label}`} onClick={onClick}>
      <HelpIcon />
    </button>
  )
}

function GuideModal({ guide, onClose }: { guide: GuideContent; onClose: () => void }) {
  return (
    <div className="stats-guide-overlay" onClick={onClose}>
      <div className="stats-guide-card" onClick={e => e.stopPropagation()}>
        <div className="stats-guide-head">
          <div>
            <div className="stats-guide-kicker">Data Guide</div>
            <div className="stats-guide-title">{guide.title}</div>
          </div>
          <button className="stats-guide-close" onClick={onClose} aria-label="Close guide">×</button>
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

const GUIDE_BY_ID: Record<string, GuideContent> = {
  tps: {
    title: 'TPS Chart',
    intro: 'TPS is the quickest read on whether the server is keeping up with real time. Minecraft targets 20 ticks per second; lower values mean the simulation is falling behind.',
    sections: [
      {
        title: 'How to read it',
        body: [
          'The solid TPS line shows the recent one-minute tick rate. The dashed 5-minute line is a smoother baseline that helps separate a short hiccup from a sustained slowdown.',
          'A healthy server spends most of its time close to 20. Brief dips can be normal during world generation, backups, large teleports, or plugin work. Repeated dips or a flat line below 19 are worth investigating.',
        ],
      },
      {
        title: 'How this helps you decide',
        body: [
          'Compare TPS with MSPT first. Low TPS with high MSPT usually means the main thread is overloaded. Low TPS without high MSPT can point to sampling gaps, startup/shutdown behavior, or external pauses.',
          'Use the range selector to zoom your question: 1h for recent incidents, 6h for session patterns, 24h for daily load, and 7d for recurring schedule or player-cycle problems.',
        ],
      },
      {
        title: 'Useful next checks',
        body: [
          'If TPS drops line up with player joins, chunk counts, or entity count growth, investigate player movement, farms, mob caps, or chunk loaders.',
          'If TPS drops line up with CPU, memory, or disk pressure, look at host limits rather than only Minecraft configuration.',
        ],
      },
    ],
  },
  mspt: {
    title: 'MSPT Chart',
    intro: 'MSPT is milliseconds per tick. Since Minecraft needs 20 ticks per second, each tick has roughly 50ms of budget.',
    sections: [
      {
        title: 'How to read it',
        body: [
          'Values under 50ms mean the server can usually sustain 20 TPS. Values above 50ms mean ticks are taking too long and TPS may start falling.',
          'Spikes are important even when TPS recovers. They often correspond to world saves, plugin tasks, entity bursts, redstone activity, or chunk generation.',
        ],
      },
      {
        title: 'How this helps you decide',
        body: [
          'MSPT is more diagnostic than TPS because it tells you how much main-thread work is happening. TPS tells you the outcome; MSPT helps explain the mechanism.',
          'When MSPT rises but player count does not, look for world or automation causes. When MSPT rises with players, look at player distribution, chunk loading, and player-triggered plugins.',
        ],
      },
      {
        title: 'Useful next checks',
        body: [
          'Correlate MSPT with Entities and Loaded Chunks. High MSPT plus high entities often points to farms, pathfinding, or mob buildup. High MSPT plus high chunks points to exploration, view distance, or loaders.',
          'Use anomaly markers on the Z-score overlay to jump to logs near the spike. Logs may show saves, warnings, plugin tasks, or lag messages.',
        ],
      },
    ],
  },
  players: {
    title: 'Players Chart',
    intro: 'This chart shows online player count over time and overlays join/leave markers when player events are available.',
    sections: [
      {
        title: 'How to read it',
        body: [
          'The line shows concurrency. Vertical markers show joins and leaves, which help explain abrupt changes or activity bursts.',
          'A player-count increase is not inherently bad. It becomes important when it aligns with TPS drops, MSPT spikes, more chunks, more entities, or higher ping.',
        ],
      },
      {
        title: 'How this helps you decide',
        body: [
          'Use this chart to distinguish baseline server load from player-driven load. A problem that appears only when players are online is usually gameplay, world, network, or plugin interaction.',
          'If performance changes after one or two players join, inspect where they are, whether they are exploring, and whether their actions activate expensive areas.',
        ],
      },
      {
        title: 'Useful next checks',
        body: [
          'Compare with Loaded Chunks and Entities. A small player increase with a large chunk increase often means exploration, high view distance, or teleport-heavy play.',
          'Compare with Ping P50/P95. If player count rises and ping rises while MSPT stays healthy, the issue may be network or host saturation rather than main-thread lag.',
        ],
      },
    ],
  },
  entities: {
    title: 'Entities Chart',
    intro: 'Entities include mobs, dropped items, projectiles, armor stands, minecarts, and other world objects that the server may need to tick.',
    sections: [
      {
        title: 'How to read it',
        body: [
          'A rising entity count means the worlds are accumulating more tickable objects. Not every entity costs the same, but growth can raise tick work.',
          'Sharp jumps can indicate farms turning on, players entering loaded areas, world events, or cleanup failures.',
        ],
      },
      {
        title: 'How this helps you decide',
        body: [
          'Entity count is most useful when compared with MSPT. If both rise together, entities are a likely contributor to lag.',
          'If entities rise but MSPT stays flat, the server is handling them for now. Keep watching for thresholds or recurring buildup.',
        ],
      },
      {
        title: 'Useful next checks',
        body: [
          'Investigate high-density areas, farms, villages, dropped item cleanup, mob caps, and plugin-spawned entities.',
          'Use the 24h or 7d range to find slow leaks: a gradual upward slope that never resets often points to cleanup or world-management issues.',
        ],
      },
    ],
  },
  chunks: {
    title: 'Loaded Chunks Chart',
    intro: 'Loaded chunks measure how much world area is active. More chunks mean more block/entity ticking, more memory pressure, and more potential disk activity.',
    sections: [
      {
        title: 'How to read it',
        body: [
          'The line shows total loaded chunks across worlds. A stable plateau is normal. Sudden jumps usually mean exploration, teleporting, chunk loaders, high view distance, or many spread-out players.',
          'Loaded chunks are a multiplier for other work. The same number of players can be much more expensive if they are spread across many areas.',
        ],
      },
      {
        title: 'How this helps you decide',
        body: [
          'Compare chunks with MSPT and memory. Rising chunks plus rising MSPT suggests simulation work. Rising chunks plus memory pressure suggests world footprint or caching pressure.',
          'Compare chunks with player count. If chunks rise faster than players, the server may need view-distance, simulation-distance, pre-generation, or loader policy changes.',
        ],
      },
      {
        title: 'Useful next checks',
        body: [
          'Review view distance, simulation distance, chunk loaders, portals, teleport commands, and whether players are exploring ungenerated terrain.',
          'If chunk spikes line up with disk or MSPT spikes, pre-generate terrain or reduce exploration-heavy load during peak hours.',
        ],
      },
    ],
  },
  ping: {
    title: 'Ping Percentiles Chart',
    intro: 'Ping P50 is median player latency. Ping P95 is the high-latency tail. Together they show whether network problems affect most players or only a few.',
    sections: [
      {
        title: 'How to read it',
        body: [
          'P50 tells you the typical player experience. P95 tells you how bad latency gets for the slower end of connected players.',
          'If P50 and P95 both rise, the server or network path is broadly degraded. If only P95 rises, a subset of players may have routing, distance, Wi-Fi, or regional issues.',
        ],
      },
      {
        title: 'How this helps you decide',
        body: [
          'Compare ping with MSPT. High ping with normal MSPT means the game loop is healthy but network or host connectivity may be poor.',
          'High ping with high CPU, disk, or memory pressure can indicate host contention. High ping with player count jumps may indicate bandwidth or proxy limits.',
        ],
      },
      {
        title: 'Useful next checks',
        body: [
          'Check proxy/tunnel health, host network graphs, DDoS protection events, routing region, and whether only specific players are affected.',
          'Ping metrics may be unavailable on non-Paper servers or older forks; absence of this chart does not mean latency is perfect.',
        ],
      },
    ],
  },
  perfOverlay: {
    title: 'Performance Overlay (Z-score)',
    intro: 'The performance overlay puts several metrics onto one standardized σ scale so different units can be compared on the same chart.',
    sections: [
      {
        title: 'How to read it',
        body: [
          'Each line shows how unusual a metric is compared with its own history in the selected range. 0σ is normal for that metric. +2σ means unusually high. -2σ means unusually low.',
          'TPS is special: negative movement is usually bad. For MSPT, memory, and CPU, positive movement is usually the concerning direction.',
        ],
      },
      {
        title: 'How this helps you decide',
        body: [
          'The overlay answers “what changed at the same time?” If MSPT, CPU, and memory all move together, host or workload pressure is more likely. If only MSPT moves, main-thread work is more likely.',
          'Anomaly markers appear when any visible series crosses the configured σ threshold. Click a marked area to inspect nearby logs.',
        ],
      },
      {
        title: 'Important caveats',
        body: [
          'Z-scores are relative to the selected window. A quiet one-hour window can make small changes look unusual; a noisy seven-day window can make real issues look less dramatic.',
          'Use this as a triage tool, not proof. Confirm with raw charts, logs, and operational context.',
        ],
      },
    ],
  },
  worldOverlay: {
    title: 'World Overlay (Z-score)',
    intro: 'The world overlay standardizes player count, entities, chunks, and optionally ping so you can see which world-facing workload changed together.',
    sections: [
      {
        title: 'How to read it',
        body: [
          'Lines above 0σ are higher than usual for the selected range. Lines below 0σ are lower than usual. Crossings and simultaneous spikes are more important than isolated noise.',
          'The overlay is useful for identifying whether lag is driven by player presence, world area, entity accumulation, or latency.',
        ],
      },
      {
        title: 'How this helps you decide',
        body: [
          'Players plus chunks suggests distribution or exploration. Entities plus MSPT suggests tick cost. Ping without MSPT suggests network rather than server simulation.',
          'When multiple world metrics spike together, use timestamps to jump into logs and correlate with joins, teleports, world saves, or plugin actions.',
        ],
      },
      {
        title: 'Useful next checks',
        body: [
          'Use this overlay to pick which raw chart to inspect next. The overlay shows relationships; the raw charts show magnitude.',
          'If the world overlay identifies recurring daily spikes, compare with scheduled actions, backups, restarts, or known player activity windows.',
        ],
      },
    ],
  },
  correlation: {
    title: 'Metric Correlations Table',
    intro: 'The correlation table estimates how strongly pairs of metrics moved together during the selected range using Pearson r.',
    sections: [
      {
        title: 'How to read it',
        body: [
          'Values range from -1.00 to +1.00. Positive values mean two metrics tend to rise together. Negative values mean one tends to rise while the other falls. Values near 0 mean no clear linear relationship.',
          'As a rough rule: |r| above 0.7 is strong, 0.4 to 0.7 is moderate, and below 0.2 is usually weak or negligible.',
        ],
      },
      {
        title: 'How this helps you decide',
        body: [
          'Correlation helps prioritize investigations. If MSPT correlates strongly with entities, inspect entity-heavy areas. If MSPT correlates with chunks, inspect exploration or loaders. If ping correlates with players but MSPT does not, inspect network capacity.',
          'The table is best used after you notice a symptom. Find the symptom row or column, then look for high absolute correlations that suggest likely drivers.',
        ],
      },
      {
        title: 'Important caveats',
        body: [
          'Correlation is not causation. Backups, peak hours, restarts, and player behavior can make unrelated metrics move together.',
          'Small sample sizes and flat metrics can produce missing values. Change the time range if the table looks sparse or misleading.',
        ],
      },
    ],
  },
}

// ── Mini chart ─────────────────────────────────────────────────────────────────

interface MiniChartProps {
  data: Snap[]
  dataKey: keyof Snap
  color: string
  label: string
  guideId: keyof typeof GUIDE_BY_ID
  onGuide: (guide: GuideContent) => void
  yDomain?: [number | 'auto', number | 'auto']
  yFmt?: (v: number) => string
  events?: PlayerEvent[]
  extraLine?: { key: keyof Snap; color: string; label: string }
}

function MiniChart({ data, dataKey, color, label, guideId, onGuide, yDomain, yFmt, events, extraLine }: MiniChartProps) {
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
        <HelpButton label={label} onClick={() => onGuide(GUIDE_BY_ID[guideId])} />
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
          {downsampleEvents(events).map(ev => (
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
  guideId: keyof typeof GUIDE_BY_ID
  showMarkers: boolean
  threshold: number
  onAnomalyClick: (ts: number) => void
  onGuide: (guide: GuideContent) => void
}

function ZOverlay({ data, series, title, guideId, showMarkers, threshold, onAnomalyClick, onGuide }: ZOverlayProps) {
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
        <HelpButton label={title} onClick={() => onGuide(GUIDE_BY_ID[guideId])} />
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
  onGuide: (guide: GuideContent) => void
}

function CorrelationTable({ data, onGuide }: CorrelationTableProps) {
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
        <span className="glance-chart-title">Pearson r Correlation Table</span>
        <span className="corr-hint">|r| &gt; 0.7 strong · 0.4–0.7 moderate · &lt;0.2 negligible</span>
        <HelpButton label="Metric Correlations" onClick={() => onGuide(GUIDE_BY_ID.correlation)} />
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
  const [guide, setGuide] = useState<GuideContent | null>(null)

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

  const historyRawWithCurrent = useMemo(() => {
    if (!snap) return historyRaw
    const lastTs = historyRaw[historyRaw.length - 1]?.timestamp ?? 0
    return snap.timestamp > lastTs + 500 ? [...historyRaw, snap] : historyRaw
  }, [historyRaw, snap])

  const history = useMemo(() => downsample(historyRawWithCurrent), [historyRawWithCurrent])

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
    <div className="section-root page-content">
      <div className="section-header">
        <span className="section-title">Server Stats</span>
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
          <div className="stat-label">Players</div>
          <div className="stat-value amber">{data.onlinePlayers}</div>
          <div className="stat-sub">of {data.maxPlayers} max</div>
          <Sparkline values={history.map(s => s.playerCount)} color="var(--amber)" />
        </div>
        <div className="stat-card">
          <div className="stat-label">TPS · 1m</div>
          <div className={`stat-value ${tpsClass(tps1)}`}>{tps1?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">target 20.0</div>
          <Sparkline values={history.map(s => s.tps1)} color="var(--green)" />
        </div>
        <div className="stat-card">
          <div className="stat-label">TPS · 5m</div>
          <div className={`stat-value ${tpsClass(tps5)}`}>{tps5?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">5 min avg</div>
          <Sparkline values={history.map(s => s.tps5)} color="var(--green)" />
        </div>
        <div className="stat-card">
          <div className="stat-label">TPS · 15m</div>
          <div className={`stat-value ${tpsClass(tps15)}`}>{tps15?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">15 min avg</div>
          <Sparkline values={history.map(s => s.tps15)} color="var(--green)" />
        </div>
        <div className="stat-card">
          <div className="stat-label">Tick Time</div>
          <div className={`stat-value ${snap ? tickClass(snap.tickTimeMs) : ''}`}>
            {snap ? `${Math.round(snap.tickTimeMs)}ms` : '—'}
          </div>
          <div className="stat-sub">healthy &lt;50ms</div>
          <Sparkline values={history.map(s => s.tickTimeMs)} color="var(--amber)" />
        </div>
        <div className="stat-card">
          <div className="stat-label">JVM Memory</div>
          <div className={`stat-value ${memClass(memPct)}`}>{snap ? fmtMem(snap.memUsedMb) : '—'}</div>
          <div className="stat-sub">{snap ? `of ${fmtMem(snap.memMaxMb)} max` : ''}</div>
          <Sparkline values={history.map(s => s.memUsedMb)} color="var(--blue)" />
        </div>
        {snap?.cpuPercent != null && snap.cpuPercent >= 0 && (
          <div className="stat-card">
            <div className="stat-label">Host CPU</div>
            <div className={`stat-value ${cpuClass(snap.cpuPercent)}`}>{snap.cpuPercent.toFixed(1)}%</div>
            <div className="stat-sub">system-wide</div>
            <Sparkline values={history.map(s => s.cpuPercent != null && s.cpuPercent >= 0 ? s.cpuPercent : null)} color="var(--red)" />
          </div>
        )}
        {sysMemPct != null && snap?.sysMemUsedMb != null && snap?.sysMemTotalMb != null && (
          <div className="stat-card">
            <div className="stat-label">Host RAM</div>
            <div className={`stat-value ${memClass(sysMemPct)}`}>{fmtMem(snap.sysMemUsedMb)}</div>
            <div className="stat-sub">of {fmtMem(snap.sysMemTotalMb)}</div>
            <Sparkline values={history.map(s => s.sysMemUsedMb)} color="var(--blue)" />
          </div>
        )}
        {diskPct != null && snap?.diskUsedGb != null && snap?.diskTotalGb != null && (
          <div className="stat-card">
            <div className="stat-label">Disk</div>
            <div className={`stat-value ${diskClass(diskPct)}`}>{snap.diskUsedGb} GB</div>
            <div className="stat-sub">of {snap.diskTotalGb} GB used</div>
            <Sparkline values={history.map(s => s.diskUsedGb)} color="var(--mist)" />
          </div>
        )}
        {snap && (
          <div className="stat-card">
            <div className="stat-label">Entities</div>
            <div className="stat-value">{snap.entityCount.toLocaleString()}</div>
            <div className="stat-sub">all worlds</div>
            <Sparkline values={history.map(s => s.entityCount)} color="var(--blue)" />
          </div>
        )}
        {snap && (
          <div className="stat-card">
            <div className="stat-label">Chunks</div>
            <div className="stat-value">{snap.loadedChunks.toLocaleString()}</div>
            <div className="stat-sub">loaded</div>
            <Sparkline values={history.map(s => s.loadedChunks)} color="var(--mist)" />
          </div>
        )}
        {snap?.pingP50 != null && snap.pingP50 > 0 && (
          <div className="stat-card">
            <div className="stat-label">Ping P50</div>
            <div className="stat-value green">{snap.pingP50}ms</div>
            <div className="stat-sub">median latency</div>
            <Sparkline values={history.map(s => s.pingP50 != null && s.pingP50 > 0 ? s.pingP50 : null)} color="var(--green)" />
          </div>
        )}
        {rangeSummary.samples > 0 && (
          <div className="stat-card">
            <div className="stat-label">Window Data</div>
            <div className="stat-value">{rangeSummary.coverageMin != null ? `${Math.round(rangeSummary.coverageMin)}m` : '—'}</div>
            <div className="stat-sub">{rangeSummary.samples.toLocaleString()} samples in {range}</div>
          </div>
        )}
        {rangeSummary.avgTps != null && (
          <div className="stat-card">
            <div className="stat-label">Avg TPS</div>
            <div className={`stat-value ${tpsClass(rangeSummary.avgTps)}`}>{rangeSummary.avgTps.toFixed(1)}</div>
            <div className="stat-sub">selected window</div>
          </div>
        )}
        {rangeSummary.minTps != null && (
          <div className="stat-card">
            <div className="stat-label">Lowest TPS</div>
            <div className={`stat-value ${tpsClass(rangeSummary.minTps)}`}>{rangeSummary.minTps.toFixed(1)}</div>
            <div className="stat-sub">selected window</div>
          </div>
        )}
        {rangeSummary.avgMspt != null && (
          <div className="stat-card">
            <div className="stat-label">Avg MSPT</div>
            <div className={`stat-value ${tickClass(rangeSummary.avgMspt)}`}>{Math.round(rangeSummary.avgMspt)}ms</div>
            <div className="stat-sub">selected window</div>
          </div>
        )}
        {rangeSummary.maxMspt != null && (
          <div className="stat-card">
            <div className="stat-label">Peak MSPT</div>
            <div className={`stat-value ${tickClass(rangeSummary.maxMspt)}`}>{Math.round(rangeSummary.maxMspt)}ms</div>
            <div className="stat-sub">selected window</div>
          </div>
        )}
        {rangeSummary.peakPlayers != null && (
          <div className="stat-card">
            <div className="stat-label">Peak Players</div>
            <div className="stat-value amber">{Math.round(rangeSummary.peakPlayers)}</div>
            <div className="stat-sub">{rangeSummary.avgPlayers != null ? `avg ${rangeSummary.avgPlayers.toFixed(1)}` : 'selected window'}</div>
          </div>
        )}
        {rangeSummary.avgCpu != null && (
          <div className="stat-card">
            <div className="stat-label">Avg CPU</div>
            <div className={`stat-value ${cpuClass(rangeSummary.avgCpu)}`}>{rangeSummary.avgCpu.toFixed(1)}%</div>
            <div className="stat-sub">selected window</div>
          </div>
        )}
        {rangeSummary.peakJvmPct != null && (
          <div className="stat-card">
            <div className="stat-label">Peak JVM</div>
            <div className={`stat-value ${memClass(rangeSummary.peakJvmPct)}`}>{fmtPct(rangeSummary.peakJvmPct)}</div>
            <div className="stat-sub">heap used</div>
          </div>
        )}
        {rangeSummary.maxPingP95 != null && (
          <div className="stat-card">
            <div className="stat-label">Worst Ping P95</div>
            <div className="stat-value">{Math.round(rangeSummary.maxPingP95)}ms</div>
            <div className="stat-sub">selected window</div>
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
              guideId="tps" onGuide={setGuide}
              yDomain={[0, 20]} yFmt={v => v.toFixed(1)}
              extraLine={{ key: 'tps5', color: 'var(--green)', label: '5m' }} />
          )}
          {ss.showChartMspt && (
            <MiniChart data={history} dataKey="tickTimeMs" color="var(--amber)" label="MSPT"
              guideId="mspt" onGuide={setGuide}
              yDomain={[0, 'auto']} yFmt={v => `${Math.round(v)}ms`} />
          )}
          {ss.showChartPlayers && (
            <MiniChart data={history} dataKey="playerCount" color="var(--amber)" label="Players"
              guideId="players" onGuide={setGuide}
              yDomain={[0, 'auto']} yFmt={v => String(Math.round(v))} events={eventsRaw} />
          )}
          {ss.showChartEntities && (
            <MiniChart data={history} dataKey="entityCount" color="var(--blue)" label="Entities"
              guideId="entities" onGuide={setGuide}
              yFmt={fmtK} />
          )}
          {ss.showChartChunks && (
            <MiniChart data={history} dataKey="loadedChunks" color="var(--mist)" label="Loaded Chunks"
              guideId="chunks" onGuide={setGuide}
              yFmt={fmtK} />
          )}
          {ss.showChartPing && hasPingData && (
            <MiniChart data={history} dataKey="pingP50" color="var(--green)" label="Ping P50 / P95"
              guideId="ping" onGuide={setGuide}
              yDomain={[0, 'auto']} yFmt={v => `${Math.round(v)}ms`}
              extraLine={{ key: 'pingP95', color: 'var(--yellow)', label: 'P95' }} />
          )}

          {/* ── Z-score overlays ───────────────────────────────────── */}
          {ss.showOverlayPerf && (
            <ZOverlay data={history} series={perfSeries}
              title="Performance Overlay (Z-score)"
              guideId="perfOverlay"
              showMarkers={ss.overlayAnomalyMarkers}
              threshold={ss.overlayAnomalyThreshold}
              onAnomalyClick={onAnomalyClick}
              onGuide={setGuide} />
          )}
          {ss.showOverlayWorld && (
            <ZOverlay data={history} series={worldSeries}
              title="World Overlay (Z-score)"
              guideId="worldOverlay"
              showMarkers={ss.overlayAnomalyMarkers}
              threshold={ss.overlayAnomalyThreshold}
              onAnomalyClick={onAnomalyClick}
              onGuide={setGuide} />
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
            <CorrelationTable data={history} onGuide={setGuide} />
          )}
        </div>
      )}
      {guide && <GuideModal guide={guide} onClose={() => setGuide(null)} />}
    </div>
  )
}
