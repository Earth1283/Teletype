import { useLayoutEffect, useRef, type ReactNode } from 'react'
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
  /** Icon-only rail: labels fade out but stay in the DOM as accessible names */
  collapsed?: boolean
  className?: string
}

export function Tabs<T extends string>({
  items, active, onChange, orientation = 'vertical', collapsed = false, className,
}: TabsProps<T>) {
  const navRef = useRef<HTMLElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)
  const vertical = orientation === 'vertical'

  useLayoutEffect(() => {
    const indicator = indicatorRef.current
    const target = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!indicator) return
    if (!target) {
      indicator.style.opacity = '0'
      return
    }
    const placed = indicator.style.opacity === '1'
    indicator.style.transitionDuration = placed ? '' : '0ms'
    if (vertical) {
      // Symmetric insets (not a measured width) so the pill tracks the rail's width animation
      indicator.style.left = indicator.style.right = `${target.offsetLeft}px`
      indicator.style.height = `${target.offsetHeight}px`
      indicator.style.transform = `translateY(${target.offsetTop}px)`
    } else {
      indicator.style.width = `${target.offsetWidth}px`
      indicator.style.transform = `translateX(${target.offsetLeft}px)`
    }
    indicator.style.opacity = '1'
  }, [active, items, vertical])

  return (
    <nav
      ref={navRef}
      className={cx(
        'relative flex',
        vertical ? 'flex-col gap-0.5' : 'flex-row gap-1',
        className,
      )}
    >
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute left-0 top-0 rounded-sm bg-accent/10 opacity-0',
          'transition-[transform,height,width] duration-[260ms] ease-[var(--ease-out)]',
          !vertical && 'h-full',
        )}
      >
        <span
          className={cx(
            'absolute rounded-full bg-accent',
            vertical ? 'left-0 top-1/2 h-4 w-[2px] -translate-y-1/2' : 'bottom-0 left-1/2 h-[2px] w-4 -translate-x-1/2',
          )}
        />
      </span>
      {items.map(item => {
        const isActive = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            title={item.hint ? `${item.label} (${item.hint})` : collapsed ? item.label : undefined}
            onClick={() => onChange(item.id)}
            className={cx(
              'relative flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-sm px-[12px] py-1.5 text-left font-sans text-[13px]',
              'transition-colors duration-150',
              isActive
                ? 'text-accent'
                : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
            )}
          >
            {item.icon && <span className="flex shrink-0">{item.icon}</span>}
            <span className={cx('tabs-label', collapsed && 'is-collapsed')}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
