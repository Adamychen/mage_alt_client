/**
 * Mini-motor determinista de "partida humana vs Sim" para los escenarios del
 * FixtureServer (spells, targeting, combat). No hay motor de reglas: un script
 * reacciona a las acciones del helper/test (tierras, cast, pago, pases) y
 * emite los eventos XMage que la UI consume. El estado es COMPARTIDO entre
 * todas las conexiones del servidor (la página y el HumanHelper WS ven la
 * misma partida) gracias al broadcast de FakeServer.
 */

import type { FakeConn, Scenario } from '../fake'
import { makeCard, makeGameView, makePlayer, makePermanent } from '../../src/__fixtures__/gameViews'
import type { CardView, GameView, PermanentView, SeatView, TableView } from '../../src/net/types'

export const GAME_ID = 'game-human-1'
export const TABLE_ID = 'table-human-1'
export const SIM_NAME = 'sim-000001-244'
export const HUMAN_NAME = 'Mage Web'
export const HUMAN_PLAYER_ID = 'human-1'
export const SIM_PLAYER_ID = 'opp-1'

const BASIC_LANDS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'])

export type CastStep =
  | { type: 'amount'; message: string; min?: number; max?: number }
  | { type: 'ability'; message: string; choices: Array<{ id: string; label: string }> }
  | { type: 'target'; message: string; targets?: string[] }
  | { type: 'mana'; message: string; sources: number }

export interface LandConfig {
  name: string
  count: number
}

export interface ResolveEffect {
  addToMyBattle?: Array<{ name: string; counters?: { name: string; count: number }[] }>
}

export interface HumanGameOptions {
  tableName?: string
  lands?: LandConfig[]
  hand: string[]
  playable?: string[]
  cast?: CastStep[]
  damageToSim?: number
  resolveEffect?: ResolveEffect
  simBattle?: string[]
  simAttack?: boolean
  simCombatDamage?: number
}

interface CastRuntime {
  index: number
  manaLeft: number
}

export class HumanGame {
  readonly tableName: string
  readonly gameId = GAME_ID
  readonly tableId = TABLE_ID
  readonly simName = SIM_NAME

  private conn: FakeConn | null = null
  private hand: Array<{ id: string; name: string }> = []
  private myBattle: PermanentView[] = []
  private simBattle: PermanentView[] = []
  private humanLife = 20
  private simLife = 20
  private turn = 1
  private phase = 'PRECOMBAT_MAIN'
  private active: 'human' | 'sim' = 'human'
  private priority: 'human' | 'sim' = 'human'
  private stack: Record<string, CardView> = {}
  private combat: unknown[] = []
  private stage: 'lobby' | 'main' | 'cast' | 'sim' | 'end' = 'lobby'
  private cast: CastRuntime | null = null
  private playedLandTurn = -1
  private started = false

  constructor(private readonly options: HumanGameOptions) {
    this.tableName = options.tableName ?? 'Mesa E2E'
    for (const land of options.lands ?? []) {
      for (let i = 0; i < land.count; i++) {
        this.myBattle.push(makePermanent({ name: land.name, parentId: `land-${i}`, controlled: true }))
      }
    }
    this.hand = options.hand.map((name, i) => ({ id: `human-${i}`, name }))
    this.simBattle = (options.simBattle ?? []).map((name) => makePermanent({ name, parentId: `sim-${name}` }))
  }

  scenario(): Scenario {
    return {
      onConnect: (conn) => {
        conn.raw({ type: 'connected', message: 'Proxy ready. Send {"action":"connect",...} to log in.' })
        conn.raw({ type: 'info', message: 'Proxy ready. Send {"action":"connect",...} to log in.' })
        conn.lobby([this.table()])
        if (!this.conn) this.conn = conn
      },
      onAction: (conn, action, args, requestId) => {
        if (!this.conn) this.conn = conn
        switch (action) {
          case 'connect':
            conn.ok(requestId, action, {})
            break
          case 'createTable':
            conn.ok(requestId, action, { tableId: this.tableId })
            conn.lobby([this.table()])
            break
          case 'startMatch':
            conn.ok(requestId, action, {})
            this.start()
            break
          case 'joinGame':
          case 'watchTable':
          case 'watchGame':
          case 'quitMatch':
          case 'removeTable':
          case 'leaveTable':
          case 'stopWatching':
          case 'sendPlayerString':
          case 'sendPlayerManaType':
            conn.ok(requestId, action, {})
            break
          case 'sendPlayerUUID':
            this.onUUID(conn, requestId, action, String(args.value ?? ''))
            break
          case 'sendPlayerBoolean':
            this.onBoolean(conn, requestId, action, args.value === true)
            break
          case 'sendPlayerInteger':
            this.onInteger(conn, requestId, action, Number(args.value))
            break
          default:
            conn.ok(requestId, action, undefined)
            break
        }
      },
    }
  }

  private table(): TableView {
    const seats: SeatView[] = [
      { playerName: HUMAN_NAME, seatIndex: 0, playerType: 'HUMAN' },
      { playerName: this.simName, seatIndex: 1, playerType: 'SIM' },
    ]
    return {
      tableId: this.tableId,
      gameType: 'Two Player Duel',
      deckType: 'Constructed - Modern',
      tableName: this.tableName,
      controllerName: 'e2e',
      additionalInfoShort: '2/2',
      additionalInfoFull: '',
      createTime: Date.now(),
      tableState: 'READY_TO_START',
      skillLevel: 'Casual',
      tableStateText: 'Lista',
      seatsInfo: '2/2',
      isTournament: false,
      seats,
      games: [this.gameId],
      quitRatio: '100',
      minimumRating: '0',
      limited: false,
      rated: false,
      passworded: false,
      spectatorsAllowed: true,
    }
  }

  private start(): void {
    if (this.started) return
    this.started = true
    this.stage = 'main'
    this.phase = 'PRECOMBAT_MAIN'
    this.active = 'human'
    this.priority = 'human'
    this.emit('START_GAME', { gameId: this.gameId, tableName: this.tableName })
    this.emit('GAME_INIT', { gameView: this.view() })
    this.emit('GAME_SELECT', { gameView: this.view() })
  }

  private emit(method: string, data: unknown): void {
    if (this.conn) this.conn.broadcast(method, data, this.gameId)
  }

  private view(): GameView {
    const myBattleMap: Record<string, PermanentView> = {}
    for (const p of this.myBattle) myBattleMap[p.parentId ?? p.name] = p
    const simBattleMap: Record<string, PermanentView> = {}
    for (const p of this.simBattle) simBattleMap[p.parentId ?? p.name] = p
    const human = makePlayer({
      playerId: HUMAN_PLAYER_ID,
      name: HUMAN_NAME,
      controlled: true,
      isHuman: true,
      isActive: this.active === 'human',
      hasPriority: this.priority === 'human',
      life: this.humanLife,
      battlefield: myBattleMap,
      handCount: this.hand.length,
      libraryCount: 40 - this.turn,
    })
    const sim = makePlayer({
      playerId: SIM_PLAYER_ID,
      name: this.simName,
      controlled: false,
      isHuman: false,
      isActive: this.active === 'sim',
      hasPriority: this.priority === 'sim',
      life: this.simLife,
      battlefield: simBattleMap,
    })
    const myHand: Record<string, CardView> = {}
    for (const card of this.hand) myHand[card.id] = makeCard({ name: card.name, parentId: card.id })
    const playableIds = this.playableIds()
    return makeGameView({
      players: [human, sim],
      myPlayerId: HUMAN_PLAYER_ID,
      myHand,
      phase: this.phase,
      step: 'PRECOMBAT_MAIN',
      activePlayerId: this.active === 'human' ? HUMAN_PLAYER_ID : SIM_PLAYER_ID,
      activePlayerName: this.active === 'human' ? HUMAN_NAME : this.simName,
      priorityPlayerName: this.priority === 'human' ? HUMAN_NAME : this.simName,
      turn: this.turn,
      stack: this.stack,
      combat: this.combat,
      canPlayObjects: playableIds.length ? { objects: Object.fromEntries(playableIds.map((id) => [id, {}])) } : undefined,
    })
  }

  private playableIds(): string[] {
    if (this.stage !== 'main') return []
    const names = this.options.playable ?? []
    return this.hand.filter((c) => names.includes(c.name)).map((c) => c.id)
  }

  // ============================ acciones del humano ============================

  private onUUID(conn: FakeConn, requestId: string | number, action: string, value: string): void {
    conn.ok(requestId, action, {})
    if (this.stage === 'main') {
      const card = this.hand.find((c) => c.id === value)
      if (card && BASIC_LANDS.has(card.name)) {
        this.playLand(card)
        return
      }
      if (card && this.playableIds().includes(value)) {
        this.startCast()
        return
      }
      return
    }
    if (this.stage === 'cast' && this.cast) this.onCastUUID(value)
  }

  private onBoolean(conn: FakeConn, requestId: string | number, action: string, _value: boolean): void {
    conn.ok(requestId, action, {})
    if (this.stage !== 'main') return
    // el humano pasa su ventana main: si hay hechizo jugable, mantenerla (el test
    // va a lanzar; el pass del fallback del helper no debe romper la ventana)
    if (this.playableIds().length > 0) return
    this.startSimTurn()
  }

  private onInteger(conn: FakeConn, requestId: string | number, action: string, value: number): void {
    conn.ok(requestId, action, {})
    if (this.stage !== 'cast' || !this.cast) return
    const step = this.castStep()
    if (!step || step.type !== 'amount') return
    if (value < (step.min ?? 0) || value > (step.max ?? 10)) return
    this.cast.index++
    this.emitCastStep()
  }

  private playLand(card: { id: string; name: string }): void {
    this.hand = this.hand.filter((c) => c.id !== card.id)
    this.myBattle.push(makePermanent({ name: card.name, parentId: card.id, controlled: true }))
    this.emit('GAME_UPDATE', { gameView: this.view() })
    this.emit('GAME_SELECT', { gameView: this.view() })
  }

  // ============================ cast del humano ============================

  private castStep(): CastStep | undefined {
    const steps = this.options.cast ?? []
    if (!this.cast) return undefined
    return steps[this.cast.index]
  }

  private startCast(): void {
    const steps = this.options.cast ?? []
    if (steps.length === 0) return
    this.stage = 'cast'
    this.cast = { index: 0, manaLeft: 0 }
    this.emitCastStep()
  }

  private emitCastStep(): void {
    const rt = this.cast
    if (!rt) return
    const step = this.castStep()
    if (!step) return this.resolveCast()
    switch (step.type) {
      case 'amount':
        this.emit('GAME_GET_AMOUNT', { message: step.message, min: step.min ?? 0, max: step.max ?? 10, gameView: this.view() })
        break
      case 'ability':
        this.emit('GAME_CHOOSE_ABILITY', { message: step.message, choices: step.choices, gameView: this.view() })
        break
      case 'target':
        this.emit('GAME_TARGET', {
          message: step.message,
          targets: step.targets ?? [SIM_PLAYER_ID],
          options: { secondMessage: this.lastPlayedName() ?? '', possibleTargets: step.targets ?? [SIM_PLAYER_ID] },
          gameView: this.view(),
        })
        break
      case 'mana':
        rt.manaLeft = step.sources
        this.emit('GAME_PLAY_MANA', { message: step.message, options: { queryType: 'PLAY_MANA' }, gameView: this.viewWithManaSource() })
        break
    }
  }

  private onCastUUID(value: string): void {
    const rt = this.cast
    if (!rt) return
    const step = this.castStep()
    if (!step) return
    if (step.type === 'ability') {
      const choice = step.choices.find((c) => c.id === value || c.label === value)
      if (!choice) return
      rt.index++
      this.emitCastStep()
      return
    }
    if (step.type === 'target') {
      const targets = step.targets ?? [SIM_PLAYER_ID]
      if (!targets.includes(value)) return
      rt.index++
      this.emitCastStep()
      return
    }
    if (step.type === 'mana') {
      const source = this.myBattle.find((p) => p.tapped !== true && p.parentId === value)
      if (!source) return
      source.tapped = true
      rt.manaLeft--
      this.emit('GAME_UPDATE', { gameView: this.view() })
      if (rt.manaLeft > 0) {
        this.emit('GAME_PLAY_MANA', { message: step.message, options: { queryType: 'PLAY_MANA' }, gameView: this.viewWithManaSource() })
      } else {
        rt.index++
        this.emitCastStep()
      }
      return
    }
  }

  private resolveCast(): void {
    this.cast = null
    this.stage = 'main'
    // el hechizo entra al stack y resuelve en un instante
    this.stack = { 's-1': makeCard({ name: 'hechizo', parentId: 's-1' }) }
    this.emit('GAME_UPDATE', { gameView: this.view() })
    if (this.options.damageToSim) this.simLife = Math.max(0, this.simLife - this.options.damageToSim)
    for (const perm of this.options.resolveEffect?.addToMyBattle ?? []) {
      this.myBattle.push(makePermanent({ name: perm.name, parentId: `my-${perm.name}`, controlled: true, counters: perm.counters }))
    }
    this.stack = {}
    this.combat = []
    this.emit('GAME_UPDATE', { gameView: this.view() })
    // siguiente main del humano (limpia el feedback: targeting off)
    this.turn++
    this.emit('GAME_SELECT', { gameView: this.view() })
  }

  private lastPlayedName(): string | null {
    return this.options.playable?.[0] ?? null
  }

  private viewWithManaSource(): GameView {
    const gv = this.view()
    const source = this.myBattle.find((p) => p.tapped !== true)
    if (source?.parentId) gv.canPlayObjects = { objects: { [source.parentId]: {} } }
    return gv
  }

  // ============================ turno del Sim (combat) ============================

  private startSimTurn(): void {
    if (this.stage !== 'main') return
    this.stage = 'sim'
    this.active = 'sim'
    this.priority = 'sim'
    let simStep = 0
    const tick = () => {
      switch (simStep++) {
        case 0:
          this.emit('GAME_UPDATE', { gameView: this.view() })
          break
        case 1:
          if (this.options.simAttack) {
            this.combat = [{ attackers: [{ attackerId: 'sim-attacker' }] }]
            this.emit('GAME_UPDATE', { gameView: this.view() })
          }
          break
        case 2:
          if (this.options.simCombatDamage) {
            this.combat = []
            this.humanLife = Math.max(0, this.humanLife - (this.options.simCombatDamage ?? 0))
            this.emit('GAME_UPDATE', { gameView: this.view() })
          }
          break
        case 3:
          this.stage = 'main'
          this.active = 'human'
          this.priority = 'human'
          this.turn++
          this.emit('GAME_SELECT', { gameView: this.view() })
          return
        default:
          return
      }
      setTimeout(tick, 400)
    }
    tick()
  }
}