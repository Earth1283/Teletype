import type { Language } from './SettingsContext'

// Languages the UI ships translations for. Kept out of SettingsContext.tsx so
// that file only exports components/hooks (react-refresh friendly).
export const SUPPORTED_LANGUAGES: Language[] = ['en', 'es', 'fr', 'zh']
