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
  const { lines, connected, send: socketSend, tabComplete } = useLogs()
  const { settings } = useSettings()
  const { fontSize, displayLines, wordWrap, showTimestamps } = settings.console
  const [input, setInput] = useState('')
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const [runSnippet, setRunSnippet] = useState<Snippet | null>(null)
  const [completions, setCompletions] = useState<string[]>([])
  const [completionIdx, setCompletionIdx] = useState(0)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const atBottom = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const completionListRef = useRef<HTMLDivElement>(null)

  const clearCompletions = () => { setCompletions([]); setCompletionIdx(0) }

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
    clearCompletions()
    socketSend(cmd)
    setInput('')
    inputRef.current?.focus()
  }, [input, socketSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      send()
      return
    }
    if (e.key === 'Escape') {
      clearCompletions()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (completions.length > 0) {
        const next = (completionIdx + 1) % completions.length
        setCompletionIdx(next)
        setInput(completions[next])
      } else {
        tabComplete(input, (results) => {
          if (results.length === 1) {
            setInput(results[0] + ' ')
          } else if (results.length > 1) {
            setCompletions(results)
            setCompletionIdx(0)
            setInput(results[0])
          }
        })
      }
      return
    }
    if (e.key === 'ArrowUp' && completions.length > 0) {
      e.preventDefault()
      const prev = (completionIdx - 1 + completions.length) % completions.length
      setCompletionIdx(prev)
      setInput(completions[prev])
      return
    }
    if (e.key === 'ArrowDown' && completions.length > 0) {
      e.preventDefault()
      const next = (completionIdx + 1) % completions.length
      setCompletionIdx(next)
      setInput(completions[next])
      return
    }
  }, [input, completions, completionIdx, send, tabComplete])

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
        followOutput={(isAtBottom) => isAtBottom ? 'smooth' : false}
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
        {completions.length > 0 && (
          <div className="console-completions" ref={completionListRef}>
            {completions.map((c, i) => (
              <div
                key={c}
                className={`console-completion-item${i === completionIdx ? ' active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); setInput(c); clearCompletions(); inputRef.current?.focus() }}
              >
                {c}
              </div>
            ))}
          </div>
        )}
        <span className="console-prompt">&gt;</span>
        <input
          ref={inputRef}
          className="console-input"
          value={input}
          onChange={(e) => { setInput(e.target.value); clearCompletions() }}
          onKeyDown={handleKeyDown}
          placeholder="Enter server command… (Tab to complete)"
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
