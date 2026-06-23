import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { IconNetwork, IconPencil, IconTrash, IconX } from '../Icons'

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
    if (!ext || ext < 1 || ext > 65535) { setErr('External port must be 1–65535'); return }
    if (!tgt || tgt < 1 || tgt > 65535) { setErr('Target port must be 1–65535'); return }
    onSave({ ...form, externalPort: ext, targetPort: tgt })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-title">
          {initial ? 'Edit Forward' : 'Add Port Forward'}
          <button className="btn-ghost btn-xs" onClick={onClose}><IconX size={12} /></button>
        </div>

        <div className="modal-field">
          <div className="modal-label">Label (optional)</div>
          <input
            className="modal-input"
            placeholder="e.g. Dynmap"
            value={form.label}
            onChange={e => set('label', e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">External Port</div>
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
            <div className="modal-label">Target Port</div>
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
              {form.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {err && (
          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '8px' }}>{err}</div>
        )}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>
            {initial ? 'Save' : 'Add Forward'}
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
  const [form, setForm] = useState<Omit<RouteMapping, 'id'>>(
    initial ? { label: initial.label, prefix: initial.prefix, targetPort: initial.targetPort,
                enabled: initial.enabled, rateLimitPerMinute: initial.rateLimitPerMinute }
            : emptyForm(defaultRateLimit)
  )
  const [err, setErr] = useState('')

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.prefix.startsWith('/')) { setErr('Prefix must start with /'); return }
    const port = Number(form.targetPort)
    if (!port || port < 1 || port > 65535) { setErr('Port must be 1–65535'); return }
    onSave({ ...form, targetPort: port })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-title">
          {initial ? 'Edit Route' : 'Add Route'}
          <button className="btn-ghost btn-xs" onClick={onClose}><IconX size={12} /></button>
        </div>

        <div className="modal-field">
          <div className="modal-label">Label (optional)</div>
          <input
            className="modal-input"
            placeholder="e.g. Dynmap"
            value={form.label}
            onChange={e => set('label', e.target.value)}
          />
        </div>

        <div className="modal-field">
          <div className="modal-label">Path Prefix</div>
          <input
            className="modal-input mono-input"
            placeholder="/map"
            value={form.prefix}
            onChange={e => set('prefix', e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="modal-field" style={{ flex: 1 }}>
            <div className="modal-label">Target Port</div>
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
            <div className="modal-label">Rate Limit / min</div>
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
              {form.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {err && (
          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '8px' }}>{err}</div>
        )}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>
            {initial ? 'Save' : 'Add Route'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NetworkPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'add' | RouteMapping | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [fwdModal, setFwdModal] = useState<'add' | PortForward | null>(null)
  const [deletingFwdId, setDeletingFwdId] = useState<string | null>(null)

  const { data: status } = useQuery<NetworkStatus>({
    queryKey: ['network-status'],
    queryFn: () => api.get('/network/status').then(r => r.data),
    refetchInterval: 15_000,
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
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...r }: RouteMapping) => api.put(`/network/routes/${id}`, r),
    onSuccess: () => { setModal(null); invalidate() },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/network/routes/${id}`),
    onSuccess: () => { setDeletingId(null); invalidate() },
  })

  const toggleMut = useMutation({
    mutationFn: (route: RouteMapping) =>
      api.put(`/network/routes/${route.id}`, { ...route, enabled: !route.enabled }),
    onSuccess: () => invalidate(),
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
  })

  const updateFwdMut = useMutation({
    mutationFn: ({ id, ...f }: PortForward) => api.put(`/network/forwards/${id}`, f),
    onSuccess: () => { setFwdModal(null); invalidateFwd() },
  })

  const deleteFwdMut = useMutation({
    mutationFn: (id: string) => api.delete(`/network/forwards/${id}`),
    onSuccess: () => { setDeletingFwdId(null); invalidateFwd() },
  })

  const toggleFwdMut = useMutation({
    mutationFn: (fwd: PortForward) =>
      api.put(`/network/forwards/${fwd.id}`, { ...fwd, enabled: !fwd.enabled }),
    onSuccess: () => invalidateFwd(),
  })

  const muxOn = status?.muxEnabled ?? false
  const netOn = status?.networkEnabled ?? true
  const defaultRateLimit = status?.defaultRateLimitPerMinute ?? 120
  const maxRoutes = status?.maxRoutes ?? 50
  const atLimit = routes.length >= maxRoutes
  const maxForwards = status?.maxPortForwards ?? 20
  const atFwdLimit = forwards.length >= maxForwards

  return (
    <div className="net-page">
      <div className="net-header">
        <span className="net-title">Network &amp; Routing</span>
        <span className={`net-status-pill ${muxOn && netOn ? 'on' : 'off'}`}>
          <span className="net-status-dot" />
          {muxOn
            ? netOn ? `routing :${status?.muxPort}` : 'routing disabled'
            : 'multiplexer off'}
        </span>
      </div>

      {!muxOn && (
        <div className="net-banner net-banner-warn">
          <IconNetwork size={14} />
          Multiplexer disabled — set <code style={{ fontFamily: 'var(--mono)', margin: '0 4px' }}>
            server.multiplex-game-port: true
          </code> in config.yml and restart to enable routing.
        </div>
      )}

      {muxOn && !netOn && (
        <div className="net-banner net-banner-warn">
          <IconNetwork size={14} />
          Routing disabled in config — set <code style={{ fontFamily: 'var(--mono)', margin: '0 4px' }}>
            network.enabled: true
          </code> in config.yml and run <code style={{ fontFamily: 'var(--mono)', margin: '0 4px' }}>/tty reload</code>.
          Routes below are saved but inactive.
        </div>
      )}

      {muxOn && netOn && (
        <div className="net-banner">
          <IconNetwork size={14} />
          HTTP on <code style={{ fontFamily: 'var(--mono)', margin: '0 4px' }}>:{status?.muxPort}</code>
          routes by longest prefix match. Unmatched → Teletype. WebSocket upgrades proxy transparently.
          Default rate limit: <code style={{ fontFamily: 'var(--mono)', margin: '0 4px' }}>{defaultRateLimit}/min</code> per IP.
        </div>
      )}

      <div className="net-toolbar">
        <span style={{ fontSize: '12px', color: 'var(--mist)' }}>
          {routes.length} / {maxRoutes} routes
        </span>
        <span style={{ flex: 1 }} />
        <button
          className="btn-primary btn-sm"
          disabled={atLimit}
          title={atLimit ? `Route limit (${maxRoutes}) reached` : undefined}
          onClick={() => setModal('add')}
        >
          + Add Route
        </button>
      </div>

      <div className="net-table-wrap">
        {routes.length === 0 ? (
          <div className="net-empty">
            <IconNetwork size={28} />
            <span>No routes configured</span>
            <span style={{ color: 'var(--ghost)' }}>Add a route to proxy paths to internal services</span>
          </div>
        ) : (
          <table className="net-table">
            <thead>
              <tr>
                <th>Prefix</th>
                <th></th>
                <th>Target Port</th>
                <th>Label</th>
                <th>Rate Limit</th>
                <th>Enabled</th>
                <th></th>
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
                      <input
                        type="checkbox"
                        checked={route.enabled}
                        onChange={() => toggleMut.mutate(route)}
                      />
                    </label>
                  </td>
                  <td>
                    <div className="net-actions">
                      <button
                        className="btn-ghost btn-xs"
                        title="Edit"
                        onClick={() => setModal(route)}
                      >
                        <IconPencil size={12} />
                      </button>
                      {deletingId === route.id ? (
                        <>
                          <button
                            className="btn-ghost btn-xs"
                            style={{ color: 'var(--red)' }}
                            onClick={() => deleteMut.mutate(route.id)}
                          >
                            Confirm
                          </button>
                          <button
                            className="btn-ghost btn-xs"
                            onClick={() => setDeletingId(null)}
                          >
                            <IconX size={10} />
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn-ghost btn-xs"
                          title="Delete"
                          onClick={() => setDeletingId(route.id)}
                        >
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

      <div className="net-section-title">Port Forwards</div>

      <div className="net-toolbar">
        <span style={{ fontSize: '12px', color: 'var(--mist)' }}>
          {forwards.length} / {maxForwards} forwards
        </span>
        <span style={{ flex: 1 }} />
        <button
          className="btn-primary btn-sm"
          disabled={atFwdLimit || !netOn}
          title={atFwdLimit ? `Forward limit (${maxForwards}) reached` : !netOn ? 'Network disabled' : undefined}
          onClick={() => setFwdModal('add')}
        >
          + Add Forward
        </button>
      </div>

      <div className="net-table-wrap">
        {forwards.length === 0 ? (
          <div className="net-empty">
            <IconNetwork size={28} />
            <span>No port forwards configured</span>
            <span style={{ color: 'var(--ghost)' }}>Forward external ports to internal services over raw TCP</span>
          </div>
        ) : (
          <table className="net-table">
            <thead>
              <tr>
                <th>External Port</th>
                <th></th>
                <th>Target Port</th>
                <th>Label</th>
                <th>Enabled</th>
                <th></th>
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
                      <input
                        type="checkbox"
                        checked={fwd.enabled}
                        onChange={() => toggleFwdMut.mutate(fwd)}
                      />
                    </label>
                  </td>
                  <td>
                    <div className="net-actions">
                      <button
                        className="btn-ghost btn-xs"
                        title="Edit"
                        onClick={() => setFwdModal(fwd)}
                      >
                        <IconPencil size={12} />
                      </button>
                      {deletingFwdId === fwd.id ? (
                        <>
                          <button
                            className="btn-ghost btn-xs"
                            style={{ color: 'var(--red)' }}
                            onClick={() => deleteFwdMut.mutate(fwd.id)}
                          >
                            Confirm
                          </button>
                          <button
                            className="btn-ghost btn-xs"
                            onClick={() => setDeletingFwdId(null)}
                          >
                            <IconX size={10} />
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn-ghost btn-xs"
                          title="Delete"
                          onClick={() => setDeletingFwdId(fwd.id)}
                        >
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

      {modal === 'add' && (
        <RouteModal
          defaultRateLimit={defaultRateLimit}
          onSave={r => createMut.mutate(r)}
          onClose={() => setModal(null)}
        />
      )}
      {modal && modal !== 'add' && (
        <RouteModal
          initial={modal as RouteMapping}
          defaultRateLimit={defaultRateLimit}
          onSave={r => updateMut.mutate({ ...r, id: (modal as RouteMapping).id })}
          onClose={() => setModal(null)}
        />
      )}
      {fwdModal === 'add' && (
        <ForwardModal
          onSave={f => createFwdMut.mutate(f)}
          onClose={() => setFwdModal(null)}
        />
      )}
      {fwdModal && fwdModal !== 'add' && (
        <ForwardModal
          initial={fwdModal as PortForward}
          onSave={f => updateFwdMut.mutate({ ...f, id: (fwdModal as PortForward).id })}
          onClose={() => setFwdModal(null)}
        />
      )}
    </div>
  )
}
