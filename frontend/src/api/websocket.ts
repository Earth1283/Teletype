import { TOKEN_KEY, expireSession } from './client'

export type WsMessage = { type: string; payload: string; seq?: number; epoch?: string }
export type LogsHandler = (lines: string[]) => void
export type TabCompleteHandler = (completions: string[]) => void

type ConnHandler = () => void

const POLICY_VIOLATION = 1008
const MAX_RECONNECT_DELAY_MS = 30_000

function parseJson<T>(text: string): T | null {
  try { return JSON.parse(text) as T } catch { return null }
}

export class ConsoleSocket {
  private ws: WebSocket | null = null
  private logHandlers: LogsHandler[] = []
  private connHandlers: ConnHandler[] = []
  private discHandlers: ConnHandler[] = []
  private tabCompleteHandler: TabCompleteHandler | null = null
  private reconnectDelay = 1000
  private stopped = false
  private lastSeq: number | undefined
  private epoch: string | undefined

  connect() {
    this.stopped = false
    this.open()
  }

  private open() {
    if (this.stopped) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws/console`)
    this.ws = ws

    ws.onopen = () => {
      const token = localStorage.getItem(TOKEN_KEY) ?? ''
      ws.send(JSON.stringify({ type: 'auth', payload: token, seq: this.lastSeq, epoch: this.epoch }))
      this.reconnectDelay = 1000
      this.connHandlers.forEach(h => h())
    }

    ws.onmessage = (e) => {
      const msg = parseJson<WsMessage>(e.data)
      if (msg) this.handleMessage(msg)
    }

    ws.onclose = (e) => {
      this.discHandlers.forEach(h => h())
      if (e.code === POLICY_VIOLATION) {
        this.stopped = true
        if (e.reason === 'Unauthorized') expireSession()
        return
      }
      if (!this.stopped) {
        setTimeout(() => this.open(), this.reconnectDelay)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
      }
    }
  }

  private handleMessage(msg: WsMessage) {
    switch (msg.type) {
      case 'log_batch': {
        const lines = parseJson<string[]>(msg.payload)
        if (!lines) return
        this.lastSeq = msg.seq
        this.epoch = msg.epoch
        this.logHandlers.forEach(h => h(lines))
        break
      }
      case 'log':
        this.logHandlers.forEach(h => h([msg.payload]))
        break
      case 'tab_complete':
        this.tabCompleteHandler?.(parseJson<string[]>(msg.payload) ?? [])
        this.tabCompleteHandler = null
        break
    }
  }

  private sendMessage(type: string, payload: string) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type, payload }))
  }

  send(command: string) {
    this.sendMessage('command', command)
  }

  sendTabComplete(partial: string) {
    this.sendMessage('tab_complete', partial)
  }

  onTabComplete(handler: TabCompleteHandler) {
    this.tabCompleteHandler = handler
  }

  onLogs(handler: LogsHandler) {
    this.logHandlers.push(handler)
    return () => { this.logHandlers = this.logHandlers.filter(h => h !== handler) }
  }

  onConnected(handler: ConnHandler) {
    this.connHandlers.push(handler)
    return () => { this.connHandlers = this.connHandlers.filter(h => h !== handler) }
  }

  onDisconnected(handler: ConnHandler) {
    this.discHandlers.push(handler)
    return () => { this.discHandlers = this.discHandlers.filter(h => h !== handler) }
  }

  disconnect() {
    this.stopped = true
    this.ws?.close()
    this.ws = null
  }
}
