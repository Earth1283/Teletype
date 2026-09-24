import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ConsoleSocket } from './api/websocket'

export interface TimestampedLog {
  ts: number
  line: string
}

export interface LogLine {
  id: number
  text: string
}

interface LogLinesValue {
  lines: LogLine[]
  tsLogs: TimestampedLog[]
}

interface LogApiValue {
  connected: boolean
  send: (cmd: string) => void
  tabComplete: (partial: string, callback: (completions: string[]) => void) => void
  getLogsAround: (ts: number, windowMs: number) => TimestampedLog[]
}

const MAX_LINES = 5000
const MAX_TIMESTAMPED = 2000
const FLUSH_INTERVAL_MS = 50

const LogLinesContext = createContext<LogLinesValue>({ lines: [], tsLogs: [] })
const LogApiContext = createContext<LogApiValue>({
  connected: false,
  send: () => {},
  tabComplete: () => {},
  getLogsAround: () => [],
})

function stripMinecraft(s: string) {
  return s.replace(/§[0-9a-fklmnor]/gi, '')
}

function parseLogTs(raw: string): number | null {
  const m = raw.match(/^\[(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const d = new Date()
  d.setHours(+m[1], +m[2], +m[3], 0)
  if (d.getTime() > Date.now() + 60_000) d.setDate(d.getDate() - 1)
  return d.getTime()
}

function appendCapped<T>(prev: T[], added: T[], cap: number): T[] {
  const next = prev.concat(added)
  return next.length > cap ? next.slice(next.length - cap) : next
}

export function LogProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [tsLogs, setTsLogs] = useState<TimestampedLog[]>([])
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<ConsoleSocket | null>(null)
  const tsLogsRef = useRef<TimestampedLog[]>([])
  const nextLineIdRef = useRef(0)

  useEffect(() => {
    const socket = new ConsoleSocket()
    socketRef.current = socket
    let pending: string[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flush = () => {
      flushTimer = null
      const batch = pending
      pending = []
      const added = batch.map(raw => ({ id: nextLineIdRef.current++, text: stripMinecraft(raw) }))
      const addedTs = batch.map((raw, i) => ({ ts: parseLogTs(raw) ?? Date.now(), line: added[i].text }))
      setLines(prev => appendCapped(prev, added, MAX_LINES))
      tsLogsRef.current = appendCapped(tsLogsRef.current, addedTs, MAX_TIMESTAMPED)
      setTsLogs(tsLogsRef.current)
    }

    const unsubLogs = socket.onLogs((raw) => {
      pending = appendCapped(pending, raw, MAX_LINES)
      flushTimer ??= setTimeout(flush, FLUSH_INTERVAL_MS)
    })
    const unsubConn = socket.onConnected(() => setConnected(true))
    const unsubDisc = socket.onDisconnected(() => setConnected(false))

    socket.connect()

    return () => {
      if (flushTimer) clearTimeout(flushTimer)
      unsubLogs()
      unsubConn()
      unsubDisc()
      socket.disconnect()
    }
  }, [])

  const send = useCallback((cmd: string) => {
    socketRef.current?.send(cmd)
  }, [])

  const tabComplete = useCallback((partial: string, callback: (completions: string[]) => void) => {
    const socket = socketRef.current
    if (!socket) return
    socket.onTabComplete(callback)
    socket.sendTabComplete(partial)
  }, [])

  const getLogsAround = useCallback((ts: number, windowMs: number): TimestampedLog[] => {
    const from = ts - windowMs
    const to = ts + windowMs
    return tsLogsRef.current.filter(l => l.ts >= from && l.ts <= to)
  }, [])

  const linesValue = useMemo(() => ({ lines, tsLogs }), [lines, tsLogs])
  const apiValue = useMemo(
    () => ({ connected, send, tabComplete, getLogsAround }),
    [connected, send, tabComplete, getLogsAround],
  )

  return (
    <LogApiContext.Provider value={apiValue}>
      <LogLinesContext.Provider value={linesValue}>
        {children}
      </LogLinesContext.Provider>
    </LogApiContext.Provider>
  )
}

export function useLogLines() {
  return useContext(LogLinesContext)
}

export function useLogApi() {
  return useContext(LogApiContext)
}
