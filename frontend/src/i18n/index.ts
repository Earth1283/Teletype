import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { Language } from '../SettingsContext'

// Every locale/namespace JSON is bundled at build time — no runtime fetch,
// so the UI never flashes untranslated keys while a request is in flight.
const modules = import.meta.glob('../locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, string> }
>

const LOCALE_PATH_RE = /\.\.\/locales\/([^/]+)\/([^/]+)\.json$/

type ResourceTree = Record<string, Record<string, Record<string, string>>>

const resources: ResourceTree = {}
const namespaces = new Set<string>()

for (const path in modules) {
  const match = path.match(LOCALE_PATH_RE)
  if (!match) continue
  const [, lng, ns] = match
  resources[lng] ??= {}
  resources[lng][ns] = modules[path].default
  namespaces.add(ns)
}

function initialLanguage(): Language {
  try {
    const raw = localStorage.getItem('teletype-settings-v1')
    const stored = raw ? JSON.parse(raw)?.language : undefined
    if (stored && resources[stored]) return stored
  } catch {
    // fall through to browser detection below
  }
  const primary = (navigator.language || 'en').split('-')[0].toLowerCase()
  return (resources[primary] ? primary : 'en') as Language
}

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage(),
    fallbackLng: 'en',
    ns: Array.from(namespaces),
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  })

export default i18n
