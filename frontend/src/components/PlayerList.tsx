import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useContextMenu } from '../ContextMenu'
import { useToast } from '../ToastContext'
import { IconRefresh } from '../Icons'
import PromptModal, { type PromptVariant } from './PromptModal'
import { Skeleton } from '../Skeleton'

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
  if (hp > 14) return 'var(--status-good)'
  if (hp > 8)  return 'var(--status-warning)'
  return 'var(--status-critical)'
}

function pingColor(ms?: number) {
  if (ms == null) return 'var(--text-muted)'
  if (ms < 80) return 'var(--status-good)'
  if (ms < 150) return 'var(--status-warning)'
  return 'var(--status-critical)'
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

type SortKey = 'name' | 'health' | 'ping' | 'level'

export default function PlayerList() {
  const toast = useToast()
  const { data, isLoading, error, refetch, isFetching } = useQuery<Player[]>({
    queryKey: ['players'],
    queryFn: () => api.get('/players').then((r) => r.data),
    refetchInterval: 5000,
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [prompt, setPrompt] = useState<PromptState>(null)
  const [customActionPlayer, setCustomActionPlayer] = useState<Player | null>(null)
  // Persists between player selections so the command isn't reset each time
  const [customCommand, setCustomCommand] = useState('effect give {player} minecraft:speed 60 1')
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const lastCheckIdx = useRef<number | null>(null)
  const { openContextMenu } = useContextMenu()

  function showPrompt(title: string, message: React.ReactNode, variant: PromptVariant = 'info') {
    setPrompt({ title, message, variant })
  }

  async function runCommand(command: string, successMsg?: string) {
    try {
      await api.post('/execute', { command })
      if (successMsg) toast.success(successMsg)
    } catch (e: any) {
      const msg = e.response?.data?.error ?? `Command failed: ${command}`
      toast.error(msg)
      showPrompt('Command failed', msg, 'error')
      throw e
    }
  }

  async function runActionButton(key: string, command: string, successMsg?: string) {
    setLoadingAction(key)
    try {
      await runCommand(command, successMsg)
    } finally {
      setLoadingAction(null)
    }
  }

  function kick(name: string) {
    runActionButton(`kick-${name}`, `kick ${name}`, `Kicked ${name}`)
  }

  function ban(name: string) {
    setPrompt({
      title: 'Ban player?',
      message: `Ban ${name}? This cannot be undone from Teletype.`,
      variant: 'danger',
      confirmLabel: 'Ban',
      cancelLabel: 'Cancel',
      onConfirm: () => runCommand(`ban ${name}`, `Banned ${name}`),
    })
  }

  function runCustomAction() {
    if (!customActionPlayer || !customCommand.trim()) return
    const command = customCommand.trim().replaceAll('{player}', customActionPlayer.name)
    runCommand(command, 'Command sent')
      .then(() => setCustomActionPlayer(null))
      .catch(() => {})
  }

  function openCustomAction(player: Player) {
    setCustomActionPlayer(player)
    // Don't reset command — preserve last used command
  }

  function openPlayerCtx(e: React.MouseEvent, player: Player) {
    openContextMenu(e, [
      { label: 'Copy Player Name', action: () => navigator.clipboard.writeText(player.name) },
      { label: 'Copy UUID', action: () => navigator.clipboard.writeText(player.uuid) },
      { label: 'Copy Skin URL', action: () => navigator.clipboard.writeText(playerSkinUrl(player.uuid)) },
      { type: 'separator' },
      { label: 'Heal', action: () => runCommand(`effect give ${player.name} minecraft:instant_health 1 10`, `Healed ${player.name}`).catch(() => {}) },
      { label: 'Feed', action: () => runCommand(`effect give ${player.name} minecraft:saturation 1 10`, `Fed ${player.name}`).catch(() => {}) },
      { label: 'Send to Spawn', action: () => runCommand(`spawn ${player.name}`, `Teleported ${player.name} to spawn`).catch(() => {}) },
      { label: 'Creative Mode', action: () => runCommand(`gamemode creative ${player.name}`, `${player.name} → Creative`).catch(() => {}) },
      { label: 'Survival Mode', action: () => runCommand(`gamemode survival ${player.name}`, `${player.name} → Survival`).catch(() => {}) },
      { label: 'Custom Command...', action: () => openCustomAction(player) },
      { type: 'separator' },
      { label: 'Kick Player', action: () => kick(player.name) },
      { label: 'Ban Player', danger: true, action: () => ban(player.name) },
    ], { kind: 'player', name: player.name, uuid: player.uuid })
  }

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortBy(key); setSortDir(1) }
  }

  const sortedPlayers = useMemo(() => {
    if (!data) return []
    return [...data].sort((a, b) => {
      let av: number | string, bv: number | string
      switch (sortBy) {
        case 'name':   av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break
        case 'health': av = a.health;             bv = b.health;             break
        case 'ping':   av = a.ping ?? 9999;       bv = b.ping ?? 9999;       break
        case 'level':  av = a.level ?? 0;         bv = b.level ?? 0;         break
      }
      if (av < bv) return -sortDir
      if (av > bv) return sortDir
      return 0
    })
  }, [data, sortBy, sortDir])

  const count = data?.length ?? 0
  const sel = data?.find(p => p.uuid === selected) ?? null

  // Players can leave between refetches; act only on the ones still online
  const checkedPlayers = useMemo(
    () => sortedPlayers.filter(p => checked.has(p.uuid)),
    [sortedPlayers, checked],
  )

  function toggleCheck(idx: number, uuid: string, shiftKey: boolean) {
    setChecked(prev => {
      const next = new Set(prev)
      if (shiftKey && lastCheckIdx.current != null) {
        const [from, to] = [Math.min(lastCheckIdx.current, idx), Math.max(lastCheckIdx.current, idx)]
        for (let i = from; i <= to; i++) next.add(sortedPlayers[i].uuid)
      } else if (next.has(uuid)) {
        next.delete(uuid)
      } else {
        next.add(uuid)
      }
      return next
    })
    lastCheckIdx.current = idx
  }

  async function bulkRun(key: string, label: string, cmdFor: (name: string) => string) {
    const targets = checkedPlayers
    setLoadingAction(key)
    let failed = 0
    try {
      for (const p of targets) {
        try {
          await api.post('/execute', { command: cmdFor(p.name) })
        } catch {
          failed++
        }
      }
    } finally {
      setLoadingAction(null)
    }
    if (failed === 0) toast.success(`${label} — ${targets.length} player${targets.length === 1 ? '' : 's'}`)
    else toast.error(`${label} failed for ${failed} of ${targets.length} players`)
  }

  function bulkKick() {
    setPrompt({
      title: `Kick ${checkedPlayers.length} players?`,
      message: `Disconnect ${checkedPlayers.map(p => p.name).join(', ')} from the server?`,
      confirmLabel: 'Kick all',
      cancelLabel: 'Cancel',
      onConfirm: () => bulkRun('bulk-kick', 'Kicked', n => `kick ${n}`),
    })
  }

  function bulkBan() {
    setPrompt({
      title: `Ban ${checkedPlayers.length} players?`,
      message: `Ban ${checkedPlayers.map(p => p.name).join(', ')}? This cannot be undone from Teletype.`,
      variant: 'danger',
      confirmLabel: 'Ban all',
      cancelLabel: 'Cancel',
      onConfirm: () => bulkRun('bulk-ban', 'Banned', n => `ban ${n}`),
    })
  }

  // If selected player left mid-session, show offline message
  const selectedGone = selected !== null && !sel && !isLoading

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
          <div className="mac-master-header" style={{ flexDirection: 'column', gap: 6, padding: '8px 10px' }}>
            <span>{count} Online</span>
            <div className="player-sort-bar">
              {(['name', 'health', 'ping', 'level'] as SortKey[]).map(k => (
                <button
                  key={k}
                  className={`player-sort-btn${sortBy === k ? ' active' : ''}`}
                  onClick={() => toggleSort(k)}
                >
                  {k}{sortBy === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>
          </div>

          {isLoading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="mac-master-row" style={{ gap: 10, pointerEvents: 'none' }}>
              <Skeleton width={32} height={32} radius={6} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Skeleton width="55%" height={11} />
                <Skeleton width="35%" height={9} />
              </div>
            </div>
          ))}
          {error && <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--red)' }}>Failed to load players</div>}

          {sortedPlayers.map((p, idx) => (
            <div
              key={p.uuid}
              className={`mac-master-row${selected === p.uuid ? ' active' : ''}${checked.has(p.uuid) ? ' checked' : ''}`}
              onClick={() => setSelected(p.uuid === selected ? null : p.uuid)}
              onContextMenu={e => openPlayerCtx(e, p)}
            >
              <input
                type="checkbox"
                className="player-check"
                checked={checked.has(p.uuid)}
                readOnly
                aria-label={`Select ${p.name}`}
                onClick={e => { e.stopPropagation(); toggleCheck(idx, p.uuid, e.shiftKey) }}
              />
              <PlayerAvatar player={p} />
              <div className="mac-master-info">
                <div className="mac-master-name">{p.name}</div>
                <div className="mac-master-world">{p.world} {typeof p.ping === 'number' ? `• ${p.ping}ms` : ''}</div>
              </div>
            </div>
          ))}

          {checkedPlayers.length > 0 && (
            <div className="bulk-bar">
              <span className="bulk-count">{checkedPlayers.length} selected</span>
              <button className="bulk-btn" disabled={!!loadingAction}
                onClick={() => bulkRun('bulk-heal', 'Healed', n => `effect give ${n} minecraft:instant_health 1 10`)}>
                Heal
              </button>
              <button className="bulk-btn" disabled={!!loadingAction}
                onClick={() => bulkRun('bulk-feed', 'Fed', n => `effect give ${n} minecraft:saturation 1 10`)}>
                Feed
              </button>
              <button className="bulk-btn" disabled={!!loadingAction}
                onClick={() => bulkRun('bulk-surv', 'Survival', n => `gamemode survival ${n}`)}>
                Survival
              </button>
              <button className="bulk-btn" disabled={!!loadingAction}
                onClick={() => bulkRun('bulk-crea', 'Creative', n => `gamemode creative ${n}`)}>
                Creative
              </button>
              <button className="bulk-btn" disabled={!!loadingAction} onClick={bulkKick}>Kick</button>
              <button className="bulk-btn danger" disabled={!!loadingAction} onClick={bulkBan}>Ban</button>
              <button className="bulk-btn clear" title="Clear selection" onClick={() => { setChecked(new Set()); lastCheckIdx.current = null }}>
                ✕
              </button>
            </div>
          )}

          {data && count === 0 && (
            <div className="player-empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="player-empty-icon">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <div className="player-empty-title">Server is empty</div>
              <div className="player-empty-sub">No players online right now</div>
            </div>
          )}
        </div>

        <div className="mac-detail-pane">
          {selectedGone ? (
            <div className="mac-detail-empty">
              <div className="mac-detail-empty-text" style={{ color: 'var(--ghost)', fontSize: 12 }}>
                Player went offline
              </div>
              <button className="btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={() => setSelected(null)}>
                Dismiss
              </button>
            </div>
          ) : !sel ? (
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
                          style={{ background: i < Math.round(sel.health / 2) ? healthColor(sel.health) : 'color-mix(in srgb, ' + healthColor(sel.health) + ' 18%, transparent)' }}
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
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-center">
                  <div className="font-mono text-[9px] uppercase tracking-wide text-text-muted">Food</div>
                  <div className="mt-0.5 font-mono text-base text-text-primary">{sel.foodLevel ?? '—'}</div>
                </div>
                <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-center">
                  <div className="font-mono text-[9px] uppercase tracking-wide text-text-muted">Level</div>
                  <div className="mt-0.5 font-mono text-base text-text-primary">{sel.level ?? '—'}</div>
                </div>
                <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-center">
                  <div className="font-mono text-[9px] uppercase tracking-wide text-text-muted">Ping</div>
                  <div className="mt-0.5 font-mono text-base" style={{ color: pingColor(sel.ping) }}>
                    {typeof sel.ping === 'number' ? `${sel.ping}` : '—'}
                  </div>
                </div>
              </div>

              <div className="mac-player-detail-actions">
                <button
                  className="mac-player-action-btn"
                  disabled={loadingAction === `heal-${sel.name}`}
                  onClick={() => runActionButton(`heal-${sel.name}`, `effect give ${sel.name} minecraft:instant_health 1 10`, `Healed ${sel.name}`)}
                >
                  {loadingAction === `heal-${sel.name}` ? '…' : 'Heal'}
                </button>
                <button
                  className="mac-player-action-btn"
                  disabled={loadingAction === `feed-${sel.name}`}
                  onClick={() => runActionButton(`feed-${sel.name}`, `effect give ${sel.name} minecraft:saturation 1 10`, `Fed ${sel.name}`)}
                >
                  {loadingAction === `feed-${sel.name}` ? '…' : 'Feed'}
                </button>
              </div>

              <div className="mac-player-detail-actions">
                <button
                  className="mac-player-action-btn"
                  disabled={loadingAction === `surv-${sel.name}`}
                  onClick={() => runActionButton(`surv-${sel.name}`, `gamemode survival ${sel.name}`, `${sel.name} → Survival`)}
                >
                  {loadingAction === `surv-${sel.name}` ? '…' : 'Survival'}
                </button>
                <button
                  className="mac-player-action-btn"
                  disabled={loadingAction === `crea-${sel.name}`}
                  onClick={() => runActionButton(`crea-${sel.name}`, `gamemode creative ${sel.name}`, `${sel.name} → Creative`)}
                >
                  {loadingAction === `crea-${sel.name}` ? '…' : 'Creative'}
                </button>
              </div>

              <div className="mac-player-detail-actions">
                <button className="mac-player-action-btn" onClick={() => openCustomAction(sel)}>
                  Custom
                </button>
                <button
                  className="mac-player-action-btn"
                  disabled={loadingAction === `kick-${sel.name}`}
                  onClick={() => kick(sel.name)}
                >
                  {loadingAction === `kick-${sel.name}` ? '…' : 'Kick'}
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
