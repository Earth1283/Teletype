import { createContext, useCallback, useContext, useState } from 'react'
import { DEFAULT_THEME_ID } from './themes'

export interface TeletypeSettings {
  theme: string
  greyBeardMode: boolean
  fun: boolean
  appleify: boolean

  glance: {
    anomalyThresholdTps: number
    anomalyThresholdTick: number
    anomalyThresholdMem: number
    anomalyThresholdCpu: number
    logCorrelation: boolean
    logCorrelationWindowMs: number
    showBifurcation: boolean
    showLogPanel: boolean
    showChartTps: boolean
    showChartTick: boolean
    showChartMem: boolean
    showChartCpu: boolean
    refreshIntervalMs: number
    statusBadgePulse: boolean
    // Gauge zone thresholds
    tpsYellowBelow: number
    tpsOrangeBelow: number
    tpsRedBelow: number
    msptYellowAbove: number
    msptOrangeAbove: number
    msptRedAbove: number
    memYellowAbove: number
    memOrangeAbove: number
    memRedAbove: number
    cpuYellowAbove: number
    cpuOrangeAbove: number
    cpuRedAbove: number
    diskYellowAbove: number
    diskOrangeAbove: number
    diskRedAbove: number
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

  contextWheel: {
    releaseToSelect: boolean
    actions: string[]
  }

  stats: {
    defaultRange: '1h' | '6h' | '24h' | '7d'
    showChartTps: boolean
    showChartMspt: boolean
    showChartPlayers: boolean
    showChartEntities: boolean
    showChartChunks: boolean
    showChartPing: boolean
    showOverlayPerf: boolean
    showOverlayWorld: boolean
    overlayAnomalyMarkers: boolean
    overlayAnomalyThreshold: number
    showCorrelation: boolean
  }

  editor: {
    fontSize: number
    wordWrap: boolean
    lineNumbers: boolean
    smoothCaret: boolean
    suggestions: boolean
    renderWhitespace: boolean
    validate: boolean
  }
}

export const DEFAULT_SETTINGS: TeletypeSettings = {
  theme: DEFAULT_THEME_ID,
  greyBeardMode: false,
  fun: false,
  appleify: false,
  glance: {
    anomalyThresholdTps: 2.0,
    anomalyThresholdTick: 2.0,
    anomalyThresholdMem: 2.5,
    anomalyThresholdCpu: 2.0,
    logCorrelation: true,
    logCorrelationWindowMs: 5000,
    showBifurcation: true,
    showLogPanel: true,
    showChartTps: true,
    showChartTick: true,
    showChartMem: true,
    showChartCpu: true,
    refreshIntervalMs: 2000,
    statusBadgePulse: true,
    tpsYellowBelow: 19,
    tpsOrangeBelow: 15,
    tpsRedBelow: 10,
    msptYellowAbove: 35,
    msptOrangeAbove: 45,
    msptRedAbove: 55,
    memYellowAbove: 65,
    memOrangeAbove: 80,
    memRedAbove: 90,
    cpuYellowAbove: 50,
    cpuOrangeAbove: 70,
    cpuRedAbove: 85,
    diskYellowAbove: 75,
    diskOrangeAbove: 85,
    diskRedAbove: 92,
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
  contextWheel: {
    releaseToSelect: true,
    actions: ['palette', 'glance', 'console', 'files', 'actions', 'quick-actions'],
  },

  stats: {
    defaultRange: '1h',
    showChartTps: true,
    showChartMspt: true,
    showChartPlayers: true,
    showChartEntities: true,
    showChartChunks: true,
    showChartPing: true,
    showOverlayPerf: true,
    showOverlayWorld: false,
    overlayAnomalyMarkers: true,
    overlayAnomalyThreshold: 2.0,
    showCorrelation: true,
  },

  editor: {
    fontSize: 13,
    wordWrap: true,
    lineNumbers: true,
    smoothCaret: true,
    suggestions: true,
    renderWhitespace: false,
    validate: true,
  },
}

const STORAGE_KEY = 'teletype-settings-v1'

type DeepPartial<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepMerge<T>(defaults: T, overrides: DeepPartial<T> | unknown): T {
  if (Array.isArray(defaults)) {
    return Array.isArray(overrides) ? overrides as T : defaults
  }

  if (!isPlainObject(defaults)) {
    return overrides !== undefined && overrides !== null ? overrides as T : defaults
  }

  if (!isPlainObject(overrides)) {
    return defaults
  }

  const result = { ...defaults } as Record<string, unknown>
  for (const key of Object.keys(defaults)) {
    result[key] = deepMerge(defaults[key], overrides[key])
  }
  return result as T
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
