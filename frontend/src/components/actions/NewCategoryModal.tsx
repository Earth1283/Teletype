import { useState } from 'react'
import { IconX } from '../../Icons'
import type { CreateCategoryRequest } from './actionTypes'

const PRESETS = ['#a78bfa', '#f472b6', '#60a5fa', '#34d399', '#f97316', '#ef4444', '#fbbf24']

interface Props {
  onClose: () => void
  onCreate: (req: CreateCategoryRequest) => void
  pending?: boolean
}

export default function NewCategoryModal({ onClose, onCreate, pending }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#a78bfa')

  const save = () => {
    if (!name.trim()) return
    onCreate({ name: name.trim(), color })
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" style={{ maxWidth: 360 }}>
        <div className="modal-title">
          <span>New Category</span>
          <button className="icon-btn" onClick={onClose}><IconX size={14} /></button>
        </div>

        <div className="modal-field">
          <label className="modal-label">Name</label>
          <input className="modal-input" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Economy" autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save() }} />
        </div>

        <div className="modal-field">
          <label className="modal-label">Color</label>
          <div className="color-presets">
            {PRESETS.map(c => (
              <button key={c} className={`color-swatch${color === c ? ' selected' : ''}`}
                style={{ background: c }} onClick={() => setColor(c)} title={c} />
            ))}
            <input type="color" className="color-custom" value={color}
              onChange={e => setColor(e.target.value)} title="Custom color" />
          </div>
        </div>

        <div className="cat-preview-row">
          <span className="cat-badge" style={{
            color,
            background: `${color}26`,
            border: `1px solid ${color}55`,
          }}>{name || 'Preview'}</span>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={!name.trim() || pending}>
            {pending ? 'Creating…' : 'Create Category'}
          </button>
        </div>
      </div>
    </div>
  )
}
