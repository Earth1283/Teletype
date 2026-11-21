import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../api/client'
import { useToast } from '../ToastContext'
import { IconNetwork, IconPencil, IconTrash, IconX } from '../Icons'
import { usePollInterval } from '../shell/PageActivity'

interface RouteMapping {
  id: string
  label: string
  prefix: string
  targetPort: number
  enabled: boolean
  rateLimitPerMinute: number
}

interface NetworkStatus {
  muxEnabled: boolean
  muxPort: number
  networkEnabled: boolean
  maxRoutes: number
  defaultRateLimitPerMinute: number
  routeCount: number
  maxPortForwards: number
  forwardCount: number
}

interface PortForward {
  id: string
  label: string
  externalPort: number
  targetPort: number
  enabled: boolean
}

function emptyForward(): Omit<PortForward, 'id'> {
  return { label: '', externalPort: 25580, targetPort: 8100, enabled: true }
}

function ForwardModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: PortForward
  onSave: (f: Omit<PortForward, 'id'>) => void
  onClose: () => void
}) {
  const { t } = useTranslation(['network', 'common'])
  const [form, setForm] = useState<Omit<PortForward, 'id'>>(
    initial
      ? { label: initial.label, externalPort: initial.externalPort, targetPort: initial.targetPort, enabled: initial.enabled }
      : emptyForward()
  )
  const [err, setErr] = useState('')

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    const ext = Number(form.externalPort)
    const tgt = Number(form.targetPort)
    if (!ext || ext < 1 || ext > 65535) { setErr(t('forwardModal.errExternalPort')); return }
    if (!tgt || tgt < 1 || tgt > 65535) { setErr(t('forwardModal.errTargetPort')); return }
    onSave({ ...form, externalPort: ext, targetPort: tgt })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-title">
          {initial ? t('forwardModal.editTitle') : t('forwardModal.addTitle')}
          <button className="btn-ghost btn-xs" onClick={onClose}><IconX size={12} /></button>
        </div>

        <div className="modal-field">
          <div className="modal-label">{t('forwardModal.labelField')}</div>
          <input
            className="modal-input"
            placeholder={t('forwardModal.labelPlaceholder')}
            value={form.label}
            onChange={e => set('label', e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">{t('forwardModal.externalPortLabel')}</div>
            <input
              className="modal-input mono-input"
              type="number"
              min={1}
              max={65535}
              style={{ width: '100%' }}
              value={form.externalPort}
              onChange={e => set('externalPort', Number(e.target.value))}
            />
          </div>

          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">{t('forwardModal.targetPortLabel')}</div>
            <input
              className="modal-input mono-input"
              type="number"
              min={1}
              max={65535}
              style={{ width: '100%' }}
              value={form.targetPort}
              onChange={e => set('targetPort', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="modal-field">
          <label className="net-toggle">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => set('enabled', e.target.checked)}
            />
            <span style={{ fontSize: '12.5px', color: 'var(--ash)' }}>
              {form.enabled ? t('forwardModal.enabled') : t('forwardModal.disabled')}
            </span>
          </label>
        </div>

        {err && (
          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '8px' }}>{err}</div>
        )}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>{t('common:cancel')}</button>
          <button className="btn-primary" onClick={submit}>
            {initial ? t('forwardModal.saveButton') : t('forwardModal.addButton')}
          </button>
        </div>
      </div>
    </div>
  )
}

function emptyForm(defaultRateLimit = 120): Omit<RouteMapping, 'id'> {
  return { label: '', prefix: '/', targetPort: 8100, enabled: true, rateLimitPerMinute: defaultRateLimit }
}

function RouteModal({
  initial,
  defaultRateLimit,
  onSave,
  onClose,
}: {
  initial?: RouteMapping
  defaultRateLimit: number
  onSave: (r: Omit<RouteMapping, 'id'>) => void
  onClose: () => void
}) {
  const { t } = useTranslation(['network', 'common'])
  const [form, setForm] = useState<Omit<RouteMapping, 'id'>>(
    initial ? { label: initial.label, prefix: initial.prefix, targetPort: initial.targetPort,
                enabled: initial.enabled, rateLimitPerMinute: initial.rateLimitPerMinute }
            : emptyForm(defaultRateLimit)
  )
  const [err, setErr] = useState('')

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.prefix.startsWith('/')) { setErr(t('routeModal.errPrefix')); return }
    const port = Number(form.targetPort)
    if (!port || port < 1 || port > 65535) { setErr(t('routeModal.errPort')); return }
    onSave({ ...form, targetPort: port })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-title">
          {initial ? t('routeModal.editTitle') : t('routeModal.addTitle')}
          <button className="btn-ghost btn-xs" onClick={onClose}><IconX size={12} /></button>
        </div>

        <div className="modal-field">
          <div className="modal-label">{t('forwardModal.labelField')}</div>
          <input
            className="modal-input"
            placeholder={t('forwardModal.labelPlaceholder')}
            value={form.label}
            onChange={e => set('label', e.target.value)}
          />
        </div>

        <div className="modal-field">
          <div className="modal-label">{t('routeModal.pathPrefixLabel')}</div>
          <input
            className="modal-input mono-input"
            placeholder={t('routeModal.pathPrefixPlaceholder')}
            value={form.prefix}
            onChange={e => set('prefix', e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">{t('forwardModal.targetPortLabel')}</div>
            <input
              className="modal-input mono-input"
              type="number"
              min={1}
              max={65535}
              style={{ width: '100%' }}
              value={form.targetPort}
              onChange={e => set('targetPort', Number(e.target.value))}
            />
          </div>

          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">{t('routeModal.rateLimitLabel')}</div>
            <input
              className="modal-input mono-input"
              type="number"
              min={1}
              style={{ width: '100%' }}
              value={form.rateLimitPerMinute}
              onChange={e => set('rateLimitPerMinute', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="modal-field">
          <label className="net-toggle">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => set('enabled', e.target.checked)}
            />
            <span style={{ fontSize: '12.5px', color: 'var(--ash)' }}>
              {form.enabled ? t('forwardModal.enabled') : t('forwardModal.disabled')}
            </span>
          </label>
        </div>

        {err && (
          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '8px' }}>{err}</div>
        )}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>{t('common:cancel')}</button>
          <button className="btn-primary" onClick={submit}>
            {initial ? t('routeModal.saveButton') : t('routeModal.addButton')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NetworkPage() {
  const { t } = useTranslation(['network', 'common'])
  const qc = useQueryClient()
  const toast = useToast()
  const [section, setSection] = useState<'routes' | 'forwards'>('routes')
  const [modal, setModal] = useState<'add' | RouteMapping | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [fwdModal, setFwdModal] = useState<'add' | PortForward | null>(null)
  const [deletingFwdId, setDeletingFwdId] = useState<string | null>(null)

  const { data: status } = useQuery<NetworkStatus>({
    queryKey: ['network-status'],
    queryFn: () => api.get('/network/status').then(r => r.data),
    refetchInterval: usePollInterval(15_000),
  })

  const { data: routes = [] } = useQuery<RouteMapping[]>({
    queryKey: ['network-routes'],
    queryFn: () => api.get('/network/routes').then(r => r.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['network-routes'] })
    qc.invalidateQueries({ queryKey: ['network-status'] })
  }

  const createMut = useMutation({
    mutationFn: (r: Omit<RouteMapping, 'id'>) => api.post('/network/routes', r),
    onSuccess: () => { setModal(null); invalidate() },
    onError: (e: unknown) => toast.error(apiError(e, t('toastCreateRouteFailed'))),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...r }: RouteMapping) => api.put(`/network/routes/${id}`, r),
    onSuccess: () => { setModal(null); invalidate() },
    onError: (e: unknown) => toast.error(apiError(e, t('toastUpdateRouteFailed'))),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/network/routes/${id}`),
    onSuccess: () => { setDeletingId(null); invalidate() },
    onError: (e: unknown) => toast.error(apiError(e, t('toastDeleteRouteFailed'))),
  })

  const toggleMut = useMutation({
    mutationFn: (route: RouteMapping) =>
      api.put(`/network/routes/${route.id}`, { ...route, enabled: !route.enabled }),
    onSuccess: () => invalidate(),
    onError: () => { invalidate(); toast.error(t('toastToggleRouteFailed')) },
  })

  const { data: forwards = [] } = useQuery<PortForward[]>({
    queryKey: ['network-forwards'],
    queryFn: () => api.get('/network/forwards').then(r => r.data),
  })

  const invalidateFwd = () => {
    qc.invalidateQueries({ queryKey: ['network-forwards'] })
    qc.invalidateQueries({ queryKey: ['network-status'] })
  }

  const createFwdMut = useMutation({
    mutationFn: (f: Omit<PortForward, 'id'>) => api.post('/network/forwards', f),
    onSuccess: () => { setFwdModal(null); invalidateFwd() },
    onError: (e: unknown) => toast.error(apiError(e, t('toastCreateForwardFailed'))),
  })

  const updateFwdMut = useMutation({
    mutationFn: ({ id, ...f }: PortForward) => api.put(`/network/forwards/${id}`, f),
    onSuccess: () => { setFwdModal(null); invalidateFwd() },
    onError: (e: unknown) => toast.error(apiError(e, t('toastUpdateForwardFailed'))),
  })

  const deleteFwdMut = useMutation({
    mutationFn: (id: string) => api.delete(`/network/forwards/${id}`),
    onSuccess: () => { setDeletingFwdId(null); invalidateFwd() },
    onError: (e: unknown) => toast.error(apiError(e, t('toastDeleteForwardFailed'))),
  })

  const toggleFwdMut = useMutation({
    mutationFn: (fwd: PortForward) =>
      api.put(`/network/forwards/${fwd.id}`, { ...fwd, enabled: !fwd.enabled }),
    onSuccess: () => invalidateFwd(),
    onError: () => { invalidateFwd(); toast.error(t('toastToggleForwardFailed')) },
  })

  const muxOn = status?.muxEnabled ?? false
  const netOn = status?.networkEnabled ?? true
  const defaultRateLimit = status?.defaultRateLimitPerMinute ?? 120
  const maxRoutes = status?.maxRoutes ?? 50
  const atLimit = routes.length >= maxRoutes
  const maxForwards = status?.maxPortForwards ?? 20
  const atFwdLimit = forwards.length >= maxForwards

  const statusLabel = muxOn
    ? netOn ? t('statusRouting', { port: status?.muxPort }) : t('statusRoutingDisabled')
    : t('statusMultiplexerOff')

  return (
    <div className="net-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="net-header">
        <span className="net-title">{t('pageTitle')}</span>
        <span className={`net-status-pill ${muxOn && netOn ? 'on' : 'off'}`}>
          <span className="net-status-dot" />
          {statusLabel}
        </span>
      </div>

      {!muxOn && (
        <div className="net-banner net-banner-warn">
          <IconNetwork size={14} />
          {t('muxDisabledPrefix')} <code style={{ fontFamily: 'var(--mono)', margin: '0 4px' }}>
            server.multiplex-game-port: true
          </code> {t('muxDisabledSuffix')}
        </div>
      )}

      {muxOn && !netOn && (
        <div className="net-banner net-banner-warn">
          <IconNetwork size={14} />
          {t('routingDisabledPrefix')} <code style={{ fontFamily: 'var(--mono)', margin: '0 4px' }}>
            network.enabled: true
          </code> {t('routingDisabledMid')} <code style={{ fontFamily: 'var(--mono)', margin: '0 4px' }}>/tty reload</code>{t('routingDisabledSuffix')}
        </div>
      )}

      {muxOn && netOn && (
        <div className="net-banner">
          <IconNetwork size={14} />
          {t('httpOnPrefix')} <code style={{ fontFamily: 'var(--mono)', margin: '0 4px' }}>:{status?.muxPort}</code> {t('httpOnMid')}{' '}
          <code style={{ fontFamily: 'var(--mono)', margin: '0 4px' }}>{defaultRateLimit}/min</code> {t('httpOnSuffix')}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div className="mac-master-list" style={{ width: 180 }}>
          <div className="mac-master-header">{t('sidebarHeader')}</div>
          <div
            className={`mac-master-row${section === 'routes' ? ' active' : ''}`}
            onClick={() => setSection('routes')}
          >
            <div className="mac-master-info">
              <div className="mac-master-name">{t('httpRoutesLabel')}</div>
              <div className="mac-master-world">{t('routesCount', { count: routes.length, max: maxRoutes })}</div>
            </div>
          </div>
          <div
            className={`mac-master-row${section === 'forwards' ? ' active' : ''}`}
            onClick={() => setSection('forwards')}
          >
            <div className="mac-master-info">
              <div className="mac-master-name">{t('portForwardsLabel')}</div>
              <div className="mac-master-world">{t('forwardsCount', { count: forwards.length, max: maxForwards })}</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {section === 'routes' && (
            <>
              <div className="net-toolbar">
                <span style={{ fontSize: '12px', color: 'var(--mist)' }}>
                  {t('httpRoutesCount', { count: routes.length, max: maxRoutes })}
                </span>
                <span style={{ flex: 1 }} />
                <button
                  className="btn-primary btn-sm"
                  disabled={atLimit}
                  title={atLimit ? t('routeLimitReached', { max: maxRoutes }) : undefined}
                  onClick={() => setModal('add')}
                >
                  {t('addRouteButton')}
                </button>
              </div>

              <div className="net-table-wrap" style={{ flex: 1 }}>
                {routes.length === 0 ? (
                  <div className="net-empty">
                    <IconNetwork size={28} />
                    <span>{t('noRoutesConfigured')}</span>
                    <span style={{ color: 'var(--ghost)' }}>{t('noRoutesHint')}</span>
                  </div>
                ) : (
                  <table className="net-table">
                    <thead>
                      <tr>
                        <th>{t('tablePrefix')}</th><th></th><th>{t('tableTargetPort')}</th>
                        <th>{t('tableLabel')}</th><th>{t('tableRateLimit')}</th><th>{t('tableEnabled')}</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map(route => (
                        <tr key={route.id}>
                          <td><span className="net-prefix">{route.prefix}</span></td>
                          <td><span className="net-arrow">→</span></td>
                          <td><span className="net-port">:{route.targetPort}</span></td>
                          <td><span className="net-label">{route.label || '—'}</span></td>
                          <td><span className="net-rl">{route.rateLimitPerMinute}/min</span></td>
                          <td>
                            <label className="net-toggle">
                              <input type="checkbox" checked={route.enabled} onChange={() => toggleMut.mutate(route)} />
                            </label>
                          </td>
                          <td>
                            <div className="net-actions">
                              <button className="btn-ghost btn-xs" title={t('editTitle')} onClick={() => setModal(route)}>
                                <IconPencil size={12} />
                              </button>
                              {deletingId === route.id ? (
                                <>
                                  <button className="btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => deleteMut.mutate(route.id)}>{t('common:confirm')}</button>
                                  <button className="btn-ghost btn-xs" onClick={() => setDeletingId(null)}><IconX size={10} /></button>
                                </>
                              ) : (
                                <button className="btn-ghost btn-xs" title={t('deleteTitle')} onClick={() => setDeletingId(route.id)}>
                                  <IconTrash size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {section === 'forwards' && (
            <>
              <div className="net-toolbar">
                <span style={{ fontSize: '12px', color: 'var(--mist)' }}>
                  {t('portForwardsCount', { count: forwards.length, max: maxForwards })}
                </span>
                <span style={{ flex: 1 }} />
                <button
                  className="btn-primary btn-sm"
                  disabled={atFwdLimit || !netOn}
                  title={atFwdLimit ? t('forwardLimitReached', { max: maxForwards }) : !netOn ? t('networkDisabled') : undefined}
                  onClick={() => setFwdModal('add')}
                >
                  {t('addForwardButton')}
                </button>
              </div>

              <div className="net-table-wrap" style={{ flex: 1 }}>
                {forwards.length === 0 ? (
                  <div className="net-empty">
                    <IconNetwork size={28} />
                    <span>{t('noForwardsConfigured')}</span>
                    <span style={{ color: 'var(--ghost)' }}>{t('noForwardsHint')}</span>
                  </div>
                ) : (
                  <table className="net-table">
                    <thead>
                      <tr>
                        <th>{t('tableExternalPort')}</th><th></th><th>{t('tableTargetPort')}</th>
                        <th>{t('tableLabel')}</th><th>{t('tableEnabled')}</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {forwards.map(fwd => (
                        <tr key={fwd.id}>
                          <td><span className="net-port">:{fwd.externalPort}</span></td>
                          <td><span className="net-arrow">→</span></td>
                          <td><span className="net-port">:{fwd.targetPort}</span></td>
                          <td><span className="net-label">{fwd.label || '—'}</span></td>
                          <td>
                            <label className="net-toggle">
                              <input type="checkbox" checked={fwd.enabled} onChange={() => toggleFwdMut.mutate(fwd)} />
                            </label>
                          </td>
                          <td>
                            <div className="net-actions">
                              <button className="btn-ghost btn-xs" title={t('editTitle')} onClick={() => setFwdModal(fwd)}>
                                <IconPencil size={12} />
                              </button>
                              {deletingFwdId === fwd.id ? (
                                <>
                                  <button className="btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => deleteFwdMut.mutate(fwd.id)}>{t('common:confirm')}</button>
                                  <button className="btn-ghost btn-xs" onClick={() => setDeletingFwdId(null)}><IconX size={10} /></button>
                                </>
                              ) : (
                                <button className="btn-ghost btn-xs" title={t('deleteTitle')} onClick={() => setDeletingFwdId(fwd.id)}>
                                  <IconTrash size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {modal === 'add' && (
        <RouteModal defaultRateLimit={defaultRateLimit} onSave={r => createMut.mutate(r)} onClose={() => setModal(null)} />
      )}
      {modal && modal !== 'add' && (
        <RouteModal initial={modal as RouteMapping} defaultRateLimit={defaultRateLimit}
          onSave={r => updateMut.mutate({ ...r, id: (modal as RouteMapping).id })} onClose={() => setModal(null)} />
      )}
      {fwdModal === 'add' && (
        <ForwardModal onSave={f => createFwdMut.mutate(f)} onClose={() => setFwdModal(null)} />
      )}
      {fwdModal && fwdModal !== 'add' && (
        <ForwardModal initial={fwdModal as PortForward}
          onSave={f => updateFwdMut.mutate({ ...f, id: (fwdModal as PortForward).id })} onClose={() => setFwdModal(null)} />
      )}
    </div>
  )
}
