// navigator.clipboard is undefined on insecure (plain HTTP, non-localhost) origins,
// which is Teletype's default deployment. Fall back to the execCommand trick there.
export async function writeClipboard(text: string): Promise<boolean> {
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
