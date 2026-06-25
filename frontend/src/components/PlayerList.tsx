import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useContextMenu } from '../ContextMenu'
import { IconRefresh } from '../Icons'
import PromptModal, { type PromptVariant } from './PromptModal'

interface Player {
  name: string
  uuid: string
  world: string
  health: number
  foodLevel?: number
  level?: number
  gameMode?: string
  ping?: number
  isOp?: boolean
}

type PromptState = {
  title: string
  message: React.ReactNode
  variant?: PromptVariant
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void | Promise<void>
} | null

const MAX_HEALTH = 20

function healthColor(hp: number) {
  if (hp > 14) return 'var(--green)'
  if (hp > 8)  return 'var(--yellow)'
  return 'var(--red)'
}

function playerSkinUrl(uuid: string) {
  return `https://crafatar.com/avatars/${uuid}?overlay&size=96`
}

function playerBodyUrl(uuid: string) {
  return `https://crafatar.com/renders/body/${uuid}?overlay&size=160`
}

function PlayerAvatar({ player, large = false }: { player: Player; large?: boolean }) {
  const [skinFailed, setSkinFailed] = useState(false)
  const className = large ? 'mac-player-big-avatar skin' : 'mac-master-avatar skin'
  if (skinFailed) {
    return <div className={large ? 'mac-player-big-avatar' : 'mac-master-avatar'}>{player.name[0].toUpperCase()}</div>
  }
  return (
    <div className={className}>
      <img
        src={large ? playerBodyUrl(player.uuid) : playerSkinUrl(player.uuid)}
        alt=""
        loading="lazy"
        onError={() => setSkinFailed(true)}
      />
    </div>
  )
}

export default function PlayerList() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<Player[]>({
    queryKey: ['players'],
    queryFn: () => api.get('/players').then((r) => r.data),
    refetchInterval: 5000,
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<PromptState>(null)
  const [customActionPlayer, setCustomActionPlayer] = useState<Player | null>(null)
  const [customCommand, setCustomCommand] = useState('effect give {player} minecraft:speed 60 1')
  const { openContextMenu } = useContextMenu()

  function showPrompt(title: string, message: React.ReactNode, variant: PromptVariant = 'info') {
    setPrompt({ title, message, variant })
  }

  async function runCommand(command: string) {
    try {
      await api.post('/execute', { command })
    } catch (e: any) {
      showPrompt('Command failed', e.response?.data?.error ?? `Could not dispatch: ${command}`, 'error')
      throw e
    }
  }

  function kick(name: string) { runCommand(`kick ${name}`).catch(() => {}) }
  function ban(name: string) {
    setPrompt({
      title: 'Ban player?',
      message: `Ban ${name}? This cannot be undone from Teletype.`,
      variant: 'danger',
      confirmLabel: 'Ban',
      cancelLabel: 'Cancel',
      onConfirm: () => runCommand(`ban ${name}`),
    })
  }

  function runCustomAction() {
    if (!customActionPlayer || !customCommand.trim()) return
    const command = customCommand.trim().replaceAll('{player}', customActionPlayer.name)
    runCommand(command)
      .then(() => setCustomActionPlayer(null))
      .catch(() => {})
  }

  function openCustomAction(player: Player) {
    setCustomActionPlayer(player)
    setCustomCommand('effect give {player} minecraft:speed 60 1')
  }

  function openPlayerCtx(e: React.MouseEvent, player: Player) {
    openContextMenu(e, [
      { label: 'Copy Player Name', action: () => navigator.clipboard.writeText(player.name) },
      { label: 'Copy UUID', action: () => navigator.clipboard.writeText(player.uuid) },
      { label: 'Copy Skin URL', action: () => navigator.clipboard.writeText(playerSkinUrl(player.uuid)) },
      { type: 'separator' },
      { label: 'Heal', action: () => runCommand(`effect give ${player.name} minecraft:instant_health 1 10`).catch(() => {}) },
      { label: 'Feed', action: () => runCommand(`effect give ${player.name} minecraft:saturation 1 10`).catch(() => {}) },
      { label: 'Send to Spawn', action: () => runCommand(`spawn ${player.name}`).catch(() => {}) },
      { label: 'Creative Mode', action: () => runCommand(`gamemode creative ${player.name}`).catch(() => {}) },
      { label: 'Survival Mode', action: () => runCommand(`gamemode survival ${player.name}`).catch(() => {}) },
      { label: 'Custom Command...', action: () => openCustomAction(player) },
      { type: 'separator' },
      { label: 'Kick Player', action: () => kick(player.name) },
      { label: 'Ban Player', danger: true, action: () => ban(player.name) },
    ], { kind: 'player', name: player.name, uuid: player.uuid })
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
              onContextMenu={e => openPlayerCtx(e, p)}
            >
              <PlayerAvatar player={p} />
              <div className="mac-master-info">
                <div className="mac-master-name">{p.name}</div>
                <div className="mac-master-world">{p.world} {typeof p.ping === 'number' ? `• ${p.ping}ms` : ''}</div>
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
              <PlayerAvatar player={sel} large />
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
                <div className="mac-player-meta-row">
                  <span className="mac-player-meta-label">Game Mode</span>
                  <span className="mac-player-meta-value">{sel.gameMode ?? 'unknown'}</span>
                </div>
                <div className="mac-player-meta-row">
                  <span className="mac-player-meta-label">Food / Level</span>
                  <span className="mac-player-meta-value">{sel.foodLevel ?? '?'} food · level {sel.level ?? '?'}</span>
                </div>
                <div className="mac-player-meta-row">
                  <span className="mac-player-meta-label">Ping</span>
                  <span className="mac-player-meta-value">{typeof sel.ping === 'number' ? `${sel.ping}ms` : 'unknown'}</span>
                </div>
              </div>

              <div className="mac-player-detail-actions">
                <button className="mac-player-action-btn" onClick={() => runCommand(`effect give ${sel.name} minecraft:instant_health 1 10`).catch(() => {})}>
                  Heal
                </button>
                <button className="mac-player-action-btn" onClick={() => runCommand(`effect give ${sel.name} minecraft:saturation 1 10`).catch(() => {})}>
                  Feed
                </button>
              </div>

              <div className="mac-player-detail-actions">
                <button className="mac-player-action-btn" onClick={() => runCommand(`gamemode survival ${sel.name}`).catch(() => {})}>
                  Survival
                </button>
                <button className="mac-player-action-btn" onClick={() => runCommand(`gamemode creative ${sel.name}`).catch(() => {})}>
                  Creative
                </button>
              </div>

              <div className="mac-player-detail-actions">
                <button className="mac-player-action-btn" onClick={() => openCustomAction(sel)}>
                  Custom
                </button>
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

      {customActionPlayer && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setCustomActionPlayer(null) }}>
          <div className="modal-card">
            <div className="modal-title">Custom player command</div>
            <div className="modal-label">Command for {customActionPlayer.name}</div>
            <input
              className="modal-input mono-input"
              value={customCommand}
              onChange={e => setCustomCommand(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runCustomAction(); if (e.key === 'Escape') setCustomActionPlayer(null) }}
              autoFocus
            />
            <div className="prompt-modal-message" style={{ marginTop: 8 }}>
              Use {'{player}'} as the player placeholder. Commands run as console.
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setCustomActionPlayer(null)}>Cancel</button>
              <button className="btn-primary" onClick={runCustomAction} disabled={!customCommand.trim()}>Run</button>
            </div>
          </div>
        </div>
      )}

      <PromptModal
        open={!!prompt}
        title={prompt?.title ?? ''}
        message={prompt?.message}
        variant={prompt?.variant}
        confirmLabel={prompt?.confirmLabel}
        cancelLabel={prompt?.cancelLabel}
        onConfirm={prompt?.onConfirm}
        onClose={() => setPrompt(null)}
      />
    </div>
  )
}
