import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { IconRefresh } from '../Icons'

interface Player { name: string; uuid: string; world: string; health: number }

const MAX_HEALTH = 20

function healthColor(hp: number) {
  if (hp > 14) return 'var(--green)'
  if (hp > 8)  return 'var(--yellow)'
  return 'var(--red)'
}

export default function PlayerList() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<Player[]>({
    queryKey: ['players'],
    queryFn: () => api.get('/players').then((r) => r.data),
    refetchInterval: 5000,
  })
  const [selected, setSelected] = useState<string | null>(null)

  function kick(name: string) { api.post('/execute', { command: `kick ${name}` }) }
  function ban(name: string) {
    if (confirm(`Ban ${name}? This cannot be undone from here.`))
      api.post('/execute', { command: `ban ${name}` })
  }

  const count = data?.length ?? 0
  const sel = data?.find(p => p.uuid === selected) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="section-header" style={{ padding: '12px 16px', flexShrink: 0 }}>
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

      <div className="mac-master-detail">
        <div className="mac-master-list">
          <div className="mac-master-header">
            {count} Online
          </div>

          {isLoading && <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--mist)' }}>Loading…</div>}
          {error && <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--red)' }}>Failed to load</div>}

          {data?.map(p => (
            <div
              key={p.uuid}
              className={`mac-master-row${selected === p.uuid ? ' active' : ''}`}
              onClick={() => setSelected(p.uuid === selected ? null : p.uuid)}
            >
              <div className="mac-master-avatar">{p.name[0].toUpperCase()}</div>
              <div className="mac-master-info">
                <div className="mac-master-name">{p.name}</div>
                <div className="mac-master-world">{p.world}</div>
              </div>
            </div>
          ))}

          {data && count === 0 && (
            <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12, color: 'var(--ghost)' }}>
              No players online
            </div>
          )}
        </div>

        <div className="mac-detail-pane">
          {!sel ? (
            <div className="mac-detail-empty">
              <svg className="mac-detail-empty-icon" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <div className="mac-detail-empty-text">Select a player</div>
            </div>
          ) : (
            <div className="mac-player-detail">
              <div className="mac-player-big-avatar">{sel.name[0].toUpperCase()}</div>
              <div className="mac-player-detail-name">{sel.name}</div>

              <div className="mac-player-meta-card">
                <div className="mac-player-meta-row">
                  <span className="mac-player-meta-label">World</span>
                  <span className="mac-player-meta-value" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{sel.world}</span>
                </div>
                <div className="mac-player-meta-row">
                  <span className="mac-player-meta-label">Health</span>
                  <span className="mac-player-meta-value">
                    <div className="mac-health-bar">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div
                          key={i}
                          className="mac-health-pip"
                          style={{ background: i < Math.round(sel.health / 2) ? healthColor(sel.health) : 'rgba(255,255,255,0.08)' }}
                        />
                      ))}
                      <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mist)' }}>
                        {sel.health.toFixed(0)}/{MAX_HEALTH}
                      </span>
                    </div>
                  </span>
                </div>
                <div className="mac-player-meta-row">
                  <span className="mac-player-meta-label">UUID</span>
                  <span className="mac-player-meta-value" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mist)' }}>
                    {sel.uuid.slice(0, 8)}…
                  </span>
                </div>
              </div>

              <div className="mac-player-detail-actions">
                <button className="mac-player-action-btn" onClick={() => kick(sel.name)}>
                  Kick
                </button>
                <button className="mac-player-action-btn danger" onClick={() => ban(sel.name)}>
                  Ban
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
