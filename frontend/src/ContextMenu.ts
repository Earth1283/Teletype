import { createContext, useContext, type MouseEvent } from 'react'

export type ContextMenuItem =
  | {
      label: string
      shortcut?: string
      action?: () => void | Promise<void>
      disabled?: boolean
      danger?: boolean
    }
  | { type: 'separator' }
  | { type: 'header'; label: string }

export type ContextMenuTarget =
  | { kind: 'desktop' }
  | { kind: 'window'; id: string }
  | { kind: 'dockApp'; id: string }
  | { kind: 'file'; path: string; isDirectory: boolean }
  | { kind: 'folderBackground'; path: string }
  | { kind: 'favorite'; path: string; id: string }
  | { kind: 'logLine'; line: string }
  | { kind: 'player'; name: string; uuid: string }
  | { kind: 'auditEntry'; id: number }
  | { kind: string; [key: string]: unknown }

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
  target?: ContextMenuTarget
  flipped?: boolean
}

export interface ContextWheelState extends ContextMenuState {
  activeIndex: number | null
}

export interface ContextMenuValue {
  openContextMenu: (
    event: MouseEvent,
    items: ContextMenuItem[],
    target?: ContextMenuTarget,
  ) => void
  closeContextMenu: () => void
  setFallbackContextMenu: (items: ContextMenuItem[]) => void
  isOpen: boolean
}

export const ContextMenuContext = createContext<ContextMenuValue>({
  openContextMenu: () => {},
  closeContextMenu: () => {},
  setFallbackContextMenu: () => {},
  isOpen: false,
})

export function useContextMenu() {
  return useContext(ContextMenuContext)
}
