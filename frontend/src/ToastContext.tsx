import { createContext, useCallback, useContext, useRef, useState } from 'react'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  msg: string
  exiting?: boolean
}

interface ToastAPI {
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const ToastCtx = createContext<ToastAPI>({ success: () => {}, error: () => {}, info: () => {} })

export function useToast(): ToastAPI {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(ts => ts.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 160)
  }, [])

  const add = useCallback((kind: ToastKind, msg: string) => {
    const id = ++counter.current
    setToasts(ts => [...ts.slice(-3), { id, kind, msg }])
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  const api: ToastAPI = {
    success: (msg) => add('success', msg),
    error:   (msg) => add('error', msg),
    info:    (msg) => add('info', msg),
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind}${t.exiting ? ' exiting' : ''}`}>
            <span className="toast-dot" aria-hidden="true" />
            <span className="toast-msg">{t.msg}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
