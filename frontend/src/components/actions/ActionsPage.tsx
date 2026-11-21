import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnippets, useCategories, useSchedule } from './useActions'
import SnippetsView from './SnippetsView'
import ScheduleView from './ScheduleView'

type Sub = 'snippets' | 'schedule'

export default function ActionsPage() {
  const { t } = useTranslation(['actions', 'common'])
  const [sub, setSub] = useState<Sub>('snippets')
  const { data: snippets   = [], isLoading: sl } = useSnippets()
  const { data: categories = [], isLoading: cl } = useCategories()
  const { data: scheduled  = [], isLoading: al } = useSchedule()

  const loading = sl || cl || al

  const activeScheduled = scheduled.filter(a => a.status === 'active').length

  return (
    <div className="actions-page">
      <div className="actions-subnav">
        <div className="mac-seg-ctrl">
          <button className={`mac-seg-btn${sub === 'snippets' ? ' active' : ''}`}
            onClick={() => setSub('snippets')}>
            {t('actions:page.snippetsTab')}
            {snippets.length > 0 && <span className="mac-seg-badge">{snippets.length}</span>}
          </button>
          <button className={`mac-seg-btn${sub === 'schedule' ? ' active' : ''}`}
            onClick={() => setSub('schedule')}>
            {t('actions:page.scheduleTab')}
            {activeScheduled > 0 && <span className="mac-seg-badge">{activeScheduled}</span>}
          </button>
        </div>
      </div>

      <div className="actions-content">
        {loading ? (
          <div className="actions-loading">{t('common:loading')}</div>
        ) : sub === 'snippets' ? (
          <SnippetsView snippets={snippets} categories={categories} />
        ) : (
          <ScheduleView actions={scheduled} snippets={snippets} />
        )}
      </div>
    </div>
  )
}
