import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConsoleSocket } from '../api/websocket'

class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []
  readyState = FakeWebSocket.OPEN
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number; reason: string }) => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  send(data: string) { this.sent.push(data) }
  close() {}
}

describe('ConsoleSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('delivers batched lines and resumes from the last sequence on reconnect', () => {
    const socket = new ConsoleSocket()
    const received: string[][] = []
    socket.onLogs(lines => received.push(lines))
    socket.connect()

    const first = FakeWebSocket.instances[0]
    first.onopen?.()
    first.onmessage?.({ data: JSON.stringify({ type: 'log_batch', payload: JSON.stringify(['a', 'b']), seq: 7, epoch: 'e1' }) })
    first.onmessage?.({ data: 'not json' })
    expect(received).toEqual([['a', 'b']])

    first.onclose?.({ code: 1006, reason: '' })
    vi.advanceTimersByTime(1000)
    const second = FakeWebSocket.instances[1]
    second.onopen?.()

    expect(JSON.parse(second.sent[0])).toMatchObject({ type: 'auth', seq: 7, epoch: 'e1' })
  })

  it('stops reconnecting after a policy close', () => {
    const socket = new ConsoleSocket()
    socket.connect()
    FakeWebSocket.instances[0].onclose?.({ code: 1008, reason: 'Console streaming is disabled' })
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
