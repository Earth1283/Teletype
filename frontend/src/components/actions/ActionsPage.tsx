import { useState } from 'react'
import { useSnippets, useCategories, useSchedule } from './useActions'
import SnippetsView from './SnippetsView'
import ScheduleView from './ScheduleView'

type Sub = 'snippets' | 'schedule'

export default function ActionsPage() {
  const [sub, setSub] = useState<Sub>('snippets')
  const { data: snippets   = [], isLoading: sl } = useSnippets()
  const { data: categories = [], isLoading: cl } = useCategories()
  const { data: scheduled  = [], isLoading: al } = useSchedule()

  const loading = sl || cl || al

  const activeScheduled = scheduled.filter(a => a.status === 'active').length

  return (
    <div className="actions-page">
      <div className="actions-subnav">
        <button className={`subnav-btn${sub === 'snippets' ? ' active' : ''}`}
          onClick={() => setSub('snippets')}>
          Snippets
          {snippets.length > 0 && <span className="nav-badge">{snippets.length}</span>}
        </button>
        <button className={`subnav-btn${sub === 'schedule' ? ' active' : ''}`}
          onClick={() => setSub('schedule')}>
          Schedule
          {activeScheduled > 0 && <span className="nav-badge">{activeScheduled}</span>}
        </button>
      </div>

      <div className="actions-content">
        {loading ? (
          <div className="actions-loading">Loading…</div>
        ) : sub === 'snippets' ? (
          <SnippetsView snippets={snippets} categories={categories} />
        ) : (
          <ScheduleView actions={scheduled} snippets={snippets} />
        )}
      </div>
    </div>
  )
}
