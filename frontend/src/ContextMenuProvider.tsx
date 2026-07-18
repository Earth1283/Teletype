import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ContextMenuContext,
  type ContextMenuItem,
  type ContextMenuState,
  type ContextMenuValue,
  type ContextWheelState,
} from './ContextMenu'
import { useSettings } from './SettingsContext'

function estimateHeight(items: ContextMenuItem[]) {
  return items.reduce((h, item) => {
    if ('type' in item && item.type === 'separator') return h + 9
    if ('type' in item && item.type === 'header') return h + 22
    return h + 28
  }, 8)
}

function actionableItems(items: ContextMenuItem[]) {
  return items.filter(item => !('type' in item) && !item.disabled && item.action).slice(0, 8)
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [wheel, setWheel] = useState<ContextWheelState | null>(null)
  const [fallbackItems, setFallbackContextMenu] = useState<ContextMenuItem[]>([])
  const fallbackRef = useRef<ContextMenuItem[]>([])
  const wheelRef = useRef<ContextWheelState | null>(null)
  const altRightGesture = useRef(false)
  const suppressNativeContextMenu = useRef(false)

  const closeContextMenu = useCallback(() => {
    setMenu(null)
    setWheel(null)
  }, [])

  const openMenuAt = useCallback((
    clientX: number,
    clientY: number,
    items: ContextMenuItem[],
    target?: ContextMenuState['target'],
  ) => {
    const width = 230
    const height = estimateHeight(items)
    const flipped = clientY + height > window.innerHeight - 8
    const x = Math.min(clientX, window.innerWidth - width - 8)
    const y = flipped ? Math.max(8, clientY - height) : clientY
    setMenu({ x: Math.max(8, x), y, items, target, flipped })
  }, [])

  const openWheelAt = useCallback((
    clientX: number,
    clientY: number,
    items: ContextMenuItem[],
    target?: ContextMenuState['target'],
  ) => {
    const wheelItems = actionableItems(items)
    if (wheelItems.length === 0) return
    const radius = 96
    const edge = radius + 68
    const x = Math.min(Math.max(clientX, edge), window.innerWidth - edge)
    const y = Math.min(Math.max(clientY, edge), window.innerHeight - edge)
    setWheel({ x, y, items: wheelItems, target, activeIndex: null })
    setMenu(null)
  }, [])

  const openContextMenu = useCallback<ContextMenuValue['openContextMenu']>((event, items, target) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.altKey) {
      openWheelAt(event.clientX, event.clientY, items, target)
      return
    }
    openMenuAt(event.clientX, event.clientY, items, target)
  }, [openMenuAt, openWheelAt])

  useEffect(() => {
    fallbackRef.current = fallbackItems
  }, [fallbackItems])

  useEffect(() => {
    wheelRef.current = wheel
  }, [wheel])

  useEffect(() => {
    const onContextMenu = (event: globalThis.MouseEvent) => {
      if (suppressNativeContextMenu.current) {
        suppressNativeContextMenu.current = false
        event.preventDefault()
        return
      }
      if (event.defaultPrevented) return
      if ((event.target as Element | null)?.closest?.('.mac-ctx')) return
      const items = fallbackRef.current
      if (items.length === 0) return
      event.preventDefault()
      if (event.altKey) {
        openWheelAt(event.clientX, event.clientY, items, { kind: 'panel' })
        return
      }
      openMenuAt(event.clientX, event.clientY, items, { kind: 'panel' })
    }
    document.addEventListener('contextmenu', onContextMenu)
    return () => document.removeEventListener('contextmenu', onContextMenu)
  }, [openMenuAt])

  useEffect(() => {
    const sectorForPointer = (event: globalThis.MouseEvent, current: ContextWheelState) => {
      const dx = event.clientX - current.x
      const dy = event.clientY - current.y
      if (Math.hypot(dx, dy) < 38) return null
      const count = current.items.length
      const sector = 360 / count
      const degreesFromTop = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360
      return Math.floor((degreesFromTop + sector / 2) / sector) % count
    }

    const onMouseDown = (event: globalThis.MouseEvent) => {
      if (event.button !== 2 || !event.altKey) return
      if (!settings.contextWheel.releaseToSelect) return
      if ((event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"], .mac-ctx, .ctx-wheel')) return
      altRightGesture.current = true
      event.preventDefault()
      ;(event.target as EventTarget).dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        altKey: true,
        button: 2,
        buttons: 2,
      }))
      suppressNativeContextMenu.current = true
    }

    const onMouseMove = (event: globalThis.MouseEvent) => {
      if (!altRightGesture.current) return
      const current = wheelRef.current
      if (!current) return
      const activeIndex = sectorForPointer(event, current)
      if (activeIndex !== current.activeIndex) {
        setWheel({ ...current, activeIndex })
      }
    }

    const onMouseUp = (event: globalThis.MouseEvent) => {
      if (event.button !== 2 || !altRightGesture.current) return
      event.preventDefault()
      altRightGesture.current = false
      const current = wheelRef.current
      const activeIndex = current ? sectorForPointer(event, current) : null
      if (!current) return
      if (activeIndex == null) {
        setWheel({ ...current, activeIndex: null })
        return
      }
      closeContextMenu()
      if (current) {
        const item = current.items[activeIndex]
        if (!('type' in item) && !item.disabled) void item.action?.()
      }
    }

    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp, true)
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp, true)
    }
  }, [closeContextMenu, settings.contextWheel.releaseToSelect])

  useEffect(() => {
    let timer: number | null = null
    let startX = 0
    let startY = 0
    let target: EventTarget | null = null

    const clear = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
      target = null
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      if ((event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"], .mac-ctx')) return
      const touch = event.touches[0]
      startX = touch.clientX
      startY = touch.clientY
      target = event.target
      timer = window.setTimeout(() => {
        if (!target) return
        event.preventDefault()
        target.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: startX,
          clientY: startY,
        }))
        clear()
      }, 550)
    }

    const onTouchMove = (event: TouchEvent) => {
      if (timer === null || event.touches.length !== 1) return
      const touch = event.touches[0]
      if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > 10) clear()
    }

    document.addEventListener('touchstart', onTouchStart, { passive: false })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', clear)
    document.addEventListener('touchcancel', clear)
    return () => {
      clear()
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', clear)
      document.removeEventListener('touchcancel', clear)
    }
  }, [])

  useEffect(() => {
    if (!menu && !wheel) return
    const close = () => closeContextMenu()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeContextMenu()
    }
    const timer = window.setTimeout(() => document.addEventListener('mousedown', close), 30)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [closeContextMenu, menu, wheel])

  return (
    <ContextMenuContext.Provider value={{ openContextMenu, closeContextMenu, setFallbackContextMenu }}>
      {children}
      {menu && (
        <div
          className="mac-ctx"
          data-context-kind={menu.target?.kind}
          data-flip-y={menu.flipped ? 'true' : undefined}
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          {menu.items.map((item, index) => {
            if ('type' in item && item.type === 'separator') {
              return <div key={index} className="mac-ctx-sep" />
            }
            if ('type' in item && item.type === 'header') {
              return <div key={index} className="mac-ctx-header">{item.label}</div>
            }
            return (
              <button
                key={index}
                className={`mac-ctx-item${item.danger ? ' danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  closeContextMenu()
                  void item.action?.()
                }}
              >
                <span className="mac-ctx-label">{item.label}</span>
                {item.shortcut && <span className="mac-ctx-key">{item.shortcut}</span>}
              </button>
            )
          })}
        </div>
      )}
      {wheel && (
        <div
          className="ctx-wheel"
          data-context-kind={wheel.target?.kind}
          style={{ left: wheel.x, top: wheel.y }}
          onMouseDown={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <button className="ctx-wheel-center" onClick={closeContextMenu} title="Close context wheel">
            ×
          </button>
          {wheel.items.map((item, index) => {
            if ('type' in item) return null
            const count = wheel.items.length
            const angle = -90 + (360 / count) * index
            const radians = angle * Math.PI / 180
            const radius = count <= 4 ? 74 : 92
            const x = Math.cos(radians) * radius
            const y = Math.sin(radians) * radius
            return (
              <button
                key={index}
                className={`ctx-wheel-item${item.danger ? ' danger' : ''}${wheel.activeIndex === index ? ' active' : ''}`}
                style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}
                title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
                onClick={() => {
                  closeContextMenu()
                  void item.action?.()
                }}
              >
                <span className="ctx-wheel-label">{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </ContextMenuContext.Provider>
  )
}
