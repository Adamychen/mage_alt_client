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
import {
  GAME_ID, TABLE_ID, SIM_NAME, HUMAN_NAME, HUMAN_PLAYER_ID, SIM_PLAYER_ID,
  BASIC_LANDS, type CastStep, type HumanGameOptions, type CastRuntime,
} from '../humanGameConstants'

export { GAME_ID, TABLE_ID, SIM_NAME, HUMAN_NAME, HUMAN_PLAYER_ID, SIM_PLAYER_ID } from '../humanGameConstants'
export type { CastStep, LandConfig, ResolveEffect, CrossZoneConfig, HumanGameOptions } from '../humanGameConstants'

export class HumanGame {
  readonly tableName: string
  gameId = GAME_ID
  readonly tableId = TABLE_ID
  readonly simName = SIM_NAME

  private conn: FakeConn | null = null
  private hand: Array<{ id: string; name: string }> = []
  private myBattle: PermanentView[] = []
  private simBattle: PermanentView[] = []
  private crossZone: Array<{ id: string; name: string; zone: 'graveyard' | 'exile' }> = []
  private simGraveyard: Array<{ id: string; name: string }> = []
  private humanLife = 20
  private simLife = 20
  private turn = 1
  private phase = 'PRECOMBAT_MAIN'
  private step = 'PRECOMBAT_MAIN'
  private active: 'human' | 'sim' = 'human'
  private priority: 'human' | 'sim' = 'human'
  private stack: Record<string, CardView> = {}
  private combat: unknown[] = []
  private stage: 'lobby' | 'main' | 'cast' | 'attack' | 'block' | 'sim' | 'end' | 'discard' = 'lobby'
  private cast: CastRuntime | null = null
  private playedLandTurn = -1
  private started = false
  private simPaused = false
  private blockingId: string | null = null
  private gameIds: string[] = []
  private matchGame = 1
  private wins = 0
  private loses = 0
  private waitingSideboard = false
  private gameIndex = 1

  constructor(private readonly options: HumanGameOptions) {
    this.tableName = options.tableName ?? 'Mesa E2E'
    for (const land of options.lands ?? []) {
      for (let i = 0; i < land.count; i++) {
        this.myBattle.push(makePermanent({ name: land.name, parentId: `land-${i}`, controlled: true }))
      }
    }
    this.hand = options.hand.map((name, i) => ({ id: `human-${i}`, name }))
    this.simBattle = (options.simBattle ?? []).map((name) => makePermanent({ name, parentId: `sim-${name}` }))
    for (const name of options.myBattle ?? []) {
      this.myBattle.push(makePermanent({ name, parentId: `my-${name}`, controlled: true }))
    }
    for (const cz of options.crossZone ?? []) {
      this.crossZone.push({ id: `cz-${cz.name.replace(/\s+/g, '-')}`, name: cz.name, zone: cz.zone ?? 'graveyard' })
    }
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
          case 'sendPlayerManaType':
            conn.ok(requestId, action, {})
            break
          case 'sendPlayerString':
            conn.ok(requestId, action, {})
            if (this.stage === 'attack' && String(args.value ?? '') === 'special') this.onAttackSpecial()
            break
          case 'submitDeck':
            conn.ok(requestId, action, {})
            this.startGame2()
            break
          case 'sendPlayerUUID':
            conn.ok(requestId, action, {})
            if (this.stage === 'block' && this.blockingId === null) {
              this.onBlockUUID(String(args.value ?? ''))
              break
            }
            if (this.stage === 'block') {
              this.onBlockTarget(String(args.value ?? ''))
              break
            }
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

  // ── Envelope helpers ──────────────────────────────────────────────
  private emitUpdate(): void { this.emit('GAME_UPDATE', { gameView: this.view() }) }
  private emitSelect(): void { this.emit('GAME_SELECT', { gameView: this.view() }) }
  private emitUpdateAndSelect(): void { this.emitUpdate(); this.emitSelect() }

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

    const graveyard: Record<string, CardView> = {}
    const exile: Record<string, CardView> = {}
    for (const cz of this.crossZone) {
      const card = makeCard({ name: cz.name, parentId: cz.id })
      if (cz.zone === 'exile') exile[cz.id] = card
      else graveyard[cz.id] = card
    }
    human.graveyard = graveyard
    human.exile = exile

    const simGraveMap: Record<string, CardView> = {}
    for (const c of this.simGraveyard) {
      simGraveMap[c.id] = makeCard({ name: c.name, parentId: c.id })
    }
    sim.graveyard = simGraveMap

    const playableIds = this.playableIds()
    const crossZoneIds = this.crossZoneIds()
    const objects: Record<string, { basicCastAbilities?: { id: string; value: string }[]; other?: { id: string; value: string }[] }> = {}
    for (const id of playableIds) objects[id] = { basicCastAbilities: [{ id, value: 'cast' }] }
    for (const id of crossZoneIds) objects[id] = { other: [{ id, value: 'other' }] }
    return makeGameView({
      players: [human, sim],
      myPlayerId: HUMAN_PLAYER_ID,
      myHand,
      phase: this.phase,
      step: this.step,
      activePlayerId: this.active === 'human' ? HUMAN_PLAYER_ID : SIM_PLAYER_ID,
      activePlayerName: this.active === 'human' ? HUMAN_NAME : this.simName,
      priorityPlayerName: this.priority === 'human' ? HUMAN_NAME : this.simName,
      turn: this.turn,
      stack: this.stack,
      combat: this.combat,
      canPlayObjects: Object.keys(objects).length > 0 ? { objects } : undefined,
    })
  }

  private playableIds(): string[] {
    if (this.stage !== 'main') return []
    const names = this.options.playable ?? []
    return this.hand.filter((c) => names.includes(c.name)).map((c) => c.id)
  }

  private crossZoneIds(): string[] {
    if (this.stage !== 'main') return []
    return this.crossZone.map((cz) => cz.id)
  }

  // ============================ acciones del humano ============================

  private onUUID(conn: FakeConn, requestId: string | number, action: string, value: string): void {
    conn.ok(requestId, action, {})
    if (this.discarding) { this.onDiscard(value); return }
    if (this.stage === 'attack') { this.onAttackUUID(value); return }
    if (this.stage === 'block') { this.onBlockUUID(value); return }
    if (this.stage === 'main') {
      const card = this.hand.find((c) => c.id === value)
      if (card && BASIC_LANDS.has(card.name)) { this.playLand(card); return }
      if (card && this.playableIds().includes(value)) { this.startCast(); return }
      if (this.crossZone.find((cz) => cz.id === value)) { this.startCast(); return }
      return
    }
    if (this.stage === 'cast' && this.cast) this.onCastUUID(value)
  }

  private onBoolean(conn: FakeConn, requestId: string | number, action: string, _value: boolean): void {
    conn.ok(requestId, action, {})
    if (this.stage === 'discard') { const land = this.hand.find((c) => BASIC_LANDS.has(c.name)); const card = land ?? this.hand[0]; if (card) this.onDiscard(card.id); return }
    if (this.stage === 'attack') { this.finishHumanAttack(); return }
    if (this.stage === 'block') { this.finishHumanBlock(); return }
    if (this.stage !== 'main') return
    if (this.playableIds().length > 0 || this.crossZoneIds().length > 0) return
    if (this.options.humanAttack && this.myBattle.length > 0) { this.startHumanAttack(); return }
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
    this.emitUpdateAndSelect()
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
      this.emitUpdate()
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
    this.stack = { 's-1': makeCard({ name: 'hechizo', parentId: 's-1' }) }
    this.emitUpdate()
    if (this.options.damageToSim && !this.simWinsCurrentGame()) {
      this.simLife = Math.max(0, this.simLife - this.options.damageToSim)
    }
    for (const perm of this.options.resolveEffect?.addToMyBattle ?? []) {
      this.myBattle.push(makePermanent({ name: perm.name, parentId: `my-${perm.name}`, controlled: true, counters: perm.counters }))
    }
    this.stack = {}
    this.combat = []
    this.emitUpdate()
    if (this.options.match) {
      if (this.simWinsCurrentGame()) {
        if (this.turn >= 4) this.endGame()
        else { this.advanceTurn(); this.emitSelect() }
        return
      }
      if (this.simLife <= 0) { this.endGame(); return }
    }
    if (this.hand.length > 7) { this.requestDiscard(); return }
    if (this.waitingSideboard) {
      this.advanceTurn()
      if (this.simWinsCurrentGame() && this.turn >= 4) { this.endGame() }
      else { this.emitSelect() }
      return
    }
    this.advanceTurn()
    this.emitSelect()
  }

  private untapAll(): void {
    for (const p of this.myBattle) p.tapped = false
    for (const p of this.simBattle) p.tapped = false
  }

  private advanceTurn(): void {
    this.turn++
    this.untapAll()
  }

  private simWinsCurrentGame(): boolean {
    return (this.options.simWinsGame ?? []).includes(this.matchGame)
  }

  private requestDiscard(): void {
    this.stage = 'discard'
    this.discarding = true
    const handView: Record<string, CardView> = {}
    for (const card of this.hand) handView[card.id] = makeCard({ name: card.name, parentId: card.id })
    this.emit('GAME_TARGET', {
      message: 'Discard',
      cardsView1: handView,
      targets: this.hand.map((c) => c.id),
      options: { possibleTargets: this.hand.map((c) => c.id) },
      gameView: this.view(),
    })
  }

  private onDiscard(cardId: string): void {
    const card = this.hand.find((c) => c.id === cardId)
    if (!card) return
    this.hand = this.hand.filter((c) => c.id !== cardId)
    this.discarding = false
    this.stage = 'main'
    this.advanceTurn()
    this.emitUpdateAndSelect()
  }

  // ============================ match best-of-N ============================

  private endGame(): void {
    this.stage = 'end'
    const simWins = this.simWinsCurrentGame()
    if (!simWins) this.wins++
    else this.loses++
    const winsNeeded = this.options.match?.winsNeeded ?? 1
    const matchOver = this.wins >= winsNeeded || this.loses >= winsNeeded
    this.emit('GAME_OVER', {
      gameId: this.gameId,
      message: simWins ? `${this.simName} won the game` : `${HUMAN_NAME} won the game`,
    })
    this.emit('END_GAME_INFO', {
      gameInfo: simWins ? `You lost the game on turn ${this.turn}.` : `You won the game on turn ${this.turn}.`,
      matchInfo: matchOver
        ? (simWins ? `${this.simName} won the match!` : 'You won the match!')
        : `You need ${winsNeeded - this.wins === 1 ? 'one more win' : `${winsNeeded - this.wins} more wins`} to win the match.`,
      won: !simWins,
      wins: this.wins,
      loses: this.loses,
      winsNeeded,
      matchView: {
        result: `${this.wins}-${this.loses}`,
        games: [...this.gameIds],
        endTime: matchOver ? 'end' : null,
      },
    })
    if (matchOver) return
    this.waitingSideboard = true
    this.emit('SIDEBOARD', {
      deck: { name: this.tableName, cards: {}, sideboard: {} },
      currentTableId: this.tableId,
      time: 180,
      flag: false,
    })
  }

  private start(): void {
    if (this.started) return
    this.started = true
    this.stage = 'main'
    this.gameId = `${GAME_ID}-${this.gameIndex}`
    this.gameIds.push(this.gameId)
    this.emit('START_GAME', { gameId: this.gameId, tableName: this.tableName })
    this.emit('GAME_INIT', { gameView: this.view() })
    this.emitSelect()
  }

  private startGame2(): void {
    if (!this.waitingSideboard) return
    this.waitingSideboard = false
    this.gameIndex++
    this.matchGame++
    this.gameId = `${GAME_ID}-${this.gameIndex}`
    this.gameIds.push(this.gameId)
    this.hand = this.options.hand.map((name, i) => ({ id: `human-${i}`, name }))
    this.myBattle = (this.options.lands ?? []).flatMap((land, i) =>
      Array.from({ length: land.count }, (_, k) => makePermanent({ name: land.name, parentId: `land-${i}-${k}`, controlled: true })),
    )
    this.humanLife = 20
    this.simLife = 20
    this.turn = 1
    this.phase = 'PRECOMBAT_MAIN'
    this.stack = {}
    this.combat = []
    this.cast = null
    this.stage = 'main'
    this.playedLandTurn = -1
    this.emit('START_GAME', { gameId: this.gameId, tableName: this.tableName })
    this.emit('GAME_INIT', { gameView: this.view() })
    this.emitSelect()
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

  // ============================ combate del humano ============================

  private startHumanAttack(): void {
    this.stage = 'attack'
    this.phase = 'COMBAT'
    this.step = 'DECLARE_ATTACKERS'
    this.emitAttackSelect()
  }

  private emitAttackSelect(): void {
    const ids = this.myBattle.map((p) => p.parentId ?? p.name)
    this.emit('GAME_SELECT', {
      message: 'Select attackers',
      options: { possibleAttackers: ids, specialButton: 'All attack' },
      gameView: this.view(),
    })
  }

  private onAttackUUID(value: string): void {
    const perm = this.myBattle.find((p) => (p.parentId ?? p.name) === value)
    if (!perm) return
    const id = perm.parentId ?? perm.name
    const groups = this.combat as Array<Record<string, Record<string, unknown>>>
    const alreadyAttacking = groups.some((g) => g.attackers && id in g.attackers)
    if (alreadyAttacking) {
      this.combat = groups
        .map((g) => { const attackers = { ...g.attackers }; delete attackers[id]; return { ...g, attackers } })
        .filter((g) => Object.keys(g.attackers).length > 0)
    } else {
      this.combat = [{ attackers: { [id]: {} } }]
    }
    this.emitUpdate()
    this.emitAttackSelect()
  }

  private onAttackSpecial(): void {
    this.combat = [{ attackers: Object.fromEntries(this.myBattle.map((p) => [p.parentId ?? p.name, {}])) }]
    this.emitUpdate()
    this.finishHumanAttack()
  }

  private finishHumanAttack(): void {
    if (this.options.humanCombatDamage) this.simLife = Math.max(0, this.simLife - (this.options.humanCombatDamage ?? 0))
    this.combat = []
    this.step = 'PRECOMBAT_MAIN'
    this.phase = 'PRECOMBAT_MAIN'
    this.stage = 'main'
    this.emitUpdate()
    this.startSimTurn()
  }

  private startHumanBlock(): void {
    this.stage = 'block'
    this.phase = 'COMBAT'
    this.step = 'DECLARE_BLOCKERS'
    this.simPaused = true
    this.emitBlockSelect()
  }

  private emitBlockSelect(): void {
    const ids = this.myBattle.map((p) => p.parentId ?? p.name)
    this.emit('GAME_SELECT', {
      message: 'Select blockers',
      options: { possibleBlockers: ids },
      gameView: this.view(),
    })
  }

  private onBlockUUID(value: string): void {
    const perm = this.myBattle.find((p) => (p.parentId ?? p.name) === value)
    if (!perm) return
    this.blockingId = perm.parentId ?? perm.name
    const attackerIds = Object.keys((this.combat[0] as Record<string, Record<string, unknown>> | undefined)?.attackers ?? {})
    if (attackerIds.length === 1) { this.assignBlocker(attackerIds[0]); return }
    this.emit('GAME_TARGET', {
      message: 'Select attacker to block',
      targets: attackerIds,
      options: { possibleTargets: attackerIds, secondMessage: perm.name ?? '' },
      gameView: this.view(),
    })
  }

  private onBlockTarget(value: string): void {
    this.assignBlocker(value)
  }

  private assignBlocker(attackerId: string): void {
    if (!this.blockingId) return
    const group = this.combat[0] as Record<string, Record<string, unknown>>
    if (group) group.blockers = { [this.blockingId]: {} }
    this.blockingId = null
    this.emitUpdate()
    this.emitBlockSelect()
  }

  private finishHumanBlock(): void {
    for (const c of this.myBattle) {
      this.crossZone.push({ id: c.id, name: c.name, zone: 'graveyard' })
    }
    for (const c of this.simBattle) {
      this.simGraveyard.push({ id: c.id, name: c.name })
    }
    this.myBattle = []
    this.simBattle = []
    this.combat = []
    this.step = 'PRECOMBAT_MAIN'
    this.phase = 'PRECOMBAT_MAIN'
    this.simPaused = false
    this.stage = 'main'
    this.active = 'human'
    this.priority = 'human'
    this.advanceTurn()
    this.emitUpdateAndSelect()
  }

  // ============================ turno del Sim (combat) ============================

  private startSimTurn(): void {
    if (this.stage !== 'main') return
    this.stage = 'sim'
    this.active = 'sim'
    this.priority = 'sim'
    let simStep = 0
    const tick = () => {
      if (this.simPaused) return
      switch (simStep++) {
        case 0:
          this.emitUpdate()
          break
        case 1:
          if (this.options.simAttack) {
            const simAttackerId = this.simAttackerId()
            const simAtt = this.simBattle.find((c) => c.parentId === simAttackerId || c.id === simAttackerId)
            if (simAtt) simAtt.tapped = true
            this.combat = [{ attackers: { [simAttackerId]: {} } }]
            this.emitUpdate()
            if (this.options.humanBlock && this.myBattle.length > 0) { this.startHumanBlock(); return }
          }
          break
        case 2:
          if (this.options.simCombatDamage) {
            this.combat = []
            this.humanLife = Math.max(0, this.humanLife - (this.options.simCombatDamage ?? 0))
            this.emitUpdate()
          }
          break
        case 3:
          this.stage = 'main'
          this.active = 'human'
          this.priority = 'human'
          this.advanceTurn()
          this.emitSelect()
          return
        default:
          return
      }
      setTimeout(tick, 400)
    }
    tick()
  }

  private simAttackerId(): string {
    return this.simBattle[0] ? (this.simBattle[0].parentId ?? this.simBattle[0].name) : 'sim-attacker'
  }
}
