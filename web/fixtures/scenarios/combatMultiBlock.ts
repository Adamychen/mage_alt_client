/**
 * Escenario determinista del FixtureServer para combate con múltiples bloqueadores:
 * 1. Humano ataca con Colossal Dreadmaw (6/6).
 * 2. Sim bloquea con Grizzly Bears (2/2) y Raging Goblin (1/1).
 * 3. Paso de Orden de Bloqueadores (Damage Assignment Order - GAME_CHOOSE_CARDS_ORDER).
 * 4. Paso de Asignación de Daño (Damage Distribution - GAME_GET_MULTI_AMOUNT).
 * 5. Resolución de daño de combate.
 */

import type { FakeConn, Scenario } from '../fake'
import { makePermanent } from '../../src/__fixtures__/gameViews'
import type { CardView, GameView, PermanentView } from '../../src/net/types'
import {
  GAME_ID, TABLE_ID, SIM_NAME, HUMAN_NAME, HUMAN_PLAYER_ID, SIM_PLAYER_ID,
} from '../humanGameConstants'

export function combatMultiBlockScenario(): Scenario {
  const tableId = TABLE_ID
  const gameId = GAME_ID

  const myAttacker: PermanentView = makePermanent({
    name: 'Colossal Dreadmaw',
    displayName: 'Colossal Dreadmaw',
    parentId: 'my-dreadmaw',
    controlled: true,
    power: '6',
    toughness: '6',
    cardTypes: ['Creature'],
  })

  const simBlocker1: PermanentView = makePermanent({
    name: 'Grizzly Bears',
    displayName: 'Grizzly Bears',
    parentId: 'sim-bears',
    power: '2',
    toughness: '2',
    cardTypes: ['Creature'],
  })

  const simBlocker2: PermanentView = makePermanent({
    name: 'Raging Goblin',
    displayName: 'Raging Goblin',
    parentId: 'sim-goblin',
    power: '1',
    toughness: '1',
    cardTypes: ['Creature'],
  })

  let stage: 'attack' | 'blocked' | 'order' | 'damage' | 'resolved' = 'attack'
  let activeConn: FakeConn | null = null

  const getGameView = (combatGroups: unknown[] = []): GameView => ({
    gameId,
    turn: 3,
    phase: 'COMBAT',
    step: stage === 'attack' ? 'DECLARE_ATTACKERS' : stage === 'blocked' || stage === 'order' ? 'DECLARE_BLOCKERS' : stage === 'damage' ? 'COMBAT_DAMAGE' : 'POSTCOMBAT_MAIN',
    activePlayerId: HUMAN_PLAYER_ID,
    priorityPlayerId: HUMAN_PLAYER_ID,
    combat: combatGroups,
    players: [
      {
        playerId: HUMAN_PLAYER_ID,
        name: HUMAN_NAME,
        life: 20,
        controlled: true,
        isActive: true,
        hasPriority: true,
        battlefield: { [myAttacker.parentId!]: myAttacker },
        libraryCount: 40,
        handCount: 5,
        graveyard: {},
        exile: {},
        commandObjectList: [],
        manaPool: {},
      },
      {
        playerId: SIM_PLAYER_ID,
        name: SIM_NAME,
        life: 20,
        controlled: false,
        isActive: false,
        hasPriority: false,
        battlefield:
          stage === 'resolved'
            ? {}
            : {
                [simBlocker1.parentId!]: simBlocker1,
                [simBlocker2.parentId!]: simBlocker2,
              },
        libraryCount: 40,
        handCount: 5,
        graveyard:
          stage === 'resolved'
            ? {
                'sim-bears': { name: 'Grizzly Bears', displayName: 'Grizzly Bears', manaValue: 2 } as CardView,
                'sim-goblin': { name: 'Raging Goblin', displayName: 'Raging Goblin', manaValue: 1 } as CardView,
              }
            : {},
        exile: {},
        commandObjectList: [],
        manaPool: {},
      },
    ],
    stack: {},
    canPlayObjects: {},
  })

  const emit = (method: string, data: Record<string, unknown>) => {
    if (activeConn) activeConn.broadcast(method, data, gameId)
  }

  const table = {
    tableId: TABLE_ID,
    tableName: 'combat-multi-block',
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
      activeConn = conn
    },
    onAction: (conn, action, args, requestId) => {
      activeConn = conn
      switch (action) {
        case 'connect':
        case 'createTable':
        case 'joinGame':
        case 'watchTable':
        case 'watchGame':
          conn.ok(requestId, action, { tableId: TABLE_ID })
          conn.lobby([table])
          break
        case 'startMatch': {
          conn.ok(requestId, action, {})
          conn.broadcast('START_GAME', { gameId: GAME_ID, tableName: 'combat-multi-block' }, GAME_ID)
          conn.broadcast('GAME_INIT', { gameView: getGameView() }, GAME_ID)
          conn.broadcast(
            'GAME_SELECT',
            {
              message: 'Select attackers',
              options: { possibleAttackers: [myAttacker.parentId!], specialButton: 'All attack' },
              gameView: getGameView(),
            },
            GAME_ID
          )
          break
        }
        case 'sendPlayerUUID': {
          conn.ok(requestId, action, {})
          // Declaring Colossal Dreadmaw as attacker (taps because no vigilance)
          myAttacker.tapped = true
          const combatGroups = [{ attackers: { [myAttacker.parentId!]: {} } }]
          conn.broadcast('GAME_UPDATE', { gameView: getGameView(combatGroups) }, GAME_ID)
          conn.broadcast(
            'GAME_SELECT',
            {
              message: 'Select attackers',
              options: { possibleAttackers: [myAttacker.parentId!], specialButton: 'All attack' },
              gameView: getGameView(combatGroups),
            },
            GAME_ID
          )
          break
        }
        case 'sendPlayerBoolean': {
          conn.ok(requestId, action, {})
          if (stage === 'attack') {
            // Confirm attackers -> Sim declares 2 blockers on Colossal Dreadmaw!
            stage = 'blocked'
            const multiBlockCombat = [
              {
                attackers: { [myAttacker.parentId!]: {} },
                blockers: {
                  [simBlocker1.parentId!]: {},
                  [simBlocker2.parentId!]: {},
                },
                defenderId: SIM_PLAYER_ID,
              },
            ]
            conn.broadcast('GAME_UPDATE', { gameView: getGameView(multiBlockCombat) }, GAME_ID)

            // Next: Server asks attacker to order the blockers (Damage Assignment Order)
            stage = 'order'
            setTimeout(() => {
              conn.broadcast(
                'GAME_CHOOSE_CARDS_ORDER',
                {
                  message: 'Order blockers for Colossal Dreadmaw',
                  title: 'Order Blockers',
                  options: [
                    { id: simBlocker1.parentId!, label: 'Grizzly Bears', value: simBlocker1.parentId! },
                    { id: simBlocker2.parentId!, label: 'Raging Goblin', value: simBlocker2.parentId! },
                  ],
                  cardsView1: [
                    {
                      id: simBlocker1.parentId!,
                      name: 'Grizzly Bears',
                      displayName: 'Grizzly Bears',
                      power: '2',
                      toughness: '2',
                      cardTypes: ['Creature'],
                      manaCost: ['{1}', '{G}'],
                    },
                    {
                      id: simBlocker2.parentId!,
                      name: 'Raging Goblin',
                      displayName: 'Raging Goblin',
                      power: '1',
                      toughness: '1',
                      cardTypes: ['Creature'],
                      manaCost: ['{R}'],
                    },
                  ],
                  gameView: getGameView(multiBlockCombat),
                },
                GAME_ID
              )
            }, 1200)
          }
          break
        }
        case 'sendPlayerString': {
          conn.ok(requestId, action, {})
          if (stage === 'order') {
            // Blocker order confirmed -> Prompt for damage distribution
            stage = 'damage'
            const multiBlockCombat = [
              {
                attackers: { [myAttacker.parentId!]: {} },
                blockers: {
                  [simBlocker1.parentId!]: {},
                  [simBlocker2.parentId!]: {},
                },
                defenderId: SIM_PLAYER_ID,
              },
            ]
            conn.broadcast(
              'GAME_GET_MULTI_AMOUNT',
              {
                message: 'Asigna el daño de combate de Colossal Dreadmaw (6 puntos)',
                messages: [
                  { id: simBlocker1.parentId!, message: 'Daño a Grizzly Bears (mínimo 2 letal)', min: 2, max: 5, defaultValue: 2 },
                  { id: simBlocker2.parentId!, message: 'Daño a Raging Goblin (restante)', min: 1, max: 4, defaultValue: 4 },
                ],
                gameView: getGameView(multiBlockCombat),
              },
              GAME_ID
            )
          } else if (stage === 'damage') {
            // Damage amounts sent -> Resolve combat damage and cleanup blockers
            stage = 'resolved'
            conn.broadcast('GAME_UPDATE', { gameView: getGameView([]) }, GAME_ID)
            conn.broadcast(
              'GAME_INFORM',
              { message: 'Colossal Dreadmaw asigna 2 de daño a Grizzly Bears y 4 de daño a Raging Goblin. Ambos bloqueadores mueren.' },
              GAME_ID
            )
          }
          break
        }
        default:
          conn.ok(requestId, action, {})
          break
      }
    },
  }
}
