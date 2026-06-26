import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { TOKEN_KEY } from '../api/client'
import { IconCheck, IconCopy, TeletypeLogo } from '../Icons'

interface Props { onAuth: () => void }

export default function AuthSetup({ onAuth }: Props) {
  const [uuid, setUuid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [displayedUuid, setDisplayedUuid] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const polling = useRef(false)
  const animFrame = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

    return () => {
      polling.current = false
      if (animFrame.current) clearTimeout(animFrame.current)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [onAuth])

  const cmd = `tty verify ${uuid ?? '...'}`

  async function writeClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  }

  async function copyCommand() {
    if (!uuid) return
    try {
      const ok = await writeClipboard(cmd)
      if (!ok) throw new Error('copy failed')
      setCopied(true)
      setCopyFailed(false)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
      setCopyFailed(true)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopyFailed(false), 2200)
    }
  }

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

            <button
              className={`tty-display tty-copy${copied ? ' copied' : ''}${copyFailed ? ' failed' : ''}`}
              type="button"
              onClick={copyCommand}
              disabled={!uuid}
              title={uuid ? 'Copy auth command' : 'Waiting for challenge'}
            >
              <div className="tty-command-line">
                <span className="tty-prompt">server&gt;</span>
                <span className="tty-cmd">{cmd}</span>
                <span className="tty-copy-state">
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  {copied ? 'Copied' : copyFailed ? 'Copy failed' : 'Copy'}
                </span>
              </div>
              {uuid && displayedUuid.length === uuid.length && (
                <div className="tty-expiry">
                  Challenge expires in 5 minutes
                </div>
              )}
            </button>

            {uuid && (
              <div className="auth-challenge">
                <div className="auth-challenge-label">Challenge UUID</div>
                <div className="auth-challenge-value">
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
