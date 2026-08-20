// ── Re-exports ──────────────────────────────────────────────────────
export type { ConnectionInfo } from './persistence'
export { loadConn } from './persistence'
export type { LogEntry, CombatState, AppState } from './state'
export { getState } from './state'
export { useStore, usePhase, useLobby, useGame, useSettings } from './selectors'
export { attachGateway, detachGateway, doConnect, reset } from './gateway'
export { handleMessage } from './eventHandler'
export { clearError, setStoreError, clearFeedback, setMyDeck, clearGameEnd, setSetting, maybeAutoPass } from './actions'

// gancho de depuración para E2E (estado del store en vivo)
import { getState as _getState } from './state'
;(globalThis as unknown as { __mageStore?: unknown }).__mageStore = { getState: _getState }
