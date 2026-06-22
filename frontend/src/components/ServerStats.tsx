import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

interface Status {
  name: string; version: string
  onlinePlayers: number; maxPlayers: number; tps: number[]
  worldCount: number; pluginCount: number
}

interface Snap {
  memUsedMb: number; memMaxMb: number; memTotalMb: number
  tickTimeMs: number; uptimeMs: number
  cpuPercent?: number | null
  sysMemUsedMb?: number | null; sysMemTotalMb?: number | null
  diskUsedGb?: number | null; diskTotalGb?: number | null
}

function tpsClass(tps: number) {
  if (tps >= 19) return 'green'
  if (tps >= 15) return 'yellow'
  return 'red'
}
function memClass(pct: number) {
  if (pct < 0.65) return 'green'
  if (pct < 0.85) return 'amber'
  return 'red'
}
function cpuClass(pct: number) {
  if (pct < 50) return 'green'
  if (pct < 80) return 'amber'
  return 'red'
}
function tickClass(ms: number) {
  if (ms <= 50) return 'green'
  if (ms <= 100) return 'amber'
  return 'red'
}
function diskClass(pct: number) {
  if (pct < 0.75) return 'green'
  if (pct < 0.9) return 'amber'
  return 'red'
}
function fmtMem(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}
function fmtUptime(ms: number) {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function ServerStats() {
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

  if (isLoading || !data) return <div className="section-root"><div className="dim">Loading…</div></div>

  const [tps1, tps5, tps15] = data.tps
  const memPct = snap && snap.memMaxMb > 0 ? snap.memUsedMb / snap.memMaxMb : 0
  const sysMemPct = snap?.sysMemUsedMb && snap?.sysMemTotalMb ? snap.sysMemUsedMb / snap.sysMemTotalMb : null
  const diskPct = snap?.diskUsedGb && snap?.diskTotalGb ? snap.diskUsedGb / snap.diskTotalGb : null

  return (
    <div className="section-root">
      <div className="section-header">
        <span className="section-title">Server Stats</span>
      </div>

      <div className="server-name-display">{data.name}</div>
      <div className="server-version">{data.version}</div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Players</div>
          <div className="stat-value amber">{data.onlinePlayers}</div>
          <div className="stat-sub">of {data.maxPlayers} max</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">TPS · 1 min</div>
          <div className={`stat-value ${tpsClass(tps1)}`}>{tps1?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">target 20.0</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">TPS · 5 min</div>
          <div className={`stat-value ${tpsClass(tps5)}`}>{tps5?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">5 min avg</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">TPS · 15 min</div>
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
          <div className={`stat-value ${memClass(memPct)}`}>
            {snap ? fmtMem(snap.memUsedMb) : '—'}
          </div>
          <div className="stat-sub">{snap ? `of ${fmtMem(snap.memMaxMb)} max` : ''}</div>
        </div>

        {snap?.cpuPercent != null && snap.cpuPercent >= 0 && (
          <div className="stat-card">
            <div className="stat-label">Host CPU</div>
            <div className={`stat-value ${cpuClass(snap.cpuPercent)}`}>
              {snap.cpuPercent.toFixed(1)}%
            </div>
            <div className="stat-sub">system-wide</div>
          </div>
        )}

        {sysMemPct != null && snap?.sysMemUsedMb != null && snap?.sysMemTotalMb != null && (
          <div className="stat-card">
            <div className="stat-label">Host RAM</div>
            <div className={`stat-value ${memClass(sysMemPct)}`}>
              {fmtMem(snap.sysMemUsedMb)}
            </div>
            <div className="stat-sub">of {fmtMem(snap.sysMemTotalMb)}</div>
          </div>
        )}

        {diskPct != null && snap?.diskUsedGb != null && snap?.diskTotalGb != null && (
          <div className="stat-card">
            <div className="stat-label">Disk</div>
            <div className={`stat-value ${diskClass(diskPct)}`}>
              {snap.diskUsedGb} GB
            </div>
            <div className="stat-sub">of {snap.diskTotalGb} GB used</div>
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
    </div>
  )
}
