/**
 * Escenario del FixtureServer para full-flow.spec.ts: demo "IA vs IA"
 * (espectador). La partida avanza con un timeline determinista (fases por
 * reloj) y sin motor de reglas: la UI solo verifica render, log y avance.
 */

import type { FakeConn, Scenario } from '../fake'
import { makeCard, makeGameView } from '../../src/__fixtures__/gameViews'
import type { CardView, GameView, SeatView, TableView } from '../../src/net/types'

const GAME_ID = 'game-demo-1'
const TABLE_ID = 'table-demo-1'
const SIM_NAMES = ['sim-000130-188', 'sim-000130-189']

const PHASES: Array<[string, string]> = [
  ['BEGINNING', 'UPKEEP'],
  ['BEGINNING', 'DRAW'],
  ['PRECOMBAT_MAIN', 'PRECOMBAT_MAIN'],
  ['COMBAT', 'BEGIN_COMBAT'],
  ['COMBAT', 'DECLARE_ATTACKERS'],
  ['COMBAT', 'END_COMBAT'],
  ['POSTCOMBAT_MAIN', 'POSTCOMBAT_MAIN'],
  ['END', 'END_TURN'],
]

export interface FullFlowOptions {
  /** ms entre GAME_UPDATEs del timeline. */
  updateMs?: number
  /** nº total de updates antes del END_GAME_INFO. */
  maxUpdates?: number
}

function spectatorView(turn: number, phaseIndex: number, withBolt: boolean): GameView {
  const [phase, step] = PHASES[phaseIndex]
  const active = SIM_NAMES[(turn - 1) % SIM_NAMES.length]
  const view = makeGameView({
    myPlayerId: null,
    turn,
    phase,
    step,
    activePlayerId: `player-${turn}`,
    activePlayerName: active,
    priorityPlayerName: active,
    watchedHands: {
      [SIM_NAMES[0]]: { [turn * 2]: { id: String(turn * 2) } },
      [SIM_NAMES[1]]: { [turn * 2 + 1]: { id: String(turn * 2 + 1) } },
    },
    stack: withBolt ? ({ 's-1': makeCard({ name: 'Lightning Bolt', parentId: 's-1' }) } as Record<string, CardView>) : {},
  }) as GameView & { players?: unknown }
  // espectador: el proxy omite la clave `players`
  delete view.players
  return view
}

function demoTable(): TableView {
  const seats: SeatView[] = [
    { playerName: SIM_NAMES[0], seatIndex: 0, playerType: 'SIM' },
    { playerName: SIM_NAMES[1], seatIndex: 1, playerType: 'SIM' },
  ]
  return {
    tableId: TABLE_ID,
    gameType: 'Two Player Duel',
    deckType: 'Constructed - Modern',
    tableName: 'Demo IA vs IA',
    controllerName: 'demo',
    additionalInfoShort: '2/2',
    additionalInfoFull: '',
    createTime: Date.now(),
    tableState: 'PLAYING',
    skillLevel: 'Casual',
    tableStateText: 'Partida en curso',
    seatsInfo: `${SIM_NAMES[0]} / ${SIM_NAMES[1]}`,
    isTournament: false,
    seats,
    games: [GAME_ID],
    quitRatio: '100',
    minimumRating: '0',
    limited: false,
    rated: false,
    passworded: false,
    spectatorsAllowed: true,
  }
}

export function fullFlowScenario(options: FullFlowOptions = {}): Scenario {
  const updateMs = options.updateMs ?? 700
  const maxUpdates = options.maxUpdates ?? 40
  let watching = false
  let updates = 0
  let phaseIndex = 0
  let turn = 1

  const pushUpdate = (conn: FakeConn) => {
    if (!watching || updates >= maxUpdates) return
    updates++
    const withBolt = updates % 7 === 3
    conn.event('GAME_UPDATE', { gameView: spectatorView(turn, phaseIndex, withBolt) }, GAME_ID)
    if (updates % 6 === 0) {
      conn.event(
        'GAME_UPDATE_AND_INFORM',
        { gameView: spectatorView(turn, phaseIndex, withBolt), message: `${SIM_NAMES[(turn - 1) % 2]} plays a Mountain` },
        GAME_ID,
      )
    }
    phaseIndex = (phaseIndex + 1) % PHASES.length
    if (phaseIndex === 0) turn++
    if (updates >= maxUpdates) {
      conn.event('END_GAME_INFO', { gameId: GAME_ID }, GAME_ID)
      watching = false
    }
  }

  return {
    onConnect(conn) {
      conn.raw({ type: 'connected', message: 'Proxy ready. Send {"action":"connect",...} to log in.' })
      conn.raw({ type: 'info', message: 'Proxy ready. Send {"action":"connect",...} to log in.' })
    },
    onStart(conn) {
      const lobbyTimer = setInterval(() => conn.lobby([demoTable()]), 2000)
      const updateTimer = setInterval(() => pushUpdate(conn), updateMs)
      return () => {
        clearInterval(lobbyTimer)
        clearInterval(updateTimer)
      }
    },
    onAction(conn, action, args, requestId) {
      switch (action) {
        case 'connect':
          conn.ok(requestId, action, {})
          break
        case 'createTable':
          conn.ok(requestId, action, { tableId: TABLE_ID })
          break
        case 'startMatch':
          conn.ok(requestId, action, {})
          break
        case 'watchTable':
          conn.ok(requestId, action, {})
          // el servidor llama al callback watchGame del watcher tras un instante
          setTimeout(() => {
            conn.event('WATCHGAME', { gameId: GAME_ID, tableName: 'Demo IA vs IA' }, GAME_ID)
          }, 300)
          break
        case 'watchGame':
          conn.ok(requestId, action, {})
          watching = true
          updates = 0
          phaseIndex = 0
          turn = 1
          conn.event('GAME_INIT', { gameView: spectatorView(turn, phaseIndex, false) }, GAME_ID)
          break
        case 'joinGame':
        case 'quitMatch':
        case 'removeTable':
        case 'leaveTable':
        case 'stopWatching':
          conn.ok(requestId, action, {})
          break
        default:
          // acciones de lobby sin lógica (chat, tipos, etc.): ok genérico
          if (action !== 'disconnect') conn.ok(requestId, action, undefined)
          break
      }
    },
  }
}
