// Helper del humano en los E2E: conexión WS directa al proxy (misma sesión de
// servidor que la página). Juega las tierras del desarrollo (una por turno),
// responde descartes y asks, y pasa prioridades con fallback temporal — SIN
// tocar los diálogos de hechizo/maná (el test los ejerce por la UI).
// Elimina las carreras del canvas y los cuelgues de desarrollo de tierras:
// la partida avanza sola y el test solo actúa cuando toca la acción bajo prueba.

const WS_URL = 'ws://127.0.0.1:8787'
const HOST = 'localhost'
const PORT = 17171

const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']

interface HandCard {
  name?: string
  displayName?: string
}

interface GameViewLike {
  turn?: number
  phase?: string
  step?: string
  players?: Array<{ playerId?: string; controlled?: boolean; hasPriority?: boolean; isActive?: boolean }>
  myHand?: Record<string, HandCard>
  stack?: Record<string, unknown>
}

interface EventDataLike {
  gameView?: GameViewLike
  message?: string
  question?: string
  targets?: string[] | Record<string, unknown>
  cardsView1?: Record<string, unknown>
  options?: { possibleAttackers?: unknown[]; possibleBlockers?: unknown[] }
}

export class HumanHelper {
  private ws: WebSocket | null = null
  private seq = 0
  private pending = new Map<string, (ok: boolean) => void>()
  private gameId: string | null = null
  private lastLandTurn = -1
  private mainWindow: string | null = null
  /** No pasar prioridad mientras el humano está pagando maná (GAME_PLAY_MANA):
   *  pasar con un pago incompleto cancela el hechizo. */
  private payingUntil = 0
  /** No tocar las ventanas de DECLARE_ATTACKERS/DECLARE_BLOCKERS (el humano las
   *  ejerce por la UI en los tests de combate): pasar ahí confirmaría el paso de
   *  combate sin declarar nada. */
  private skipCombat: boolean

  constructor(
    private readonly username: string,
    private readonly password: string,
    opts: { skipCombat?: boolean } = {},
  ) {
    this.skipCombat = opts.skipCombat ?? false
  }

  get isStarted(): boolean {
    return this.ws !== null
  }

  async start(): Promise<void> {
    this.ws = new WebSocket(WS_URL)
    await new Promise<void>((resolve, reject) => {
      const ws = this.ws
      if (!ws) return reject(new Error('helper: no websocket'))
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('helper: no se pudo abrir el websocket del proxy'))
    })
    // el onmessage debe estar activo ANTES del connect: la respuesta llega por ahí
    this.ws.onmessage = (ev) => this.onMessage(String((ev as MessageEvent).data))
    const ok = await this.send('connect', { host: HOST, port: PORT, username: this.username, password: this.password })
    if (!ok) throw new Error('helper: el proxy no autorizó la conexión (mismo usuario que la página)')
  }

  async stop(): Promise<void> {
    const ws = this.ws
    this.ws = null
    this.pending.clear()
    ws?.close()
  }

  /** Espera a que el helper haya visto el arranque de la partida. */
  async waitGameId(timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.gameId) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error('helper: la partida no arrancó a tiempo')
  }

  /** Juega/lanza la carta de la mano por WS (determinista; los diálogos del
   *  servidor se verifican por la UI de la página). */
  async playCard(cardId: string): Promise<boolean> {
    if (!this.gameId) return false
    return this.send('sendPlayerUUID', { gameId: this.gameId, value: cardId })
  }

  /** Pasa la prioridad del humano (sendPlayerBoolean false) para ventanas que el
   *  test no ejerce por la UI (p. ej. el main tras lanzar la criatura de combate:
   *  el fallback interno muere si coincide con un pago de maná). */
  async passPriority(): Promise<boolean> {
    if (!this.gameId) return false
    return this.send('sendPlayerBoolean', { gameId: this.gameId, value: false })
  }

  // ============================ protocolo ============================

  private send(action: string, args: Record<string, unknown>): Promise<boolean> {
    if (process.env.E2E_DEBUG === '1') console.log(`[helper] ${Date.now()} >> ${action} ${JSON.stringify(args)}`)
    return new Promise((resolve) => {
      const requestId = `h${++this.seq}`
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        resolve(false)
      }, 8000)
      this.pending.set(requestId, (ok) => {
        clearTimeout(timer)
        resolve(ok)
      })
      try {
        this.ws?.send(JSON.stringify({ requestId, action, args }))
      } catch {
        clearTimeout(timer)
        this.pending.delete(requestId)
        resolve(false)
      }
    })
  }

  private onMessage(raw: string) {
    let m: Record<string, unknown>
    try {
      m = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    if (process.env.E2E_DEBUG === '1' && m.type === 'event') {
      const d = (m.data ?? {}) as EventDataLike
      const gv = d.gameView
      const me = gv?.players?.find((p) => p.controlled)
      console.log(`[helper] ${Date.now()} ev ${String(m.method)} pri=${me?.hasPriority} act=${me?.isActive} t=${gv?.turn} ph=${gv?.phase} stack=${Object.keys(gv?.stack ?? {}).length} msg="${String(d.message ?? d.question ?? '').slice(0, 50)}"`)
    }
    if (m.type === 'result') {
      const cb = this.pending.get(String(m.requestId))
      if (cb) {
        this.pending.delete(String(m.requestId))
        cb(m.ok === true)
      }
      return
    }
    if (m.type !== 'event') return
    const method = String(m.method ?? '')
    const data = (m.data ?? {}) as EventDataLike
    // el gameId viene en el objectId de los eventos de partida (START_GAME,
    // GAME_INIT, GAME_SELECT, GAME_UPDATE...). OJO: CHATMESSAGE/JOINED_TABLE
    // también traen objectId (chat/mesa) y NO deben tocar el gameId.
    if (m.objectId && (method === 'START_GAME' || method.startsWith('GAME_'))) {
      this.gameId = String(m.objectId)
    }
    if (method === 'GAME_PLAY_MANA') {
      this.payingUntil = Date.now() + 3000
    }
    // el test está lanzando un hechizo (diálogos X/modo/targets): el fallback de
    // la ventana main (1.5s) pasaría la prioridad a mitad del lanzamiento y el
    // servidor CANCELA el hechizo (stack vuelve a 0, nunca llega GAME_PLAY_MANA).
    // Invalidar el fallback de la ventana actual (se rearma con el próximo
    // GAME_SELECT) y cubrir el hueco hasta el primer ask de maná con payingUntil.
    if (
      method === 'GAME_GET_AMOUNT' ||
      method === 'GAME_SELECT_AMOUNT' ||
      method === 'GAME_CHOOSE_ABILITY' ||
      (method === 'GAME_TARGET' && !/discard/i.test(String(data.message ?? '')))
    ) {
      this.mainWindow = null
      this.payingUntil = Date.now() + 3000
    }
    try {
      if (method === 'GAME_SELECT') this.handleSelect(data)
      else if (method === 'GAME_TARGET') this.handleTarget(data)
      else if (method === 'GAME_ASK') this.handleAsk(data)
    } catch {
      // el helper nunca debe romper el test
    }
  }

  // ============================ bot del desarrollo ============================

  private handleSelect(data: EventDataLike) {
    const gv = data.gameView
    if (!gv || !this.gameId) return
    const me = gv.players?.find((p) => p.controlled)
    if (!me) return
    if (me.hasPriority !== true) return
    // ventanas de combate donde el HUMANO declara: mi ataque (activo con
    // possibleAttackers) y mi bloqueo (defendiendo con possibleBlockers). El test
    // las ejerce por la UI; pasar aquí cerraría el paso sin declarar nada.
    // OJO: los selects de PRIORIDAD en pasos de combate (sin criaturas que
    // declarar, "Play instants...") SÍ se pasan — son ventanas de instant.
    const options = (data.options ?? {}) as { possibleAttackers?: unknown; possibleBlockers?: unknown }
    const hasCombatSelect =
      (Array.isArray(options.possibleAttackers) && options.possibleAttackers.length > 0) ||
      (Array.isArray(options.possibleBlockers) && options.possibleBlockers.length > 0)
    if (this.skipCombat && hasCombatSelect) return
    const myMain = me.isActive === true && gv.phase === 'PRECOMBAT_MAIN'
    if (myMain) {
      // el reloj del fallback mide la ventana ACTUAL (turno+fase): los re-selects
      // de la misma ventana (p. ej. tras jugar una tierra) NO la reinician
      const winKey = `${gv.turn}:${gv.phase}`
      if (winKey !== this.mainWindow) {
        this.mainWindow = winKey
        this.armFallback()
      }
      // 1. desarrollo: jugar una tierra por turno (NUNCA durante el pago de maná:
      //    jugar tierra a mitad de pago aborta el hechizo)
      if (gv.turn !== this.lastLandTurn && Date.now() > this.payingUntil) {
        const land = firstBasicLand(gv.myHand)
        if (land) {
          this.lastLandTurn = gv.turn ?? -1
          void this.send('sendPlayerUUID', { gameId: this.gameId, value: land })
          return
        }
      }
      // 2. algo en el stack: la acción del test ya se jugó — pasar para que resuelva.
      //    Un GAME_SELECT con stack>0 llega DESPUÉS de completar el pago del coste
      //    (el servidor no da prioridad entre asks del mismo coste), así que pasar
      //    aquí nunca cancela el hechizo; esperar a payingUntil congelaba el juego
      //    (el hechizo quedaba en el stack sin que nadie pasara).
      const stackCount = Object.keys((gv.stack ?? {}) as Record<string, unknown>).length
      if (stackCount > 0) {
        void this.send('sendPlayerBoolean', { gameId: this.gameId, value: false })
        return
      }
      // 3. ventana main sin actuar: el fallback armado (1.5s) pasa si el test no
      //    lanza; el lanzamiento del test va por WS (instantáneo) y actúa antes.
      return
    }
    // turnos del rival / fases sin jugables del test: pasar para avanzar
    void this.send('sendPlayerBoolean', { gameId: this.gameId, value: false })
  }

  /** Pasa la ventana main actual si sigue abierta 1.5s después de abrirse
   *  (nunca durante un pago de maná en curso). */
  private armFallback() {
    const winKey = this.mainWindow
    setTimeout(() => {
      if (this.mainWindow === winKey && this.gameId && Date.now() > this.payingUntil) {
        void this.send('sendPlayerBoolean', { gameId: this.gameId, value: false })
      }
    }, 1500)
  }

  private handleTarget(data: EventDataLike) {
    if (!this.gameId || !/discard/i.test(String(data.message ?? ''))) return
    let first: string | null = null
    const cards = data.cardsView1
    if (cards) {
      const keys = Object.keys(cards)
      if (keys.length > 0) first = keys[0]
    }
    if (!first) {
      const targets = data.targets
      if (Array.isArray(targets) && targets.length > 0) first = String(targets[0])
      else if (targets && typeof targets === 'object') {
        const keys = Object.keys(targets)
        if (keys.length > 0) first = keys[0]
      }
    }
    if (first) void this.send('sendPlayerUUID', { gameId: this.gameId, value: first })
  }

  private handleAsk(data: EventDataLike) {
    if (!this.gameId) return
    const question = String(data.question ?? data.message ?? '')
    // XMage: false = mantener la mano en el mulligan; true = aceptar el resto.
    // El auto-keep del web ya responde el mulligan: responderlo aquí también
    // (el helper va conectado desde el arranque) mandaría un SEGUNDO false que
    // el servidor trata como "pasar prioridad" y rompería la ventana del test.
    if (/mulligan|keep your hand|keep hand/i.test(question)) return
    void this.send('sendPlayerBoolean', { gameId: this.gameId, value: true })
  }
}

function firstBasicLand(hand: Record<string, HandCard> | undefined): string | null {
  if (!hand) return null
  for (const [id, card] of Object.entries(hand)) {
    const name = card.name ?? card.displayName ?? ''
    if (BASIC_LANDS.includes(name)) return id
  }
  return null
}
