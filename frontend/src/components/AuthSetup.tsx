import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { TOKEN_KEY } from '../api/client'
import { IconCheck, IconCopy, TeletypeLogo } from '../Icons'

interface Props { onAuth: () => void }

export default function AuthSetup({ onAuth }: Props) {
  const { t } = useTranslation(['auth', 'common'])
  const [uuid, setUuid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [displayedUuid, setDisplayedUuid] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [verified, setVerified] = useState(false)
  const polling = useRef(false)
  const animFrame = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function poll(id: string) {
      while (polling.current) {
        try {
          const res = await axios.get(`/api/auth/poll/${id}`)
          if (res.data.status === 'verified' && res.data.token) {
            localStorage.setItem(TOKEN_KEY, res.data.token)
            polling.current = false
            setVerified(true)
            handoffTimer.current = setTimeout(onAuth, handoffDelayMs())
            return
          }
        } catch (err) {
          if (axios.isAxiosError(err)) {
            if (err.response?.status === 404) {
              polling.current = false
              setError(t('auth:setup.errorChallengeExpired'))
              return
            }
            if (err.response?.status === 429) {
              setError(t('auth:setup.errorTooManyRequestsPolling'))
            } else if (!err.response) {
              setError(authRequestError(err, t))
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
      .catch((err) => setError(authRequestError(err, t)))

    return () => {
      polling.current = false
      if (animFrame.current) clearTimeout(animFrame.current)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      if (handoffTimer.current) clearTimeout(handoffTimer.current)
    }
    // `t` deliberately omitted: a language switch must not restart the auth handshake.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className={`auth-card${verified ? ' verified' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <TeletypeLogo size={26} />
          <div className="auth-wordmark">Teletype</div>
        </div>
        <div className="auth-sub">{t('auth:setup.subtitle')}</div>

        {error ? (
          <div className="auth-error">{error}</div>
        ) : (
          <>
            <div className="auth-instruction">
              {t('auth:setup.instruction')}
            </div>

            <button
              className={`tty-display tty-copy${copied ? ' copied' : ''}${copyFailed ? ' failed' : ''}`}
              type="button"
              onClick={copyCommand}
              disabled={!uuid}
              title={uuid ? t('auth:setup.copyAuthCommandTitle') : t('auth:setup.waitingForChallengeTitle')}
            >
              <div className="tty-command-line">
                <span className="tty-prompt">server&gt;</span>
                <span className="tty-cmd">{cmd}</span>
                <span className="tty-copy-state">
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  {copied ? t('common:copied') : copyFailed ? t('auth:setup.copyFailed') : t('common:copy')}
                </span>
              </div>
              {uuid && displayedUuid.length === uuid.length && (
                <div className="tty-expiry">
                  {t('auth:setup.challengeExpiry')}
                </div>
              )}
            </button>

            {uuid && (
              <div className="auth-challenge">
                <div className="auth-challenge-label">{t('auth:setup.challengeUuidLabel')}</div>
                <div className="auth-challenge-value">
                  {displayedUuid}
                  {displayedUuid.length < (uuid?.length ?? 0) && <span className="tty-cursor" />}
                </div>
              </div>
            )}

            {verified ? (
              <div className="auth-waiting auth-verified">
                <IconCheck size={14} />
                {t('auth:setup.verified')}
              </div>
            ) : (
              <div className="auth-waiting">
                <div className="auth-spinner" />
                {t('auth:setup.waitingForVerification')}
              </div>
            )}

            <div className="auth-hint">
              <Trans i18nKey="auth:setup.hint" components={{ code: <code /> }} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function handoffDelayMs() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 750
}

function authRequestError(err: unknown, t: TFunction) {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 429) return t('auth:setup.errorTooManyRequestsInitial')
    if (err.response) return t('auth:setup.errorRequestFailed', { status: err.response.status })
  }
  return t('auth:setup.errorUnreachable')
}
