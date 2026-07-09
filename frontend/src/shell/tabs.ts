import {
  IconTerminal, IconUsers, IconCpu, IconFolder, IconActivity, IconZap,
  IconSettings, IconList, IconNetwork, IconFlightRecorder,
} from '../Icons'

export type Tab =
  | 'glance' | 'console' | 'players' | 'stats' | 'files' | 'actions'
  | 'audit' | 'network' | 'profiling' | 'settings'

export interface TabDef {
  id: Tab
  label: string
  Icon: React.FC<{ size?: number }>
}

/** Single canonical tab list — the default shell and both alt shells render from this. */
export const TABS: TabDef[] = [
  { id: 'glance',    label: 'Glance',    Icon: IconActivity       },
  { id: 'console',   label: 'Console',   Icon: IconTerminal       },
  { id: 'players',   label: 'Players',   Icon: IconUsers          },
  { id: 'stats',     label: 'Stats',     Icon: IconCpu            },
  { id: 'files',     label: 'Files',     Icon: IconFolder         },
  { id: 'actions',   label: 'Actions',   Icon: IconZap            },
  { id: 'audit',     label: 'Audit',     Icon: IconList           },
  { id: 'network',   label: 'Network',   Icon: IconNetwork        },
  { id: 'profiling', label: 'Profiling', Icon: IconFlightRecorder },
  { id: 'settings',  label: 'Settings',  Icon: IconSettings       },
]

export const PRIMARY_MOBILE_TABS: Tab[] = ['glance', 'console', 'players', 'actions']
export const SECONDARY_MOBILE_TABS: Tab[] = ['stats', 'files', 'audit', 'network', 'profiling', 'settings']

export function tabDef(id: Tab): TabDef {
  return TABS.find(t => t.id === id)!
}
