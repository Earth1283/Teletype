export interface ThemeConfig {
  id: string
  name: string
  base: 'dark' | 'light'
  bg: string      // for picker preview
  accent: string  // for picker preview
}

export const THEMES: ThemeConfig[] = [
  { id: 'void-amber',  name: 'Void',        base: 'dark',  bg: '#09090b', accent: '#f59e0b' },
  { id: 'void-blue',   name: 'Ocean',       base: 'dark',  bg: '#09090b', accent: '#60a5fa' },
  { id: 'void-green',  name: 'Matrix',      base: 'dark',  bg: '#09090b', accent: '#4ade80' },
  { id: 'void-rose',   name: 'Rose',        base: 'dark',  bg: '#09090b', accent: '#fb7185' },
  { id: 'void-purple', name: 'Neon',        base: 'dark',  bg: '#09090b', accent: '#a78bfa' },
  { id: 'slate-amber', name: 'Slate',       base: 'dark',  bg: '#0d1117', accent: '#f59e0b' },
  { id: 'light-amber', name: 'Light',       base: 'light', bg: '#fafafa', accent: '#d97706' },
  { id: 'light-blue',  name: 'Light Ocean', base: 'light', bg: '#fafafa', accent: '#2563eb' },
]

export const DEFAULT_THEME_ID = 'void-amber'

export function getTheme(id: string): ThemeConfig {
  return THEMES.find(t => t.id === id) ?? THEMES[0]
}
