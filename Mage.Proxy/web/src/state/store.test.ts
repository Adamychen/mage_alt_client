import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPlayerBoolean } from '../net/commands'
import { makeGameView, makePlayer, minimalGameView } from '../__fixtures__/gameViews'
import { getState, handleMessage, maybeAutoPass, reset, setSetting } from './store'

vi.mock('../net/commands', () => ({
  setGateway: vi.fn(),
  getGateway: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getGameTypes: vi.fn(),
  getPlayerTypes: vi.fn(),
  getDeckTypes: vi.fn(),
  getRoomChatId: vi.fn(),
  sendChatMessage: vi.fn(),
  createTable: vi.fn(),
  joinTable: vi.fn(),
  startMatch: vi.fn(),
  watchTable: vi.fn(),
  watchGame: vi.fn(),
  stopWatching: vi.fn(),
  leaveTable: vi.fn(),
  removeTable: vi.fn(),
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

  it('START_GAME sets phase "game" and the gameId', () => {
    handleMessage({
      type: 'event',
      method: 'START_GAME',
      messageId: 1,
      objectId: 'g-42',
      data: { gameId: 'g-42', tableName: 'Test table' },
    })
    expect(getState().phase).toBe('game')
    expect(getState().gameId).toBe('g-42')
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
})
