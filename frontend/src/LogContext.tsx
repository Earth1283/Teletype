import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ConsoleSocket } from './api/websocket'

export interface TimestampedLog {
  ts: number
  line: string
}

interface LogContextValue {
  lines: string[]
  tsLogs: TimestampedLog[]
  connected: boolean
  send: (cmd: string) => void
  tabComplete: (partial: string, callback: (completions: string[]) => void) => void
  getLogsAround: (ts: number, windowMs: number) => TimestampedLog[]
}

const LogContext = createContext<LogContextValue>({
  lines: [],
  tsLogs: [],
  connected: false,
  send: () => {},
  tabComplete: () => {},
  getLogsAround: () => [],
})

function stripMinecraft(s: string) {
  return s.replace(/§[0-9a-fklmnor]/gi, '')
}

function parseLogTs(raw: string): number | null {
  // Paper: "[12:34:56] [Server thread/INFO]: ..."
  // Spigot: "[12:34:56 INFO]: ..."
  const m = raw.match(/^\[(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const d = new Date()
  d.setHours(+m[1], +m[2], +m[3], 0)
  // If parsed time is in the future (just past midnight), assume it's from yesterday
  if (d.getTime() > Date.now() + 60_000) d.setDate(d.getDate() - 1)
  return d.getTime()
}

export function LogProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<string[]>([])
  const [tsLogs, setTsLogs] = useState<TimestampedLog[]>([])
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<ConsoleSocket | null>(null)

  useEffect(() => {
    const socket = new ConsoleSocket()
    socketRef.current = socket

    const unsubLog = socket.onLog((raw) => {
      const line = stripMinecraft(raw)
      const ts = parseLogTs(raw) ?? Date.now()
      setLines(prev => {
        const next = [...prev, line]
        return next.length > 5000 ? next.slice(-5000) : next
      })
      setTsLogs(prev => {
        const next = [...prev, { ts, line }]
        return next.length > 2000 ? next.slice(-2000) : next
      })
    })
    const unsubConn = socket.onConnected(() => setConnected(true))
    const unsubDisc = socket.onDisconnected(() => setConnected(false))

    socket.connect()

    return () => {
      unsubLog()
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
    return tsLogs.filter(l => l.ts >= from && l.ts <= to)
  }, [tsLogs])

  return (
    <LogContext.Provider value={{ lines, tsLogs, connected, send, tabComplete, getLogsAround }}>
      {children}
    </LogContext.Provider>
  )
}

export function useLogs() {
  return useContext(LogContext)
}
