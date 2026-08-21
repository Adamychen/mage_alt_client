/**
 * Tipos TS del protocolo del proxy (Mage.Proxy).
 *
 * Vue types (mage.view.*) are generated from schema/contract.schema.json.
 * Run: node scripts/gen-types.mjs (or npm run gen-types).
 *
 * Proxy-specific types (envelopes, deck, events) stay here.
 * The Java↔TS contract is JsonUtil: field names are camelCase (Java reflection),
 * UUID/enums are strings, maps have string keys, dates are epoch millis.
 */

export type UUID = string

// ─── Generated view types (from JsonUtil wire format) ────────────────────────
export type {
  GameView, PlayerView, CardView, PermanentView,
  CardsView, SimpleCardsView, SimpleCardView,
  CounterView, ManaPoolView,
  CombatGroupView, ExileView, RevealedView,
  TableView, SeatView,
  RoomUsersView, UsersView, UserView,
  ChatMessage, GameEndInfo,
  PlayableObjectsList, PlayableObjectStats, PlayableObjectRecord,
} from './types.generated'

// ─── Proxy envelope types (proxy → cliente) ─────────────────────────────────

export type ProxyMessage =
  | { type: 'connected'; message?: string }
  | { type: 'disconnected'; reason?: string }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string }
  | LobbyEnvelope
  | ResultEnvelope
  | EventEnvelope

/** Broadcast del lobby, cada ~2 s. */
export interface LobbyEnvelope {
  type: 'lobby'
  roomId?: UUID
  tables: import('./types.generated').TableView[]
  users:
    | import('./types.generated').RoomUsersView
    | import('./types.generated').RoomUsersView[]
    | import('./types.generated').UsersView[]
  serverMessages: string[]
}

/** Respuesta a una acción (una promesa por action+callId en el cliente). */
export interface ResultEnvelope {
  type: 'result'
  action: string
  requestId?: string | number
  ok: boolean
  data?: unknown
  error?: string
  errorCode?: string
}

/** Callback del servidor XMage reexpuesto (method = nombre del método MageClient). */
export interface EventEnvelope {
  type: 'event'
  method: string
  messageId: number
  objectId?: UUID | null
  data?: unknown
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatMessageEvent {
  chatId: UUID
  username: string
  message: string
  messageType?: string
}

// ─── Mazo JSON (proxy) ───────────────────────────────────────────────────────

export interface DeckJson {
  name: string
  cards: DeckCardEntry[]
  sideboard: DeckCardEntry[]
}

export interface DeckCardEntry {
  cardName: string
  setCode: string
  cardNumber: string
  amount: number
}

// ─── Fin de partida / match (GameEndView del servidor) ───────────────────────

/** Evento SIDEBOARD del servidor (match best-of-N entre partidas). */
export interface SideboardEvent {
  deck?: {
    name?: string
    cards?: Record<string, unknown>
    sideboard?: Record<string, unknown>
  }
  currentTableId?: string
  parentTableId?: string
  roomId?: string
  time?: number
  flag?: boolean
}

// ─── Partidas Finalizadas (MatchView del servidor) ───────────────────────────

export interface MatchView {
  tableId: UUID
  matchId?: UUID
  matchName?: string
  gameType?: string
  deckType?: string
  games?: UUID[]
  result?: string
  players?: string
  startTime?: number | string
  endTime?: number | string
  replayAvailable?: boolean
  isTournament?: boolean
  rated?: boolean
}

// ─── Métodos de evento del servidor (MageClient) más comunes ────────────────

export const EVENT_METHODS = {
  gameInit: 'GAME_INIT',
  gameUpdate: 'GAME_UPDATE',
  gameUpdateAndInform: 'GAME_UPDATE_AND_INFORM',
  gameAsk: 'GAME_ASK',
  gameSelect: 'GAME_SELECT',
  gameTarget: 'GAME_TARGET',
  gameTargetPlayer: 'GAME_TARGET_PLAYER',
  gameTargetAmount: 'GAME_TARGET_AMOUNT',
  gamePlayMana: 'GAME_PLAY_MANA',
  gamePlayXMana: 'GAME_PLAY_XMANA',
  gameChooseAbility: 'GAME_CHOOSE_ABILITY',
  gameChooseMode: 'GAME_CHOOSE_MODE',
  gameChoosePile: 'GAME_CHOOSE_PILE',
  gameChooseCards: 'GAME_CHOOSE_CARDS',
  gameChooseColor: 'GAME_CHOOSE_COLOR',
  gameSelectCards: 'GAME_SELECT_CARDS',
  gameSelectTargets: 'GAME_SELECT_TARGETS',
  gameGetAmount: 'GAME_GET_AMOUNT',
  gameGetMultiAmount: 'GAME_GET_MULTI_AMOUNT',
  gameSelectPlayer: 'GAME_SELECT_PLAYER',
  gameChooseOne: 'GAME_CHOOSE_ONE',
  gameChooseNumber: 'GAME_CHOOSE_NUMBER',
  gameChooseString: 'GAME_CHOOSE_STRING',
  gameChooseBetween: 'GAME_CHOOSE_BETWEEN',
  gameChooseCardsOrder: 'GAME_CHOOSE_CARDS_ORDER',
  gameEnd: 'GAME_END',
  gameOver: 'GAME_OVER',
  endGameInfo: 'END_GAME_INFO',
  sideboard: 'SIDEBOARD',
  chat: 'CHATMESSAGE',
  serverMessage: 'SERVER_MESSAGE',
  joinedTable: 'JOINED_TABLE',
  startGame: 'START_GAME',
  replayGame: 'REPLAY_GAME',
  replayInit: 'REPLAY_INIT',
  replayUpdate: 'REPLAY_UPDATE',
  replayDone: 'REPLAY_DONE',
} as const
