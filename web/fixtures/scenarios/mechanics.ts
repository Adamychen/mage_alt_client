import type { Scenario } from '../fake'
import { makeGameView, makePermanent, makePlayer } from '../../src/__fixtures__/gameViews'
import { GAME_ID, HUMAN_NAME, HUMAN_PLAYER_ID, SIM_NAME, SIM_PLAYER_ID, TABLE_ID } from '../humanGameConstants'

export function mechanicsScenario(): Scenario {
  const gameView = makeGameView({
    gameId: GAME_ID,
    turn: 3,
    phase: 'PRECOMBAT_MAIN',
    step: 'PRECOMBAT_MAIN',
    activePlayerId: HUMAN_PLAYER_ID,
    priorityPlayerId: HUMAN_PLAYER_ID,
    players: [
      makePlayer({
        playerId: HUMAN_PLAYER_ID,
        name: HUMAN_NAME,
        controlled: true,
        isHuman: true,
        life: 18,
        monarch: true,
        counters: [
          { name: 'Poison', count: 3 },
          { name: 'Energy', count: 5 },
        ],
        designationNames: ['Night', "City's Blessing"],
        commandList: [
          {
            id: 'ring-1',
            name: 'The Ring',
            rules: [
              'Your Ring-bearer is legendary and cannot be blocked by creatures with greater power.',
              'Whenever your Ring-bearer attacks, draw a card, then discard a card.',
            ],
          },
          {
            id: 'dung-1',
            name: 'Undercity',
            cardTypes: ['Dungeon'],
            currentRoom: 'Forge',
          },
        ],
        battlefield: {
          sam1: makePermanent({
            id: 'sam1',
            name: 'Samwise Gamgee',
            parentId: 'sam1',
            controlled: true,
            isRingBearer: true,
          } as any),
          land1: makePermanent({
            id: 'land1',
            name: 'Mountain',
            parentId: 'land1',
            controlled: true,
            cardTypes: ['Land'],
          }),
        },
      }),
      makePlayer({
        playerId: SIM_PLAYER_ID,
        name: SIM_NAME,
        controlled: false,
        isHuman: false,
        life: 20,
        initiative: true,
        battlefield: {
          oppLand1: makePermanent({
            id: 'oppLand1',
            name: 'Island',
            parentId: 'oppLand1',
            cardTypes: ['Land'],
          }),
        },
      }),
    ],
  })

  const table = {
    tableId: TABLE_ID,
    tableName: 'Mechanics & Reminder Showcase',
    gameType: 'Two Player Duel',
    deckType: 'Constructed - Modern',
    controllerName: 'e2e',
    additionalInfoShort: '2/2',
    additionalInfoFull: '',
    createTime: Date.now(),
    tableState: 'READY_TO_START',
    skillLevel: 'Casual',
    tableStateText: 'Lista',
    seatsInfo: '2/2',
    isTournament: false,
    seats: [
      { playerName: HUMAN_NAME, seatIndex: 0, playerType: 'HUMAN' },
      { playerName: SIM_NAME, seatIndex: 1, playerType: 'SIM' },
    ],
    games: [GAME_ID],
    quitRatio: '100',
    minimumRating: '0',
    limited: false,
  }

  return {
    onConnect: (conn) => {
      conn.raw({ type: 'connected', message: 'Proxy ready.' })
      conn.raw({ type: 'info', message: 'Proxy ready.' })
      conn.lobby([table])
    },
    onAction: (conn, action, args, requestId) => {
      switch (action) {
        case 'connect':
          conn.ok(requestId, action, {})
          break
        case 'createTable':
          conn.ok(requestId, action, { tableId: TABLE_ID })
          conn.lobby([table])
          break
        case 'startMatch':
          conn.ok(requestId, action, {})
          conn.broadcast('START_GAME', { gameId: GAME_ID, tableName: 'Mechanics & Reminder Showcase' }, GAME_ID)
          conn.broadcast('GAME_INIT', { gameView }, GAME_ID)
          conn.broadcast(
            'GAME_SELECT',
            {
              message: 'Main 1: Cast spells or activate abilities',
              options: { specialButton: 'Pass' },
              gameView,
            },
            GAME_ID,
          )
          break
        case 'sendPlayerAction':
        case 'sendPlayerBoolean':
        case 'sendPlayerInteger':
        case 'sendPlayerUUID':
        case 'sendPlayerString':
          conn.ok(requestId, action, {})
          conn.broadcast('GAME_UPDATE', { gameView }, GAME_ID)
          break
        default:
          conn.ok(requestId, action, undefined)
          break
      }
    },
  }
}
