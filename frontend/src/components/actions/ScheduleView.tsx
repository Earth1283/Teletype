import type { ScheduledAction, Snippet } from './actionTypes'
import { useDeleteSchedule, usePauseSchedule, useResumeSchedule } from './useActions'
import { IconTrash } from '../../Icons'

interface Props {
  actions: ScheduledAction[]
  snippets: Snippet[]
}

function formatDate(ms: number | undefined) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function modeLabel(a: ScheduledAction) {
  if (a.mode === 'once')    return 'Once'
  if (a.mode === 'ntimes')  return `${a.runsRemaining ?? 0}/${a.repeatCount ?? '?'} left`
  return '∞ Forever'
}

export default function ScheduleView({ actions, snippets }: Props) {
  const deleteSchedule = useDeleteSchedule()
  const pauseSchedule  = usePauseSchedule()
  const resumeSchedule = useResumeSchedule()
  const snippetMap     = Object.fromEntries(snippets.map(s => [s.id, s]))

  if (actions.length === 0) {
    return (
      <div className="schedule-view">
        <div className="actions-empty">
          <span>No scheduled actions yet.</span>
          <span className="ghost-hint">Open the Snippets tab and click 🕐 on any snippet to schedule it.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="schedule-view">
      <table className="sched-table">
        <thead>
          <tr>
            <th>Label</th>
            <th>Snippet</th>
            <th>Schedule</th>
            <th>Mode</th>
            <th>Status</th>
            <th>Last run</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {actions.map(a => {
            const sn = snippetMap[a.snippetId]
            return (
              <tr key={a.id} className={a.status === 'paused' ? 'row-paused' : ''}>
                <td className="sched-label">{a.label}</td>
                <td className="sched-snippet">{sn?.name ?? <span className="ghost-hint">(deleted)</span>}</td>
                <td className="sched-trigger">{a.trigger}</td>
                <td className="sched-mode">{modeLabel(a)}</td>
                <td>
                  <span className={`status-badge status-${a.status}`}>{a.status}</span>
                </td>
                <td className="sched-lastrun">
                  {a.lastRunMs ? (
                    <span className={a.lastRunOk ? 'run-ok' : 'run-err'}>
                      {formatDate(a.lastRunMs)}
                    </span>
                  ) : '—'}
                </td>
                <td className="sched-row-acts">
                  {a.mode !== 'once' && (
                    a.status === 'active'
                      ? <button className="btn-ghost btn-xs" onClick={() => pauseSchedule.mutate(a.id)}>Pause</button>
                      : <button className="btn-ghost btn-xs" onClick={() => resumeSchedule.mutate(a.id)}>Resume</button>
                  )}
                  <button className="icon-btn danger-icon" onClick={() => deleteSchedule.mutate(a.id)}>
                    <IconTrash size={13} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
