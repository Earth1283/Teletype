import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconX, IconPlay } from '../../Icons'
import type { Snippet } from './actionTypes'
import { useExecuteSnippet } from './useActions'

interface Props {
  snippet: Snippet
  onClose: () => void
}

export default function RunModal({ snippet, onClose }: Props) {
  const { t } = useTranslation(['actions', 'common'])
  const [vars, setVars] = useState<Record<string, string>>(
    Object.fromEntries(snippet.vars.map(v => [v, '']))
  )
  const execute = useExecuteSnippet()

  const allFilled = snippet.vars.every(v => vars[v]?.trim())

  const run = () => {
    if (!allFilled) return
    execute.mutate({ id: snippet.id, vars }, { onSuccess: onClose })
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card">
        <div className="modal-title">
          <span>{t('actions:runModal.title', { name: snippet.name })}</span>
          <button className="icon-btn" onClick={onClose}><IconX size={14} /></button>
        </div>

        <div className="run-modal-cmds">
          {snippet.cmds.map((cmd, i) => (
            <div key={i} className="run-cmd-line">
              <span className="run-cmd-num">{i + 1}</span>
              <code className="run-cmd-text">{cmd}</code>
            </div>
          ))}
        </div>

        {snippet.vars.length > 0 && (
          <div className="run-modal-vars">
            {snippet.vars.map((v, vi) => (
              <div key={v} className="modal-field">
                <label className="modal-label">{v}</label>
                <input
                  className="modal-input"
                  value={vars[v] ?? ''}
                  onChange={e => setVars(prev => ({ ...prev, [v]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && allFilled) run() }}
                  placeholder={t('actions:shared.varPlaceholder', { name: v })}
                  autoFocus={vi === 0}
                />
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>{t('common:cancel')}</button>
          <button className="btn-primary" onClick={run} disabled={!allFilled || execute.isPending}>
            <IconPlay size={13} />
            {execute.isPending ? t('actions:runModal.running') : t('actions:runModal.runNow')}
          </button>
        </div>
      </div>
    </div>
  )
}
