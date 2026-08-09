import type { CardView, GameView, ManaPoolView, PermanentView, PlayerView } from '../net/types'

export function makeCard(partial: Partial<CardView> & { name: string }): CardView {
  const { name, ...rest } = partial
  return { name, manaValue: 0, expansionSetCode: 'TEST', cardNumber: '0', ...rest }
}

export function makePermanent(partial: Partial<PermanentView> & { name: string }): PermanentView {
  const { name, ...rest } = partial
  return { name, manaValue: 0, expansionSetCode: 'TEST', cardNumber: '0', ...rest }
}

export function makePlayer(partial: Partial<PlayerView> & { playerId: string; name: string }): PlayerView {
  const { playerId, name, ...rest } = partial
  const emptyManaPool: ManaPoolView = { red: 0, green: 0, blue: 0, white: 0, black: 0, colorless: 0 }
  return {
    playerId,
    name,
    controlled: false,
    isHuman: true,
    life: 20,
    counters: [],
    wins: 0,
    winsNeeded: 1,
    libraryCount: 40,
    handCount: 0,
    isActive: false,
    hasPriority: false,
    timerActive: false,
    hasLeft: false,
    manaPool: emptyManaPool,
    graveyard: {},
    exile: {},
    sideboard: {},
    helperCards: {},
    battlefield: {},
    topCard: null,
    commandList: [],
    attachments: [],
    statesSavedSize: 0,
    priorityTimeSavedTimeMs: 0,
    priorityTimeLeftSecs: 0,
    bufferTimeLeft: 0,
    passedTurn: false,
    passedUntilEndOfTurn: false,
    passedUntilNextMain: false,
    passedUntilStackResolved: false,
    passedAllTurns: false,
    passedUntilEndStepBeforeMyTurn: false,
    monarch: false,
    initiative: false,
    designationNames: [],
    ...rest,
  }
}

export function makeGameView(partial: Partial<GameView>): GameView {
  return {
    priorityTime: 2,
    bufferTime: 2,
    players: [],
    myPlayerId: null,
    myHand: {},
    myHelperEmblems: {},
    opponentHands: {},
    watchedHands: {},
    stack: {},
    exiles: [],
    revealed: [],
    lookedAt: [],
    companion: [],
    combat: [],
    phase: 'MAIN',
    step: 'PRECOMBAT_MAIN',
    activePlayerId: '',
    activePlayerName: '',
    priorityPlayerName: '',
    turn: 1,
    special: false,
    rollbackTurnsAllowed: false,
    totalErrorsCount: 0,
    totalEffectsCount: 0,
    gameCycle: 0,
    ...partial,
  }
}

/** Partida de un jugador controlado: battlefield con 2 permanentes (1 tapped),
 *  myHand con 1 carta, graveyard y exile con 2 cartas, stack con 1 carta y mano oponente. */
export const playerGameView: GameView = makeGameView({
  players: [
    makePlayer({
      playerId: 'p1',
      name: 'Alice',
      controlled: true,
      hasPriority: true,
      battlefield: {
        'p-untapped': makePermanent({ name: 'Serra Angel', parentId: 'p-untapped' }),
        'p-tapped': makePermanent({ name: 'Llanowar Elves', parentId: 'p-tapped', tapped: true }),
      },
      graveyard: {
        'g-1': makeCard({ name: 'Grave One', parentId: 'g-1' }),
        'g-2': makeCard({ name: 'Grave Last', parentId: 'g-2' }),
      },
      exile: {
        'e-1': makeCard({ name: 'Exile One', parentId: 'e-1' }),
        'e-2': makeCard({ name: 'Exile Last', parentId: 'e-2' }),
      },
    }),
    makePlayer({
      playerId: 'p2',
      name: 'Bob',
      battlefield: {
        'p-opp-tapped': makePermanent({ name: 'Opp Permanent', parentId: 'p-opp-tapped', tapped: true }),
      },
    }),
  ],
  myPlayerId: 'p1',
  myHand: { 'h-1': makeCard({ name: 'Counterspell', parentId: 'h-1' }) },
  opponentHands: { Bob: { 'oh-1': { id: 'oh-1' } } },
  stack: { 's-1': makeCard({ name: 'Lightning Bolt', parentId: 's-1' }) },
  activePlayerId: 'p1',
  activePlayerName: 'Alice',
  priorityPlayerName: 'Alice',
})

/** Partida de espectador: sin jugadores controlados, solo stack visible. */
export const spectatorGameView: GameView = makeGameView({
  myPlayerId: null,
  stack: { 's-1': makeCard({ name: 'Lightning Bolt', parentId: 's-1' }) },
})

/** GameView mínimo para tests de estado/stack. */
export const minimalGameView: GameView = makeGameView({})

/** Regresión: objeto GameView SIN la clave `players` (espectador desde el proxy),
 *  con mano y stack visibles. */
const spectatorBase = makeGameView({ myHand: {}, stack: {} }) as Partial<GameView>
delete spectatorBase.players
export const spectatorNoPlayersGameView = {
  ...spectatorBase,
  myHand: { 'h-1': makeCard({ name: 'Counterspell', parentId: 'h-1' }) },
  stack: { 's-1': makeCard({ name: 'Lightning Bolt', parentId: 's-1' }) },
} as GameView
