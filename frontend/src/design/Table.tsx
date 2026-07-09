import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cx } from './cx'

function Root({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cx('w-full border-collapse font-sans text-[12.5px]', className)} {...rest} />
}

function Head({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cx('border-b border-border', className)} {...rest} />
}

function HeadCell({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cx(
        'py-2 px-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted font-medium',
        className,
      )}
      {...rest}
    />
  )
}

function Row({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cx('border-b border-border/60 hover:bg-surface-raised', className)} {...rest} />
}

function Cell({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cx('py-2 px-3 text-text-secondary', className)} {...rest} />
}

export const Table = Object.assign(Root, { Head, HeadCell, Row, Cell })
