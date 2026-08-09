import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Gateway } from './Gateway'
import * as commands from './commands'

describe('commands', () => {
  const send = vi.fn().mockResolvedValue({ ok: true, data: [] })

  beforeEach(() => {
    send.mockClear()
    commands.setGateway({ send } as unknown as Gateway)
  })

  it('maps lobby and table commands to the protocol', async () => {
    await commands.connect('localhost', 17171, 'alice', 'secret')
    await commands.getGameTypes()
    await commands.getPlayerTypes()
    await commands.getDeckTypes()
    await commands.getRoomChatId()
    await commands.sendChatMessage('chat-1', 'hello')
    await commands.createTable({ name: 'table', gameType: 'duel', deckType: 'modern', winsNeeded: 1, playerTypes: ['HUMAN'] })
    await commands.joinTable({ tableId: 'table-1', playerName: 'alice', playerType: 'HUMAN', deck: { name: 'deck', cards: [], sideboard: [] } })
    await commands.startMatch('table-1')
    await commands.watchTable('table-1')
    await commands.watchGame('game-1')
    await commands.stopWatching('game-1')
    await commands.leaveTable('table-1')
    await commands.removeTable('table-1')

    expect(send).toHaveBeenCalledWith('connect', { host: 'localhost', port: 17171, username: 'alice', password: 'secret' })
    expect(send).toHaveBeenCalledWith('sendChatMessage', { chatId: 'chat-1', text: 'hello' })
    expect(send).toHaveBeenCalledWith('watchGame', { gameId: 'game-1' })
    expect(send).toHaveBeenCalledWith('joinTable', expect.objectContaining({ tableId: 'table-1', playerType: 'HUMAN' }))
  })

  it('maps every player input with the gameId', async () => {
    await commands.sendPlayerAction('PASS_PRIORITY_UNTIL_STACK_RESOLVED', 'game-1')
    await commands.sendPlayerBoolean(true, 'game-1')
    await commands.sendPlayerInteger(2, 'game-1')
    await commands.sendPlayerString('choice', 'game-1')
    await commands.sendPlayerUUID('card-1', 'game-1')
    await commands.sendPlayerManaType('game-1', 'player-1', 'RED')
    await commands.quitMatch('game-1')
    await commands.disconnect()

    expect(send).toHaveBeenCalledWith('sendPlayerAction', { action: 'PASS_PRIORITY_UNTIL_STACK_RESOLVED', gameId: 'game-1', data: undefined })
    expect(send).toHaveBeenCalledWith('sendPlayerBoolean', { value: true, gameId: 'game-1' })
    expect(send).toHaveBeenCalledWith('sendPlayerManaType', { gameId: 'game-1', playerId: 'player-1', manaType: 'RED' })
    expect(send).toHaveBeenCalledWith('quitMatch', { gameId: 'game-1' })
    expect(send).toHaveBeenCalledWith('disconnect')
  })
})
