import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Eyebrow, Button } from '../design'

export default function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(['keyboardHelp', 'common'])

  const SHORTCUTS = useMemo<{ group: string; keys: string[]; label: string }[]>(() => [
    { group: t('keyboardHelp:groupGlobal'),  keys: ['?'],          label: t('keyboardHelp:showShortcuts') },
    { group: t('keyboardHelp:groupGlobal'),  keys: ['⌘', 'K'],     label: t('keyboardHelp:openPalette') },
    { group: t('keyboardHelp:groupGlobal'),  keys: ['Alt', '1–9'], label: t('keyboardHelp:jumpToTab') },
    { group: t('keyboardHelp:groupGlobal'),  keys: ['Alt', '0'],   label: t('keyboardHelp:jumpToSettings') },
    { group: t('keyboardHelp:groupGlobal'),  keys: ['Esc'],         label: t('keyboardHelp:closeDialog') },
    { group: t('keyboardHelp:groupConsole'), keys: ['↑', '↓'],      label: t('keyboardHelp:navigateHistory') },
    { group: t('keyboardHelp:groupConsole'), keys: ['Tab'],          label: t('keyboardHelp:tabComplete') },
    { group: t('keyboardHelp:groupConsole'), keys: ['/'],            label: t('keyboardHelp:focusSearch') },
    { group: t('keyboardHelp:groupConsole'), keys: ['Esc'],          label: t('keyboardHelp:clearCompletions') },
    { group: t('keyboardHelp:groupContext'), keys: ['Alt', '⊞'],    label: t('keyboardHelp:openContextWheel') },
  ], [t])

  const GROUPS = useMemo(() => [...new Set(SHORTCUTS.map(s => s.group))], [SHORTCUTS])

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
          <span>{t('keyboardHelp:title')}</span>
          <Button variant="ghost" size="xs" onClick={onClose}>{t('common:close')}</Button>
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
