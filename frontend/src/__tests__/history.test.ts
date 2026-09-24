import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { fetchHistory, historyQueryKey } from '../api/history'

type Point = { timestamp: number }

describe('fetchHistory', () => {
  let qc: QueryClient
  const get = vi.spyOn(api, 'get')

  beforeEach(() => {
    qc = new QueryClient()
    get.mockReset()
  })

  it('fetches the full window the first time', async () => {
    get.mockResolvedValue({ data: [{ timestamp: 1 }] })
    await expect(fetchHistory<Point>(qc, 5)).resolves.toEqual([{ timestamp: 1 }])
    expect(get).toHaveBeenCalledWith('/glance/history', { params: { window: 5, since: undefined } })
  })

  it('only asks for newer points and trims ones that fell out of the window', async () => {
    const minute = 60_000
    qc.setQueryData(historyQueryKey(5), [{ timestamp: 0 }, { timestamp: 2 * minute }])
    get.mockResolvedValue({ data: [{ timestamp: 6 * minute }] })

    const merged = await fetchHistory<Point>(qc, 5)

    expect(get).toHaveBeenCalledWith('/glance/history', { params: { window: 5, since: 2 * minute } })
    expect(merged.map(p => p.timestamp)).toEqual([2 * minute, 6 * minute])
  })

  it('always refetches bucketed long windows in full', async () => {
    qc.setQueryData(historyQueryKey(60), [{ timestamp: 1 }])
    get.mockResolvedValue({ data: [] })
    await fetchHistory<Point>(qc, 60)
    expect(get).toHaveBeenCalledWith('/glance/history', { params: { window: 60, since: undefined } })
  })
})
