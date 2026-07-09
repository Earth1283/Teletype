import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

type Variant = 'primary' | 'ghost' | 'danger'
type Size = 'sm' | 'xs'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent/10 border-accent/30 text-accent hover:bg-accent/20',
  ghost: 'bg-transparent border-border text-text-secondary hover:border-border-hi hover:text-text-primary',
  danger: 'bg-status-critical/10 border-status-critical/30 text-status-critical hover:bg-status-critical/20',
}

const SIZE: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-[12.5px] gap-1.5',
  xs: 'px-2.5 py-1 text-[11px] gap-1',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'sm', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center rounded-sm border font-sans font-medium',
        'transition-colors duration-150 active:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
