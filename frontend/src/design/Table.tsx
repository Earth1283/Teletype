import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cx } from './cx'

export function TableRoot({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cx('w-full border-collapse font-sans text-[12.5px]', className)} {...rest} />
}

export function TableHead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cx('border-b border-border', className)} {...rest} />
}

export function TableHeadCell({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
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

export function TableRow({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cx('border-b border-border/60 hover:bg-surface-raised', className)} {...rest} />
}

export function TableCell({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cx('py-2 px-3 text-text-secondary', className)} {...rest} />
}

export const Table = Object.assign(TableRoot, { Head: TableHead, HeadCell: TableHeadCell, Row: TableRow, Cell: TableCell })
