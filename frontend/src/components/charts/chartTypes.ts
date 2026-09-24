export interface TooltipEntry<T> {
  payload?: T
  value?: unknown
  dataKey?: unknown
  color?: string
}

export interface ChartTooltipProps<T> {
  active?: boolean
  payload?: ReadonlyArray<TooltipEntry<T>>
}

export interface ChartDotProps<T> {
  cx?: number
  cy?: number
  index?: number
  payload?: T
}

export function pointAtActiveIndex<T>(data: readonly T[], state: { activeIndex?: unknown } | null | undefined): T | undefined {
  const index = Number(state?.activeIndex)
  return Number.isInteger(index) ? data[index] : undefined
}
