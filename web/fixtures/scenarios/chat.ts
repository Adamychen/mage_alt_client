/**
 * Escenario del FixtureServer para chat.spec.ts: login, chat de sala y
 * chat en partida. Emite CHATMESSAGE cuando el cliente envía mensajes.
 */

import type { FakeConn, Scenario } from '../fake'
import { makeGameView } from '../../src/__fixtures__/gameViews'
import type { GameView, TableView } from '../../src/net/types'

const GAME_ID = 'game-chat-1'
const TABLE_ID = 'table-chat-1'
const ROOM_CHAT_ID = 'room-chat-1'
const GAME_CHAT_ID = 'game-chat-1'

function playerView(): GameView {
  return makeGameView({
    myPlayerId: 'player-1',
    turn: 1,
    phase: 'PRECOMBAT_MAIN',
    step: 'PRECOMBAT_MAIN',
    activePlayerId: 'player-1',
    activePlayerName: 'player-1',
    priorityPlayerName: 'player-1',
  }) as GameView
}

function demoTable(): TableView {
  return {
    tableId: TABLE_ID,
    gameType: 'Two Player Duel',
    deckType: 'Constructed - Modern',
    tableName: 'Chat Test',
    controllerName: 'player-1',
    additionalInfoShort: '1/2',
    additionalInfoFull: '',
    createTime: Date.now(),
    tableState: 'WAITING',
    skillLevel: 'Casual',
    tableStateText: 'Esperando jugadores',
    seatsInfo: 'player-1',
    isTournament: false,
    seats: [{ playerName: 'player-1', seatIndex: 0, playerType: 'HUMAN' }],
    games: [],
    quitRatio: '100',
    minimumRating: '0',
    limited: false,
    rated: false,
    passworded: false,
    spectatorsAllowed: true,
  }
}

export function chatScenario(): Scenario {
  let watching = false
  let chatSeq = 0

  return {
    onConnect(conn) {
      conn.raw({ type: 'connected', message: 'Proxy ready.' })
      conn.raw({ type: 'info', message: 'Proxy ready.' })
    },
    onStart(conn) {
      const lobbyTimer = setInterval(() => conn.lobby([demoTable()]), 2000)
      return () => clearInterval(lobbyTimer)
    },
    onAction(conn, action, args, requestId) {
      switch (action) {
        case 'connect':
          conn.ok(requestId, action, {})
          break
        case 'getRoomChatId':
          conn.ok(requestId, action, ROOM_CHAT_ID)
          break
        case 'getGameChatId':
          conn.ok(requestId, action, GAME_CHAT_ID)
          break
        case 'sendChatMessage': {
          const text = String(args.text ?? '')
          const chatId = String(args.chatId ?? '')
          conn.ok(requestId, action, true)
          if (text && chatId) {
            chatSeq++
            conn.broadcast(
              'CHATMESSAGE',
              { chatId, username: 'player-1', message: text },
              chatId,
            )
          }
          break
        }
        case 'createTable':
          conn.ok(requestId, action, { tableId: TABLE_ID })
          break
        case 'startMatch':
          conn.ok(requestId, action, {})
          break
        case 'watchTable':
          conn.ok(requestId, action, {})
          setTimeout(() => {
            conn.event('WATCHGAME', { gameId: GAME_ID, tableName: 'Chat Test' }, GAME_ID)
          }, 300)
          break
        case 'watchGame':
          conn.ok(requestId, action, {})
          watching = true
          conn.event('GAME_INIT', { gameView: playerView() }, GAME_ID)
          break
        case 'joinGame':
        case 'quitMatch':
        case 'removeTable':
        case 'leaveTable':
        case 'stopWatching':
          conn.ok(requestId, action, {})
          break
        default:
          if (action !== 'disconnect') conn.ok(requestId, action, undefined)
          break
      }
    },
  }
}
