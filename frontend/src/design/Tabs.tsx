import type { ReactNode } from 'react'
import { cx } from './cx'

export interface TabItem<T extends string> {
  id: T
  label: string
  icon?: ReactNode
  /** Tooltip suffix, e.g. a keyboard shortcut ("Alt+3") */
  hint?: string
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[]
  active: T
  onChange: (id: T) => void
  orientation?: 'vertical' | 'horizontal'
  className?: string
}

export function Tabs<T extends string>({ items, active, onChange, orientation = 'vertical', className }: TabsProps<T>) {
  return (
    <nav
      className={cx(
        'flex gap-1',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
        className,
      )}
    >
      {items.map(item => {
        const isActive = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            title={item.hint ? `${item.label} (${item.hint})` : undefined}
            onClick={() => onChange(item.id)}
            className={cx(
              'relative flex items-center gap-2.5 rounded-sm px-3 py-2 text-left font-sans text-[13px]',
              'transition-colors duration-150',
              isActive
                ? 'bg-accent/10 text-accent'
                : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
            )}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent" />
            )}
            {item.icon}
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
