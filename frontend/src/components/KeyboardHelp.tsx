import { useEffect } from 'react'
import { Modal, Eyebrow, Button } from '../design'

const SHORTCUTS: { group: string; keys: string[]; label: string }[] = [
  { group: 'Global',  keys: ['?'],          label: 'Show keyboard shortcuts' },
  { group: 'Global',  keys: ['⌘', 'K'],     label: 'Open command palette' },
  { group: 'Global',  keys: ['Alt', '1–9'], label: 'Jump to tab (sidebar order)' },
  { group: 'Global',  keys: ['Alt', '0'],   label: 'Jump to Settings' },
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <>
          <span>Keyboard Shortcuts</span>
          <Button variant="ghost" size="xs" onClick={onClose}>Close</Button>
        </>
      }
      className="max-w-[420px]"
    >
      <div className="flex flex-col gap-4">
        {GROUPS.map(group => (
          <div key={group}>
            <Eyebrow className="mb-1.5 block">{group}</Eyebrow>
            {SHORTCUTS.filter(s => s.group === group).map(s => (
              <div key={s.label} className="flex items-center justify-between py-1.5">
                <span className="font-sans text-[12.5px] text-text-secondary">{s.label}</span>
                <span className="flex items-center gap-1">
                  {s.keys.map((k, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <kbd className="rounded-sm border border-border-hi bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-text-primary">{k}</kbd>
                      {i < s.keys.length - 1 && <span className="text-text-muted">+</span>}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  )
}
