export default function InsecureHttpBanner() {
  if (window.location.protocol !== 'http:') return null

  return (
    <div className="insecure-http-banner" role="alert">
      <strong>HTTP is not safe.</strong>
      <span>
        This Teletype session is not encrypted. People between your browser and host can read or change traffic.
      </span>
    </div>
  )
}
