import { useSyncExternalStore } from 'react'
import { getState, listeners } from './state'
import type { AppState } from './state'

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => selector(getState()),
  )
}

export function usePhase() {
  return useStore((s) => s.phase)
}

export function useLobby() {
  return useStore((s) => s.lobby)
}

export function useGame() {
  return useStore((s) => s.game)
}

export function useSettings() {
  return useStore((s) => s.settings)
}
