import { cx } from './cx'

export interface TapeTickerItem {
  label: string
  value: string
  live?: boolean
}

export interface TapeTickerProps {
  items: TapeTickerItem[]
  className?: string
}

/**
 * The signature element: a live monospace readout in the style of a
 * teleprinter status line — always-on, always ticking, amber-on-void.
 */
export function TapeTicker({ items, className }: TapeTickerProps) {
  return (
    <div
      className={cx(
        'flex items-center gap-3 overflow-hidden whitespace-nowrap font-mono text-[11px] tabular-nums',
        className,
      )}
    >
      {items.map((it, i) => (
        <span key={it.label} className="flex items-center gap-3">
          {i > 0 && <span className="text-border">·</span>}
          <span className="flex items-center gap-1.5">
            {it.live && <span className="h-1.5 w-1.5 rounded-full bg-live animate-[blink_2s_steps(1)_infinite]" />}
            <span className="uppercase tracking-[0.08em] text-text-muted">{it.label}</span>
            <span className="text-accent">{it.value}</span>
          </span>
        </span>
      ))}
      <span className="ml-0.5 inline-block h-[12px] w-[6px] bg-accent animate-[blink_1s_steps(1)_infinite]" />
    </div>
  )
}
