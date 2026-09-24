import { createContext, useContext } from 'react'

const PageActiveContext = createContext(true)

export const PageActiveProvider = PageActiveContext.Provider

export function usePageActive() {
  return useContext(PageActiveContext)
}

export function usePollInterval(ms: number | false): number | false {
  return usePageActive() ? ms : false
}
