import { describe, expect, it } from 'vitest'
import { stripAnsi, stripLogPrefix } from '../logText'

describe('stripAnsi', () => {
  it('removes SGR colour codes', () => {
    expect(stripAnsi('\u001b[31mred\u001b[0m plain')).toBe('red plain')
  })
})

describe('stripLogPrefix', () => {
  it('drops bracketed time and thread prefixes', () => {
    expect(stripLogPrefix('[12:00:01] [Server thread/INFO]: Done (3.2s)!')).toBe('Done (3.2s)!')
  })

  it('leaves unprefixed lines alone', () => {
    expect(stripLogPrefix('hello')).toBe('hello')
  })
})
