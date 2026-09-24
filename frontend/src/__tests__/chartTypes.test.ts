import { describe, expect, it } from 'vitest'
import { pointAtActiveIndex } from '../components/charts/chartTypes'

describe('pointAtActiveIndex', () => {
  const data = [{ t: 1 }, { t: 2 }]

  it('returns the point for numeric and string indices', () => {
    expect(pointAtActiveIndex(data, { activeIndex: 1 })).toEqual({ t: 2 })
    expect(pointAtActiveIndex(data, { activeIndex: '0' })).toEqual({ t: 1 })
  })

  it('returns undefined when nothing is active', () => {
    expect(pointAtActiveIndex(data, { activeIndex: undefined })).toBeUndefined()
    expect(pointAtActiveIndex(data, null)).toBeUndefined()
  })
})
