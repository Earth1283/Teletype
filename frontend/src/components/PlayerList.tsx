import { useState, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api, apiError } from '../api/client'
import { useContextMenu } from '../ContextMenu'
import { useToast } from '../ToastContext'
import { writeClipboard } from '../clipboard'
import { IconRefresh } from '../Icons'
import PromptModal, { type PromptVariant } from './PromptModal'
import { Skeleton } from '../Skeleton'
import { usePollInterval } from '../shell/PageActivity'

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

function playerSkinUrl(name: string) {
  return `https://mc-heads.net/avatar/${encodeURIComponent(name)}/96`
}

function playerBodyUrl(name: string) {
  return `https://mc-heads.net/body/${encodeURIComponent(name)}/160`
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
        src={large ? playerBodyUrl(player.name) : playerSkinUrl(player.name)}
        alt=""
        loading="lazy"
        onError={() => setSkinFailed(true)}
      />
    </div>
  )
}

type SortKey = 'name' | 'health' | 'ping' | 'level'

export default function PlayerList() {
  const { t } = useTranslation(['players', 'common'])
  const toast = useToast()
  const { data, isLoading, error, refetch, isFetching } = useQuery<Player[]>({
    queryKey: ['players'],
    queryFn: () => api.get('/players').then((r) => r.data),
    refetchInterval: usePollInterval(5000),
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
    } catch (e) {
      const msg = apiError(e, t('players:commandFailedGeneric', { command }))
      toast.error(msg)
      showPrompt(t('players:commandFailedTitle'), msg, 'error')
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
    runActionButton(`kick-${name}`, `kick ${name}`, t('players:toastKicked', { name }))
  }

  function ban(name: string) {
    setPrompt({
      title: t('players:banTitle'),
      message: t('players:banMessage', { name }),
      variant: 'danger',
      confirmLabel: t('players:actionBan'),
      cancelLabel: t('common:cancel'),
      onConfirm: () => runCommand(`ban ${name}`, t('players:toastBanned', { name })),
    })
  }

  function runCustomAction() {
    if (!customActionPlayer || !customCommand.trim()) return
    const command = customCommand.trim().replaceAll('{player}', customActionPlayer.name)
    runCommand(command, t('players:commandSent'))
      .then(() => setCustomActionPlayer(null))
      .catch(() => {})
  }

  function openCustomAction(player: Player) {
    setCustomActionPlayer(player)
    // Don't reset command — preserve last used command
  }

  function openPlayerCtx(e: React.MouseEvent, player: Player) {
    openContextMenu(e, [
      { label: t('players:ctxCopyName'), action: async () => { if (!await writeClipboard(player.name)) toast.error(t('players:copyFailed')) } },
      { label: t('players:ctxCopyUuid'), action: async () => { if (!await writeClipboard(player.uuid)) toast.error(t('players:copyFailed')) } },
      { label: t('players:ctxCopySkinUrl'), action: async () => { if (!await writeClipboard(playerSkinUrl(player.name))) toast.error(t('players:copyFailed')) } },
      { type: 'separator' },
      { label: t('players:ctxHeal'), action: () => runCommand(`effect give ${player.name} minecraft:instant_health 1 10`, t('players:toastHealed', { name: player.name })).catch(() => {}) },
      { label: t('players:ctxFeed'), action: () => runCommand(`effect give ${player.name} minecraft:saturation 1 10`, t('players:toastFed', { name: player.name })).catch(() => {}) },
      { label: t('players:ctxSendToSpawn'), action: () => runCommand(`spawn ${player.name}`, t('players:toastSpawn', { name: player.name })).catch(() => {}) },
      { label: t('players:ctxCreativeMode'), action: () => runCommand(`gamemode creative ${player.name}`, t('players:toastToCreative', { name: player.name })).catch(() => {}) },
      { label: t('players:ctxSurvivalMode'), action: () => runCommand(`gamemode survival ${player.name}`, t('players:toastToSurvival', { name: player.name })).catch(() => {}) },
      { label: t('players:ctxCustomCommand'), action: () => openCustomAction(player) },
      { type: 'separator' },
      { label: t('players:ctxKickPlayer'), action: () => kick(player.name) },
      { label: t('players:ctxBanPlayer'), danger: true, action: () => ban(player.name) },
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
    if (failed === 0) toast.success(t('players:bulkToastSuccess', { label, count: targets.length }))
    else toast.error(t('players:bulkToastFailure', { label, failed, total: targets.length }))
  }

  function bulkKick() {
    setPrompt({
      title: t('players:confirmKickTitle', { count: checkedPlayers.length }),
      message: t('players:confirmKickMessage', { names: checkedPlayers.map(p => p.name).join(', ') }),
      confirmLabel: t('players:actionKickAll'),
      cancelLabel: t('common:cancel'),
      onConfirm: () => bulkRun('bulk-kick', t('players:toastLabelKicked'), n => `kick ${n}`),
    })
  }

  function bulkBan() {
    setPrompt({
      title: t('players:confirmBanTitle', { count: checkedPlayers.length }),
      message: t('players:confirmBanMessage', { names: checkedPlayers.map(p => p.name).join(', ') }),
      variant: 'danger',
      confirmLabel: t('players:actionBanAll'),
      cancelLabel: t('common:cancel'),
      onConfirm: () => bulkRun('bulk-ban', t('players:toastLabelBanned'), n => `ban ${n}`),
    })
  }

  // If selected player left mid-session, show offline message
  const selectedGone = selected !== null && !sel && !isLoading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="section-header" style={{ padding: '12px 16px', flexShrink: 0 }}>
        <span className="section-title">{t('players:sectionTitle')}</span>
        <span className="section-count">{t('players:onlineCount', { count })}</span>
        <div className="section-actions">
          <button
            className="refresh-btn"
            onClick={() => refetch()}
            title={t('common:refresh')}
            style={{ opacity: isFetching ? 0.4 : 1 }}
          >
            <IconRefresh size={13} />
          </button>
        </div>
      </div>

      <div className="mac-master-detail">
        <div className="mac-master-list">
          <div className="mac-master-header" style={{ flexDirection: 'column', gap: 6, padding: '8px 10px' }}>
            <span>{t('players:onlineCountLabel', { count })}</span>
            <div className="player-sort-bar">
              {(['name', 'health', 'ping', 'level'] as SortKey[]).map(k => (
                <button
                  key={k}
                  className={`player-sort-btn${sortBy === k ? ' active' : ''}`}
                  onClick={() => toggleSort(k)}
                >
                  {t(`players:sort${k.charAt(0).toUpperCase()}${k.slice(1)}`)}{sortBy === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
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
          {error && <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--red)' }}>{t('players:failedToLoad')}</div>}

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
                aria-label={t('players:selectPlayerAria', { name: p.name })}
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
              <span className="bulk-count">{t('players:selectedCount', { count: checkedPlayers.length })}</span>
              <button className="bulk-btn" disabled={!!loadingAction}
                onClick={() => bulkRun('bulk-heal', t('players:toastLabelHealed'), n => `effect give ${n} minecraft:instant_health 1 10`)}>
                {t('players:actionHeal')}
              </button>
              <button className="bulk-btn" disabled={!!loadingAction}
                onClick={() => bulkRun('bulk-feed', t('players:toastLabelFed'), n => `effect give ${n} minecraft:saturation 1 10`)}>
                {t('players:actionFeed')}
              </button>
              <button className="bulk-btn" disabled={!!loadingAction}
                onClick={() => bulkRun('bulk-surv', t('players:toastLabelSurvival'), n => `gamemode survival ${n}`)}>
                {t('players:actionSurvival')}
              </button>
              <button className="bulk-btn" disabled={!!loadingAction}
                onClick={() => bulkRun('bulk-crea', t('players:toastLabelCreative'), n => `gamemode creative ${n}`)}>
                {t('players:actionCreative')}
              </button>
              <button className="bulk-btn" disabled={!!loadingAction} onClick={bulkKick}>{t('players:actionKick')}</button>
              <button className="bulk-btn danger" disabled={!!loadingAction} onClick={bulkBan}>{t('players:actionBan')}</button>
              <button className="bulk-btn clear" title={t('players:actionClearSelection')} onClick={() => { setChecked(new Set()); lastCheckIdx.current = null }}>
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
              <div className="player-empty-title">{t('players:emptyTitle')}</div>
              <div className="player-empty-sub">{t('players:emptySubtitle')}</div>
            </div>
          )}
        </div>

        <div className="mac-detail-pane">
          {selectedGone ? (
            <div className="mac-detail-empty">
              <div className="mac-detail-empty-text" style={{ color: 'var(--ghost)', fontSize: 12 }}>
                {t('players:playerOffline')}
              </div>
              <button className="btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={() => setSelected(null)}>
                {t('players:dismiss')}
              </button>
            </div>
          ) : !sel ? (
            <div className="mac-detail-empty">
              <svg className="mac-detail-empty-icon" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <div className="mac-detail-empty-text">{t('players:selectPlayer')}</div>
            </div>
          ) : (
            <div className="mac-player-detail">
              <PlayerAvatar player={sel} large />
              <div className="mac-player-detail-name">{sel.name}</div>

              <div className="mac-player-meta-card">
                <div className="mac-player-meta-row">
                  <span className="mac-player-meta-label">{t('players:metaWorld')}</span>
                  <span className="mac-player-meta-value" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{sel.world}</span>
                </div>
                <div className="mac-player-meta-row">
                  <span className="mac-player-meta-label">{t('players:metaHealth')}</span>
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
                  <span className="mac-player-meta-label">{t('players:metaUuid')}</span>
                  <span className="mac-player-meta-value" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mist)' }}>
                    {sel.uuid.slice(0, 8)}…
                  </span>
                </div>
                <div className="mac-player-meta-row">
                  <span className="mac-player-meta-label">{t('players:metaGameMode')}</span>
                  <span className="mac-player-meta-value">{sel.gameMode ?? t('players:gameModeUnknown')}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-center">
                  <div className="font-mono text-[9px] uppercase tracking-wide text-text-muted">{t('players:statFood')}</div>
                  <div className="mt-0.5 font-mono text-base text-text-primary">{sel.foodLevel ?? '—'}</div>
                </div>
                <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-center">
                  <div className="font-mono text-[9px] uppercase tracking-wide text-text-muted">{t('players:statLevel')}</div>
                  <div className="mt-0.5 font-mono text-base text-text-primary">{sel.level ?? '—'}</div>
                </div>
                <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-center">
                  <div className="font-mono text-[9px] uppercase tracking-wide text-text-muted">{t('players:statPing')}</div>
                  <div className="mt-0.5 font-mono text-base" style={{ color: pingColor(sel.ping) }}>
                    {typeof sel.ping === 'number' ? `${sel.ping}` : '—'}
                  </div>
                </div>
              </div>

              <div className="mac-player-detail-actions">
                <button
                  className="mac-player-action-btn"
                  disabled={loadingAction === `heal-${sel.name}`}
                  onClick={() => runActionButton(`heal-${sel.name}`, `effect give ${sel.name} minecraft:instant_health 1 10`, t('players:toastHealed', { name: sel.name }))}
                >
                  {loadingAction === `heal-${sel.name}` ? '…' : t('players:actionHeal')}
                </button>
                <button
                  className="mac-player-action-btn"
                  disabled={loadingAction === `feed-${sel.name}`}
                  onClick={() => runActionButton(`feed-${sel.name}`, `effect give ${sel.name} minecraft:saturation 1 10`, t('players:toastFed', { name: sel.name }))}
                >
                  {loadingAction === `feed-${sel.name}` ? '…' : t('players:actionFeed')}
                </button>
              </div>

              <div className="mac-player-detail-actions">
                <button
                  className="mac-player-action-btn"
                  disabled={loadingAction === `surv-${sel.name}`}
                  onClick={() => runActionButton(`surv-${sel.name}`, `gamemode survival ${sel.name}`, t('players:toastToSurvival', { name: sel.name }))}
                >
                  {loadingAction === `surv-${sel.name}` ? '…' : t('players:actionSurvival')}
                </button>
                <button
                  className="mac-player-action-btn"
                  disabled={loadingAction === `crea-${sel.name}`}
                  onClick={() => runActionButton(`crea-${sel.name}`, `gamemode creative ${sel.name}`, t('players:toastToCreative', { name: sel.name }))}
                >
                  {loadingAction === `crea-${sel.name}` ? '…' : t('players:actionCreative')}
                </button>
              </div>

              <div className="mac-player-detail-actions">
                <button className="mac-player-action-btn" onClick={() => openCustomAction(sel)}>
                  {t('players:actionCustom')}
                </button>
                <button
                  className="mac-player-action-btn"
                  disabled={loadingAction === `kick-${sel.name}`}
                  onClick={() => kick(sel.name)}
                >
                  {loadingAction === `kick-${sel.name}` ? '…' : t('players:actionKick')}
                </button>
                <button className="mac-player-action-btn danger" onClick={() => ban(sel.name)}>
                  {t('players:actionBan')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {customActionPlayer && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setCustomActionPlayer(null) }}>
          <div className="modal-card">
            <div className="modal-title">{t('players:customModalTitle')}</div>
            <div className="modal-label">{t('players:customModalLabel', { name: customActionPlayer.name })}</div>
            <input
              className="modal-input mono-input"
              value={customCommand}
              onChange={e => setCustomCommand(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runCustomAction(); if (e.key === 'Escape') setCustomActionPlayer(null) }}
              autoFocus
            />
            <div className="prompt-modal-message" style={{ marginTop: 8 }}>
              {t('players:customPlaceholderNote')}
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setCustomActionPlayer(null)}>{t('common:cancel')}</button>
              <button className="btn-primary" onClick={runCustomAction} disabled={!customCommand.trim()}>{t('players:actionRun')}</button>
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
