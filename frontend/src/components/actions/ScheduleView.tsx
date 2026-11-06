import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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

function modeLabel(a: ScheduledAction, t: TFunction) {
  if (a.mode === 'once')    return t('actions:scheduleView.modeOnce')
  if (a.mode === 'ntimes')  return t('actions:scheduleView.modeNTimes', { remaining: a.runsRemaining ?? 0, count: a.repeatCount ?? '?' })
  return t('actions:scheduleView.modeForever')
}

export default function ScheduleView({ actions, snippets }: Props) {
  const { t } = useTranslation('actions')
  const deleteSchedule = useDeleteSchedule()
  const pauseSchedule  = usePauseSchedule()
  const resumeSchedule = useResumeSchedule()
  const snippetMap     = Object.fromEntries(snippets.map(s => [s.id, s]))

  if (actions.length === 0) {
    return (
      <div className="schedule-view">
        <div className="actions-empty">
          <span>{t('scheduleView.empty.title')}</span>
          <span className="ghost-hint">{t('scheduleView.empty.hint')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="schedule-view">
      <table className="sched-table">
        <thead>
          <tr>
            <th>{t('scheduleView.columns.label')}</th>
            <th>{t('scheduleView.columns.snippet')}</th>
            <th>{t('scheduleView.columns.schedule')}</th>
            <th>{t('scheduleView.columns.mode')}</th>
            <th>{t('scheduleView.columns.status')}</th>
            <th>{t('scheduleView.columns.lastRun')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {actions.map(a => {
            const sn = snippetMap[a.snippetId]
            return (
              <tr key={a.id} className={a.status === 'paused' ? 'row-paused' : ''}>
                <td className="sched-label">{a.label}</td>
                <td className="sched-snippet">{sn?.name ?? <span className="ghost-hint">{t('scheduleView.deletedSnippet')}</span>}</td>
                <td className="sched-trigger">{a.trigger}</td>
                <td className="sched-mode">{modeLabel(a, t)}</td>
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
                      ? <button className="btn-ghost btn-xs" onClick={() => pauseSchedule.mutate(a.id)}>{t('scheduleView.pause')}</button>
                      : <button className="btn-ghost btn-xs" onClick={() => resumeSchedule.mutate(a.id)}>{t('scheduleView.resume')}</button>
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
