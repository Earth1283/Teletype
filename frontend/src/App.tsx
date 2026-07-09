import { useCallback, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TOKEN_KEY } from './api/client'
import { LogProvider } from './LogContext'
import { ContextMenuProvider } from './ContextMenuProvider'
import { SettingsProvider, useSettings } from './SettingsContext'
import { ToastProvider } from './ToastContext'
import AuthSetup from './components/AuthSetup'
import InsecureHttpBanner from './components/InsecureHttpBanner'
import { ShellKernel, useShell } from './shell/ShellKernel'
import { DefaultShell } from './shell/DefaultShell'
import MacShell from './shell/MacShell'
import AppleShell from './shell/AppleShell'

/* Stamps data-theme / data-mode / data-density on <html>. Mode "system"
   resolves via matchMedia and tracks OS changes live. Renders nothing. */
function AppearanceApplier() {
  const { settings } = useSettings()
  const { mode, theme, density } = settings.appearance

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.density = density

    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      root.dataset.mode = mode === 'system' ? (mq.matches ? 'light' : 'dark') : mode
    }
    apply()
    if (mode === 'system') {
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [mode, theme, density])

  return null
}

function MainApp({ onLogout }: { onLogout: () => void }) {
  const { settings } = useSettings()
  const { isPhoneViewport } = useShell()

  if (settings.fun && !isPhoneViewport) return <MacShell onLogout={onLogout} />
  if (settings.appleify) return <AppleShell onLogout={onLogout} />
  return <DefaultShell onLogout={onLogout} />
}

export default function App() {
  const [qc] = useState(() => new QueryClient())
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(TOKEN_KEY))

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    qc.clear()
    setAuthed(false)
  }, [qc])

  return (
    <QueryClientProvider client={qc}>
      <SettingsProvider>
        <LogProvider>
          <ContextMenuProvider>
            <ToastProvider>
              <AppearanceApplier />
              <InsecureHttpBanner />
              {authed ? (
                <ShellKernel>
                  <MainApp onLogout={handleLogout} />
                </ShellKernel>
              ) : (
                <AuthSetup onAuth={() => setAuthed(true)} />
              )}
            </ToastProvider>
          </ContextMenuProvider>
        </LogProvider>
      </SettingsProvider>
    </QueryClientProvider>
  )
}
