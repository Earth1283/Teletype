import {
  IconTerminal, IconUsers, IconCpu, IconFolder, IconActivity, IconZap,
  IconSettings, IconList, IconNetwork, IconFlightRecorder,
} from '../Icons'
import i18n from '../i18n'

export type Tab =
  | 'glance' | 'console' | 'players' | 'stats' | 'files' | 'actions'
  | 'audit' | 'network' | 'profiling' | 'settings'

export interface TabDef {
  id: Tab
  label: string
  Icon: React.FC<{ size?: number }>
}

/**
 * Single canonical tab list — the default shell and both alt shells render from this.
 * `label` is a live getter (not a resolved string) so every read reflects the
 * current i18next language, even though this array is built once at module load.
 */
export const TABS: TabDef[] = [
  { id: 'glance',    get label() { return i18n.t('shellKernel:tabGlance') },    Icon: IconActivity       },
  { id: 'console',   get label() { return i18n.t('shellKernel:tabConsole') },   Icon: IconTerminal       },
  { id: 'players',   get label() { return i18n.t('shellKernel:tabPlayers') },   Icon: IconUsers          },
  { id: 'stats',     get label() { return i18n.t('shellKernel:tabStats') },     Icon: IconCpu            },
  { id: 'files',     get label() { return i18n.t('shellKernel:tabFiles') },     Icon: IconFolder         },
  { id: 'actions',   get label() { return i18n.t('shellKernel:tabActions') },   Icon: IconZap            },
  { id: 'audit',     get label() { return i18n.t('shellKernel:tabAudit') },     Icon: IconList           },
  { id: 'network',   get label() { return i18n.t('shellKernel:tabNetwork') },   Icon: IconNetwork        },
  { id: 'profiling', get label() { return i18n.t('shellKernel:tabProfiling') }, Icon: IconFlightRecorder },
  { id: 'settings',  get label() { return i18n.t('shellKernel:tabSettings') },  Icon: IconSettings       },
]

export const PRIMARY_MOBILE_TABS: Tab[] = ['glance', 'console', 'players', 'actions']
export const SECONDARY_MOBILE_TABS: Tab[] = ['stats', 'files', 'audit', 'network', 'profiling', 'settings']

export function tabDef(id: Tab): TabDef {
  return TABS.find(t => t.id === id)!
}
