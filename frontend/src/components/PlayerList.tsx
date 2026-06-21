import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { IconRefresh } from '../Icons'

interface Player { name: string; uuid: string; world: string; health: number }

const MAX_HEALTH = 20

export default function PlayerList() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<Player[]>({
    queryKey: ['players'],
    queryFn: () => api.get('/players').then((r) => r.data),
    refetchInterval: 5000,
  })

  function kick(name: string) { api.post('/execute', { command: `kick ${name}` }) }
  function ban(name: string) {
    if (confirm(`Ban ${name}? This cannot be undone from here.`))
      api.post('/execute', { command: `ban ${name}` })
  }

  const count = data?.length ?? 0

  return (
    <div className="section-root">
      <div className="section-header">
        <span className="section-title">Players</span>
        <span className="section-count">{count} online</span>
        <div className="section-actions">
          <button
            className="refresh-btn"
            onClick={() => refetch()}
            title="Refresh"
            style={{ opacity: isFetching ? 0.4 : 1 }}
          >
            <IconRefresh size={13} />
          </button>
        </div>
      </div>

      {isLoading && <div className="dim">Loading players…</div>}
      {error && <div className="err">Failed to load player list</div>}
      {data && count === 0 && <div className="dim">No players online</div>}

      {data?.map((p) => {
        const hpFull = Math.round(p.health / 2)
        const hpEmpty = 10 - hpFull
        return (
          <div key={p.uuid} className="player-row">
            <div className="player-avatar">{p.name[0].toUpperCase()}</div>
            <div className="player-info">
              <div className="player-name">{p.name}</div>
              <div className="player-meta">
                <span className="player-meta-item">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" /><path d="M12 8v4l3 3" />
                  </svg>
                  {p.world}
                </span>
                <span className="player-meta-item">
                  <div className="health-bar">
                    {Array.from({ length: hpFull }).map((_, i) => (
                      <div key={i} className="health-pip" style={{ background: p.health > 10 ? 'var(--green)' : p.health > 6 ? 'var(--yellow)' : 'var(--red)' }} />
                    ))}
                    {Array.from({ length: hpEmpty }).map((_, i) => (
                      <div key={i} className="health-pip" style={{ background: 'var(--ghost)' }} />
                    ))}
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mist)' }}>{p.health.toFixed(0)}/{MAX_HEALTH}</span>
                </span>
              </div>
            </div>
            <div className="player-actions">
              <button className="action-btn" onClick={() => kick(p.name)}>Kick</button>
              <button className="action-btn danger" onClick={() => ban(p.name)}>Ban</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
