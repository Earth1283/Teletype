import { useState } from 'react'
import { IconX } from '../../Icons'
import type { SnippetCategory, CreateSnippetRequest } from './actionTypes'

interface Props {
  categories: SnippetCategory[]
  onClose: () => void
  onCreate: (req: CreateSnippetRequest) => void
  pending?: boolean
}

export default function NewSnippetModal({ categories, onClose, onCreate, pending }: Props) {
  const [name, setName] = useState('')
  const [catId, setCatId] = useState(categories[0]?.id ?? '')
  const [cmds, setCmds] = useState([''])

  const nonBlankCmds = cmds.filter(c => c.trim())
  const vars = [...new Set(nonBlankCmds.flatMap(cmd =>
    (cmd.match(/\{(\w+)\}/g) ?? []).map(m => m.slice(1, -1))
  ))]

  const canSave = name.trim().length > 0 && nonBlankCmds.length > 0 && catId.length > 0

  const save = () => {
    if (!canSave) return
    onCreate({ name: name.trim(), categoryId: catId, cmds: nonBlankCmds })
  }

  const updateCmd = (i: number, val: string) =>
    setCmds(prev => { const next = [...prev]; next[i] = val; return next })

  const addCmd = () => setCmds(prev => [...prev, ''])

  const removeCmd = (i: number) => setCmds(prev => prev.filter((_, j) => j !== i))

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card">
        <div className="modal-title">
          <span>New Snippet</span>
          <button className="icon-btn" onClick={onClose}><IconX size={14} /></button>
        </div>

        <div className="modal-field">
          <label className="modal-label">Name</label>
          <input className="modal-input" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Force GC" autoFocus
            onKeyDown={e => { if (e.key === 'Enter') addCmd() }} />
        </div>

        <div className="modal-field">
          <label className="modal-label">Category</label>
          <select className="modal-select modal-select-full" value={catId}
            onChange={e => setCatId(e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="modal-field">
          <label className="modal-label">Commands</label>
          <div className="cmd-list-editor">
            {cmds.map((cmd, i) => (
              <div key={i} className="cmd-input-row">
                <span className="cmd-num">{i + 1}</span>
                <input className="modal-input mono-input cmd-input" value={cmd}
                  onChange={e => updateCmd(i, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCmd() } }}
                  placeholder="/command {variable}" spellCheck={false} />
                {cmds.length > 1 && (
                  <button className="icon-btn" onClick={() => removeCmd(i)}><IconX size={12} /></button>
                )}
              </div>
            ))}
            <button className="add-cmd-btn" onClick={addCmd}>+ Add command</button>
          </div>
        </div>

        {vars.length > 0 && (
          <div className="vars-preview">
            <span className="modal-label">Detected variables: </span>
            {vars.map(v => <span key={v} className="var-chip">{'{' + v + '}'}</span>)}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={!canSave || pending}>
            {pending ? 'Creating…' : 'Create Snippet'}
          </button>
        </div>
      </div>
    </div>
  )
}
