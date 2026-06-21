import { TOKEN_KEY } from './client'

export type WsMessage = { type: string; payload: string }
export type LogHandler = (line: string) => void

export class ConsoleSocket {
  private ws: WebSocket | null = null
  private handlers: LogHandler[] = []
  private reconnectDelay = 1000
  private stopped = false

  connect() {
    this.stopped = false
    this._connect()
  }

  private _connect() {
    if (this.stopped) return
    const token = localStorage.getItem(TOKEN_KEY) ?? ''
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    // Browsers can't set custom WS headers — pass JWT as a query param
    this.ws = new WebSocket(`${proto}://${location.host}/ws/console?token=${encodeURIComponent(token)}`)

    this.ws.onopen = () => {
      this.reconnectDelay = 1000
    }

    this.ws.onmessage = (e) => {
      const msg: WsMessage = JSON.parse(e.data)
      if (msg.type === 'log') {
        this.handlers.forEach((h) => h(msg.payload))
      }
    }

    this.ws.onclose = () => {
      if (!this.stopped) {
        setTimeout(() => this._connect(), this.reconnectDelay)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
      }
    }
  }

  send(command: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'command', payload: command }))
    }
  }

  onLog(handler: LogHandler) {
    this.handlers.push(handler)
    return () => { this.handlers = this.handlers.filter((h) => h !== handler) }
  }

  disconnect() {
    this.stopped = true
    this.ws?.close()
    this.ws = null
  }
}
