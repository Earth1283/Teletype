import type { HTMLAttributes } from 'react'
import { cx } from './cx'

type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral' | 'accent'

const TONE: Record<Tone, string> = {
  good: 'bg-status-good/12 text-status-good border-status-good/30',
  warning: 'bg-status-warning/12 text-status-warning border-status-warning/30',
  serious: 'bg-status-serious/12 text-status-serious border-status-serious/30',
  critical: 'bg-status-critical/12 text-status-critical border-status-critical/30',
  neutral: 'bg-border/40 text-text-secondary border-border',
  accent: 'bg-accent/10 text-accent border-accent/30',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  icon?: React.ReactNode
}

export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5',
        'font-mono text-[10px] uppercase tracking-[0.06em] leading-none',
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  )
}
