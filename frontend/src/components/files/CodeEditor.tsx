import { useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { jsonDefaults, monaco } from './monacoSetup'
import { useSettings } from '../../SettingsContext'

const EXT_LANG: Record<string, string> = {
  js: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
  json: 'json', yml: 'yaml', yaml: 'yaml', xml: 'xml', html: 'html',
  css: 'css', scss: 'scss', sh: 'shell', bash: 'shell',
  py: 'python', kt: 'kotlin', java: 'java', rs: 'rust', go: 'go',
  md: 'markdown', txt: 'plaintext', properties: 'ini',
  conf: 'ini', cfg: 'ini', toml: 'ini', log: 'plaintext',
}

const THEME = 'teletype-ui'

function languageFor(path: string) {
  return EXT_LANG[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'
}

function applyTheme() {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  const isLight = (document.documentElement.dataset.mode
    ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'light'
  const accent = v('--accent', isLight ? '#2563EB' : '#4C82F7')
  monaco.editor.defineTheme(THEME, {
    base: isLight ? 'vs' : 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': v('--surface', isLight ? '#FFFFFF' : '#131316'),
      'editor.foreground': v('--text-primary', isLight ? '#1B1F26' : '#EDEDEF'),
      'editorLineNumber.foreground': v('--text-muted', '#5C5C64'),
      'editorLineNumber.activeForeground': v('--text-secondary', '#9A9AA2'),
      'editor.selectionBackground': accent + '33',
      'editorCursor.foreground': accent,
      'editor.lineHighlightBackground': v('--elevated', '#1B1B1F'),
      'editorIndentGuide.background': v('--border', '#26262B'),
      'editorIndentGuide.activeBackground': v('--border-hi', '#3A3A40'),
      'editorWidget.background': v('--elevated', '#1B1B1F'),
      'editorWidget.border': v('--border', '#26262B'),
      'editorSuggestWidget.background': v('--elevated', '#1B1B1F'),
      'editorSuggestWidget.border': v('--border', '#26262B'),
    },
  })
  monaco.editor.setTheme(THEME)
}

interface CodeEditorProps {
  path: string
  defaultValue: string
  onChange: (value: string) => void
}

export default function CodeEditor({ path, defaultValue, onChange }: CodeEditorProps) {
  const { settings } = useSettings()
  const { editor } = settings

  useEffect(applyTheme, [settings.appearance])

  useEffect(() => {
    jsonDefaults.setDiagnosticsOptions({ validate: editor.validate, allowComments: true })
  }, [editor.validate])

  const onOff = (enabled: boolean) => (enabled ? 'on' : 'off') as 'on' | 'off'

  return (
    <Editor
      key={path}
      height="100%"
      language={languageFor(path)}
      defaultValue={defaultValue}
      onChange={(v) => onChange(v ?? '')}
      theme={THEME}
      options={{
        fontSize: editor.fontSize,
        fontFamily: "'JetBrains Mono', monospace",
        minimap: { enabled: false },
        wordWrap: onOff(editor.wordWrap),
        lineHeight: 1.7,
        scrollBeyondLastLine: false,
        padding: { top: 12, bottom: 12 },
        cursorSmoothCaretAnimation: onOff(editor.smoothCaret),
        quickSuggestions: editor.suggestions,
        suggestOnTriggerCharacters: editor.suggestions,
        parameterHints: { enabled: editor.suggestions },
        lineNumbers: onOff(editor.lineNumbers),
        renderWhitespace: editor.renderWhitespace ? 'boundary' : 'none',
        bracketPairColorization: { enabled: true },
        automaticLayout: true,
      }}
    />
  )
}
