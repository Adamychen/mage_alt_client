import { beforeEach, describe, expect, it, vi } from 'vitest'
import { joinGame, sendPlayerBoolean, sendPlayerUUID } from '../net/commands'
import { makeCard, makeGameView, makePermanent, makePlayer, minimalGameView } from '../__fixtures__/gameViews'
import { getState, setState } from './state'
import { handleMessage, maybeAutoPass, reset, setSetting } from './store'
import { loadActiveGame } from './persistence'

vi.mock('../net/commands', () => ({
  setGateway: vi.fn(),
  getGateway: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getGameTypes: vi.fn(),
  getPlayerTypes: vi.fn(),
  getDeckTypes: vi.fn(),
  getRoomChatId: vi.fn(),
  getGameChatId: vi.fn().mockResolvedValue(undefined),
  sendChatMessage: vi.fn(),
  createTable: vi.fn(),
  joinTable: vi.fn(),
  startMatch: vi.fn(),
  watchTable: vi.fn(),
  watchGame: vi.fn(),
  joinGame: vi.fn(),
  stopWatching: vi.fn(),
  leaveTable: vi.fn(),
  removeTable: vi.fn(),
  submitDeck: vi.fn().mockResolvedValue({ ok: true }),
  updateDeck: vi.fn(),
  updatePreferences: vi.fn().mockResolvedValue({ ok: true }),
  quitMatch: vi.fn(),
  sendPlayerAction: vi.fn(),
  sendPlayerBoolean: vi.fn(),
  sendPlayerInteger: vi.fn(),
  sendPlayerString: vi.fn(),
  sendPlayerUUID: vi.fn(),
}))

describe('handleMessage', () => {
  beforeEach(() => {
    reset()
    vi.clearAllMocks()
  })

  it('GAME_UPDATE sets the game and switches to phase "game"', () => {
    const game = minimalGameView
    handleMessage({ type: 'event', method: 'GAME_UPDATE', messageId: 1, objectId: 'g-1', data: game })
    expect(getState().phase).toBe('game')
    expect(getState().game).toBe(game)
    expect(getState().gameId).toBe('g-1')
  })

  it('unwraps GAME_UPDATE_AND_INFORM gameView data', () => {
    const game = makeGameView({ phase: 'COMBAT' })
    handleMessage({
      type: 'event',
      method: 'GAME_UPDATE_AND_INFORM',
      messageId: 1,
      objectId: 'g-inform',
      data: { gameView: game, message: 'Waiting for Alice' },
    })
    expect(getState().game).toBe(game)
    expect(getState().gameId).toBe('g-inform')
  })

  it('does not create a blocking feedback dialog for GAME_SELECT priority', () => {
    handleMessage({
      type: 'event',
      method: 'GAME_SELECT',
      messageId: 1,
      objectId: 'g-select',
      data: { gameView: makeGameView({}), message: 'Play spells and abilities', options: {} },
    })
    expect(getState().feedback).toBeNull()
  })

  it('ignores a game view OLDER than the current one (no pisa el estado con turnos pasados)', () => {
    const t3 = makeGameView({ turn: 3, phase: 'COMBAT', step: 'DECLARE_ATTACKERS' })
    const t1 = makeGameView({ turn: 1, phase: 'PRECOMBAT_MAIN', step: 'PRECOMBAT_MAIN' })
    handleMessage({ type: 'event', method: 'GAME_UPDATE', messageId: 1, objectId: 'g-1', data: t3 })
    handleMessage({ type: 'event', method: 'GAME_UPDATE_AND_INFORM', messageId: 2, objectId: 'g-1', data: { gameView: t1 } })
    expect(getState().game).toBe(t3)
  })

  it('reemplaza la vista si el mismo turno+paso trae estado nuevo (carta movida)', () => {
    const first = makeGameView({ turn: 2, phase: 'PRECOMBAT_MAIN', step: 'PRECOMBAT_MAIN' })
    const second = makeGameView({ turn: 2, phase: 'PRECOMBAT_MAIN', step: 'PRECOMBAT_MAIN', myHand: { 'h-1': makeCard({ name: 'Bolt' }) } })
    handleMessage({ type: 'event', method: 'GAME_UPDATE', messageId: 1, objectId: 'g-1', data: first })
    handleMessage({ type: 'event', method: 'GAME_UPDATE', messageId: 2, objectId: 'g-1', data: second })
    expect(getState().game).toBe(second)
  })

  it('START_GAME sets phase "game", the gameId and joins the game (sin esperar los 10s)', () => {
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-42',
      data: { gameId: 'g-42', tableName: 'Test table' },
    })
    expect(getState().phase).toBe('game')
    expect(getState().gameId).toBe('g-42')
    expect(joinGame).toHaveBeenCalledWith('g-42')
  })

  it('START_GAME con el mismo gameId no re-une la partida (evita join duplicado)', () => {
    handleMessage({ type: 'event', method: 'START_GAME', messageId: 1, objectId: 'g-1', data: { gameId: 'g-1' } })
    handleMessage({ type: 'event', method: 'START_GAME', messageId: 2, objectId: 'g-1', data: { gameId: 'g-1' } })
    expect(joinGame).toHaveBeenCalledTimes(1)
  })

  it('result with ok:false sets the error', () => {
    handleMessage({ type: 'result', action: 'joinTable', ok: false, error: 'table full' })
    expect(getState().error).toBe('table full')
  })

  it('result with ok:true does not set an error', () => {
    handleMessage({ type: 'result', action: 'joinTable', ok: true })
    expect(getState().error).toBeNull()
  })

  it('CHATMESSAGE appends to chat messages and the log', () => {
    handleMessage({
      type: 'event',
      method: 'CHATMESSAGE',
      messageId: 1,
      objectId: 'c-1',
      data: { chatId: 'c-1', username: 'Alice', message: 'hi there' },
    })
    expect(getState().chatMessages).toHaveLength(1)
    expect(getState().chatMessages[0].username).toBe('Alice')
    expect(getState().chatMessages[0].message).toBe('hi there')
    const lastLog = getState().log[getState().log.length - 1]
    expect(lastLog.from).toBe('Alice')
    expect(lastLog.text).toBe('hi there')
  })

  it('GAME_ASK with a mulligan question auto-keeps the hand via sendPlayerBoolean(false)', () => {
    handleMessage({
      type: 'event',
      method: 'GAME_ASK',
      messageId: 1,
      objectId: 'g-1',
      data: { question: 'Do you want to keep your hand? (Mulligan)', options: ['Keep hand', 'Mulligan'], gameId: 'g-1' },
    })
    expect(sendPlayerBoolean).toHaveBeenCalledWith(false, 'g-1')
  })

  it('GAME_ASK with a non-mulligan question does not auto-answer', () => {
    handleMessage({
      type: 'event',
      method: 'GAME_ASK',
      messageId: 1,
      data: { question: 'Choose a card from your hand', options: [] },
    })
    expect(sendPlayerBoolean).not.toHaveBeenCalled()
  })

  it('GAME_TARGET starting player auto-resolves and keeps the feedback until the next ask', () => {
    handleMessage({
      type: 'event',
      method: 'GAME_TARGET',
      messageId: 1,
      objectId: 'g-1',
      data: { message: 'Select a starting player', targets: ['p1', 'p2'] },
    })
    expect(sendPlayerUUID).toHaveBeenCalledWith('p1', 'g-1')
    // el feedback se MANTIENE: es la barrera que evita que el auto-pase mande
    // booleanos en la ventana del sorteo (respuesta inválida para un ask de
    // target → el servidor re-dispara y acaba la partida)
    expect(getState().feedback?.method).toBe('GAME_TARGET')
    // el ask del mulligan (auto-keep) cierra el prompt
    handleMessage({
      type: 'event',
      method: 'GAME_ASK',
      messageId: 2,
      objectId: 'g-1',
      data: { question: 'Mulligan?', options: ['Keep hand', 'Mulligan'] },
    })
    expect(getState().feedback).toBeNull()
  })

  it('GAME_ASK respects the autoKeepMulligan setting', () => {
    setSetting('autoKeepMulligan', false)
    handleMessage({
      type: 'event',
      method: 'GAME_ASK',
      messageId: 1,
      data: { question: 'Mulligan?', options: ['Keep hand', 'Mulligan'] },
    })
    expect(sendPlayerBoolean).not.toHaveBeenCalled()
  })

  it('lobby updates the lobby state', () => {
    const lobby = {
      type: 'lobby' as const,
      tables: [],
      users: { numberActiveGames: 1, numberGameThreads: 1, numberMaxGames: 100, usersView: [] },
      serverMessages: [],
    }
    handleMessage(lobby)
    expect(getState().lobby).toBe(lobby)
  })

  it('disconnected resets back to idle', () => {
    handleMessage({ type: 'event', method: 'START_GAME', messageId: 1, data: { gameId: 'g-1' } })
    handleMessage({ type: 'disconnected', reason: 'bye' })
    expect(getState().phase).toBe('idle')
    expect(getState().game).toBeNull()
    expect(getState().gameId).toBeNull()
  })
})

describe('maybeAutoPass', () => {
  beforeEach(() => {
    reset()
    vi.clearAllMocks()
  })

  it('regression: does not crash when players is undefined', () => {
    const game = { ...makeGameView({}), players: undefined as unknown as ReturnType<typeof makeGameView>['players'] }
    expect(() => maybeAutoPass(game)).not.toThrow()
    expect(sendPlayerBoolean).not.toHaveBeenCalled()
  })

  it('passes priority with XMage boolean feedback when autoPass is on', () => {
    setSetting('autoPass', true)
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-1',
      data: { gameId: 'g-1' },
    })
    const game = makeGameView({
      players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: true })],
      myHand: { 'h-1': makeCard({ name: 'Lightning Bolt', parentId: 'h-1' }) },
    })
    maybeAutoPass(game)
    expect(sendPlayerBoolean).toHaveBeenCalledWith(false, 'g-1')
  })

  it('does nothing when the controlled player has no priority', () => {
    const game = makeGameView({
      players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: false })],
    })
    maybeAutoPass(game)
    expect(sendPlayerBoolean).not.toHaveBeenCalled()
  })

  it('respects the autoPass setting', () => {
    setSetting('autoPass', false)
    const game = makeGameView({
      players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: true })],
    })
    maybeAutoPass(game)
    expect(sendPlayerBoolean).not.toHaveBeenCalled()
  })

  it('does not pass in my precombat main phase while something is playable', () => {
    setSetting('autoPass', true)
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-1',
      data: { gameId: 'g-1' },
    })
    const game = makeGameView({
      phase: 'PRECOMBAT_MAIN',
      players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: true })],
      canPlayObjects: { objects: { 'h-1': {} } },
    })
    maybeAutoPass(game)
    expect(sendPlayerBoolean).not.toHaveBeenCalled()
  })

  it('passes in my precombat main phase when nothing is playable', () => {
    setSetting('autoPass', true)
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-1',
      data: { gameId: 'g-1' },
    })
    const game = makeGameView({
      phase: 'PRECOMBAT_MAIN',
      players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: true })],
      myHand: { 'h-1': makeCard({ name: 'Lightning Bolt', parentId: 'h-1' }) },
    })
    maybeAutoPass(game)
    expect(sendPlayerBoolean).toHaveBeenCalledWith(false, 'g-1')
  })

  it('does not pass in my precombat main phase with a basic land in hand (el auto-pase no se salta el drop de tierra)', () => {
    setSetting('autoPass', true)
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-1',
      data: { gameId: 'g-1' },
    })
    const game = makeGameView({
      phase: 'PRECOMBAT_MAIN',
      players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: true, isActive: true })],
      myHand: { 'h-1': makeCard({ name: 'Mountain', parentId: 'h-1' }) },
    })
    maybeAutoPass(game)
    expect(sendPlayerBoolean).not.toHaveBeenCalled()
  })

  it('passes in the opponent main phase with a basic land in hand (no se puede jugar tierra en el turno del rival)', () => {
    setSetting('autoPass', true)
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-1',
      data: { gameId: 'g-1' },
    })
    const game = makeGameView({
      phase: 'PRECOMBAT_MAIN',
      players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: true, isActive: false })],
      myHand: { 'h-1': makeCard({ name: 'Mountain', parentId: 'h-1' }) },
    })
    maybeAutoPass(game)
    expect(sendPlayerBoolean).toHaveBeenCalledWith(false, 'g-1')
  })

  it('passes in non-main phases even with playables (el jugador solo actúa en su main phase)', () => {
    setSetting('autoPass', true)
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-1',
      data: { gameId: 'g-1' },
    })
    const game = makeGameView({
      phase: 'UPKEEP',
      players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: true })],
      canPlayObjects: { objects: { 'h-1': {} } },
      myHand: { 'h-1': makeCard({ name: 'Lightning Bolt', parentId: 'h-1' }) },
    })
    maybeAutoPass(game)
    expect(sendPlayerBoolean).toHaveBeenCalledWith(false, 'g-1')
  })
})

describe('playables consolidados', () => {
  beforeEach(() => {
    reset()
    vi.clearAllMocks()
  })

  const select = () =>
    handleMessage({
      type: 'event',
      method: 'GAME_SELECT',
      messageId: 1,
      objectId: 'g-1',
      data: {
        gameView: makeGameView({
          players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: true })],
          myHand: { 'h-1': makeCard({ name: 'Lightning Bolt', parentId: 'h-1' }) },
          canPlayObjects: { objects: { 'h-1': {} } },
        }),
      },
    })

  it('GAME_SELECT with playables sets them', () => {
    select()
    expect(getState().playableIds).toEqual(['h-1'])
  })

  it('GAME_UPDATE without canPlayObjects keeps the last playables (no flicker)', () => {
    select()
    handleMessage({
      type: 'event',
      method: 'GAME_UPDATE',
      messageId: 2,
      objectId: 'g-1',
      data: {
        gameView: makeGameView({
          players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: true })],
        }),
      },
    })
    expect(getState().playableIds).toEqual(['h-1'])
  })

  it('regression: un GAME_UPDATE con hasPriority=false en la MISMA ventana conserva los playables', () => {
    select()
    handleMessage({
      type: 'event',
      method: 'GAME_UPDATE',
      messageId: 2,
      objectId: 'g-1',
      data: {
        gameView: makeGameView({
          players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: false })],
        }),
      },
    })
    expect(getState().playableIds).toEqual(['h-1'])
  })

  it('un cambio de fase (nueva ventana) sin canPlayObjects limpia los playables', () => {
    select()
    handleMessage({
      type: 'event',
      method: 'GAME_UPDATE',
      messageId: 2,
      objectId: 'g-1',
      data: {
        gameView: makeGameView({
          phase: 'END',
          players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: false })],
        }),
      },
    })
    expect(getState().playableIds).toEqual([])
  })

  it('an empty GAME_SELECT is authoritative (playables were used)', () => {
    select()
    handleMessage({
      type: 'event',
      method: 'GAME_SELECT',
      messageId: 3,
      objectId: 'g-1',
      data: {
        gameView: makeGameView({
          players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: true })],
        }),
      },
    })
    expect(getState().playableIds).toEqual([])
  })

  it('GAME_PLAY_MANA lists battlefield mana sources', () => {
    handleMessage({
      type: 'event',
      method: 'GAME_PLAY_MANA',
      messageId: 1,
      objectId: 'g-1',
      data: {
        gameView: makeGameView({
          players: [
            makePlayer({
              playerId: 'p1',
              name: 'Alice',
              controlled: true,
              hasPriority: true,
              battlefield: { 'p-untapped': makePermanent({ name: 'Mountain', parentId: 'p-untapped' }) },
            }),
          ],
          canPlayObjects: { objects: { 'p-untapped': {} } },
        }),
      },
    })
    expect(getState().playableIds).toEqual(['p-untapped'])
  })

  it('a GAME_SELECT clears a stale GAME_TARGET dialog', () => {
    handleMessage({
      type: 'event',
      method: 'GAME_TARGET',
      messageId: 1,
      objectId: 'g-1',
      data: { message: 'Choose target', cardsView1: { 'p-1': {} } },
    })
    expect(getState().feedback?.method).toBe('GAME_TARGET')
    handleMessage({
      type: 'event',
      method: 'GAME_SELECT',
      messageId: 2,
      objectId: 'g-1',
      data: {
        gameView: makeGameView({
          players: [makePlayer({ playerId: 'p1', name: 'Alice', controlled: true, hasPriority: true })],
        }),
      },
    })
    expect(getState().feedback).toBeNull()
  })
})

describe('SIDEBOARD event', () => {
  beforeEach(() => {
    reset()
    vi.clearAllMocks()
  })

  it('parses SIDEBOARD data and sets sideboardScreen state', async () => {
    // Mock awaitCardMeta to resolve immediately
    vi.doMock('../cards/cardImages', () => ({
      awaitCardMeta: vi.fn().mockResolvedValue({ name: 'Grizzly Bears', typeLine: 'Creature', manaCost: '{1}{G}', imageUrl: null }),
    }))

    handleMessage({
      type: 'event',
      method: 'SIDEBOARD',
      messageId: 1,
      objectId: 'table-1',
      data: {
        deck: {
          name: 'Test Deck',
          cards: {
            'inst-1': { id: 'inst-1', expansionSetCode: 'IMA', cardNumber: '165' },
            'inst-2': { id: 'inst-2', expansionSetCode: 'M10', cardNumber: '147' },
          },
          sideboard: {
            'inst-3': { id: 'inst-3', expansionSetCode: 'M21', cardNumber: '59' },
          },
        },
        currentTableId: 'table-1',
        time: 120,
        flag: false,
      },
    })

    // Wait for async card resolution
    await vi.waitFor(() => {
      expect(getState().sideboardScreen).not.toBeNull()
    })

    const screen = getState().sideboardScreen!
    expect(screen.deckName).toBe('Test Deck')
    expect(screen.tableId).toBe('table-1')
    expect(screen.timeLeft).toBe(120)
    expect(screen.limited).toBe(false)
    expect(screen.maindeck).toHaveLength(2)
    expect(screen.sideboard).toHaveLength(1)
    expect(screen.maindeck[0].instanceId).toBe('inst-1')
    expect(screen.maindeck[0].setCode).toBe('IMA')
  })

  it('clears sideboardScreen on START_GAME', () => {
    setState({ sideboardScreen: { deckName: 'D', maindeck: [], sideboard: [], tableId: 't', parentTableId: null, timeLeft: 60, limited: false } })
    handleMessage({ type: 'event', method: 'START_GAME', messageId: 1, objectId: 'g-1', data: { gameId: 'g-1' } })
    expect(getState().sideboardScreen).toBeNull()
  })

  it('clears sideboardScreen on disconnect', () => {
    setState({ sideboardScreen: { deckName: 'D', maindeck: [], sideboard: [], tableId: 't', parentTableId: null, timeLeft: 60, limited: false } })
    handleMessage({ type: 'disconnected', reason: 'bye' })
    expect(getState().sideboardScreen).toBeNull()
  })
})

describe('phaseStops', () => {
  beforeEach(() => {
    reset()
    vi.clearAllMocks()
  })

  it('has default phase stops with main1 and main2 disabled', () => {
    const stops = getState().phaseStops
    expect(stops.yourTurn.main1).toBe(false)
    expect(stops.yourTurn.main2).toBe(false)
    expect(stops.yourTurn.upkeep).toBe(true)
    expect(stops.yourTurn.draw).toBe(true)
    expect(stops.yourTurn.beginCombat).toBe(true)
    expect(stops.yourTurn.endStep).toBe(true)
  })

  it('default phase stops are independent for your turn and opponent turn', () => {
    const stops = getState().phaseStops
    expect(stops.opponentTurn.main1).toBe(false)
    expect(stops.opponentTurn.upkeep).toBe(true)
  })
})

describe('active game persistence in store', () => {
  beforeEach(() => {
    reset()
    vi.clearAllMocks()
  })

  it('saves active game ID when START_GAME is received', () => {
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-persist-1',
      data: { gameId: 'g-persist-1', tableName: 'Table 1' },
    })
    expect(loadActiveGame()?.gameId).toBe('g-persist-1')
  })

  it('saves active game ID when GAME_INIT is received with objectId', () => {
    handleMessage({
      type: 'event',
      method: 'GAME_INIT',
      messageId: 1,
      objectId: 'g-init-99',
      data: minimalGameView,
    })
    expect(loadActiveGame()?.gameId).toBe('g-init-99')
  })

  it('clears active game ID when match ends (END_GAME_INFO with matchOver)', () => {
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-over-1',
      data: { gameId: 'g-over-1' },
    })
    expect(loadActiveGame()?.gameId).toBe('g-over-1')

    handleMessage({
      type: 'event',
      method: 'END_GAME_INFO',
      messageId: 2,
      objectId: 'g-over-1',
      data: { matchInfo: 'Alice won the match', matchView: { endTime: 12345 } },
    })
    expect(loadActiveGame()).toBeNull()
  })

  it('clears active game on store reset()', () => {
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-reset-1',
      data: { gameId: 'g-reset-1' },
    })
    expect(loadActiveGame()?.gameId).toBe('g-reset-1')
    reset()
    expect(loadActiveGame()).toBeNull()
  })

  it('rejects stale events from previous/orphan gameId while in an active game', () => {
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-active-2',
      data: {
        gameId: 'g-active-2',
        gameView: makeGameView({ turn: 3, step: 'PRECOMBAT_MAIN' }),
      },
    })
    expect(getState().gameId).toBe('g-active-2')
    expect(getState().game?.turn).toBe(3)

    // Stale lingering packet from previous game 'g-active-1' arrives
    handleMessage({
      type: 'event',
      method: 'GAME_UPDATE',
      messageId: 2,
      objectId: 'g-active-1',
      data: {
        gameView: makeGameView({ turn: 1, step: 'UPKEEP' }),
      },
    })

    // Active game remains on g-active-2 (turn 3), NOT overwritten by g-active-1
    expect(getState().gameId).toBe('g-active-2')
    expect(getState().game?.turn).toBe(3)
  })
})

