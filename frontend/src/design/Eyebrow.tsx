import type { HTMLAttributes } from 'react'
import { cx } from './cx'

export function Eyebrow({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx(
        'font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
