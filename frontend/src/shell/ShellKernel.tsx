import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useLogs } from '../LogContext'
import { useContextMenu, type ContextMenuItem } from '../ContextMenu'
import { useSettings } from '../SettingsContext'
import { useToast } from '../ToastContext'
import { CONTEXT_WHEEL_ACTIONS } from '../contextWheelActions'
import type { Snippet } from '../components/actions/actionTypes'
import { TABS, type Tab } from './tabs'

const PHONE_VIEWPORT_QUERY = '(max-width: 640px)'
const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)'
const MAX_PHONE_SCREEN_SIDE = 500
const MAX_PHONE_SCREEN_LONG_SIDE = 1000

function hasTouchInput() {
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window
}

function hasMobileUserAgentData() {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  return nav.userAgentData?.mobile === true
}

function hasPhoneUserAgent() {
  const ua = navigator.userAgent
  return /\b(iPhone|iPod)\b/i.test(ua)
    || (/\bAndroid\b/i.test(ua) && /\bMobile\b/i.test(ua))
    || /\b(IEMobile|Windows Phone|BlackBerry|BB10|Opera Mini)\b/i.test(ua)
}

function getIsPhoneViewport() {
  if (hasPhoneUserAgent() || hasMobileUserAgentData()) return true
  if (window.matchMedia(PHONE_VIEWPORT_QUERY).matches) return true

  const shortSide = Math.min(window.screen.width, window.screen.height)
  const longSide = Math.max(window.screen.width, window.screen.height)
  // Guard: zero means unreported dimensions (some headless/embedded envs) — not a phone
  if (shortSide <= 0) return false
  const hasPhoneSizedScreen = shortSide <= MAX_PHONE_SCREEN_SIDE && longSide <= MAX_PHONE_SCREEN_LONG_SIDE
  return hasTouchInput()
    && window.matchMedia(COARSE_POINTER_QUERY).matches
    && hasPhoneSizedScreen
}

export function useIsPhoneViewport() {
  const [isPhoneViewport, setIsPhoneViewport] = useState(getIsPhoneViewport)

  useEffect(() => {
    const phoneMq = window.matchMedia(PHONE_VIEWPORT_QUERY)
    const pointerMq = window.matchMedia(COARSE_POINTER_QUERY)
    const update = () => setIsPhoneViewport(getIsPhoneViewport())

    update()
    phoneMq.addEventListener('change', update)
    pointerMq.addEventListener('change', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)

    return () => {
      phoneMq.removeEventListener('change', update)
      pointerMq.removeEventListener('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return isPhoneViewport
}

interface ShellContextValue {
  tab: Tab
  setTab: (tab: Tab) => void
  visitedTabs: Set<Tab>
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  openPalette: () => void
  helpOpen: boolean
  setHelpOpen: (open: boolean) => void
  mobileMoreOpen: boolean
  setMobileMoreOpen: (open: boolean) => void
  forceMobile: boolean
  setForceMobile: (v: boolean) => void
  isPhoneViewport: boolean
  connected: boolean
  tpsHistory: number[]
  onLogoTap: () => void
}

const ShellContext = createContext<ShellContextValue | null>(null)

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell() must be used within <ShellKernel>')
  return ctx
}

/** Registers the radial context-wheel's fallback actions for the active tab. */
function ContextWheelBinding({ tab, onNavigate, onOpenPalette }: {
  tab: Tab
  onNavigate: (tab: Tab) => void
  onOpenPalette: () => void
}) {
  const { setFallbackContextMenu } = useContextMenu()
  const { settings } = useSettings()
  const { data: snippets = [] } = useQuery<Snippet[]>({
    queryKey: ['snippets'],
    queryFn: () => api.get('/actions/snippets').then(r => r.data),
    staleTime: 60_000,
  })

  const items = useMemo<ContextMenuItem[]>(() => {
    const selected = settings.contextWheel.actions.length > 0
      ? settings.contextWheel.actions
      : CONTEXT_WHEEL_ACTIONS.map(a => a.id)
    const quickActions = snippets.filter(s => s.categoryId === 'quick-actions')

    return selected.flatMap<ContextMenuItem>(id => {
      if (id === 'palette') {
        return [{ label: 'Command Palette', shortcut: '⌘K', action: onOpenPalette }]
      }
      if (id === 'quick-actions') {
        return quickActions.map(snippet => ({
          label: snippet.name,
          action: () => {
            if (snippet.vars.length > 0) {
              onNavigate('actions')
            } else {
              api.post(`/actions/execute/${snippet.id}`, { vars: {} }).catch(() => {})
            }
          },
        }))
      }
      const tabDef = TABS.find(t => t.id === id)
      if (!tabDef) return []
      return [{
        label: `Open ${tabDef.label}`,
        disabled: tab === tabDef.id,
        action: () => onNavigate(tabDef.id),
      }]
    })
  }, [onNavigate, onOpenPalette, settings.contextWheel.actions, snippets, tab])

  useEffect(() => {
    setFallbackContextMenu(items)
    return () => setFallbackContextMenu([])
  }, [items, setFallbackContextMenu])

  return null
}

export function ShellKernel({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('glance')
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set<Tab>(['glance']))
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [forceMobile, setForceMobile] = useState(false)
  const [tpsHistory, setTpsHistory] = useState<number[]>([])
  const { settings, update } = useSettings()
  const { connected } = useLogs()
  const isPhoneViewport = useIsPhoneViewport()
  const toast = useToast()

  const { data: glanceCurrent } = useQuery<{ tps1: number }>({
    queryKey: ['glance-current'],
    queryFn: () => api.get('/glance/current').then(r => r.data),
    refetchInterval: 5000,
  })
  useEffect(() => {
    if (glanceCurrent?.tps1 != null) {
      setTpsHistory(h => [...h.slice(-19), glanceCurrent.tps1])
    }
  }, [glanceCurrent])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (settings.palette.enabled) setPaletteOpen(p => !p)
        return
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
        e.preventDefault()
        setHelpOpen(p => !p)
        return
      }
      // Alt+1..9,0 jumps to a tab (Alt avoids the browser's own ⌘/Ctrl+digit
      // tab switching; e.code so macOS Option special characters don't matter)
      if (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit\d$/.test(e.code)) {
        const n = Number(e.code.slice(5))
        const def = TABS[n === 0 ? 9 : n - 1]
        if (def) {
          e.preventDefault()
          setTab(def.id)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [settings.palette.enabled])

  useEffect(() => {
    if (!mobileMoreOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMoreOpen(false)
    }
    document.body.classList.add('mobile-nav-open')
    window.addEventListener('keydown', handler)
    return () => {
      document.body.classList.remove('mobile-nav-open')
      window.removeEventListener('keydown', handler)
    }
  }, [mobileMoreOpen])

  useEffect(() => {
    setVisitedTabs(prev => prev.has(tab) ? prev : new Set([...prev, tab]))
  }, [tab])

  useEffect(() => {
    if (isPhoneViewport && settings.fun) update({ fun: false })
  }, [isPhoneViewport, settings.fun, update])

  const tapCountRef = useRef(0)
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onLogoTap = useCallback(() => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
    tapCountRef.current += 1
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0
      update({ appleify: true })
      toast.success('Appleify activated')
    } else {
      tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0 }, 2000)
    }
  }, [update, toast])

  const openPalette = useCallback(() => {
    setMobileMoreOpen(false)
    setPaletteOpen(true)
  }, [])

  const value = useMemo<ShellContextValue>(() => ({
    tab, setTab, visitedTabs,
    paletteOpen, setPaletteOpen, openPalette,
    helpOpen, setHelpOpen,
    mobileMoreOpen, setMobileMoreOpen,
    forceMobile, setForceMobile,
    isPhoneViewport, connected, tpsHistory, onLogoTap,
  }), [tab, visitedTabs, paletteOpen, openPalette, helpOpen, mobileMoreOpen,
      forceMobile, isPhoneViewport, connected, tpsHistory, onLogoTap])

  return (
    <ShellContext.Provider value={value}>
      <ContextWheelBinding tab={tab} onNavigate={setTab} onOpenPalette={openPalette} />
      {children}
    </ShellContext.Provider>
  )
}
