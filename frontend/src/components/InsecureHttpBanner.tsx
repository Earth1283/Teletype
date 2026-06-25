import { useState } from 'react'
import { IconX } from '../Icons'

export default function InsecureHttpBanner() {
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
        <strong>HTTP is not safe.</strong>
        <span>
          This Teletype session is not encrypted. People between your browser and host can read or change traffic.
        </span>
      </div>
      <button className="insecure-http-dismiss" type="button" aria-label="Dismiss HTTP warning" onClick={dismiss}>
        <IconX size={14} />
      </button>
    </div>
  )
}
