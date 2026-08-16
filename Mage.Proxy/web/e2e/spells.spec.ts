import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { cleanupUser, registerHelper } from './cleanup'
import { HumanHelper } from './wshelper'

const SHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')
const TARGETING_SHOT = path.join(SHOTS_DIR, 'spells-targeting.png')

// tope de frames WS retenidos por test (evita el OOM con partidas rápidas)
const MAX_FRAMES = 500

// Replicas del layout del tablero (src/board/zones.ts) para clicar cartas en el canvas de Pixi.
const CARD_W = 146
const CARD_H = 204

interface ZoneLayout {
  w: number
  h: number
  scale: number
  oppHeader: { x: number; y: number }
  myHeader: { x: number; y: number }
  myHand: { x: number; y: number }
  myBattle: { x: number; y: number }
}

interface FieldPermanent {
  name?: string
  displayName?: string
  tapped?: boolean
  counters?: { name?: string; count?: number }[]
}

function computeZones(w: number, h: number): ZoneLayout {
  const scale = Math.min(w / 1600, h / 900)
  const worldH = 900 * scale
  const offY = (h - worldH) / 2
  const ch = CARD_H * scale
  const X = (x: number) => (w - 1600 * scale) / 2 + x * scale
  const Y = (y: number) => offY + y * scale
  return {
    w,
    h,
    scale,
    oppHeader: { x: X(16), y: Y(10) },
    myHeader: { x: X(16), y: Y(900 - 34) },
    myHand: { x: X(800), y: Y(900 - 12) - ch },
    myBattle: { x: X(16), y: Y(900 - 100) - ch },
  }
}

function handFanned(zone: { x: number; y: number }, count: number, scale: number, w: number): { x: number; y: number }[] {
  if (count === 0) return []
  const cardW = CARD_W * scale
  const maxW = w * 0.9
  const spacing = Math.min((maxW - cardW) / Math.max(count - 1, 1), cardW * 1.35)
  const startX = zone.x - (spacing * (count - 1)) / 2
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * spacing, y: zone.y }))
}

function battlefieldRow(zone: { x: number; y: number }, count: number, scale: number): { x: number; y: number }[] {
  const cardW = CARD_W * scale
  const spacing = cardW * 0.88
  const startX = zone.x + cardW / 2
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * spacing, y: zone.y }))
}

interface GameFrame {
  method: string
  data?: Record<string, unknown> & { gameView?: Record<string, unknown> }
}

/** Los frames se guardan YA PARSEADOS (con cap de MAX_FRAMES): los polls de
 *  waitFrame/parseFrames se hacen cada ~200ms y re-parsear los 1200 frames en
 *  cada poll con partidas rápidas generaba ~600MB/s de basura (OOM del runner). */
function parseFrames(frames: Array<Record<string, unknown> | null>): GameFrame[] {
  const out: GameFrame[] = []
  for (const frame of frames) {
    if (!frame || typeof frame !== 'object') continue
    if (typeof frame.method === 'string') {
      out.push({ method: frame.method, data: frame.data as GameFrame['data'] })
    }
  }
  return out
}

function parseSent(frames: Array<Record<string, unknown> | null>): { action?: string; args?: Record<string, unknown> }[] {
  const out: { action?: string; args?: Record<string, unknown> }[] = []
  for (const frame of frames) {
    if (!frame || typeof frame !== 'object') continue
    if (typeof frame.action === 'string') {
      out.push({ action: frame.action, args: frame.args as Record<string, unknown> | undefined })
    }
  }
  return out
}

function gameViewOf(frame: GameFrame): Record<string, unknown> | null {
  const data = frame.data
  if (!data) return null
  if (data.gameView && typeof data.gameView === 'object') return data.gameView
  if ('myHand' in data && 'phase' in data) return data
  return null
}

function lastGameView(frames: GameFrame[]): Record<string, unknown> | null {
  for (const frame of [...frames].reverse()) {
    const view = gameViewOf(frame)
    if (view) return view
  }
  return null
}

function myHandEntries(view: Record<string, unknown> | null): [string, { name?: string; displayName?: string }][] {
  const hand = (view?.myHand ?? {}) as Record<string, { name?: string; displayName?: string }>
  return Object.entries(hand)
}

function playableInView(view: Record<string, unknown> | null, name: string): string | null {
  if (!view) return null
  const objects = (view.canPlayObjects as Record<string, unknown> | undefined)?.objects as Record<string, unknown> | undefined
  if (!objects) return null
  for (const [id, card] of myHandEntries(view)) {
    if (objects[id] && (card.name === name || card.displayName === name)) return id
  }
  return null
}

function controlledPlayer(view: Record<string, unknown> | null) {
  const players = (view?.players ?? []) as { playerId?: string; name?: string; controlled?: boolean }[]
  return players.find((p) => p.controlled)
}

function opponentPlayer(view: Record<string, unknown> | null) {
  const players = (view?.players ?? []) as { playerId?: string; name?: string; controlled?: boolean }[]
  return players.find((p) => !p.controlled)
}

function hasMyPriority(frame: GameFrame): boolean {
  const view = gameViewOf(frame)
  if (!view) return false
  const me = controlledPlayer(view)
  if (!me) return false
  return (me as { hasPriority?: boolean }).hasPriority === true
}

async function canvasBox(page: Page) {
  const canvas = page.locator('.board-wrap canvas')
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  return await canvas.boundingBox()
}

async function clickHandCard(page: Page, name: string): Promise<boolean> {
  // el canvas puede ir un render por detrás de los frames (throttling de ~80ms +
  // descartes en marcha): clicar por índice calculado de una vista parseada falla
  // cuando la mano cambia entre medias. Se clica la posición REAL del escenario.
  const useScene = await sceneHookAvailable(page)
  for (let attempt = 0; attempt < 10; attempt++) {
    const view = lastGameView(parseFrames(framesOf(page)))
    const hand = myHandEntries(view)
    const index = hand.findIndex(([, card]) => card.name === name || card.displayName === name)
    const count = hand.length
    if (index < 0 || count === 0) return false
    const cardId = hand[index][0]
    const live = await liveSceneCard(page, cardId)
    if (live) {
      const box = await canvasBox(page)
      if (!box) return false
      await page.mouse.click(box.x + live.x, box.y + live.y)
      return true
    }
    if (useScene) {
      await page.waitForTimeout(150)
      continue
    }
    const box = await canvasBox(page)
    if (!box) return false
    const zones = computeZones(box.width, box.height)
    const slots = handFanned(zones.myHand, count, zones.scale, box.width)
    const slot = slots[index]
    await page.mouse.click(box.x + slot.x, box.y + slot.y)
    return true
  }
  return false
}

/** Posición real en el canvas de la carta con `id`, o null si aún no está en el escenario. */
async function liveSceneCard(page: Page, id: string): Promise<{ x: number; y: number } | null> {
  const scene = await sceneState(page)
  if (!scene) return null
  const slot = scene.cards?.[id]
  return slot && typeof slot.x === 'number' && typeof slot.y === 'number' ? slot : null
}

/** Estado del escenario expuesto por la app (posiciones + playables en vivo). */
async function sceneState(page: Page): Promise<{
  cards?: Record<string, { x: number; y: number }>
  playable?: string[]
  game?: { turn?: number; phase?: string; step?: string; priority?: boolean }
} | null> {
  const scene = await page.evaluate(() => (globalThis as unknown as { __mageScene?: { cards?: Record<string, { x: number; y: number }>; playable?: string[]; game?: unknown } }).__mageScene ?? null)
  return scene && typeof scene === 'object' ? scene : null
}

/** ¿La carta (por UUID) está jugable según el estado REAL de la app? */
async function playableInScene(page: Page, id: string | null): Promise<boolean> {
  if (!id) return false
  const scene = await sceneState(page)
  return Array.isArray(scene?.playable) && scene.playable.includes(id)
}

/** UUID de la carta por nombre en la última mano parseada. */
function handCardId(page: Page, name: string): string | null {
  const view = lastGameView(parseFrames(framesOf(page)))
  const entry = myHandEntries(view).find(([, card]) => card.name === name || card.displayName === name)
  return entry ? entry[0] : null
}

/** Devuelve true si el hook de escenario existe (build con soporte E2E). */
async function sceneHookAvailable(page: Page): Promise<boolean> {
  return (await page.evaluate(() => (globalThis as unknown as { __mageScene?: unknown }).__mageScene !== undefined)) === true
}

/** ¿La carta por nombre está jugable? Prioriza el estado real de la app; el
 *  canPlayObjects de los frames es intermitente (el servidor no lo manda en
 *  todos los GAME_UPDATE) y clicar contra él falla en ventanas perdidas.
 *  La app puede ir un render por detrás: si la carta está en mano y la app aún
 *  no la marca jugable, se reintenta antes de devolver null. */
async function isPlayable(page: Page, name: string): Promise<string | null> {
  const id = handCardId(page, name)
  if (id && (await playableInScene(page, id))) return id
  if (!(await sceneHookAvailable(page))) {
    const view = lastGameView(parseFrames(framesOf(page)))
    return playableInView(view, name)
  }
  if (id) {
    for (let attempt = 0; attempt < 6; attempt++) {
      await page.waitForTimeout(200)
      if (await playableInScene(page, id)) return id
    }
  }
  return null
}

function myBattlefield(view: Record<string, unknown> | null): Record<string, FieldPermanent> {
  const me = controlledPlayer(view)
  if (!me) return {}
  return ((me as unknown as { battlefield?: unknown }).battlefield ?? {}) as Record<string, FieldPermanent>
}

async function clickBattlefieldCard(page: Page, cardId: string): Promise<boolean> {
  const useScene = await sceneHookAvailable(page)
  for (let attempt = 0; attempt < 10; attempt++) {
    const live = await liveSceneCard(page, cardId)
    if (live) {
      const box = await canvasBox(page)
      if (!box) return false
      await page.mouse.click(box.x + live.x, box.y + live.y)
      return true
    }
    if (useScene) {
      await page.waitForTimeout(150)
      continue
    }
    break
  }
  if (useScene) return false
  const view = lastGameView(parseFrames(framesOf(page)))
  const entries = Object.keys(myBattlefield(view))
  const index = entries.indexOf(cardId)
  if (index < 0) return false
  const box = await canvasBox(page)
  if (!box) return false
  const zones = computeZones(box.width, box.height)
  const slots = battlefieldRow(zones.myBattle, entries.length, zones.scale)
  const slot = slots[index]
  await page.mouse.click(box.x + slot.x, box.y + slot.y)
  return true
}

function manaSourceId(view: Record<string, unknown> | null): string | null {
  if (!view) return null
  const me = controlledPlayer(view)
  if (!me) return null
  const objects = (view.canPlayObjects as Record<string, unknown> | undefined)?.objects as Record<string, unknown> | undefined
  if (!objects) return null
  const battlefield = ((me as unknown as { battlefield?: unknown }).battlefield ?? {}) as Record<string, FieldPermanent>
  // excluir fuentes ya giradas: el servidor puede listar en canPlayObjects una tierra
  // que el cliente ya usó en un ask anterior y rechazar el clic silenciosamente
  return Object.keys(objects).find((id) => battlefield[id] && battlefield[id].tapped !== true) ?? null
}

/** Colores exigidos por el ask "Pay {R}{W}…": cada símbolo {C} → carta básica que lo produce. */
function requiredSourceName(message: string | undefined): string | null {
  if (!message) return null
  const symbols = [...message.matchAll(/\{([RWBGU]|\d+)\}/g)].map((m) => m[1])
  if (symbols.length === 0) return null
  const COLOR_LANDS: Record<string, string> = { R: 'Mountain', W: 'Plains', U: 'Island', B: 'Swamp', G: 'Forest' }
  const lands = new Set(symbols.filter((s) => COLOR_LANDS[s]).map((s) => COLOR_LANDS[s]))
  if (lands.size === 0) return null
  return lands.size === 1 ? [...lands][0] : null
}

function nextManaSource(view: Record<string, unknown> | null, preferredName: string | null): string | null {
  const primary = manaSourceId(view)
  if (primary && (!preferredName || battlefieldName(view, primary) === preferredName)) return primary
  if (!view) return null
  // fuentes declaradas en canPlayObjects del ask
  const objects = (view.canPlayObjects as Record<string, unknown> | undefined)?.objects as Record<string, unknown> | undefined
  const me = controlledPlayer(view)
  const battlefield = ((me as unknown as { battlefield?: unknown }).battlefield ?? {}) as Record<string, FieldPermanent>
  if (objects) {
    const fromObjects = Object.keys(objects).find(
      (id) => battlefield[id] && battlefield[id].tapped !== true && (!preferredName || battlefieldName(view, id) === preferredName),
    )
    if (fromObjects) return fromObjects
  }
  // fallback: tierras básicas sin girar del campo (el ask puede llegar sin
  // canPlayObjects en partidas rápidas; el nombre de la tierra es el color)
  return (
    Object.keys(battlefield).find(
      (id) => battlefield[id] && battlefield[id].tapped !== true && (!preferredName || battlefieldName(view, id) === preferredName),
    ) ?? null
  )
}

function battlefieldName(view: Record<string, unknown> | null, id: string): string | null {
  if (!view) return null
  const me = controlledPlayer(view)
  const battlefield = ((me as unknown as { battlefield?: unknown }).battlefield ?? {}) as Record<string, FieldPermanent>
  return battlefield[id]?.name ?? battlefield[id]?.displayName ?? null
}

async function clickPlayerTarget(page: Page, playerId: string): Promise<boolean> {
  const box = await canvasBox(page)
  if (!box) return false
  const zones = computeZones(box.width, box.height)
  const view = lastGameView(parseFrames(framesOf(page)))
  const players = (view?.players ?? []) as { playerId?: string; controlled?: boolean }[]
  const opponents = players.filter((p) => !p.controlled)
  const index = opponents.findIndex((p) => p.playerId === playerId)
  if (index < 0) return false
  const y = zones.oppHeader.y + index * 24
  await page.mouse.click(box.x + zones.oppHeader.x + 8, box.y + y - 4)
  return true
}

async function clickPlayerHeader(page: Page, playerId: string): Promise<boolean> {
  const box = await canvasBox(page)
  if (!box) return false
  const zones = computeZones(box.width, box.height)
  const view = lastGameView(parseFrames(framesOf(page)))
  const players = (view?.players ?? []) as { playerId?: string; controlled?: boolean }[]
  const player = players.find((p) => p.playerId === playerId)
  if (!player) return false
  if (player.controlled) {
    await page.mouse.click(box.x + zones.myHeader.x + 8, box.y + zones.myHeader.y - 4)
    return true
  }
  const opponents = players.filter((p) => !p.controlled)
  const index = opponents.findIndex((p) => p.playerId === playerId)
  if (index < 0) return false
  await page.mouse.click(box.x + zones.oppHeader.x + 8, box.y + zones.oppHeader.y + index * 24 - 4)
  return true
}

function framesOf(page: Page): Array<Record<string, unknown> | null> {
  return (page as unknown as { __frames: Array<Record<string, unknown> | null> }).__frames
}

function sentOf(page: Page): Array<Record<string, unknown> | null> {
  return (page as unknown as { __sent: Array<Record<string, unknown> | null> }).__sent
}

function parsedLen(page: Page): number {
  return parseFrames(framesOf(page)).length
}

function waitFrame(
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
      // los frames se eviccionan al superar MAX_FRAMES: un cursor viejo apuntaría
      // fuera del array y no hay nada que re-matchear (sin clamp al último frame:
      // re-matcheaba un frame ya consumido, p. ej. el ask de maná recién pagado)
      const start = Math.min(startIndex, parsed.length)
      const found = parsed.slice(start).find(predicate)
      if (found) return resolve(found)
      if (Date.now() - started > timeoutMs) return reject(new Error(`timeout esperando ${label}`))
      setTimeout(tick, 200)
    }
    tick()
  })
}

function waitFrameAt(
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
      // sin clamp al último frame (ver waitFrame): un cursor fuera del array no
      // debe re-matchear el frame actual como si fuera el siguiente
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

function targetIdsOf(frame: GameFrame): string[] {
  const data = frame.data
  if (!data) return []
  if (Array.isArray(data.targets)) return data.targets.map(String)
  const options = data.options as { possibleTargets?: unknown } | undefined
  const possible = options?.possibleTargets
  if (Array.isArray(possible)) return possible.map(String)
  if (possible && typeof possible === 'object') return Object.keys(possible)
  return []
}

function gameEnded(frames: Array<Record<string, unknown> | null>): boolean {
  return parseFrames(frames).some((f) => f.method === 'GAME_OVER' || f.method === 'END_GAME_INFO')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}


/** Espera la resolución verificando la vida EXACTA del oponente con el stack vacío.
 *  Solo la del oponente: la IA lanza Lightning Bolts contra el humano (nunca contra
 *  el oponente), así que MI vida no es determinista mientras el hechizo resuelve. */
function waitOppLife(page: Page, expectedOpp: number, label: string, timeoutMs = 15_000): Promise<void> {
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

/** Paga el maná del hechizo en curso. El diálogo "Pagar maná" se VERIFICA por UI
 *  (render de la página); el pago en sí va por WS (determinista: el clic por
 *  escena en los sources es una carrera con partidas rápidas). */
async function payMana(page: Page, helper: HumanHelper): Promise<void> {
  try {
    await payManaInner(page, helper)
  } catch (e) {
    dumpE2E(page, 'payMana-fallback')
    throw e
  }
}

function dumpE2E(page: Page, tag: string): void {
  try {
    const frames = framesOf(page)
    const sent = sentOf(page)
    const file = `/tmp/e2e-${tag}-${Date.now()}.jsonl`
    const lines: string[] = []
    for (const f of frames) lines.push(JSON.stringify(f))
    lines.push('=====SENT=====')
    for (const s of sent) lines.push(JSON.stringify(s))
    fs.writeFileSync(file, lines.join('\n'))
    console.log(`[dbg] dump ${file} frames=${frames.length} sent=${sent.length}`)
  } catch {
    /* noop */
  }
}

async function payManaInner(page: Page, helper: HumanHelper): Promise<void> {
  // lookback: el primer GAME_PLAY_MANA puede haber llegado mientras la acción
  // anterior terminaba (p. ej. la verificación del target); un cursor estricto
  // lo saltaría y esperaría un ask que ya no llega
  let cursor = Math.max(0, parsedLen(page) - 10)
  for (let i = 0; i < 14; i++) {
    const { frame: mana, index: manaIndex } = await waitFrameAt(page, (f) => f.method === 'GAME_PLAY_MANA', `GAME_PLAY_MANA (${i})`, 15_000, cursor)
    // verificación UI del diálogo de pago
    await expect(page.locator('.feedback-dialog')).toContainText(/Pagar maná/, { timeout: 10_000 })
    cursor = manaIndex + 1
    // pagar el color que el servidor pide (el ask trae "Pay {R}{W}…"): una Plains no
    // puede pagar {R} y el servidor re-pregunta en bucle si el clic no sirve
    const preferredName = requiredSourceName(mana.data?.message as string | undefined)
    // el view del ask puede ir stale (fuentes ya tapadas en frames viejos): el
    // pago del ask anterior se propaga con retraso. REINTENTAR la lectura hasta
    // ver una fuente sin girar — la lectura única era la raíz de "sin fuente".
    let sourceId: string | null = null
    for (let attempt = 0; attempt < 20 && !sourceId; attempt++) {
      sourceId = nextManaSource(lastGameView(parseFrames(framesOf(page))), preferredName)
      if (!sourceId) await page.waitForTimeout(150)
    }
    if (!sourceId) throw new Error(`sin fuente de maná para "${String(mana.data?.message ?? '').slice(0, 40)}"`)
    expect(await helper.playCard(sourceId), `pago de maná por WS (intento ${i})`).toBeTruthy()
    // tras el pago, esperar el SIGUIENTE ask de maná; si no llega (5s), el pago
    // está completo. OJO: no salir por hasMyPriority — un SELECT durante el pago
    // incompleto (el helper lo aguanta con payingUntil) no significa el final.
    let nextIndex = -1
    try {
      const next = await waitFrameAt(
        page,
        (f) => f.method === 'GAME_PLAY_MANA',
        `siguiente ask de maná (${i})`,
        5_000,
        cursor,
      )
      nextIndex = next.index
    } catch {
      nextIndex = -1
    }
    if (nextIndex < 0) return
    // el ask siguiente sigue sin pagar: no avanzar el cursor más allá de él,
    // o la siguiente iteración esperaría un ask posterior que nunca llega
    cursor = nextIndex
  }
  throw new Error('no se pudo pagar el maná del hechizo')
}

/** Resuelve un GAME_TARGET eligiendo al jugador oponente. El envío del UUID va
 *  por WS (determinista); las aserciones visuales del targeting ya se hicieron
 *  ANTES (el diálogo queda abierto hasta responder). Fallback al botón del diálogo. */
async function targetOpponent(page: Page, target: GameFrame, label: string, helper: HumanHelper): Promise<void> {
  const opp = opponentPlayer(lastGameView(parseFrames(framesOf(page))))
  if (opp?.playerId) {
    expect(await helper.playCard(opp.playerId), label).toBeTruthy()
    return
  }
  const dialog = page.locator('.feedback-dialog')
  const oppName = opp?.name
  const button = oppName
    ? dialog.getByRole('button', { name: new RegExp(escapeRegExp(oppName)) }).first()
    : dialog.getByRole('button').first()
  await expect(button, label).toBeVisible({ timeout: 15_000 })
  await button.click()
}


/** Tierras básicas sin girar del campo (Mountain/Plains) para saber si el maná
 *  del hechizo del guion ya está desarrollado. */
function countUntappedLands(view: Record<string, unknown> | null): { count: number; plains: number } {
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

/** Motivo real del fin de partida (ganador + stats) para que los fallos de
 *  "la partida terminó" digan POR QUÉ (p. ej. deck-out del humano). */
function gameEndReason(page: Page): string {
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

/** Espera a que una carta sea jugable en MI main phase con SUFICIENTE maná
 *  (el HumanHelper desarrolla tierras en paralelo). Timeout en milisegundos.
 *  Se exige MI main phase: como instantáneo la carta es "jugable" también en el
 *  turno del rival y clicar ahí es una carrera con la ventana (flake). El maná
 *  mínimo es clave: los X-cost son "jugables" con X=0 y sin maná suficiente el
 *  pago del test falla (impagable). La jugabilidad se lee de los frames
 *  (canPlayObjects de los GAME_SELECT es autoritativo), no de la escena. */
async function waitPlayable(
  page: Page,
  name: string,
  timeoutMs = 30_000,
  minUntapped = 1,
  needPlains = false,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (gameEnded(framesOf(page))) return null
    const view = lastGameView(parseFrames(framesOf(page)))
    const me = controlledPlayer(view)
    const myMain = !!view && me?.isActive === true && view.phase === 'PRECOMBAT_MAIN'
    if (myMain) {
      const lands = countUntappedLands(view)
      if (lands.count >= minUntapped && (!needPlains || lands.plains >= 1)) {
        const id = playableInView(view, name)
        if (id) return id
      }
    }
    await page.waitForTimeout(250)
  }
  const dump = parseFrames(framesOf(page))
    .slice(-20)
    .map((f) => {
      const v = gameViewOf(f)
      if (!v) return f.method
      const me = controlledPlayer(v)
      const objs = (v.canPlayObjects as Record<string, unknown> | undefined)?.objects as Record<string, unknown> | undefined
      const hand = myHandEntries(v).map(([, c]) => c.name)
      return `${f.method} t${v.turn} ${v.phase} act=${(me as { isActive?: boolean } | undefined)?.isActive} cpo=${objs ? Object.keys(objs).length : '-'} hand=${hand.join('/')}`
    })
  console.log(`[dbg] waitPlayable(${name}) agotado: ${JSON.stringify(dump)}`)
  return null
}

/** Login, mesa con el mazo avanzado, Sim y arranque. El desarrollo de tierras lo
 *  hace el HumanHelper (WS directo al proxy): la partida avanza sola y el test
 *  solo espera a que el hechizo del guion sea jugable. */
async function setupAdvancedGame(page: Page, username: string, tableName: string): Promise<void> {
  await page.goto('/')
  await expect(page.locator('form.login-card')).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Servidor del proxy (host)').fill('localhost')
  await page.getByLabel('Puerto del servidor XMage').fill('17171')
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill('x')
  await page.getByRole('button', { name: 'Conectar' }).click()
  // el switch de sesión del proxy tras un usuario anterior puede tardar o fallar
  // transitoriamente; el connect es idempotente, así que reintentar es seguro
  const lobby = page.getByRole('heading', { name: 'Lobby' })
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await expect(lobby).toBeVisible({ timeout: 15_000 })
      break
    } catch {
      await page.getByRole('button', { name: 'Conectar' }).click()
    }
  }
  await expect(lobby).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Nueva mesa' }).click()
  await expect(page.getByRole('heading', { name: 'Nueva mesa' })).toBeVisible()
  await page.getByLabel('Nombre').fill(tableName)
  await page.getByLabel('Tu mazo').selectOption('Mage Web advanced')
  // partida determinista: sin barajar, la mano/robos son el orden exacto del mazo
  await page.getByLabel('No barajar el mazo inicial (modo test)').check()
  // partida determinista: sin sorteo aleatorio de starting player (el primer
  // jugador de la mesa empieza; no llega ningún GAME_TARGET de sorteo)
  await page.getByLabel('Sin sorteo de jugador inicial (modo test)').check()
  // oponente simulado determinista: el proxy une el asiento SIM con su propia
  // sesión (mazo por defecto = solo tierras) y juega sin tiempos de IA
  await page.getByRole('button', { name: 'SIM' }).click()
  await page.getByRole('button', { name: 'Crear mesa' }).click()

  const row = page.locator('.table-row', { hasText: tableName }).first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  // el asiento SIM lo une el proxy inmediatamente: la mesa nace casi llena
  await expect(row.locator('.table-seats')).toHaveText(/2\/2/, { timeout: 20_000 })
  const startButton = row.getByRole('button', { name: 'Empezar' })
  await expect(startButton).toBeVisible({ timeout: 15_000 })
  await startButton.click()
  await expect(page.locator('.game-top').getByText(/Partida/).first()).toBeVisible({ timeout: 20_000 })

  // SIN auto-pase del web: lo sustituye el HumanHelper (WS) para evitar que sus
  // pases compitan con la ventana donde el test va a lanzar el hechizo.
}

/** Monta la partida (login → mesa → Sim → arranque), arranca el HumanHelper
 *  (desarrollo de tierras, descartes y asks por WS) y devuelve el contexto. */
async function startAdvancedGame(page: Page): Promise<{
  frames: Array<Record<string, unknown> | null>
  sent: Array<Record<string, unknown> | null>
  pageErrors: Error[]
  username: string
  helper: HumanHelper
}> {
  const pageErrors: Error[] = []
  const frames: Array<Record<string, unknown> | null> = []
  const sent: Array<Record<string, unknown> | null> = []
  ;(page as unknown as { __frames: Array<Record<string, unknown> | null> }).__frames = frames
  ;(page as unknown as { __sent: Array<Record<string, unknown> | null> }).__sent = sent
  page.on('pageerror', (err) => pageErrors.push(err))
  page.on('websocket', (ws) => {
    // con auto-pase los turnos vuelan y los frames se acumulan sin límite
    // (OOM: ~4GB en un minuto); se guardan solo los últimos MAX_FRAMES,
    // ya parseados (re-parsear en cada poll también agotaba el heap)
    ws.on('framereceived', (e) => {
      try {
        const f = JSON.parse(String(e.payload)) as Record<string, unknown>
        f.__t = Date.now()
        frames.push(f)
      } catch {
        frames.push(null)
      }
      if (frames.length > MAX_FRAMES) frames.splice(0, frames.length - MAX_FRAMES)
    })
    ws.on('framesent', (e) => {
      try {
        const f = JSON.parse(String(e.payload)) as Record<string, unknown>
        f.__t = Date.now()
        sent.push(f)
      } catch {
        sent.push(null)
      }
      if (sent.length > MAX_FRAMES) sent.splice(0, sent.length - MAX_FRAMES)
    })
  })
  const username = `sp-${String(Date.now()).slice(-10)}`
  cleanupUser(username)

  // helper WS: desarrolla tierras, descarta y responde asks — la partida avanza
  // sola y el test solo espera a que el hechizo del guion sea jugable. Se arranca
  // ANTES de crear la mesa para que capture el START_GAME (gameId) desde el inicio.
  const helper = new HumanHelper(username, 'x')
  registerHelper(helper)
  await helper.start()

  await setupAdvancedGame(page, username, `${username}-t`)

  await helper.waitGameId(20_000)
  return { frames, sent, pageErrors, username, helper }
}

async function resolveInteger(page: Page, expected: number, label: string): Promise<void> {
  const input = page.getByLabel('Cantidad', { exact: true })
  await expect(input, `diálogo integer de ${label}`).toBeVisible({ timeout: 15_000 })
  const max = await input.getAttribute('max')
  if (max === null || Number(max) < expected) throw new Error(`el diálogo integer de ${label} no admite ${expected}`)
  await input.fill(String(expected))
  await page.getByRole('button', { name: 'Enviar' }).click()
  expect(
    parseSent(sentOf(page)).some((s) => s.action === 'sendPlayerInteger' && String(s.args?.value) === String(expected)),
    `${label} X=${expected} debería haberse enviado al proxy`,
  ).toBeTruthy()
}

test('Blaze {X}{R}: diálogo integer X=2, targeting visual y pago de maná', async ({ page }) => {
  const { frames, sent, pageErrors, helper } = await startAdvancedGame(page)
  const canvas = page.locator('.board-wrap canvas')
  const blazeId = await waitPlayable(page, 'Blaze', 30_000, 3)
  if (!blazeId) throw new Error('Blaze no fue jugable en 30s (robo adverso)')
  const beforeShot = await canvas.screenshot()
  const cursor = parsedLen(page)
  // el lanzamiento va por WS (determinista); los diálogos se verifican por UI
  expect(await helper.playCard(blazeId), 'el Blaze debería lanzarse por WS').toBeTruthy()
  await waitFrame(page, (f) => f.method === 'GAME_GET_AMOUNT' || f.method === 'GAME_SELECT_AMOUNT', 'GAME_GET_AMOUNT del Blaze', 15_000, cursor)
  await resolveInteger(page, 2, 'Blaze')
  const target = await waitFrame(
    page,
    (f) => f.method === 'GAME_TARGET' && !/discard/i.test(String(f.data?.message ?? '')),
    'GAME_TARGET del Blaze',
    15_000,
    cursor,
  )
  await expect(page.locator('.feedback-dialog')).toContainText(/Elige objetivo/, { timeout: 15_000 })
  // dar tiempo al render del targeting (el pulso/la línea) antes de capturar;
  // el pulso es periódico: reintentar capturas hasta cogerlo en fase visible
  await page.waitForTimeout(700)
  await page.locator('.feedback-backdrop').evaluate((el) => {
    el.style.background = 'transparent'
  })
  let shotA = await canvas.screenshot()
  for (let attempt = 0; attempt < 4 && Buffer.compare(beforeShot, shotA) === 0; attempt++) {
    await page.waitForTimeout(300)
    shotA = await canvas.screenshot()
  }
  expect(Buffer.compare(beforeShot, shotA) !== 0, 'el canvas debe cambiar al entrar en targeting').toBeTruthy()
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  fs.writeFileSync(TARGETING_SHOT, shotA)
  await targetOpponent(page, target, 'objetivo del Blaze', helper)
  // la vida del oponente se lee ANTES de pagar: el hechizo puede resolver durante
  // payMana (el helper pasa la prioridad del stack al instante tras el pago) y
  // restar el daño sobre una vida ya dañada esperaría un daño extra (18-2=16)
  const opp = opponentPlayer(lastGameView(parseFrames(frames)))
  await payMana(page, helper)
  await waitOppLife(page, (opp?.life ?? 20) - 2, 'Blaze resuelto (oponente -2)', 15_000)
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  await test.info().attach('ws-frames', { body: frames.map((f) => JSON.stringify(f)).join('\n'), contentType: 'text/plain' })
})

test('Arc Trail {1}{R}: dos objetivos (segundo ask o auto-elección) y resolución', async ({ page }) => {
  const { frames, sent, pageErrors, helper } = await startAdvancedGame(page)
  const arcId = await waitPlayable(page, 'Arc Trail', 30_000, 2)
  if (!arcId) throw new Error('Arc Trail no fue jugable en 30s (robo adverso)')
  const cursor = parsedLen(page)
  expect(await helper.playCard(arcId), 'el Arc Trail debería lanzarse por WS').toBeTruthy()
  const { frame: arc1, index: arc1Idx } = await waitFrameAt(
    page,
    (f) => f.method === 'GAME_TARGET' && !/discard/i.test(String(f.data?.message ?? '')),
    'GAME_TARGET #1 de Arc Trail',
    15_000,
    cursor,
  )
  await expect(page.locator('.feedback-dialog')).toContainText(/Elige objetivo/, { timeout: 15_000 })
  await targetOpponent(page, arc1, 'primer objetivo de Arc Trail', helper)
  // El 2º objetivo es "any other target": solo se re-dispara si hay otro objetivo
  // legal (p. ej. una criatura en juego); si no, el servidor lo auto-elige y va
  // directo al pago de maná (verificado contra el servidor: los dos Target de
  // Arc Trail son objetos separados y NO pueblan options.chosenTargets).
  try {
    const arc2 = await waitFrameAt(
      page,
      (f) => f.method === 'GAME_TARGET' && !/discard/i.test(String(f.data?.message ?? '')),
      'GAME_TARGET #2 de Arc Trail (re-disparo)',
      8_000,
      arc1Idx + 1,
    )
    const me = controlledPlayer(lastGameView(parseFrames(frames)))
    const ids = targetIdsOf(arc2.frame)
    if (me?.playerId && ids.includes(me.playerId)) {
      const clicked = await clickPlayerHeader(page, me.playerId)
      expect(clicked, 'segundo objetivo de Arc Trail en mi header').toBeTruthy()
    } else {
      const dialog = page.locator('.feedback-dialog')
      const button = dialog.getByRole('button').first()
      await expect(button, 'segundo objetivo de Arc Trail').toBeVisible({ timeout: 15_000 })
      await button.click()
    }
  } catch {
    // sin segundo objetivo legal: el servidor lo auto-elige (va directo al maná)
  }
  // vida del oponente antes del pago (el daño puede aplicarse durante payMana)
  const opp = opponentPlayer(lastGameView(parseFrames(frames)))
  await payMana(page, helper)
  await waitOppLife(page, (opp?.life ?? 20) - 2, 'Arc Trail resuelto (oponente -2)', 15_000)
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  await test.info().attach('ws-frames', { body: frames.map((f) => JSON.stringify(f)).join('\n'), contentType: 'text/plain' })
})

test('Boros Charm {R}{W}: GAME_CHOOSE_ABILITY del modo "4 damage" y pago multi-color', async ({ page }) => {
  const { frames, sent, pageErrors, helper } = await startAdvancedGame(page)
  const borosId = await waitPlayable(page, 'Boros Charm', 30_000, 2, true)
  if (!borosId) throw new Error('Boros Charm no fue jugable en 30s (¿sin Mountain+Plains sin girar?)')
  const cursor = parsedLen(page)
  expect(await helper.playCard(borosId), 'el Boros Charm debería lanzarse por WS').toBeTruthy()
  // el modo llega como GAME_CHOOSE_ABILITY (chooseMode -> AbilityPickerView), no como
  // GAME_CHOOSE_CHOICE (verificado contra el servidor en human-test)
  await waitFrame(page, (f) => f.method === 'GAME_CHOOSE_ABILITY', 'GAME_CHOOSE_ABILITY del modo de Boros Charm', 15_000, cursor)
  const modeButton = page.locator('.feedback-dialog .feedback-options').getByRole('button', { name: /4 damage|4 daño|deals 4/i }).first()
  await expect(modeButton, 'modo "4 damage" de Boros Charm').toBeVisible({ timeout: 15_000 })
  await modeButton.click()
  const target = await waitFrame(
    page,
    (f) => f.method === 'GAME_TARGET' && !/discard/i.test(String(f.data?.message ?? '')),
    'GAME_TARGET de Boros Charm',
    15_000,
    cursor,
  )
  await targetOpponent(page, target, 'objetivo de Boros Charm', helper)
  // vida del oponente antes del pago (el daño puede aplicarse durante payMana)
  const opp = opponentPlayer(lastGameView(parseFrames(frames)))
  await payMana(page, helper)
  await waitOppLife(page, (opp?.life ?? 20) - 4, 'Boros Charm resuelto (oponente -4)', 15_000)
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  await test.info().attach('ws-frames', { body: frames.map((f) => JSON.stringify(f)).join('\n'), contentType: 'text/plain' })
})

test('Walking Ballista {X}{X}: GAME_CHOOSE_ABILITY "Cast", X=4 y 4 contadores en el campo', async ({ page }) => {
  const { frames, sent, pageErrors, helper } = await startAdvancedGame(page)
  const ballistaId = await waitPlayable(page, 'Walking Ballista', 60_000, 8)
  if (!ballistaId) throw new Error('Walking Ballista no fue jugable con 8+ maná en 60s (robo adverso)')
  const cursor = parsedLen(page)
  expect(await helper.playCard(ballistaId), 'el Walking Ballista debería lanzarse por WS').toBeTruthy()
  // las criaturas con habilidades activadas piden GAME_CHOOSE_ABILITY ("Cast") antes del X
  await waitFrame(page, (f) => f.method === 'GAME_CHOOSE_ABILITY', 'GAME_CHOOSE_ABILITY del Walking Ballista', 15_000, cursor)
  const castButton = page.locator('.feedback-dialog .feedback-options').getByRole('button', { name: /Cast/i }).first()
  await expect(castButton, 'opción "Cast" del Walking Ballista').toBeVisible({ timeout: 15_000 })
  await castButton.click()
  await waitFrame(page, (f) => f.method === 'GAME_GET_AMOUNT' || f.method === 'GAME_SELECT_AMOUNT', 'GAME_GET_AMOUNT del Walking Ballista', 15_000, cursor)
  await resolveInteger(page, 4, 'Walking Ballista')
  await payMana(page, helper)
  await waitFrame(
    page,
    (f) => {
      return Object.values(myBattlefield(gameViewOf(f))).some(
        (p) =>
          (p.name === 'Walking Ballista' || p.displayName === 'Walking Ballista') &&
          (p.counters ?? []).reduce((sum, c) => sum + (c.count ?? 0), 0) === 4,
      )
    },
    'Walking Ballista en el campo con 4 contadores',
    20_000,
  )
  const ballistaView = myBattlefield(lastGameView(parseFrames(frames)))
  const ballista = Object.values(ballistaView).find((p) => p.name === 'Walking Ballista' || p.displayName === 'Walking Ballista')
  expect(ballista, 'Walking Ballista debería estar en el campo').toBeTruthy()
  const counterTotal = (ballista?.counters ?? []).reduce((sum, c) => sum + (c.count ?? 0), 0)
  expect(counterTotal, 'contadores totales del Walking Ballista').toBe(4)
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  await test.info().attach('ws-frames', { body: frames.map((f) => JSON.stringify(f)).join('\n'), contentType: 'text/plain' })
})
