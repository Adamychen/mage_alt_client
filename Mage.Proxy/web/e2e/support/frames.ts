/**
 * DSL común de frames WS de los E2E. Centraliza el parseo, los accesores del
 * GameView y las esperas (waitFrame/waitFrameAt) que antes se duplicaban en
 * cada spec. Los frames se guardan YA PARSEADOS (con cap de MAX_FRAMES): los
 * polls de waitFrame se hacen cada ~200ms y re-parsear en cada poll con
 * partidas rápidas generaba cientos de MB/s de basura (OOM del runner).
 */

import type { Page } from '@playwright/test'

export interface GameFrame {
  method: string
  objectId?: string | null
  data?: Record<string, unknown> & { gameView?: Record<string, unknown> }
}

export interface FieldPermanent {
  name?: string
  displayName?: string
  tapped?: boolean
  counters?: { name?: string; count?: number }[]
}

/** Frames WS recibidos por la página (RAW ya parseados, ver cabecera). */
export function framesOf(page: Page): Array<Record<string, unknown> | null> {
  return (page as unknown as { __frames: Array<Record<string, unknown> | null> }).__frames
}

/** Frames WS ENVIADOS por la página (acción + args). */
export function sentOf(page: Page): Array<Record<string, unknown> | null> {
  return (page as unknown as { __sent: Array<Record<string, unknown> | null> }).__sent
}

export function parsedLen(page: Page): number {
  return parseFrames(framesOf(page)).length
}

export function parseFrames(frames: Array<Record<string, unknown> | null>): GameFrame[] {
  const out: GameFrame[] = []
  for (const frame of frames) {
    if (!frame || typeof frame !== 'object') continue
    if (typeof frame.method === 'string') {
      out.push({ method: frame.method, objectId: frame.objectId as string | null | undefined, data: frame.data as GameFrame['data'] })
    }
  }
  return out
}

export function parseSent(frames: Array<Record<string, unknown> | null>): { action?: string; args?: Record<string, unknown> }[] {
  const out: { action?: string; args?: Record<string, unknown> }[] = []
  for (const frame of frames) {
    if (!frame || typeof frame !== 'object') continue
    if (typeof frame.action === 'string') {
      out.push({ action: frame.action, args: frame.args as Record<string, unknown> | undefined })
    }
  }
  return out
}

export function gameViewOf(frame: GameFrame): Record<string, unknown> | null {
  const data = frame.data
  if (!data) return null
  if (data.gameView && typeof data.gameView === 'object') return data.gameView
  if ('myHand' in data && 'phase' in data) return data
  return null
}

export function lastGameView(frames: GameFrame[]): Record<string, unknown> | null {
  for (const frame of [...frames].reverse()) {
    const view = gameViewOf(frame)
    if (view) return view
  }
  return null
}

export function myHandEntries(view: Record<string, unknown> | null): [string, { name?: string; displayName?: string }][] {
  const hand = (view?.myHand ?? {}) as Record<string, { name?: string; displayName?: string }>
  return Object.entries(hand)
}

export function controlledPlayer(view: Record<string, unknown> | null) {
  const players = (view?.players ?? []) as { playerId?: string; name?: string; controlled?: boolean }[]
  return players.find((p) => p.controlled)
}

export function opponentPlayer(view: Record<string, unknown> | null) {
  const players = (view?.players ?? []) as { playerId?: string; name?: string; controlled?: boolean; life?: number }[]
  return players.find((p) => !p.controlled)
}

export function opponentBattlefield(view: Record<string, unknown> | null): Record<string, { name?: string; displayName?: string }> {
  const players = (view?.players ?? []) as { playerId?: string; controlled?: boolean; battlefield?: unknown }[]
  const opp = players.find((p) => !p.controlled)
  if (!opp) return {}
  return ((opp.battlefield ?? {}) as Record<string, { name?: string; displayName?: string }>)
}

export function myBattlefield(view: Record<string, unknown> | null): Record<string, FieldPermanent> {
  const me = controlledPlayer(view)
  if (!me) return {}
  return ((me as unknown as { battlefield?: unknown }).battlefield ?? {}) as Record<string, FieldPermanent>
}

export function hasMyPriority(frame: GameFrame): boolean {
  const view = gameViewOf(frame)
  if (!view) return false
  const me = controlledPlayer(view)
  if (!me) return false
  // igual que el human-test: solo cuentan los GAME_SELECT con prioridad real del humano
  return (me as { hasPriority?: boolean }).hasPriority === true
}

/** Id de una carta de la mano jugable según canPlayObjects del frame. */
export function playableInView(view: Record<string, unknown> | null, name: string): string | null {
  if (!view) return null
  const objects = (view.canPlayObjects as Record<string, unknown> | undefined)?.objects as Record<string, unknown> | undefined
  if (!objects) return null
  for (const [id, card] of myHandEntries(view)) {
    if (objects[id] && (card.name === name || card.displayName === name)) return id
  }
  return null
}

/** Tierras básicas sin girar del campo (Mountain/Plains), con contador de Plains. */
export function countUntappedLands(view: Record<string, unknown> | null): { count: number; plains: number } {
  let count = 0
  let plains = 0
  for (const perm of Object.values(myBattlefield(view))) {
    if (perm.tapped === true) continue
    if (perm.name === 'Mountain' || perm.displayName === 'Mountain') count++
    else if (perm.name === 'Plains' || perm.displayName === 'Plains') {
      count++
      plains++
    }
  }
  return { count, plains }
}

function manaSourceId(view: Record<string, unknown> | null): string | null {
  if (!view) return null
  const me = controlledPlayer(view)
  if (!me) return null
  const objects = (view.canPlayObjects as Record<string, unknown> | undefined)?.objects as Record<string, unknown> | undefined
  if (!objects) return null
  const battlefield = myBattlefield(view)
  // excluir fuentes ya giradas: el servidor puede listar en canPlayObjects una tierra
  // que el cliente ya usó en un ask anterior y rechazar el clic silenciosamente
  return Object.keys(objects).find((id) => battlefield[id] && battlefield[id].tapped !== true) ?? null
}

export function battlefieldName(view: Record<string, unknown> | null, id: string): string | null {
  if (!view) return null
  const battlefield = myBattlefield(view)
  return battlefield[id]?.name ?? battlefield[id]?.displayName ?? null
}

/** Colores exigidos por el ask "Pay {R}{W}…": cada símbolo {C} → carta básica que lo produce. */
export function requiredSourceName(message: string | undefined): string | null {
  if (!message) return null
  const symbols = [...message.matchAll(/\{([RWBGU]|\d+)\}/g)].map((m) => m[1])
  if (symbols.length === 0) return null
  const COLOR_LANDS: Record<string, string> = { R: 'Mountain', W: 'Plains', U: 'Island', B: 'Swamp', G: 'Forest' }
  const lands = new Set(symbols.filter((s) => COLOR_LANDS[s]).map((s) => COLOR_LANDS[s]))
  if (lands.size === 0) return null
  return lands.size === 1 ? [...lands][0] : null
}

/** Fuente de maná para el ask actual: canPlayObjects primero, tierras básicas
 *  sin girar del campo como fallback (el ask puede llegar sin canPlayObjects). */
export function nextManaSource(view: Record<string, unknown> | null, preferredName: string | null): string | null {
  const primary = manaSourceId(view)
  if (primary && (!preferredName || battlefieldName(view, primary) === preferredName)) return primary
  if (!view) return null
  const objects = (view.canPlayObjects as Record<string, unknown> | undefined)?.objects as Record<string, unknown> | undefined
  const battlefield = myBattlefield(view)
  if (objects) {
    const fromObjects = Object.keys(objects).find(
      (id) => battlefield[id] && battlefield[id].tapped !== true && (!preferredName || battlefieldName(view, id) === preferredName),
    )
    if (fromObjects) return fromObjects
  }
  return (
    Object.keys(battlefield).find(
      (id) => battlefield[id] && battlefield[id].tapped !== true && (!preferredName || battlefieldName(view, id) === preferredName),
    ) ?? null
  )
}

export function targetIdsOf(frame: GameFrame): string[] {
  const data = frame.data
  if (!data) return []
  if (Array.isArray(data.targets)) return data.targets.map(String)
  const options = data.options as { possibleTargets?: unknown } | undefined
  const possible = options?.possibleTargets
  if (Array.isArray(possible)) return possible.map(String)
  if (possible && typeof possible === 'object') return Object.keys(possible)
  return []
}

/** Id del juego actual (el último START_GAME/GAME_INIT del buffer). En un match
 *  best-of-N el buffer acumula partidas viejas: sus eventos de fin no deben
 *  contar como "la partida terminó". */
export function lastGameId(frames: Array<Record<string, unknown> | null>): string | null {
  for (const frame of [...parseFrames(frames)].reverse()) {
    if ((frame.method === 'START_GAME' || frame.method === 'GAME_INIT') && frame.objectId) return frame.objectId
  }
  return null
}

/** ¿La partida ACTUAL terminó? (GAME_OVER/END_GAME_INFO del último juego). */
export function gameEnded(frames: Array<Record<string, unknown> | null>): boolean {
  const currentId = lastGameId(frames)
  return parseFrames(frames).some(
    (f) => (f.method === 'GAME_OVER' || f.method === 'END_GAME_INFO') && (currentId == null || f.objectId === currentId),
  )
}

/** Motivo real del fin de partida (ganador + stats) para que los fallos de
 *  "la partida terminó" digan POR QUÉ (p. ej. deck-out del humano). */
export function gameEndReason(page: Page): string {
  const parsed = parseFrames(framesOf(page))
  const over = [...parsed].reverse().find((f) => f.method === 'GAME_OVER' || f.method === 'END_GAME_INFO')
  if (!over) return 'sin evento de fin en los frames'
  const msg = String((over.data as { message?: unknown } | null)?.message ?? '')
  const gv = gameViewOf(over)
  const stats = ((gv?.players ?? []) as Array<Record<string, unknown>>)
    .map((p) => `${p.name}: life=${p.life} lib=${p.libraryCount} hand=${p.handCount}`)
    .join(' | ')
  return `GAME_OVER "${msg}" — ${stats}`
}

export function waitFrame(
  page: Page,
  predicate: (frame: GameFrame) => boolean,
  label: string,
  timeoutMs = 15_000,
  startIndex = 0,
) {
  return new Promise<GameFrame>((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      const parsed = parseFrames(framesOf(page))
      // sin clamp al último frame (un cursor fuera del array no debe re-matchear
      // el frame actual como si fuera el siguiente): evita re-consumir un ask de
      // maná ya pagado o un targeting ya resuelto
      const start = Math.min(startIndex, parsed.length)
      const found = parsed.slice(start).find(predicate)
      if (found) return resolve(found)
      if (Date.now() - started > timeoutMs) return reject(new Error(`timeout esperando ${label}`))
      setTimeout(tick, 200)
    }
    tick()
  })
}

export function waitFrameAt(
  page: Page,
  predicate: (frame: GameFrame) => boolean,
  label: string,
  timeoutMs = 15_000,
  startIndex = 0,
): Promise<{ frame: GameFrame; index: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      const parsed = parseFrames(framesOf(page))
      const start = Math.min(startIndex, parsed.length)
      for (let i = start; i < parsed.length; i++) {
        if (predicate(parsed[i])) return resolve({ frame: parsed[i], index: i })
      }
      if (Date.now() - started > timeoutMs) return reject(new Error(`timeout esperando ${label}`))
      setTimeout(tick, 200)
    }
    tick()
  })
}

/** Espera la resolución verificando la vida EXACTA del oponente con el stack vacío.
 *  Solo la del oponente: la IA lanza Bolts contra el humano (nunca contra el
 *  oponente), así que MI vida no es determinista mientras el hechizo resuelve. */
export function waitOppLife(page: Page, expectedOpp: number, label: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const tick = () => {
      const view = lastGameView(parseFrames(framesOf(page)))
      const stack = (view?.stack ?? {}) as Record<string, unknown>
      const opp = opponentPlayer(view)
      if (Object.keys(stack).length === 0 && (opp?.life ?? -1) === expectedOpp) return resolve()
      if (Date.now() > deadline) {
        const dump = parseFrames(framesOf(page))
          .slice(-14)
          .map((f) => `${f.method} ${String((f.data as { message?: unknown } | null)?.message ?? '').slice(0, 30)}`)
        console.log(`[dbg] waitOppLife(${expectedOpp}) agotado: oppLife=${opp?.life} stack=${Object.keys(stack).length} frames=${JSON.stringify(dump)}`)
        return reject(new Error(`timeout esperando ${label}`))
      }
      setTimeout(tick, 250)
    }
    tick()
  })
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}