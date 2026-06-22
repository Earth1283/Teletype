import { useState } from 'react'
import type { Snippet, SnippetCategory } from './actionTypes'
import {
  useDeleteSnippet, useUpdateSnippet, useCreateSnippet,
  useCreateCategory, useCreateSchedule,
} from './useActions'
import RunModal from './RunModal'
import ScheduleModal from './ScheduleModal'
import NewSnippetModal from './NewSnippetModal'
import NewCategoryModal from './NewCategoryModal'
import { IconPlay, IconClock, IconTrash, IconZap } from '../../Icons'

function hexToRgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

interface Props {
  snippets: Snippet[]
  categories: SnippetCategory[]
}

export default function SnippetsView({ snippets, categories }: Props) {
  const [catFilter, setCatFilter]         = useState('all')
  const [runSnippet, setRunSnippet]       = useState<Snippet | null>(null)
  const [schedSnippet, setSchedSnippet]   = useState<Snippet | null>(null)
  const [showNewSnippet, setShowNewSnippet] = useState(false)
  const [showNewCat, setShowNewCat]       = useState(false)
  const [menuId, setMenuId]               = useState<string | null>(null)

  const deleteSnippet  = useDeleteSnippet()
  const updateSnippet  = useUpdateSnippet()
  const createSnippet  = useCreateSnippet()
  const createCategory = useCreateCategory()
  const createSchedule = useCreateSchedule()

  const catMap = Object.fromEntries(categories.map(c => [c.id, c]))
  const qaId   = categories.find(c => c.special)?.id ?? 'quick-actions'

  const displayed = catFilter === 'all'
    ? snippets
    : snippets.filter(s => s.categoryId === catFilter)

  const toggleQA = (s: Snippet) => {
    const fallback = categories.find(c => !c.special)?.id ?? 'maintenance'
    updateSnippet.mutate({
      id: s.id,
      categoryId: s.categoryId === qaId ? fallback : qaId,
    })
    setMenuId(null)
  }

  return (
    <div className="snippets-view">
      {/* Category filter row */}
      <div className="cat-filter-row">
        <button className={`cat-tab${catFilter === 'all' ? ' active' : ''}`}
          onClick={() => setCatFilter('all')}>
          All <span className="cat-count">{snippets.length}</span>
        </button>
        {categories.map(cat => {
          const count = snippets.filter(s => s.categoryId === cat.id).length
          return (
            <button key={cat.id}
              className={`cat-tab${catFilter === cat.id ? ' active' : ''}`}
              style={{ '--cat-color': cat.color } as React.CSSProperties}
              onClick={() => setCatFilter(cat.id)}>
              {cat.special ? '⚡ ' : ''}{cat.name}
              <span className="cat-count">{count}</span>
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <button className="btn-ghost btn-sm" onClick={() => setShowNewCat(true)}>+ Category</button>
        <button className="btn-primary btn-sm" onClick={() => setShowNewSnippet(true)}>+ Snippet</button>
      </div>

      {/* Card grid */}
      {displayed.length === 0 ? (
        <div className="actions-empty">
          <span>No snippets{catFilter !== 'all' ? ' in this category' : ''}.</span>
          <button className="btn-ghost" onClick={() => setShowNewSnippet(true)}>Create one</button>
        </div>
      ) : (
        <div className="snippet-grid">
          {displayed.map(s => {
            const cat  = catMap[s.categoryId]
            const isQA = s.categoryId === qaId
            return (
              <div key={s.id} className="snippet-card">
                <div className="snippet-card-top">
                  <span className="snippet-name">{s.name}</span>
                  <div className="snippet-card-btns">
                    <button className="icon-btn" title="Run now" onClick={() => setRunSnippet(s)}>
                      <IconPlay size={13} />
                    </button>
                    <button className="icon-btn" title="Schedule" onClick={() => setSchedSnippet(s)}>
                      <IconClock size={13} />
                    </button>
                    <div className="snippet-menu-wrap">
                      <button className="icon-btn snippet-dots"
                        onClick={() => setMenuId(menuId === s.id ? null : s.id)}>
                        ···
                      </button>
                      {menuId === s.id && (
                        <div className="snippet-menu">
                          <button className="snippet-menu-item" onClick={() => toggleQA(s)}>
                            <IconZap size={12} />
                            {isQA ? 'Remove from Quick Actions' : 'Add to Quick Actions'}
                          </button>
                          <div className="snippet-menu-divider" />
                          <button className="snippet-menu-item danger"
                            onClick={() => { deleteSnippet.mutate(s.id); setMenuId(null) }}>
                            <IconTrash size={12} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {cat && (
                  <div className="snippet-cat-row">
                    <span className="cat-badge" style={{
                      color: cat.color,
                      background: hexToRgba(cat.color, 0.12),
                      borderColor: hexToRgba(cat.color, 0.3),
                    }}>
                      {cat.special ? '⚡ ' : ''}{cat.name}
                    </span>
                  </div>
                )}

                <div className="snippet-cmd-list">
                  {s.cmds.slice(0, 3).map((cmd, i) => (
                    <div key={i} className="snippet-cmd">
                      <span className="snippet-cmd-num">{i + 1}</span>
                      <code className="snippet-cmd-text">{cmd}</code>
                    </div>
                  ))}
                  {s.cmds.length > 3 && (
                    <div className="snippet-cmd-more">+{s.cmds.length - 3} more…</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {menuId && <div className="menu-backdrop" onClick={() => setMenuId(null)} />}

      {runSnippet && <RunModal snippet={runSnippet} onClose={() => setRunSnippet(null)} />}

      {schedSnippet && (
        <ScheduleModal
          snippet={schedSnippet}
          onClose={() => setSchedSnippet(null)}
          onSchedule={req => createSchedule.mutate(req, { onSuccess: () => setSchedSnippet(null) })}
          pending={createSchedule.isPending}
        />
      )}

      {showNewSnippet && (
        <NewSnippetModal
          categories={categories}
          onClose={() => setShowNewSnippet(false)}
          onCreate={req => createSnippet.mutate(req, { onSuccess: () => setShowNewSnippet(false) })}
          pending={createSnippet.isPending}
        />
      )}

      {showNewCat && (
        <NewCategoryModal
          onClose={() => setShowNewCat(false)}
          onCreate={req => createCategory.mutate(req, { onSuccess: () => setShowNewCat(false) })}
          pending={createCategory.isPending}
        />
      )}
    </div>
  )
}
