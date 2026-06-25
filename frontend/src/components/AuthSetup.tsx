import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { TOKEN_KEY } from '../api/client'
import { TeletypeLogo } from '../Icons'

interface Props { onAuth: () => void }

export default function AuthSetup({ onAuth }: Props) {
  const [uuid, setUuid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [displayedUuid, setDisplayedUuid] = useState('')
  const polling = useRef(false)
  const animFrame = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function poll(id: string) {
      while (polling.current) {
        try {
          const res = await axios.get(`/api/auth/poll/${id}`)
          if (res.data.status === 'verified' && res.data.token) {
            localStorage.setItem(TOKEN_KEY, res.data.token)
            polling.current = false
            onAuth()
            return
          }
        } catch (err) {
          if (axios.isAxiosError(err)) {
            if (err.response?.status === 404) {
              polling.current = false
              setError('Verification challenge expired or was already used. Refresh to create a new challenge.')
              return
            }
            if (err.response?.status === 429) {
              setError('Too many auth requests. Waiting before trying again.')
            } else if (!err.response) {
              setError(authRequestError(err))
            }
          }
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    axios.post('/api/auth/challenge')
      .then((res) => {
        const id: string = res.data.uuid
        setUuid(id)
        polling.current = true
        poll(id)
        // Typewriter reveal of the UUID
        let i = 0
        const reveal = () => {
          i++
          setDisplayedUuid(id.slice(0, i))
          if (i < id.length) animFrame.current = setTimeout(reveal, 28)
        }
        animFrame.current = setTimeout(reveal, 200)
      })
      .catch((err) => setError(authRequestError(err)))

    return () => { polling.current = false; if (animFrame.current) clearTimeout(animFrame.current) }
  }, [onAuth])

  const cmd = `tty verify ${uuid ?? '...'}`

  return (
    <div className="auth-root">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <TeletypeLogo size={26} />
          <div className="auth-wordmark">Teletype</div>
        </div>
        <div className="auth-sub">Remote server console</div>

        {error ? (
          <div className="auth-error">{error}</div>
        ) : (
          <>
            <div className="auth-instruction">
              Run this command in your Minecraft server console to authenticate:
            </div>

            <div className="tty-display">
              <div><span className="tty-prompt">server&gt;</span> <span className="tty-cmd">{cmd}</span></div>
              {uuid && displayedUuid.length === uuid.length && (
                <div style={{ marginTop: 8, color: '#52525e', fontSize: 11 }}>
                  — challenge expires in 5 minutes
                </div>
              )}
            </div>

            {uuid && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mist)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Challenge UUID</div>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 13.5, color: 'var(--amber)',
                  background: 'var(--elevated)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)', padding: '8px 12px',
                  letterSpacing: '0.04em',
                }}>
                  {displayedUuid}
                  {displayedUuid.length < (uuid?.length ?? 0) && <span className="tty-cursor" />}
                </div>
              </div>
            )}

            <div className="auth-waiting">
              <div className="auth-spinner" />
              Waiting for console verification…
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function authRequestError(err: unknown) {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 429) return 'Too many auth requests. Wait a moment and refresh.'
    if (err.response) return `Authentication request failed (${err.response.status}). Refresh and try again.`
  }
  return 'Cannot reach Teletype server. Is the plugin running?'
}
