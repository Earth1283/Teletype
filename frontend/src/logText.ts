const ESC = String.fromCharCode(27)
const ANSI_SGR = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')

export function stripAnsi(line: string): string {
  return line.replace(ANSI_SGR, '')
}

export function stripLogPrefix(line: string): string {
  return line.replace(/^(?:\[[^\]]*\]\s*)+:?\s*/, '')
}
