import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'
import { Eyebrow } from './Eyebrow'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: string
  raised?: boolean
  actions?: ReactNode
}

export function Card({ eyebrow, raised, actions, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-md border border-border',
        raised ? 'bg-surface-raised' : 'bg-surface',
        'p-4',
        className,
      )}
      {...rest}
    >
      {(eyebrow || actions) && (
        <div className="flex items-center justify-between mb-3">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}
