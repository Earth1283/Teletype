import i18n from './i18n'

// `label` is a live getter (not a resolved string) so every read reflects the
// current i18next language, even though this array is built once at module load.
export const CONTEXT_WHEEL_ACTIONS = [
  { id: 'palette', get label() { return i18n.t('contextMenu:actionPalette') } },
  { id: 'glance', get label() { return i18n.t('contextMenu:actionGlance') } },
  { id: 'console', get label() { return i18n.t('contextMenu:actionConsole') } },
  { id: 'players', get label() { return i18n.t('contextMenu:actionPlayers') } },
  { id: 'stats', get label() { return i18n.t('contextMenu:actionStats') } },
  { id: 'files', get label() { return i18n.t('contextMenu:actionFiles') } },
  { id: 'actions', get label() { return i18n.t('contextMenu:actionActions') } },
  { id: 'audit', get label() { return i18n.t('contextMenu:actionAudit') } },
  { id: 'network', get label() { return i18n.t('contextMenu:actionNetwork') } },
  { id: 'settings', get label() { return i18n.t('contextMenu:actionSettings') } },
  { id: 'quick-actions', get label() { return i18n.t('contextMenu:actionQuickActions') } },
]
