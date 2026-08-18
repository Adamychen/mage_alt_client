/**
 * Tipos TS del protocolo del proxy (Mage.Proxy).
 * Espejo 1:1 de los campos Java que serializa JsonUtil (nombres de campo camelCase,
 * UUID y enums como strings, maps con claves string, fechas como epoch millis).
 * Ver Mage.Proxy/README.md y las clases mage.view.* de Mage.Common.
 */

export type UUID = string

// ─── Envoltorio de mensajes del proxy (proxy → cliente) ──────────────────────

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
  tables: TableView[]
  users: RoomUsersView
  serverMessages: string[]
}

export interface RoomUsersView {
  numberActiveGames: number
  numberGameThreads: number
  numberMaxGames: number
  usersView: UsersView[]
}

export interface UsersView {
  flagName: string
  userName: string
  matchHistory: string
  matchQuitRatio: number
  tourneyHistory: string
  tourneyQuitRatio: number
  infoGames: string
  infoPing: string
  generalRating: number
  constructedRating: number
  limitedRating: number
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

// ─── Vistas de partida (mage.view) ───────────────────────────────────────────

export interface GameView {
  priorityTime: number
  bufferTime: number
  /** ausente o vacío cuando somos espectador (el proxy omite players) */
  players?: PlayerView[] | null
  /** null cuando somos espectador */
  myPlayerId: UUID | null
  myHand: CardsView
  myHelperEmblems: CardsView
  canPlayObjects?: PlayableObjectsList | null
  /** por nombre de jugador */
  opponentHands: Record<string, SimpleCardsView>
  /** por nombre de jugador (espectador) */
  watchedHands: Record<string, SimpleCardsView>
  stack?: CardsView | null
  exiles: ExileView[]
  revealed: RevealedView[]
  lookedAt: RevealedView[]
  companion: RevealedView[]
  combat: CombatGroupView[]
  phase: string
  step: string
  activePlayerId: UUID
  activePlayerName: string
  priorityPlayerName: string
  turn: number
  special: boolean
  rollbackTurnsAllowed: boolean
  totalErrorsCount: number
  totalEffectsCount: number
  gameCycle: number
}

/** Serializable shape of Mage's PlayableObjectsList. */
export interface PlayableObjectsList {
  objects?: Record<UUID, PlayableObjectStats>
}

export interface PlayableObjectStats {
  basicManaAbilities?: PlayableObjectRecord[]
  basicPlayAbilities?: PlayableObjectRecord[]
  basicCastAbilities?: PlayableObjectRecord[]
  other?: PlayableObjectRecord[]
}

export interface PlayableObjectRecord {
  id: UUID
  value: string
}

export interface PlayerView {
  playerId: UUID
  name: string
  controlled: boolean
  isHuman: boolean
  life: number
  counters: CounterView[]
  wins: number
  winsNeeded: number
  libraryCount: number
  handCount: number
  isActive: boolean
  hasPriority: boolean
  timerActive: boolean
  hasLeft: boolean
  manaPool: ManaPoolView
  graveyard: CardsView
  exile: CardsView
  sideboard: CardsView
  helperCards: CardsView
  battlefield: Record<UUID, PermanentView>
  topCard: CardView | null
  userData?: unknown
  commandList: unknown[]
  attachments: UUID[]
  statesSavedSize: number
  priorityTimeSavedTimeMs: number
  priorityTimeLeftSecs: number
  bufferTimeLeft: number
  passedTurn: boolean
  passedUntilEndOfTurn: boolean
  passedUntilNextMain: boolean
  passedUntilStackResolved: boolean
  passedAllTurns: boolean
  passedUntilEndStepBeforeMyTurn: boolean
  monarch: boolean
  initiative: boolean
  designationNames: string[]
}

export interface ManaPoolView {
  red: number
  green: number
  blue: number
  white: number
  black: number
  colorless: number
}

export interface CounterView {
  name: string
  count: number
}

/** Map UUID → CardView (LinkedHashMap en Java). */
export type CardsView = Record<UUID, CardView>

/** Manos de oponentes / mazos simplificados: solo datos básicos por carta. */
export type SimpleCardsView = Record<UUID, SimpleCardView>

export interface SimpleCardView {
  id: UUID
  name?: string
  mageObjectType?: string
}

export interface CardView {
  id?: UUID
  parentId?: UUID
  name: string
  displayName?: string
  displayFullName?: string
  rules?: string[]
  power?: string
  toughness?: string
  loyalty?: string
  defense?: string
  startingLoyalty?: string
  startingDefense?: string
  cardTypes?: string[]
  subTypes?: unknown
  superTypes?: string[]
  color?: { white?: boolean; blue?: boolean; black?: boolean; red?: boolean; green?: boolean } | null
  frameColor?: unknown
  frameStyle?: string
  manaCostLeftStr?: string[]
  manaCostRightStr?: string[]
  manaValue: number
  rarity?: string
  mageObjectType?: string
  isAbility?: boolean
  abilityType?: string
  isToken?: boolean
  ability?: CardView | null
  imageFileName?: string
  imageNumber?: number
  expansionSetCode?: string
  cardNumber?: string
  extraDeckCard?: boolean
  transformable?: boolean
  secondCardFace?: CardView | null
  transformed?: boolean
  flipCard?: boolean
  faceDown?: boolean
  alternateName?: string
  isSplitCard?: boolean
  targets?: UUID[]
  pairedCard?: UUID
  bandedCards?: UUID[]
  paid?: boolean
  counters?: CounterView[]
  controlledByOwner?: boolean
  zone?: string
  rotate?: boolean
  hideInfo?: boolean
  canAttack?: boolean
  canBlock?: boolean
  inViewerOnly?: boolean
  cardIcons?: unknown[]
  originalPower?: string | null
  originalToughness?: string | null
  originalColorIdentity?: string | null
  originalIsCopy?: boolean
}

export interface ServerInfo {
  host: string
  version: string
  connected: boolean
  sessionId?: string
  protocolVersion: string
}

export interface PermanentView extends CardView {
  tapped?: boolean
  flipped?: boolean
  phasedIn?: boolean
  summoningSickness?: boolean
  damage?: number
  attachments?: UUID[]
  copy?: boolean
  nameOwner?: string
  nameController?: string
  controlled?: boolean
  attachedTo?: UUID
  morphed?: boolean
  disguised?: boolean
  manifested?: boolean
  cloaked?: boolean
  attachedToPermanent?: boolean
  attachedControllerDiffers?: boolean
  mutated?: boolean
}

export interface CombatGroupView {
  attackers?: unknown[]
  blockers?: unknown[]
  defenders?: unknown[]
  attacker?: unknown
  isAttackedByDefender?: boolean
}

export interface ExileView {
  name: string
  cards: CardsView
  zoneId?: UUID
}

export interface RevealedView {
  name: string
  cards: CardsView
}

// ─── Lobby (mage.view) ───────────────────────────────────────────────────────

export interface TableView {
  tableId: UUID
  gameType: string
  deckType: string
  tableName: string
  controllerName: string
  additionalInfoShort: string
  additionalInfoFull: string
  createTime: number
  tableState: string
  skillLevel: string
  tableStateText: string
  seatsInfo: string
  isTournament: boolean
  seats: SeatView[]
  games: UUID[]
  quitRatio: string
  minimumRating: string
  limited: boolean
  rated: boolean
  passworded: boolean
  spectatorsAllowed: boolean
}

export interface SeatView {
  playerName: string
  playerId?: UUID
  seatIndex: number
  playerType?: string
  flagName?: string
  history?: string
  joinedInRound?: string
  bowingOut?: boolean
  isExtraSeat?: boolean
}

export interface UserView {
  userName: string
  host?: string
  sessionId?: string
  timeConnected?: number
  lastActivity?: number
  gameInfo?: string
  userState?: string
  muteChatUntil?: number
  clientVersion?: string
  email?: string
  userIdStr?: string
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  username: string
  time?: number
  turnInfo?: string
  message: string
  color?: string
  soundToPlay?: string
  messageType?: string
}

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

export interface GameEndInfo {
  gameInfo?: string
  matchInfo?: string
  additionalInfo?: string
  won?: boolean
  wins?: number
  loses?: number
  winsNeeded?: number
  startTime?: string
  endTime?: string
  matchView?: {
    matchId?: string
    result?: string
    players?: string
    games?: string[]
    startTime?: string
    endTime?: string
    [k: string]: unknown
  }
  players?: PlayerView[]
}

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
} as const
