import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconX } from '../../Icons'
import type { CreateCategoryRequest } from './actionTypes'

const PRESETS = ['#a78bfa', '#f472b6', '#60a5fa', '#34d399', '#f97316', '#ef4444', '#fbbf24']

interface Props {
  onClose: () => void
  onCreate: (req: CreateCategoryRequest) => void
  pending?: boolean
}

export default function NewCategoryModal({ onClose, onCreate, pending }: Props) {
  const { t } = useTranslation(['actions', 'common'])
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
          <span>{t('actions:newCategoryModal.title')}</span>
          <button className="icon-btn" onClick={onClose}><IconX size={14} /></button>
        </div>

        <div className="modal-field">
          <label className="modal-label">{t('actions:newCategoryModal.nameLabel')}</label>
          <input className="modal-input" value={name} onChange={e => setName(e.target.value)}
            placeholder={t('actions:newCategoryModal.namePlaceholder')} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save() }} />
        </div>

        <div className="modal-field">
          <label className="modal-label">{t('actions:newCategoryModal.colorLabel')}</label>
          <div className="color-presets">
            {PRESETS.map(c => (
              <button key={c} className={`color-swatch${color === c ? ' selected' : ''}`}
                style={{ background: c }} onClick={() => setColor(c)} title={c} />
            ))}
            <input type="color" className="color-custom" value={color}
              onChange={e => setColor(e.target.value)} title={t('actions:newCategoryModal.customColorTitle')} />
          </div>
        </div>

        <div className="cat-preview-row">
          <span className="cat-badge" style={{
            color,
            background: `${color}26`,
            border: `1px solid ${color}55`,
          }}>{name || t('actions:newCategoryModal.previewPlaceholder')}</span>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>{t('common:cancel')}</button>
          <button className="btn-primary" onClick={save} disabled={!name.trim() || pending}>
            {pending ? t('actions:newCategoryModal.creating') : t('actions:newCategoryModal.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
