import { useEffect, useRef, useState, useCallback } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import AnsiConvert from 'ansi-to-html'
import { ConsoleSocket } from '../api/websocket'

const convert = new AnsiConvert({ escapeXML: true, newline: true })

// Strip Minecraft §-color codes
const stripMinecraft = (s: string) => s.replace(/§[0-9a-fklmnor]/gi, '')

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

function lineClass(raw: string): LogLevel {
  const upper = raw.toUpperCase()
  if (upper.includes('[WARN]') || upper.includes('[WARNING]')) return 'warn'
  if (upper.includes('[ERROR]') || upper.includes('[SEVERE]') || upper.includes('[FATAL]')) return 'error'
  if (upper.includes('[DEBUG]') || upper.includes('[TRACE]')) return 'debug'
  return 'info'
}

export default function Console() {
  const [lines, setLines] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<ConsoleSocket | null>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const atBottom = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const socket = new ConsoleSocket()
    socketRef.current = socket

    const unsub = socket.onLog((line) => {
      setLines((prev) => {
        const next = [...prev, stripMinecraft(line)]
        return next.length > 5000 ? next.slice(-5000) : next
      })
      if (atBottom.current) {
        requestAnimationFrame(() =>
          virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' })
        )
      }
    })

    socket.connect()

    const tid = setInterval(() => {
      if ((socket as any).ws?.readyState === 1) {
        setConnected(true)
        clearInterval(tid)
      }
    }, 300)

    return () => { unsub(); socket.disconnect(); clearInterval(tid) }
  }, [])

  const send = useCallback(() => {
    const cmd = input.trim()
    if (!cmd) return
    socketRef.current?.send(cmd)
    setInput('')
    inputRef.current?.focus()
  }, [input])

  return (
    <div className="console-root">
      <div className="console-header">
        <span className="console-header-title">Live Console</span>
        <div className="conn-badge">
          <span className={`dot ${connected ? 'on' : 'off'}`} />
          {connected ? 'connected' : 'connecting'}
        </div>
      </div>

      <Virtuoso
        ref={virtuosoRef}
        className="console-log"
        style={{ flex: 1 }}
        data={lines}
        followOutput
        atBottomStateChange={(b) => { atBottom.current = b }}
        itemContent={(_, line) => (
          <div
            className={`log-line ${lineClass(line)}`}
            dangerouslySetInnerHTML={{ __html: convert.toHtml(line) }}
          />
        )}
        components={{
          Footer: () => (
            <div style={{ padding: '0 16px 8px', fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ghost)' }}>
              <span className="console-cursor" />
            </div>
          ),
        }}
      />

      <div className="console-input-row">
        <span className="console-prompt">&gt;</span>
        <input
          ref={inputRef}
          className="console-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          placeholder="Enter server command…"
          spellCheck={false}
          autoComplete="off"
          autoFocus
        />
        <button className="console-send-btn" onClick={send}>Send</button>
      </div>
    </div>
  )
}
