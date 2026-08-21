import type { ChatMessageEvent, DeckCardEntry, DeckJson, GameEndInfo, GameView, LobbyEnvelope, TableView } from '../net/types'
import type { FeedbackPrompt } from '../game/feedback'
import type { PhaseStops } from '../net/commands'
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

/** A card in the sideboard screen (instance ID + resolved Scryfall data). */
export interface SideboardCard {
  instanceId: string
  setCode: string
  cardNumber: string
  name: string
}

/** State for the sideboard screen (between games in Bo3). */
export interface SideboardScreenState {
  deckName: string
  maindeck: SideboardCard[]
  sideboard: SideboardCard[]
  tableId: string
  parentTableId: string | null
  timeLeft: number
  limited: boolean
}

export interface AppState {
  phase: 'idle' | 'connecting' | 'lobby' | 'spectating_pending' | 'game'
  conn: ConnectionInfo | null
  wsUrl: string | null
  connecting: boolean
  wsAlive: boolean
  lobby: LobbyEnvelope | null
  roomChatId: string | null
  chatMessages: ChatMessageEvent[]
  watchingTable: TableView | null
  game: GameView | null
  gameId: string | null
  gameChatId: string | null
  playableIds: string[]
  playableWindow: { turn: number; phase: string } | null
  combat: CombatState | null
  gameEnd: GameEndInfo | null
  myDeck: DeckJson | null
  feedback: FeedbackPrompt | null
  sideboard: DeckCardEntry[]
  sideboardScreen: SideboardScreenState | null
  phaseStops: PhaseStops
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
  watchingTable: null,
  game: null,
  gameId: null,
  gameChatId: null,
  playableIds: [],
  playableWindow: null,
  combat: null,
  gameEnd: null,
  myDeck: null,
  feedback: null,
  sideboard: [],
  sideboardScreen: null,
  phaseStops: {
    yourTurn: { upkeep: true, draw: true, main1: false, beginCombat: true, endCombat: false, main2: false, endStep: true },
    opponentTurn: { upkeep: true, draw: true, main1: false, beginCombat: true, endCombat: false, main2: false, endStep: true },
  },
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
