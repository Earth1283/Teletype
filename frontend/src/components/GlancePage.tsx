import { useEffect, useRef, useState } from 'react'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { api } from '../api/client'

interface Snap {
  timestamp: number
  tps1: number; tps5: number; tps15: number
  tickTimeMs: number
  memUsedMb: number; memTotalMb: number; memMaxMb: number
  uptimeMs: number
}

type Window = 1 | 5 | 15
const WINDOWS: Window[] = [1, 5, 15]
const WINDOW_LABEL: Record<Window, string> = { 1: '1 min', 5: '5 min', 15: '15 min' }

function fmtUptime(ms: number) {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${sec}s`
  return `${m}m ${sec}s`
}

function tpsColor(tps: number) {
  if (tps >= 19) return 'var(--green)'
  if (tps >= 15) return 'var(--yellow)'
  return 'var(--red)'
}

function memPct(snap: Snap) {
  return snap.memMaxMb > 0 ? Math.round((snap.memUsedMb / snap.memMaxMb) * 100) : 0
}

function xLabel(ts: number, window: Window) {
  const d = new Date(ts)
  if (window === 1) return `${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const CHART_MARGIN = { top: 4, right: 16, left: 0, bottom: 0 }

// Custom tooltip that fits the dark theme
function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-hi)',
      borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 11,
    }}>
      <div style={{ color: 'var(--mist)', marginBottom: 3 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color ?? 'var(--ash)' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}{unit}
        </div>
      ))}
    </div>
  )
}

export default function GlancePage() {
  const [window, setWindow] = useState<Window>(5)
  const [data, setData] = useState<Snap[]>([])
  const [latest, setLatest] = useState<Snap | null>(null)
  const [loading, setLoading] = useState(true)
  const [uptimeDisplay, setUptimeDisplay] = useState('—')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function loadHistory(w: Window) {
    setLoading(true)
    try {
      const res = await api.get('/glance/history', { params: { window: w } })
      setData(res.data)
      if (res.data.length > 0) setLatest(res.data[res.data.length - 1])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadHistory(window) }, [window])

  // Live polling — append current snapshot every 2s
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get('/glance/current')
        const snap: Snap = res.data
        setLatest(snap)
        setData((prev) => {
          const maxPts = window * 60
          const next = [...prev, snap]
          return next.length > maxPts ? next.slice(-maxPts) : next
        })
      } catch { /* server may be restarting */ }
    }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [window])

  // Tick the uptime display every second without a server call
  useEffect(() => {
    if (!latest) return
    const base = latest.uptimeMs
    const captured = Date.now()
    const tick = () => setUptimeDisplay(fmtUptime(base + (Date.now() - captured)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [latest?.timestamp])

  const tps = latest?.tps1 ?? 0
  const mem = latest ? memPct(latest) : 0
  const memColor = mem > 85 ? 'var(--red)' : mem > 65 ? 'var(--yellow)' : 'var(--blue)'

  return (
    <div className="section-root" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="section-title" style={{ fontSize: 16 }}>Server at a glance</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mist)', marginTop: 2 }}>
            Live metrics · updates every 2 s
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {WINDOWS.map((w) => (
            <button key={w}
              onClick={() => setWindow(w)}
              style={{
                fontFamily: 'var(--mono)', fontSize: 11, padding: '4px 10px',
                borderRadius: 'var(--r-sm)', cursor: 'pointer',
                background: window === w ? 'var(--amber-dim)' : 'var(--elevated)',
                border: `1px solid ${window === w ? 'var(--amber-glow)' : 'var(--border)'}`,
                color: window === w ? 'var(--amber)' : 'var(--mist)',
                transition: 'all 120ms',
              }}
            >
              {WINDOW_LABEL[w]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <SummaryCard label="Uptime">
          <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, color: 'var(--ash)', letterSpacing: '-0.02em' }}>
            {uptimeDisplay}
          </span>
        </SummaryCard>

        <SummaryCard label="TPS (1 min)">
          <span style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 600, color: tpsColor(tps), letterSpacing: '-0.02em' }}>
            {tps.toFixed(1)}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mist)', marginLeft: 4, alignSelf: 'flex-end', paddingBottom: 4 }}>/ 20.0</span>
        </SummaryCard>

        <SummaryCard label="Memory">
          <span style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 600, color: memColor, letterSpacing: '-0.02em' }}>
            {mem}%
          </span>
          {latest && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mist)', marginLeft: 6, alignSelf: 'flex-end', paddingBottom: 4 }}>
              {latest.memUsedMb} / {latest.memMaxMb} MB
            </span>
          )}
        </SummaryCard>
      </div>

      {/* Charts */}
      {loading ? (
        <div className="dim">Loading metrics…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ChartCard title="Ticks per Second" subtitle="Target: 20.0">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="timestamp" type="number" scale="time" domain={['auto', 'auto']}
                  tickFormatter={(v) => xLabel(v, window)}
                  tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 10 }}
                  tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40}
                />
                <YAxis
                  domain={[0, 21]} width={28}
                  tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 10 }}
                  tickLine={false} axisLine={false} tickCount={5}
                />
                <Tooltip content={<ChartTooltip unit="" />} />
                <ReferenceLine y={20} stroke="var(--border-hi)" strokeDasharray="3 3" />
                <Line dataKey="tps1" name="1m" stroke="var(--amber)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line dataKey="tps5" name="5m" stroke="rgba(245,158,11,.4)" strokeWidth={1} dot={false} strokeDasharray="3 3" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Memory Usage" subtitle={`Max: ${latest?.memMaxMb ?? '—'} MB`}>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--blue)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="timestamp" type="number" scale="time" domain={['auto', 'auto']}
                  tickFormatter={(v) => xLabel(v, window)}
                  tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 10 }}
                  tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40}
                />
                <YAxis
                  width={40}
                  tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 10 }}
                  tickLine={false} axisLine={false} tickCount={4}
                  tickFormatter={(v) => `${v}m`}
                  domain={[0, (latest?.memMaxMb ?? 'auto')]}
                />
                <Tooltip content={<ChartTooltip unit=" MB" />} />
                <Area
                  dataKey="memUsedMb" name="Used"
                  stroke="var(--blue)" strokeWidth={1.5}
                  fill="url(#memGrad)" dot={false} isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Mean Tick Time" subtitle="Healthy: < 50 ms">
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={data} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="tickGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--green)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--green)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="timestamp" type="number" scale="time" domain={['auto', 'auto']}
                  tickFormatter={(v) => xLabel(v, window)}
                  tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 10 }}
                  tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40}
                />
                <YAxis
                  width={36}
                  tick={{ fill: 'var(--mist)', fontFamily: 'var(--mono)', fontSize: 10 }}
                  tickLine={false} axisLine={false} tickCount={4}
                  tickFormatter={(v) => `${v}ms`}
                  domain={[0, 'auto']}
                />
                <Tooltip content={<ChartTooltip unit=" ms" />} />
                <ReferenceLine y={50} stroke="rgba(248,113,113,.4)" strokeDasharray="3 3" />
                <Area
                  dataKey="tickTimeMs" name="Tick"
                  stroke="var(--green)" strokeWidth={1.5}
                  fill="url(#tickGrad)" dot={false} isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: '14px 18px',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 500, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--mist)', marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline' }}>{children}</div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: '16px 20px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ash)' }}>{title}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mist)' }}>{subtitle}</span>
      </div>
      {children}
    </div>
  )
}
