import { createContext, useCallback, useContext, useState } from 'react'

export interface TeletypeSettings {
  greyBeardMode: boolean

  glance: {
    anomalyThresholdTps: number
    anomalyThresholdTick: number
    anomalyThresholdMem: number
    logCorrelation: boolean
    logCorrelationWindowMs: number
    showBifurcation: boolean
    showLogPanel: boolean
    showChartTps: boolean
    showChartTick: boolean
    showChartMem: boolean
    refreshIntervalMs: number
    statusBadgePulse: boolean
  }

  console: {
    fontSize: number
    displayLines: number
    wordWrap: boolean
    showTimestamps: boolean
  }

  palette: {
    enabled: boolean
  }
}

export const DEFAULT_SETTINGS: TeletypeSettings = {
  greyBeardMode: false,
  glance: {
    anomalyThresholdTps: 2.0,
    anomalyThresholdTick: 2.0,
    anomalyThresholdMem: 2.5,
    logCorrelation: true,
    logCorrelationWindowMs: 5000,
    showBifurcation: true,
    showLogPanel: true,
    showChartTps: true,
    showChartTick: true,
    showChartMem: true,
    refreshIntervalMs: 2000,
    statusBadgePulse: true,
  },
  console: {
    fontSize: 12.5,
    displayLines: 5000,
    wordWrap: true,
    showTimestamps: true,
  },
  palette: {
    enabled: true,
  },
}

const STORAGE_KEY = 'teletype-settings-v1'

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

function deepMerge<T extends object>(defaults: T, overrides: DeepPartial<T>): T {
  const result = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const d = defaults[key]
    const o = (overrides as any)[key]
    if (o !== undefined) {
      if (typeof d === 'object' && d !== null && typeof o === 'object' && o !== null) {
        result[key] = deepMerge(d as any, o) as T[keyof T]
      } else {
        result[key] = o as T[keyof T]
      }
    }
  }
  return result
}

function load(): TeletypeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return deepMerge(DEFAULT_SETTINGS, JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

interface SettingsContextValue {
  settings: TeletypeSettings
  update: (patch: DeepPartial<TeletypeSettings>) => void
  reset: () => void
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  reset: () => {},
})

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<TeletypeSettings>(load)

  const update = useCallback((patch: DeepPartial<TeletypeSettings>) => {
    setSettings(prev => {
      const next = deepMerge(prev, patch)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setSettings(DEFAULT_SETTINGS)
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
