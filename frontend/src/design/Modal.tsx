import type { ReactNode } from 'react'
import { cx } from './cx'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-void/70 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className={cx(
          'w-[90vw] max-w-[520px] min-w-[360px] rounded-lg border border-border-hi bg-surface p-6',
          'animate-[modal-in_220ms_cubic-bezier(0.16,1,0.3,1)]',
          className,
        )}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between font-sans text-sm font-semibold text-text-primary">
            {title}
          </div>
        )}
        {children}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
