import type { QueryClient } from '@tanstack/react-query'
import { api } from './client'

const INCREMENTAL_MAX_WINDOW_MIN = 15

export const historyQueryKey = (windowMin: number) => ['glance-history', windowMin] as const

export async function fetchHistory<T extends { timestamp: number }>(qc: QueryClient, windowMin: number): Promise<T[]> {
  const previous = windowMin <= INCREMENTAL_MAX_WINDOW_MIN ? qc.getQueryData<T[]>(historyQueryKey(windowMin)) : undefined
  const since = previous?.at(-1)?.timestamp
  const { data } = await api.get<T[]>('/glance/history', { params: { window: windowMin, since } })
  if (!previous || since === undefined) return data

  const cutoff = (data.at(-1)?.timestamp ?? since) - windowMin * 60_000
  return [...previous.filter(s => s.timestamp >= cutoff), ...data]
}
