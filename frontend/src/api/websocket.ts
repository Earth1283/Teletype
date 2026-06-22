import { TOKEN_KEY } from './client'

export type WsMessage = { type: string; payload: string }
export type LogHandler = (line: string) => void

type ConnHandler = () => void

export class ConsoleSocket {
  private ws: WebSocket | null = null
  private logHandlers: LogHandler[] = []
  private connHandlers: ConnHandler[] = []
  private discHandlers: ConnHandler[] = []
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
    this.ws = new WebSocket(`${proto}://${location.host}/ws/console?token=${encodeURIComponent(token)}`)

    this.ws.onopen = () => {
      this.reconnectDelay = 1000
      this.connHandlers.forEach(h => h())
    }

    this.ws.onmessage = (e) => {
      const msg: WsMessage = JSON.parse(e.data)
      if (msg.type === 'log') this.logHandlers.forEach(h => h(msg.payload))
    }

    this.ws.onclose = () => {
      this.discHandlers.forEach(h => h())
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
