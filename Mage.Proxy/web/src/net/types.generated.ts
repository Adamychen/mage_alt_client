// @generated — Do not edit manually.
// Source: schema/contract.schema.json
// Run: node scripts/gen-types.mjs

export interface GameView {
  priorityTime: number
  bufferTime: number
  players?: PlayerView[]
  myPlayerId?: string | null
  myHand: CardsView
  myHelperEmblems: CardsView
  canPlayObjects?: PlayableObjectsList
  opponentHands: Record<string, SimpleCardsView>
  watchedHands: Record<string, SimpleCardsView>
  stack: CardsView
  exiles: ExileView[]
  revealed: RevealedView[]
  lookedAt: RevealedView[]
  companion: RevealedView[]
  combat: CombatGroupView[]
  phase: string
  step: string
  activePlayerId: string
  activePlayerName: string
  priorityPlayerName: string
  turn: number
  special: boolean
  rollbackTurnsAllowed: boolean
  totalErrorsCount: number
  totalEffectsCount: number
  gameCycle: number
}

export interface PlayerView {
  playerId: string
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
  battlefield: Record<string, PermanentView>
  topCard: CardView | null
  userData?: unknown
  commandList: unknown[]
  attachments: string[]
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

export interface CardView {
  id?: string
  parentId?: string
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
  color?: {
    white?: boolean
    blue?: boolean
    black?: boolean
    red?: boolean
    green?: boolean
  } | null
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
  ability?: CardView
  imageFileName?: string
  imageNumber?: number
  expansionSetCode?: string
  cardNumber?: string
  extraDeckCard?: boolean
  transformable?: boolean
  secondCardFace?: CardView
  transformed?: boolean
  flipCard?: boolean
  faceDown?: boolean
  alternateName?: string
  isSplitCard?: boolean
  targets?: string[]
  pairedCard?: string
  bandedCards?: string[]
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

export interface PermanentView extends CardView {
  tapped?: boolean
  flipped?: boolean
  phasedIn?: boolean
  summoningSickness?: boolean
  damage?: number
  attachments?: string[]
  copy?: boolean
  nameOwner?: string
  nameController?: string
  controlled?: boolean
  attachedTo?: string
  morphed?: boolean
  disguised?: boolean
  manifested?: boolean
  cloaked?: boolean
  attachedToPermanent?: boolean
  attachedControllerDiffers?: boolean
  mutated?: boolean
}

export type CardsView = Record<string, CardView>

export interface SimpleCardView {
  id: string
  name?: string
  mageObjectType?: string
}

export type SimpleCardsView = Record<string, SimpleCardView>

export interface CounterView {
  name: string
  count: number
}

export interface ManaPoolView {
  red: number
  green: number
  blue: number
  white: number
  black: number
  colorless: number
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
  zoneId?: string
}

export interface RevealedView {
  name: string
  cards: CardsView
}

export interface TableView {
  tableId: string
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
  games: string[]
  quitRatio: string
  minimumRating: string
  limited: boolean
  rated: boolean
  passworded: boolean
  spectatorsAllowed: boolean
}

export interface SeatView {
  playerName: string
  playerId?: string
  seatIndex: number
  playerType?: string
  flagName?: string
  history?: string
  joinedInRound?: string
  bowingOut?: boolean
  isExtraSeat?: boolean
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

export interface ChatMessage {
  username: string
  time?: number
  turnInfo?: string
  message: string
  color?: string
  soundToPlay?: string
  messageType?: string
}

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
    endTime?: string | null
  }
  players?: PlayerView[]
}

export interface PlayableObjectsList {
  objects?: Record<string, PlayableObjectStats>
}

export interface PlayableObjectStats {
  basicManaAbilities?: PlayableObjectRecord[]
  basicPlayAbilities?: PlayableObjectRecord[]
  basicCastAbilities?: PlayableObjectRecord[]
  other?: PlayableObjectRecord[]
}

export interface PlayableObjectRecord {
  id: string
  value: string
}
