import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

interface Status {
  name: string; version: string;
  onlinePlayers: number; maxPlayers: number; tps: number[]
}

function tpsClass(tps: number) {
  if (tps >= 19) return 'green'
  if (tps >= 15) return 'yellow'
  return 'red'
}

export default function ServerStats() {
  const { data, isLoading } = useQuery<Status>({
    queryKey: ['status'],
    queryFn: () => api.get('/status').then((r) => r.data),
    refetchInterval: 3000,
  })

  if (isLoading || !data) return <div className="section-root"><div className="dim">Loading…</div></div>

  const [tps1, tps5, tps15] = data.tps

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
          <div className="stat-sub">5 minute avg</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">TPS · 15 min</div>
          <div className={`stat-value ${tpsClass(tps15)}`}>{tps15?.toFixed(1) ?? '—'}</div>
          <div className="stat-sub">15 minute avg</div>
        </div>
      </div>
    </div>
  )
}
