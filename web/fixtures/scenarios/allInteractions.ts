/**
 * Escenario del FixtureServer para probar todas las interacciones interactivas de MTG:
 * 1. GAME_ASK (Pregunta binaria Sí/No, ej. Shockland)
 * 2. GAME_CHOOSE_COLOR (Selector de color de maná, ej. Utopia Sprawl)
 * 3. GAME_CHOOSE_PILE (Elección de pila, ej. Fact or Fiction)
 * 4. GAME_TARGET con cardsView1 (Cuadrícula CardGrid para tutores y búsquedas)
 * 5. GAME_CHOOSE_CARDS_ORDER (Scry / Surveil / Reordenar biblioteca con botones Top/Bottom)
 */

import type { FakeConn, Scenario } from '../fake'
import { makeCard, makePermanent } from '../../src/__fixtures__/gameViews'
import type { CardView, GameView, PlayerView } from '../../src/net/types'
import {
  GAME_ID, TABLE_ID, SIM_NAME, HUMAN_NAME, HUMAN_PLAYER_ID, SIM_PLAYER_ID,
} from '../humanGameConstants'

export function allInteractionsScenario(): Scenario {
  const tableId = TABLE_ID
  const gameId = GAME_ID

  let stage: 'ask' | 'color' | 'pile' | 'tutor' | 'scry' | 'finished' = 'ask'
  let activeConn: FakeConn | null = null

  const commanderCard: CardView = makeCard({
    id: 'cmd-atraxa',
    name: "Atraxa, Praetors' Voice",
    displayName: "Atraxa, Praetors' Voice",
    manaCostLeftStr: ['{G}{W}{U}{B}'],
    manaValue: 4,
    power: '4',
    toughness: '4',
    cardTypes: ['Creature'],
  })

  const getGameView = (): GameView => {
    const humanPlayer: PlayerView = {
      playerId: HUMAN_PLAYER_ID,
      name: HUMAN_NAME,
      life: 20,
      controlled: true,
      isHuman: true,
      hasPriority: true,
      isActive: true,
      handCount: 4,
      libraryCount: 40,
      commandList: [
        {
          ...commanderCard,
          id: 'cmd-atraxa',
          parentId: 'cmd-atraxa',
          isCommander: true,
          castCount: 1,
        },
      ],
      battlefield: {
        'land-blood-crypt': makePermanent({
          name: 'Blood Crypt',
          displayName: 'Blood Crypt',
          parentId: 'land-blood-crypt',
          controlled: true,
          cardTypes: ['Land'],
        }),
      },
    }

    const simPlayer: PlayerView = {
      playerId: SIM_PLAYER_ID,
      name: SIM_NAME,
      life: 20,
      controlled: false,
      isHuman: false,
      hasPriority: false,
      isActive: false,
      handCount: 5,
      libraryCount: 40,
      battlefield: {},
    }

    return {
      gameId,
      turn: 2,
      phase: 'PRECOMBAT_MAIN',
      step: 'PRECOMBAT_MAIN',
      activePlayerId: HUMAN_PLAYER_ID,
      priorityPlayerId: HUMAN_PLAYER_ID,
      players: [humanPlayer, simPlayer],
      myHand: {
        'hand-demonic-tutor': makeCard({
          id: 'hand-demonic-tutor',
          name: 'Demonic Tutor',
          displayName: 'Demonic Tutor',
          manaCostLeftStr: ['{1}{B}'],
          manaValue: 2,
          cardTypes: ['Sorcery'],
        }),
        'hand-ponder': makeCard({
          id: 'hand-ponder',
          name: 'Ponder',
          displayName: 'Ponder',
          manaCostLeftStr: ['{U}'],
          manaValue: 1,
          cardTypes: ['Sorcery'],
        }),
      },
      canPlayObjects: {
        objects: {
          'cmd-atraxa': { basicCastAbilities: [{ id: 'cmd-atraxa', value: 'Cast Commander' }] },
          'hand-demonic-tutor': { basicCastAbilities: [{ id: 'hand-demonic-tutor', value: 'Cast' }] },
          'hand-ponder': { basicCastAbilities: [{ id: 'hand-ponder', value: 'Cast' }] },
        },
      },
    }
  }

  const table = {
    tableId,
    tableName: 'all-interactions-test',
    controllerName: HUMAN_NAME,
    gameType: 'Two Player Duel',
    deckType: 'Constructed - Standard',
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

  const tutorCards: Record<string, CardView> = {
    'c-lotus': makeCard({ id: 'c-lotus', name: 'Black Lotus', displayName: 'Black Lotus', manaCostLeftStr: ['{0}'], manaValue: 0, cardTypes: ['Artifact'] }),
    'c-recall': makeCard({ id: 'c-recall', name: 'Ancestral Recall', displayName: 'Ancestral Recall', manaCostLeftStr: ['{U}'], manaValue: 1, cardTypes: ['Instant'] }),
    'c-timewalk': makeCard({ id: 'c-timewalk', name: 'Time Walk', displayName: 'Time Walk', manaCostLeftStr: ['{1}{U}'], manaValue: 2, cardTypes: ['Sorcery'] }),
    'c-solring': makeCard({ id: 'c-solring', name: 'Sol Ring', displayName: 'Sol Ring', manaCostLeftStr: ['{1}'], manaValue: 1, cardTypes: ['Artifact'] }),
    'c-bolt': makeCard({ id: 'c-bolt', name: 'Lightning Bolt', displayName: 'Lightning Bolt', manaCostLeftStr: ['{R}'], manaValue: 1, cardTypes: ['Instant'] }),
    'c-counter': makeCard({ id: 'c-counter', name: 'Counterspell', displayName: 'Counterspell', manaCostLeftStr: ['{U}{U}'], manaValue: 2, cardTypes: ['Instant'] }),
    'c-demonic': makeCard({ id: 'c-demonic', name: 'Demonic Tutor', displayName: 'Demonic Tutor', manaCostLeftStr: ['{1}{B}'], manaValue: 2, cardTypes: ['Sorcery'] }),
    'c-swords': makeCard({ id: 'c-swords', name: 'Swords to Plowshares', displayName: 'Swords to Plowshares', manaCostLeftStr: ['{W}'], manaValue: 1, cardTypes: ['Instant'] }),
    'c-mox': makeCard({ id: 'c-mox', name: 'Mox Sapphire', displayName: 'Mox Sapphire', manaCostLeftStr: ['{0}'], manaValue: 0, cardTypes: ['Artifact'] }),
    'c-force': makeCard({ id: 'c-force', name: 'Force of Will', displayName: 'Force of Will', manaCostLeftStr: ['{3}{U}{U}'], manaValue: 5, cardTypes: ['Instant'] }),
    'c-darkrit': makeCard({ id: 'c-darkrit', name: 'Dark Ritual', displayName: 'Dark Ritual', manaCostLeftStr: ['{B}'], manaValue: 1, cardTypes: ['Instant'] }),
    'c-birds': makeCard({ id: 'c-birds', name: 'Birds of Paradise', displayName: 'Birds of Paradise', manaCostLeftStr: ['{G}'], manaValue: 1, cardTypes: ['Creature'] }),
  }

  const scryCards: Record<string, CardView> = {
    'scry-ponder': makeCard({ id: 'scry-ponder', name: 'Ponder', displayName: 'Ponder', manaCostLeftStr: ['{U}'], manaValue: 1, cardTypes: ['Sorcery'] }),
    'scry-brainstorm': makeCard({ id: 'scry-brainstorm', name: 'Brainstorm', displayName: 'Brainstorm', manaCostLeftStr: ['{U}'], manaValue: 1, cardTypes: ['Instant'] }),
    'scry-opt': makeCard({ id: 'scry-opt', name: 'Opt', displayName: 'Opt', manaCostLeftStr: ['{U}'], manaValue: 1, cardTypes: ['Instant'] }),
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
          conn.broadcast('START_GAME', { gameId: GAME_ID, tableName: 'all-interactions-test' }, GAME_ID)
          conn.broadcast('GAME_INIT', { gameView: getGameView() }, GAME_ID)
          // 1. GAME_ASK
          stage = 'ask'
          conn.broadcast(
            'GAME_ASK',
            {
              message: '¿Deseas pagar 2 vidas para que Blood Crypt entre al campo enderezada?',
              gameView: getGameView(),
            },
            GAME_ID
          )
          break
        }

        case 'sendPlayerBoolean': {
          conn.ok(requestId, action, {})
          if (stage === 'ask') {
            // Avanzar a 2. GAME_CHOOSE_COLOR
            stage = 'color'
            conn.broadcast(
              'GAME_CHOOSE_CHOICE',
              {
                choice: {
                  message: 'Elige un color de maná para Utopia Sprawl',
                  keyChoices: {
                    White: 'White',
                    Blue: 'Blue',
                    Black: 'Black',
                    Red: 'Red',
                    Green: 'Green',
                  },
                },
                gameView: getGameView(),
              },
              GAME_ID
            )
          } else if (stage === 'pile') {
            // Avanzar a 4. GAME_TARGET con CardGrid (Tutor)
            stage = 'tutor'
            conn.broadcast(
              'GAME_TARGET',
              {
                message: 'Busca una carta en tu biblioteca (Demonic Tutor)',
                cardsView1: tutorCards,
                required: true,
                min: 1,
                max: 1,
                gameView: getGameView(),
              },
              GAME_ID
            )
          }
          break
        }

        case 'sendPlayerString': {
          conn.ok(requestId, action, {})
          if (stage === 'color') {
            // Avanzar a 3. GAME_CHOOSE_PILE
            stage = 'pile'
            conn.broadcast(
              'GAME_CHOOSE_PILE',
              {
                message: 'Fact or Fiction: Elige una pila de cartas para poner en tu mano',
                cardsView1: {
                  'p1-bolt': makeCard({ id: 'p1-bolt', name: 'Lightning Bolt', displayName: 'Lightning Bolt', manaCostLeftStr: ['{R}'], manaValue: 1 }),
                  'p1-counter': makeCard({ id: 'p1-counter', name: 'Counterspell', displayName: 'Counterspell', manaCostLeftStr: ['{U}{U}'], manaValue: 2 }),
                  'p1-brainstorm': makeCard({ id: 'p1-brainstorm', name: 'Brainstorm', displayName: 'Brainstorm', manaCostLeftStr: ['{U}'], manaValue: 1 }),
                },
                cardsView2: {
                  'p2-jace': makeCard({ id: 'p2-jace', name: 'Jace, the Mind Sculptor', displayName: 'Jace, the Mind Sculptor', manaCostLeftStr: ['{2}{U}{U}'], manaValue: 4 }),
                  'p2-island': makeCard({ id: 'p2-island', name: 'Island', displayName: 'Island', manaValue: 0 }),
                },
                gameView: getGameView(),
              },
              GAME_ID
            )
          } else if (stage === 'scry') {
            stage = 'finished'
            conn.broadcast('GAME_UPDATE', { gameView: getGameView() }, GAME_ID)
            conn.broadcast(
              'GAME_SELECT',
              {
                message: 'Prioridad en Fase Principal (M1)',
                gameView: getGameView(),
              },
              GAME_ID
            )
          }
          break
        }

        case 'sendPlayerUUID': {
          conn.ok(requestId, action, {})
          if (stage === 'tutor') {
            // Avanzar a 5. GAME_CHOOSE_CARDS_ORDER (Scry 3)
            stage = 'scry'
            conn.broadcast(
              'GAME_CHOOSE_CARDS_ORDER',
              {
                message: 'Scry 3: Ordena las cartas de tu biblioteca o ponlas al fondo',
                cardsView1: scryCards,
                gameView: getGameView(),
              },
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
