import { useState, type ReactNode } from 'react'

export type PromptVariant = 'info' | 'error' | 'danger'

interface PromptModalProps {
  open: boolean
  title: string
  message?: ReactNode
  variant?: PromptVariant
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void | Promise<void>
  onClose: () => void
}

export default function PromptModal({
  open,
  title,
  message,
  variant = 'info',
  confirmLabel = 'OK',
  cancelLabel,
  onConfirm,
  onClose,
}: PromptModalProps) {
  const [busy, setBusy] = useState(false)

  if (!open) return null

  async function confirm() {
    if (!onConfirm) {
      onClose()
      return
    }
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } catch {
      // The caller is responsible for surfacing the specific error state.
    } finally {
      setBusy(false)
    }
  }

  const primaryClass = variant === 'danger' ? 'btn-danger' : 'btn-primary'

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={`modal-card prompt-modal ${variant}`}>
        <div className="modal-title">{title}</div>
        {message && <div className="prompt-modal-message">{message}</div>}
        <div className="modal-footer">
          {cancelLabel && (
            <button className="btn-ghost" disabled={busy} onClick={onClose}>
              {cancelLabel}
            </button>
          )}
          <button className={primaryClass} disabled={busy} onClick={confirm} autoFocus>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
