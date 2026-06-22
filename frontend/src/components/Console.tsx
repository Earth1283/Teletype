import { useRef, useState, useCallback, useMemo } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import AnsiConvert from 'ansi-to-html'
import { useQuery } from '@tanstack/react-query'
import { useLogs } from '../LogContext'
import { useSettings } from '../SettingsContext'
import { api } from '../api/client'
import type { Snippet } from './actions/actionTypes'
import RunModal from './actions/RunModal'

const convert = new AnsiConvert({ escapeXML: true, newline: true })

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

function lineClass(raw: string): LogLevel {
  const upper = raw.toUpperCase()
  if (upper.includes('[WARN]') || upper.includes('[WARNING]')) return 'warn'
  if (upper.includes('[ERROR]') || upper.includes('[SEVERE]') || upper.includes('[FATAL]')) return 'error'
  if (upper.includes('[DEBUG]') || upper.includes('[TRACE]')) return 'debug'
  return 'info'
}

interface CtxState { x: number; y: number; line: string }

export default function Console() {
  const { lines, connected, send: socketSend } = useLogs()
  const { settings } = useSettings()
  const { fontSize, displayLines, wordWrap, showTimestamps } = settings.console
  const [input, setInput] = useState('')
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const [runSnippet, setRunSnippet] = useState<Snippet | null>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const atBottom = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayedLines = useMemo(
    () => lines.length > displayLines ? lines.slice(lines.length - displayLines) : lines,
    [lines, displayLines]
  )

  const formatLine = useCallback(
    (line: string) => showTimestamps ? line : line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, ''),
    [showTimestamps]
  )

  const { data: allSnippets = [] } = useQuery<Snippet[]>({
    queryKey: ['snippets'],
    queryFn: () => api.get('/actions/snippets').then(r => r.data),
    staleTime: 30_000,
  })
  const quickActions = allSnippets.filter(s => s.categoryId === 'quick-actions')

  const send = useCallback(() => {
    const cmd = input.trim()
    if (!cmd) return
    socketSend(cmd)
    setInput('')
    inputRef.current?.focus()
  }, [input, socketSend])

  const openCtx = (e: React.MouseEvent, line: string) => {
    e.preventDefault()
    const x = Math.min(e.clientX, window.innerWidth - 220)
    const y = Math.min(e.clientY, window.innerHeight - 200)
    setCtx({ x, y, line })
  }

  const closeCtx = () => setCtx(null)

  const handleQAClick = (s: Snippet) => {
    closeCtx()
    if (s.vars.length > 0) {
      setRunSnippet(s)
    } else {
      api.post(`/actions/execute/${s.id}`, { vars: {} }).catch(() => {})
    }
  }

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
        data={displayedLines}
        followOutput
        atBottomStateChange={(b) => { atBottom.current = b }}
        itemContent={(_, line) => (
          <div
            className={`log-line ${lineClass(line)}`}
            style={{ fontSize, whiteSpace: wordWrap ? 'pre-wrap' : 'pre' }}
            dangerouslySetInnerHTML={{ __html: convert.toHtml(formatLine(line)) }}
            onContextMenu={e => openCtx(e, line)}
          />
        )}
        components={{
          Footer: () => (
            <div style={{ padding: '0 16px 8px', fontFamily: 'var(--mono)', fontSize, color: 'var(--ghost)' }}>
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

      {ctx && (
        <>
          <div className="ctx-backdrop" onClick={closeCtx} />
          <div className="ctx-menu" style={{ left: ctx.x, top: ctx.y }}>
            <button className="ctx-item" onClick={() => { navigator.clipboard.writeText(ctx.line); closeCtx() }}>
              📋 Copy line
            </button>
            {quickActions.length > 0 && (
              <>
                <div className="ctx-divider" />
                <div className="ctx-section-label">Quick Actions</div>
                {quickActions.map(s => (
                  <button key={s.id} className="ctx-item ctx-qa" onClick={() => handleQAClick(s)}>
                    ⚡ {s.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {runSnippet && <RunModal snippet={runSnippet} onClose={() => setRunSnippet(null)} />}
    </div>
  )
}
