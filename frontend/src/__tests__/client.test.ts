import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { apiError, apiStatus } from '../api/client'

function axiosErrorWith(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError('boom', undefined, config, undefined, { status, statusText: '', headers: {}, config, data })
}

describe('apiError', () => {
  it('uses the server error message when present', () => {
    expect(apiError(axiosErrorWith(409, { error: 'Already exists' }), 'fallback')).toBe('Already exists')
  })

  it('falls back for non-API errors', () => {
    expect(apiError(new Error('x'), 'fallback')).toBe('fallback')
    expect(apiError(axiosErrorWith(500, 'oops'), 'fallback')).toBe('fallback')
  })

  it('exposes the status code', () => {
    expect(apiStatus(axiosErrorWith(415, {}))).toBe(415)
    expect(apiStatus(new Error('x'))).toBeUndefined()
  })
})
