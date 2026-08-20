import type { ChatMessageEvent, DeckCardEntry, DeckJson, GameEndInfo, GameView, LobbyEnvelope } from '../net/types'
import type { FeedbackPrompt } from '../game/feedback'
import { loadConn, type ConnectionInfo } from './persistence'

export interface LogEntry {
  id: number
  time: number
  from: string
  text: string
  gameId?: string
}

export interface CombatState {
  mode: 'attack' | 'block'
  selectable: string[]
  special: boolean
  chosen: string[]
}

export interface AppState {
  phase: 'idle' | 'connecting' | 'lobby' | 'game'
  conn: ConnectionInfo | null
  wsUrl: string | null
  connecting: boolean
  wsAlive: boolean
  lobby: LobbyEnvelope | null
  roomChatId: string | null
  chatMessages: ChatMessageEvent[]
  game: GameView | null
  gameId: string | null
  playableIds: string[]
  playableWindow: { turn: number; phase: string } | null
  combat: CombatState | null
  gameEnd: GameEndInfo | null
  myDeck: DeckJson | null
  feedback: FeedbackPrompt | null
  sideboard: DeckCardEntry[]
  log: LogEntry[]
  events: { method: string; time: number }[]
  settings: {
    autoKeepMulligan: boolean
    autoPass: boolean
  }
  error: string | null
}

export const initialState: AppState = {
  phase: 'idle',
  conn: loadConn(),
  wsUrl: null,
  connecting: false,
  wsAlive: false,
  lobby: null,
  roomChatId: null,
  chatMessages: [],
  game: null,
  gameId: null,
  playableIds: [],
  playableWindow: null,
  combat: null,
  gameEnd: null,
  myDeck: null,
  feedback: null,
  sideboard: [],
  log: [],
  events: [],
  settings: { autoKeepMulligan: true, autoPass: false },
  error: null,
}

let _state: AppState = initialState
const listeners = new Set<() => void>()
let logSeq = 0

export function setState(partial: Partial<AppState>) {
  _state = { ..._state, ...partial }
  listeners.forEach((l) => l())
}

export function getState(): AppState {
  return _state
}

export function addLog(from: string, text: string, gameId?: string) {
  setState({ log: [..._state.log, { id: ++logSeq, time: Date.now(), from, text, gameId }].slice(-300) })
}

export { listeners }
