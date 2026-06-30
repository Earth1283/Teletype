import { useEffect } from 'react'

const SHORTCUTS: { group: string; keys: string[]; label: string }[] = [
  { group: 'Global',  keys: ['?'],          label: 'Show keyboard shortcuts' },
  { group: 'Global',  keys: ['⌘', 'K'],     label: 'Open command palette' },
  { group: 'Global',  keys: ['Esc'],         label: 'Close dialog / overlay' },
  { group: 'Console', keys: ['↑', '↓'],      label: 'Navigate command history' },
  { group: 'Console', keys: ['Tab'],          label: 'Tab-complete command' },
  { group: 'Console', keys: ['/'],            label: 'Focus search bar' },
  { group: 'Console', keys: ['Esc'],          label: 'Clear completions / close search' },
  { group: 'Context', keys: ['Alt', '⊞'],    label: 'Open context wheel (right-click hold)' },
]

const GROUPS = [...new Set(SHORTCUTS.map(s => s.group))]

export default function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="kbd-help-card">
        <div className="kbd-help-header">
          <span className="kbd-help-title">Keyboard Shortcuts</span>
          <button className="btn-ghost btn-xs" onClick={onClose}>Close</button>
        </div>
        {GROUPS.map(group => (
          <div key={group} className="kbd-help-group">
            <div className="kbd-help-group-label">{group}</div>
            {SHORTCUTS.filter(s => s.group === group).map(s => (
              <div key={s.label} className="kbd-help-row">
                <span className="kbd-help-desc">{s.label}</span>
                <span className="kbd-help-keys">
                  {s.keys.map((k, i) => (
                    <span key={i}>
                      <kbd className="kbd-key">{k}</kbd>
                      {i < s.keys.length - 1 && <span className="kbd-plus">+</span>}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
