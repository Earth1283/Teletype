import { useState } from 'react'
import { IconX, IconClock } from '../../Icons'
import type { Snippet, CreateScheduleRequest } from './actionTypes'

interface Props {
  snippet: Snippet
  onClose: () => void
  onSchedule: (req: CreateScheduleRequest) => void
  pending?: boolean
}

type Mode = 'once' | 'ntimes' | 'forever'
type TimeUnit = 'minutes' | 'hours' | 'days'

const UNIT_MS: Record<TimeUnit, number> = {
  minutes: 60_000,
  hours:   3_600_000,
  days:    86_400_000,
}

function validateCron(expr: string): { valid: boolean; error?: string } {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return { valid: false, error: 'Expected 5 fields: minute hour day month weekday' }
  const ranges = [[0,59],[0,23],[1,31],[1,12],[0,7]]
  const names  = ['minute','hour','day','month','weekday']
  for (let i = 0; i < 5; i++) {
    const p = parts[i]
    if (p === '*') continue
    if (/^\*\/\d+$/.test(p)) {
      const step = parseInt(p.split('/')[1])
      if (step < 1) return { valid: false, error: `${names[i]}: step /${step} out of range` }
      continue
    }
    for (const seg of p.split(',')) {
      if (/-/.test(seg)) {
        const [a, b] = seg.split('-').map(Number)
        if (isNaN(a)||isNaN(b)||a>b||a<ranges[i][0]||b>ranges[i][1])
          return { valid: false, error: `${names[i]}: "${seg}" out of range` }
      } else {
        const n = Number(seg)
        if (isNaN(n)||n<ranges[i][0]||n>ranges[i][1])
          return { valid: false, error: `${names[i]}: ${n} out of range` }
      }
    }
  }
  return { valid: true }
}

function describeCron(expr: string): string {
  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/)
  const pad = (s: string | number) => String(s).padStart(2, '0')
  if (expr.trim() === '* * * * *') return 'Every minute'
  if (/^\*\/(\d+)$/.test(min) && hour==='*' && dom==='*' && mon==='*' && dow==='*')
    return `Every ${min.split('/')[1]} minutes`
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom==='*' && mon==='*' && dow==='*')
    return `Every day at ${pad(hour)}:${pad(min)}`
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom==='*' && mon==='*' && /^\d+$/.test(dow)) {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    return `Every ${days[+dow] ?? 'weekday'} at ${pad(hour)}:${pad(min)}`
  }
  return expr.trim()
}

function nowLocalIso() {
  const d = new Date(); d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

export default function ScheduleModal({ snippet, onClose, onSchedule, pending }: Props) {
  const [mode, setMode]           = useState<Mode>('forever')
  const [runAt, setRunAt]         = useState(nowLocalIso())
  const [count, setCount]         = useState(3)
  const [nInterval, setNInterval] = useState(30)
  const [nUnit, setNUnit]         = useState<TimeUnit>('minutes')
  const [nStartAt, setNStartAt]   = useState(nowLocalIso())
  const [fInterval, setFInterval] = useState(30)
  const [fUnit, setFUnit]         = useState<TimeUnit>('minutes')
  const [useCron, setUseCron]     = useState(false)
  const [cronExpr, setCronExpr]   = useState('*/30 * * * *')
  const [vars, setVars]           = useState<Record<string, string>>(
    Object.fromEntries(snippet.vars.map(v => [v, '']))
  )

  const cronResult = useCron ? validateCron(cronExpr) : { valid: true }
  const onceInPast = mode === 'once' && !!runAt && new Date(runAt) <= new Date()
  const nCountBad  = mode === 'ntimes' && count < 2
  const varsFilled = snippet.vars.every(v => vars[v]?.trim())

  const canConfirm = !onceInPast && !nCountBad &&
    (mode !== 'forever' || !useCron || cronResult.valid) && varsFilled

  const confirm = () => {
    if (!canConfirm) return
    let req: CreateScheduleRequest
    if (mode === 'once') {
      req = {
        snippetId: snippet.id, label: snippet.name, mode: 'once',
        trigger: `Once at ${runAt.replace('T', ' ')}`,
        runAt: new Date(runAt).getTime(), vars,
      }
    } else if (mode === 'ntimes') {
      const ms = nInterval * UNIT_MS[nUnit]
      req = {
        snippetId: snippet.id, label: snippet.name, mode: 'ntimes',
        trigger: `${count}× every ${nInterval} ${nUnit}, starting ${nStartAt.replace('T', ' ')}`,
        intervalMs: ms, repeatCount: count, runAt: new Date(nStartAt).getTime(), vars,
      }
    } else {
      req = {
        snippetId: snippet.id, label: snippet.name, mode: 'forever',
        trigger: useCron ? `Cron: ${cronExpr}` : `Every ${fInterval} ${fUnit}`,
        intervalMs: useCron ? undefined : fInterval * UNIT_MS[fUnit],
        cronExpr: useCron ? cronExpr : undefined, vars,
      }
    }
    onSchedule(req)
  }

  const MODES: { id: Mode; label: string }[] = [
    { id: 'once',    label: '📅 Run once' },
    { id: 'ntimes',  label: '🔁 Run N times' },
    { id: 'forever', label: '∞ Run forever' },
  ]

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card sched-modal-card">
        <div className="modal-title">
          <span>Schedule: {snippet.name}</span>
          <button className="icon-btn" onClick={onClose}><IconX size={14} /></button>
        </div>

        <div className="sched-mode-row">
          {MODES.map(m => (
            <button key={m.id}
              className={`sched-mode-btn${mode === m.id ? ' active' : ''}`}
              onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'once' && (
          <div className="sched-fields">
            <div className="modal-field">
              <label className="modal-label">Date &amp; time</label>
              <input className="modal-input" type="datetime-local" value={runAt}
                onChange={e => setRunAt(e.target.value)} />
              {onceInPast && <span className="field-error">Date must be in the future</span>}
            </div>
          </div>
        )}

        {mode === 'ntimes' && (
          <div className="sched-fields">
            <div className="modal-field">
              <label className="modal-label">Run count (min 2)</label>
              <input className="modal-input" type="number" min={2} value={count}
                onChange={e => setCount(Math.max(2, +e.target.value))} />
              {nCountBad && <span className="field-error">Must be at least 2</span>}
            </div>
            <div className="modal-field">
              <label className="modal-label">Every</label>
              <div className="interval-row">
                <input className="modal-input interval-num" type="number" min={1} value={nInterval}
                  onChange={e => setNInterval(Math.max(1, +e.target.value))} />
                <select className="modal-select" value={nUnit} onChange={e => setNUnit(e.target.value as TimeUnit)}>
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
            </div>
            <div className="modal-field">
              <label className="modal-label">Starting at</label>
              <input className="modal-input" type="datetime-local" value={nStartAt}
                onChange={e => setNStartAt(e.target.value)} />
            </div>
          </div>
        )}

        {mode === 'forever' && (
          <div className="sched-fields">
            <label className="sched-cron-toggle">
              <input type="checkbox" checked={useCron} onChange={e => setUseCron(e.target.checked)} />
              <span>Custom cron expression</span>
            </label>
            {useCron ? (
              <div className="modal-field">
                <label className="modal-label">Cron (5 fields)</label>
                <input className="modal-input mono-input" value={cronExpr}
                  onChange={e => setCronExpr(e.target.value)}
                  placeholder="*/30 * * * *" spellCheck={false} />
                {cronResult.valid
                  ? <span className="field-ok">↳ {describeCron(cronExpr)}</span>
                  : <span className="field-error">{cronResult.error}</span>}
              </div>
            ) : (
              <div className="modal-field">
                <label className="modal-label">Every</label>
                <div className="interval-row">
                  <input className="modal-input interval-num" type="number" min={1} value={fInterval}
                    onChange={e => setFInterval(Math.max(1, +e.target.value))} />
                  <select className="modal-select" value={fUnit} onChange={e => setFUnit(e.target.value as TimeUnit)}>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {snippet.vars.length > 0 && (
          <div className="sched-vars">
            <p className="modal-label" style={{ marginBottom: 8 }}>Variable values (fixed for all runs)</p>
            {snippet.vars.map(v => (
              <div key={v} className="modal-field">
                <label className="modal-label">{v}</label>
                <input className="modal-input" value={vars[v] ?? ''}
                  onChange={e => setVars(prev => ({ ...prev, [v]: e.target.value }))}
                  placeholder={`Enter ${v}…`} />
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={confirm} disabled={!canConfirm || pending}>
            <IconClock size={13} />
            {pending ? 'Scheduling…' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
