import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import AnsiConvert from 'ansi-to-html'
import { useQuery } from '@tanstack/react-query'
import { useLogs } from '../LogContext'
import { useSettings } from '../SettingsContext'
import { useContextMenu, type ContextMenuItem } from '../ContextMenu'
import { api } from '../api/client'
import { writeClipboard } from '../clipboard'
import { useToast } from '../ToastContext'
import type { Snippet } from './actions/actionTypes'
import RunModal from './actions/RunModal'
import { IconSearch, IconX } from '../Icons'

const convert = new AnsiConvert({ escapeXML: true, newline: true })

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

function stripAnsi(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, '')
}
function stripLogPrefix(line: string): string {
  return line.replace(/^(?:\[[^\]]*\]\s*)+:?\s*/, '')
}
function lineClass(raw: string): LogLevel {
  const upper = raw.toUpperCase()
  if (upper.includes('[WARN]') || upper.includes('[WARNING]')) return 'warn'
  if (upper.includes('[ERROR]') || upper.includes('[SEVERE]') || upper.includes('[FATAL]')) return 'error'
  if (upper.includes('[DEBUG]') || upper.includes('[TRACE]')) return 'debug'
  return 'info'
}

function matchLine(line: string, q: string, fuzzyLevel: number): boolean {
  if (!q) return true
  const l = line.toLowerCase()
  const ql = q.toLowerCase()
  if (fuzzyLevel < 50) return l.includes(ql)
  let qi = 0
  for (const c of l) { if (qi < ql.length && c === ql[qi]) qi++ }
  return qi === ql.length
}

export default function Console() {
  const { lines, connected, send: socketSend, tabComplete } = useLogs()
  const { settings } = useSettings()
  const { fontSize, displayLines, wordWrap, showTimestamps } = settings.console
  const [input, setInput] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [fuzzyLevel, setFuzzyLevel] = useState(0)
  const [clearedAt, setClearedAt] = useState(0)
  const [runSnippet, setRunSnippet] = useState<Snippet | null>(null)
  const [completions, setCompletions] = useState<string[]>([])
  const [completionIdx, setCompletionIdx] = useState(0)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const completionListRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<string[]>((() => {
    try { return JSON.parse(localStorage.getItem('teletype_console_history') ?? '[]') } catch { return [] }
  })())
  const histCursorRef = useRef<number>(-1)
  const draftRef = useRef<string>('')
  const { openContextMenu, isOpen: isMenuOpen } = useContextMenu()
  const toast = useToast()

  const clearCompletions = () => { setCompletions([]); setCompletionIdx(0) }

  const displayedLines = useMemo(() => {
    const base = lines.length > displayLines ? lines.slice(lines.length - displayLines) : lines
    const clearIdx = Math.max(0, clearedAt - (lines.length - base.length))
    return base.slice(clearIdx)
  }, [lines, displayLines, clearedAt])

  const filteredLines = useMemo(
    () => searchOpen && searchQuery
      ? displayedLines.filter(l => matchLine(l.text, searchQuery, fuzzyLevel))
      : displayedLines,
    [displayedLines, searchOpen, searchQuery, fuzzyLevel]
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

  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    const lastIndex = filteredLines.length - 1
    if (lastIndex < 0) return
    virtuosoRef.current?.scrollToIndex({
      index: lastIndex,
      align: 'end',
      behavior,
    })
  }, [filteredLines.length])

  useEffect(() => {
    if (filteredLines.length === 0) {
      setIsAtBottom(true)
      return
    }
    if (!isAtBottom || isMenuOpen) return
    const frame = requestAnimationFrame(() => scrollToBottom('auto'))
    return () => cancelAnimationFrame(frame)
  }, [filteredLines.length, scrollToBottom, isAtBottom, isMenuOpen])

  const send = useCallback(() => {
    const cmd = input.trim()
    if (!cmd) return
    clearCompletions()
    const h = historyRef.current
    if (h[h.length - 1] !== cmd) {
      const next = [...h.slice(-99), cmd]
      historyRef.current = next
      try { localStorage.setItem('teletype_console_history', JSON.stringify(next)) } catch {}
    }
    histCursorRef.current = -1
    try {
      socketSend(cmd)
      setInput('')
    } catch {
      // Keep input on send failure so the user doesn't lose the command
    }
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
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (completions.length > 0) {
        const prev = (completionIdx - 1 + completions.length) % completions.length
        setCompletionIdx(prev)
        setInput(completions[prev])
      } else {
        const h = historyRef.current
        if (h.length === 0) return
        if (histCursorRef.current === -1) draftRef.current = input
        const next = Math.min(histCursorRef.current + 1, h.length - 1)
        histCursorRef.current = next
        setInput(h[h.length - 1 - next])
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (completions.length > 0) {
        const next = (completionIdx + 1) % completions.length
        setCompletionIdx(next)
        setInput(completions[next])
      } else {
        if (histCursorRef.current === -1) return
        const next = histCursorRef.current - 1
        histCursorRef.current = next
        setInput(next === -1 ? draftRef.current : historyRef.current[historyRef.current.length - 1 - next])
      }
      return
    }
  }, [input, completions, completionIdx, send, tabComplete])

  const openCtx = (e: React.MouseEvent, line: string) => {
    const plain = e.shiftKey
    const clean = stripAnsi(line)
    const items: ContextMenuItem[] = [
      {
        label: plain ? 'Copy Message Only' : 'Copy Line',
        shortcut: '⌘C',
        action: async () => {
          const ok = await writeClipboard(plain ? stripLogPrefix(clean) : clean).catch(() => false)
          if (!ok) toast.error('Copy failed')
        },
      },
    ]
    if (quickActions.length > 0) {
      items.push({ type: 'separator' }, { type: 'header', label: 'Quick Actions' })
      quickActions.forEach(s => {
        items.push({ label: s.name, action: () => handleQAClick(s) })
      })
    }
    openContextMenu(e, items, { kind: 'logLine', line })
  }

  const handleQAClick = (s: Snippet) => {
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
        {searchOpen && (
          <div className="console-search-bar">
            <IconSearch size={12} />
            <input
              className="console-search-input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search logs…"
              autoFocus
              spellCheck={false}
            />
            <div className="fuzzy-slider-wrap">
              <span className="fuzzy-label">Precise</span>
              <input
                type="range" min={0} max={100} value={fuzzyLevel}
                onChange={e => setFuzzyLevel(+e.target.value)}
                className="fuzzy-slider"
              />
              <span className="fuzzy-label">Fuzzy</span>
            </div>
            {searchOpen && searchQuery && (
              <span className="console-search-count">
                {filteredLines.length}/{displayedLines.length}
              </span>
            )}
            <button className="console-search-close" onClick={() => { setSearchOpen(false); setSearchQuery('') }}>
              <IconX size={12} />
            </button>
          </div>
        )}
        <button
          className={`icon-btn${searchOpen ? ' active' : ''}`}
          onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQuery('') }}
          title="Search logs"
          style={{ flexShrink: 0 }}
        >
          <IconSearch size={13} />
        </button>
        <button
          className="icon-btn"
          onClick={() => setClearedAt(lines.length)}
          title="Clear console"
          style={{ flexShrink: 0 }}
        >
          <IconX size={13} />
        </button>
        <button
          className={`console-bottom-btn${isAtBottom ? '' : ' active'}`}
          onClick={() => scrollToBottom('smooth')}
          title="Scroll to bottom"
          disabled={filteredLines.length === 0}
        >
          Bottom
        </button>
        <div className="conn-badge">
          <span className={`dot ${connected ? 'on' : 'off'}`} />
          {connected ? 'connected' : 'connecting'}
        </div>
      </div>

      <Virtuoso
        ref={virtuosoRef}
        className="console-log"
        style={{ flex: 1 }}
        data={filteredLines}
        computeItemKey={(_, item) => item.id}
        followOutput={isBottom => isBottom ? 'auto' : false}
        atBottomStateChange={setIsAtBottom}
        itemContent={(_, item) => (
          <div
            className={`log-line ${lineClass(item.text)}${wordWrap ? ' wrap' : ''}`}
            style={{ fontSize }}
            dangerouslySetInnerHTML={{ __html: convert.toHtml(formatLine(item.text)) }}
            onContextMenu={e => openCtx(e, item.text)}
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

      {runSnippet && <RunModal snippet={runSnippet} onClose={() => setRunSnippet(null)} />}
    </div>
  )
}
