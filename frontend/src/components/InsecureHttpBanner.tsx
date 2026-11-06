import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconX } from '../Icons'

export default function InsecureHttpBanner() {
  const { t } = useTranslation('auth')
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('teletype-insecure-http-dismissed') === 'true')

  if (window.location.protocol !== 'http:') return null
  if (dismissed) return null

  const dismiss = () => {
    sessionStorage.setItem('teletype-insecure-http-dismissed', 'true')
    setDismissed(true)
  }

  return (
    <div className="insecure-http-banner" role="alert">
      <div className="insecure-http-banner-copy">
        <strong>{t('insecureHttp.title')}</strong>
        <span>{t('insecureHttp.body')}</span>
      </div>
      <button className="insecure-http-dismiss" type="button" aria-label={t('insecureHttp.dismiss')} onClick={dismiss}>
        <IconX size={14} />
      </button>
    </div>
  )
}
