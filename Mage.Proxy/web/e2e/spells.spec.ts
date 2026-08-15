import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

const SHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')
const TARGETING_SHOT = path.join(SHOTS_DIR, 'spells-targeting.png')

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
  const ch = CARD_H * scale
  return {
    w,
    h,
    scale,
    oppHeader: { x: 16, y: 10 },
    myHeader: { x: 16, y: h - 34 },
    myHand: { x: w / 2, y: h - ch - 12 },
    myBattle: { x: 16, y: h - ch - 100 },
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

function parseFrames(frames: string[]): GameFrame[] {
  const out: GameFrame[] = []
  for (const frame of frames) {
    if (!frame.startsWith('<< ')) continue
    try {
      const parsed = JSON.parse(frame.slice(3)) as { method?: string; data?: unknown }
      if (parsed && typeof parsed.method === 'string') {
        out.push({ method: parsed.method, data: parsed.data as GameFrame['data'] })
      }
    } catch {
      // frame no JSON (p.ej. ping del proxy)
    }
  }
  return out
}

function parseSent(frames: string[]): { action?: string; args?: Record<string, unknown> }[] {
  const out: { action?: string; args?: Record<string, unknown> }[] = []
  for (const frame of frames) {
    if (!frame.startsWith('>> ')) continue
    try {
      const parsed = JSON.parse(frame.slice(3)) as { action?: string; args?: Record<string, unknown> }
      if (parsed && typeof parsed.action === 'string') {
        out.push({ action: parsed.action, args: parsed.args })
      }
    } catch {
      // frame no JSON
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
  await expect(canvas).toBeVisible({ timeout: 60_000 })
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

function nextManaSource(view: Record<string, unknown> | null, rejected: Set<string>, preferredName: string | null): string | null {
  const primary = manaSourceId(view)
  if (primary && !rejected.has(primary) && (!preferredName || battlefieldName(view, primary) === preferredName)) return primary
  if (!view) return null
  const objects = (view.canPlayObjects as Record<string, unknown> | undefined)?.objects as Record<string, unknown> | undefined
  if (!objects) return null
  const me = controlledPlayer(view)
  const battlefield = ((me as unknown as { battlefield?: unknown }).battlefield ?? {}) as Record<string, FieldPermanent>
  return (
    Object.keys(objects).find(
      (id) => battlefield[id] && battlefield[id].tapped !== true && !rejected.has(id) && (!preferredName || battlefieldName(view, id) === preferredName),
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

function framesOf(page: Page): string[] {
  return (page as unknown as { __frames: string[] }).__frames
}

function sentOf(page: Page): string[] {
  return (page as unknown as { __sent: string[] }).__sent
}

function parsedLen(page: Page): number {
  return parseFrames(framesOf(page)).length
}

function waitFrame(
  page: Page,
  predicate: (frame: GameFrame) => boolean,
  label: string,
  timeoutMs = 60_000,
  startIndex = 0,
) {
  return new Promise<GameFrame>((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      const found = parseFrames(framesOf(page).slice(startIndex)).find(predicate)
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
  timeoutMs = 60_000,
  startIndex = 0,
): Promise<{ frame: GameFrame; index: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      const parsed = parseFrames(framesOf(page))
      for (let i = startIndex; i < parsed.length; i++) {
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

function gameEnded(frames: string[]): boolean {
  return parseFrames(frames).some((f) => f.method === 'GAME_OVER' || f.method === 'END_GAME_INFO')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function untappedLands(view: Record<string, unknown> | null): { count: number; plains: number } {
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

/** Espera la resolución verificando la vida EXACTA del oponente con el stack vacío.
 *  Solo la del oponente: la IA lanza Lightning Bolts contra el humano (nunca contra
 *  el oponente), así que MI vida no es determinista mientras el hechizo resuelve. */
function waitOppLife(page: Page, expectedOpp: number, label: string, timeoutMs = 45_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const tick = () => {
      const view = lastGameView(parseFrames(framesOf(page)))
      const stack = (view?.stack ?? {}) as Record<string, unknown>
      const opp = opponentPlayer(view)
      if (Object.keys(stack).length === 0 && (opp?.life ?? -1) === expectedOpp) return resolve()
      if (Date.now() > deadline) return reject(new Error(`timeout esperando ${label}`))
      setTimeout(tick, 250)
    }
    tick()
  })
}

/** Paga el maná del hechizo en curso: clic en fuentes del tablero (o reserva) hasta que
 *  el servidor devuelva la prioridad. El cursor por índice evita re-procesar el mismo ask. */
async function payMana(page: Page): Promise<void> {
  const rejected = new Set<string>()
  let poolTry = 0
  // lookback: el primer GAME_PLAY_MANA puede haber llegado mientras la acción
  // anterior terminaba (p. ej. la verificación del target); un cursor estricto
  // lo saltaría y esperaría un ask que ya no llega
  let cursor = Math.max(0, parsedLen(page) - 10)
  for (let i = 0; i < 14; i++) {
    const { frame: mana, index: manaIndex } = await waitFrameAt(page, (f) => f.method === 'GAME_PLAY_MANA', `GAME_PLAY_MANA (${i})`, 45_000, cursor)
    await expect(page.locator('.feedback-dialog')).toContainText(/Pagar maná/, { timeout: 10_000 })
    // la confirmación del pago (hasMyPriority) puede llegar mientras el clic/espera
    // de tap del source anterior termina; escanear desde el ask actual evita saltarla
    cursor = manaIndex + 1
    // pagar el color que el servidor pide (el ask trae "Pay {R}{W}…"): una Plains no
    // puede pagar {R} y el servidor re-pregunta en bucle si el clic no sirve
    const preferredName = requiredSourceName(mana.data?.message as string | undefined)
    const sourceId = nextManaSource(gameViewOf(mana), rejected, preferredName)
    if (sourceId) {
      const clicked = await clickBattlefieldCard(page, sourceId)
      expect(clicked, `clic sobre la fuente de maná (intento ${i})`).toBeTruthy()
      let tapped = false
      const startLen = parsedLen(page)
      for (let w = 0; w < 25 && !tapped; w++) {
        await page.waitForTimeout(200)
        if (parsedLen(page) === startLen) continue
        const perm = myBattlefield(lastGameView(parseFrames(framesOf(page))))[sourceId]
        tapped = !perm || perm.tapped === true
      }
      if (!tapped) rejected.add(sourceId)
    } else {
      const poolButtons = page.locator('.feedback-dialog').getByRole('button', { name: /Pagar reserva/i })
      const count = await poolButtons.count()
      expect(count, `botones de reserva de maná (intento ${i})`).toBeGreaterThan(0)
      await poolButtons.nth(poolTry % count).click()
      poolTry++
    }
    const { frame: next, index: nextIndex } = await waitFrameAt(
      page,
      (f) => f.method === 'GAME_PLAY_MANA' || hasMyPriority(f),
      `maná pagado o nuevo ask (${i})`,
      45_000,
      cursor,
    )
    if (next.method !== 'GAME_PLAY_MANA') return
    // el ask siguiente sigue sin pagar: no avanzar el cursor más allá de él,
    // o la siguiente iteración esperaría un ask posterior que nunca llega
    cursor = nextIndex
  }
  throw new Error('no se pudo pagar el maná del hechizo')
}

/** Resuelve un GAME_TARGET eligiendo al jugador oponente (header del canvas o botón del diálogo). */
async function targetOpponent(page: Page, target: GameFrame, label: string): Promise<void> {
  const opp = opponentPlayer(lastGameView(parseFrames(framesOf(page))))
  const ids = targetIdsOf(target)
  if (opp?.playerId && ids.includes(opp.playerId)) {
    // el hit-area del header se construye en el siguiente tick del fx: clicar y
    // verificar que el UUID salió de verdad (reintento por si el área no estaba)
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = sentOf(page).length
      const clicked = await clickPlayerTarget(page, opp.playerId)
      expect(clicked, label).toBeTruthy()
      await page.waitForTimeout(300)
      const sentAfter = sentOf(page).slice(before)
      if (sentAfter.some((s) => s.includes('sendPlayerUUID'))) return
    }
    const dialog = page.locator('.feedback-dialog')
    const oppName = opp?.name
    const button = oppName
      ? dialog.getByRole('button', { name: new RegExp(escapeRegExp(oppName)) }).first()
      : dialog.getByRole('button').first()
    await expect(button, label).toBeVisible({ timeout: 15_000 })
    await button.click()
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

/** Pasa prioridad continuamente hasta tener prioridad en MI main phase (o timeout/partida terminada). */
async function passUntilMyMainPhase(page: Page, timeoutMs: number): Promise<boolean> {
  const passButton = page.getByRole('button', { name: 'Pasar prioridad' })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (gameEnded(framesOf(page))) return false
    const view = lastGameView(parseFrames(framesOf(page)))
    const me = controlledPlayer(view)
    if (view && me && (me as { hasPriority?: boolean }).hasPriority === true && view.phase === 'PRECOMBAT_MAIN') return true
    if (await passButton.isEnabled()) {
      await passButton.click()
    }
    await page.waitForTimeout(250)
  }
  return false
}

/**
 * Espera a que una carta sea jugable, desarrollando tierras (prefiriendo Plains).
 * La prioridad rota por fase en modo test, así que cada ventana se consume en MI
 * main phase (pasando el resto de fases); una tierra por turno.
 */
async function waitPlayable(page: Page, name: string, maxWindows: number): Promise<string | null> {
  const passButton = page.getByRole('button', { name: 'Pasar prioridad' })
  for (let w = 0; w < maxWindows; w++) {
    if (gameEnded(framesOf(page))) return null
    // la comprobación debe hacerse CON prioridad en mi main phase (el inicio de la
    // ventana siempre ve un frame posterior al pase, fuera del main phase)
    if (!(await passUntilMyMainPhase(page, 90_000))) return null
    const id = await isPlayable(page, name)
    if (id) return id
    const plainsId = await isPlayable(page, 'Plains')
    const mountainId = await isPlayable(page, 'Mountain')
    if (plainsId || mountainId) {
      await clickHandCard(page, plainsId ? 'Plains' : 'Mountain')
      await page.waitForTimeout(600)
      // tras jugar la tierra sigo con prioridad en el mismo main phase (el servidor
      // manda otro GAME_SELECT con PRECOMBAT_MAIN); pasar ya para que cada ventana
      // consuma un turno y no dos
      if (await passButton.isEnabled()) {
        await passButton.click()
      }
    } else if (await passButton.isEnabled()) {
      await passButton.click()
    }
  }
  return null
}

/** Una partida completa contra IA con el mazo avanzado; devuelve 'ok' o el motivo de reintento. */
/** Login, mesa con el mazo avanzado, IA, sorteo, mulligan y desarrollo de tierras.
 *  Devuelve el botón de pasar prioridad o lanza con el motivo del fallo. */
async function setupAdvancedGame(
  page: Page,
  username: string,
  tableName: string,
  opts: { minUntapped: number; needPlains: boolean },
): Promise<{ passButton: ReturnType<Page['getByRole']> }> {
  await page.goto('/')
  await expect(page.locator('form.login-card')).toBeVisible({ timeout: 60_000 })
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
      await expect(lobby).toBeVisible({ timeout: 25_000 })
      break
    } catch {
      await page.getByRole('button', { name: 'Conectar' }).click()
    }
  }
  await expect(lobby).toBeVisible({ timeout: 25_000 })

  await page.getByRole('button', { name: 'Nueva mesa' }).click()
  await expect(page.getByRole('heading', { name: 'Nueva mesa' })).toBeVisible()
  await page.getByLabel('Nombre').fill(tableName)
  await page.getByLabel('Tu mazo').selectOption('Mage Web advanced')
  await page.getByRole('button', { name: 'Crear mesa' }).click()

  const row = page.locator('.table-row', { hasText: tableName }).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  await expect(row.locator('.table-seats')).toHaveText(/1\/2/, { timeout: 15_000 })
  await row.getByRole('button', { name: 'Unirse IA' }).click()
  await expect(row.locator('.table-seats')).toHaveText(/2\/2/, { timeout: 30_000 })
  const startButton = row.getByRole('button', { name: 'Empezar' })
  await expect(startButton).toBeVisible({ timeout: 15_000 })
  await startButton.click()
  await expect(page.locator('.game-top').getByText(/Partida/).first()).toBeVisible({ timeout: 60_000 })

  // sorteo de "starting player": si llega, clicar el primer botón (el auto-mulligan
  // puede limpiar el diálogo antes de que el test lo vea; no es un fallo)
  let startupCursor = parsedLen(page)
  for (let i = 0; i < 2; i++) {
    try {
      await waitFrame(
        page,
        (f) => f.method === 'GAME_TARGET' && /starting player/i.test(String(f.data?.message ?? '')),
        'sorteo de starting player',
        12_000,
        startupCursor,
      )
    } catch {
      break
    }
    startupCursor = parsedLen(page)
    const button = page.locator('.feedback-dialog').getByRole('button').first()
    try {
      await expect(button).toBeVisible({ timeout: 4_000 })
      await button.click()
      await page.waitForTimeout(800)
    } catch {
      break
    }
  }

  // auto-keep del mulligan; esperar la mano definitiva con prioridad
  await waitFrame(
    page,
    (f) => {
      const view = gameViewOf(f)
      return !!view && myHandEntries(view).length <= 7 && hasMyPriority(f)
    },
    'mano definitiva con prioridad',
    60_000,
  )

  // desarrollo de tierras: `minUntapped` sin girar (+ Plains si hace falta). Una
  // tierra por turno; cada ventana se consume en MI main phase.
  const passButton = page.getByRole('button', { name: 'Pasar prioridad' })
  for (let w = 0; w < 24; w++) {
    if (gameEnded(framesOf(page))) throw new Error('la partida terminó durante el desarrollo de tierras')
    const view = lastGameView(parseFrames(framesOf(page)))
    const lands = untappedLands(view)
    if (lands.count >= opts.minUntapped && (!opts.needPlains || lands.plains >= 1)) break
    if (!(await passUntilMyMainPhase(page, 90_000))) throw new Error('la partida terminó esperando mi main phase')
    const plainsId = await isPlayable(page, 'Plains')
    const mountainId = await isPlayable(page, 'Mountain')
    if (plainsId || mountainId) {
      await clickHandCard(page, plainsId ? 'Plains' : 'Mountain')
      await page.waitForTimeout(600)
      if (await passButton.isEnabled()) {
        await passButton.click()
      }
    } else if (await passButton.isEnabled()) {
      await passButton.click()
    }
  }
  const devLands = untappedLands(lastGameView(parseFrames(framesOf(page))))
  if (opts.needPlains && devLands.plains < 1) throw new Error('no se consiguió un Plains en el campo (robo adverso)')
  if (devLands.count < opts.minUntapped) throw new Error(`no se consiguieron ${opts.minUntapped}+ tierras sin girar (robo adverso)`)
  return { passButton }
}

test.describe.configure({ retries: 2 })

/** Monta la partida (login → mesa → IA → sorteo → mulligan → tierras), activa el
 *  watcher de descarte y devuelve el contexto del test (frames, sent, pageerrors). */
async function startAdvancedGame(
  page: Page,
  opts: { minUntapped?: number; needPlains?: boolean } = {},
): Promise<{
  frames: string[]
  sent: string[]
  pageErrors: Error[]
  username: string
  passButton: ReturnType<Page['getByRole']>
}> {
  test.setTimeout(300_000)
  const pageErrors: Error[] = []
  const frames: string[] = []
  const sent: string[] = []
  ;(page as unknown as { __frames: string[] }).__frames = frames
  ;(page as unknown as { __sent: string[] }).__sent = sent
  page.on('pageerror', (err) => pageErrors.push(err))
  page.on('websocket', (ws) => {
    ws.on('framereceived', (e) => frames.push(`<< ${String(e.payload)}`))
    ws.on('framesent', (e) => sent.push(`>> ${String(e.payload)}`))
  })
  const username = `sp-${String(Date.now()).slice(-10)}`

  // watcher de descarte: el cliente NO auto-descarta y con mano >7 la partida se
  // bloquea. Prefiere tierras (para no comerse los hechizos del escenario). Vive
  // hasta que Playwright cierra la página al terminar el test.
  let discardCursor = 0
  const discardTimer = setInterval(() => {
    void (async () => {
      try {
        const parsed = parseFrames(framesOf(page))
        const idx = parsed.findIndex(
          (f, i) => i >= discardCursor && f.method === 'GAME_TARGET' && /discard/i.test(String(f.data?.message ?? '')),
        )
        if (idx < 0 || idx < discardCursor) return
        for (let i = 0; i < 12; i++) {
          const dialog = page.locator('.feedback-dialog')
          if (!(await dialog.isVisible().catch(() => false))) {
            await page.waitForTimeout(200)
            continue
          }
          if (!/discard/i.test(await dialog.textContent().catch(() => ''))) {
            await page.waitForTimeout(200)
            continue
          }
          const land = dialog.getByRole('button', { name: /Mountain|Plains/i }).first()
          const button = (await land.isVisible().catch(() => false)) ? land : dialog.getByRole('button').first()
          if (!(await button.isVisible().catch(() => false))) {
            await page.waitForTimeout(200)
            continue
          }
          await button.click()
          discardCursor = idx + 1
          return
        }
      } catch {
        // noop: el watcher nunca debe romper el test
      }
    })()
  }, 350)
  page.once('close', () => clearInterval(discardTimer))

  const { passButton } = await setupAdvancedGame(page, username, `${username}-t`, {
    minUntapped: opts.minUntapped ?? 3,
    needPlains: opts.needPlains ?? true,
  })
  return { frames, sent, pageErrors, username, passButton }
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
  const { frames, sent, pageErrors, passButton } = await startAdvancedGame(page)
  const canvas = page.locator('.board-wrap canvas')
  const blazeId = await waitPlayable(page, 'Blaze', 14)
  if (!blazeId) throw new Error('Blaze no fue jugable en ~14 turnos (robo adverso)')
  const beforeShot = await canvas.screenshot()
  const cursor = parsedLen(page)
  await clickHandCard(page, 'Blaze')
  await waitFrame(page, (f) => f.method === 'GAME_GET_AMOUNT' || f.method === 'GAME_SELECT_AMOUNT', 'GAME_GET_AMOUNT del Blaze', 30_000, cursor)
  await resolveInteger(page, 2, 'Blaze')
  const target = await waitFrame(
    page,
    (f) => f.method === 'GAME_TARGET' && !/discard/i.test(String(f.data?.message ?? '')),
    'GAME_TARGET del Blaze',
    30_000,
    cursor,
  )
  await expect(page.locator('.feedback-dialog')).toContainText(/Elige objetivo/, { timeout: 15_000 })
  await page.waitForTimeout(250)
  await page.locator('.feedback-backdrop').evaluate((el) => {
    el.style.background = 'transparent'
  })
  const shotA = await canvas.screenshot()
  expect(Buffer.compare(beforeShot, shotA) !== 0, 'el canvas debe cambiar al entrar en targeting').toBeTruthy()
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  fs.writeFileSync(TARGETING_SHOT, shotA)
  await targetOpponent(page, target, 'objetivo del Blaze')
  await payMana(page)
  // leer la vida ANTES de pasar prioridad: la resolución en testMode es casi
  // instantánea y una lectura posterior calcularía el objetivo mal
  const opp = opponentPlayer(lastGameView(parseFrames(frames)))
  await expect(passButton).toBeEnabled({ timeout: 15_000 })
  await passButton.click()
  await waitOppLife(page, (opp?.life ?? 0) - 2, 'Blaze resuelto (oponente -2)', 45_000)
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  await test.info().attach('ws-frames', { body: `${frames.join('\n')}\n${sent.join('\n')}`, contentType: 'text/plain' })
})

test('Arc Trail {1}{R}: dos objetivos (segundo ask o auto-elección) y resolución', async ({ page }) => {
  const { frames, sent, pageErrors, passButton } = await startAdvancedGame(page)
  const arcId = await waitPlayable(page, 'Arc Trail', 14)
  if (!arcId) throw new Error('Arc Trail no fue jugable en ~14 turnos (robo adverso)')
  const cursor = parsedLen(page)
  await clickHandCard(page, 'Arc Trail')
  const { frame: arc1, index: arc1Idx } = await waitFrameAt(
    page,
    (f) => f.method === 'GAME_TARGET' && !/discard/i.test(String(f.data?.message ?? '')),
    'GAME_TARGET #1 de Arc Trail',
    30_000,
    cursor,
  )
  await expect(page.locator('.feedback-dialog')).toContainText(/Elige objetivo/, { timeout: 15_000 })
  await targetOpponent(page, arc1, 'primer objetivo de Arc Trail')
  // El 2º objetivo es "any other target": solo se re-dispara si hay otro objetivo
  // legal (p. ej. una criatura en juego); si no, el servidor lo auto-elige y va
  // directo al pago de maná (verificado contra el servidor: los dos Target de
  // Arc Trail son objetos separados y NO pueblan options.chosenTargets).
  try {
    const arc2 = await waitFrameAt(
      page,
      (f) => f.method === 'GAME_TARGET' && !/discard/i.test(String(f.data?.message ?? '')),
      'GAME_TARGET #2 de Arc Trail (re-disparo)',
      12_000,
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
  await payMana(page)
  const opp = opponentPlayer(lastGameView(parseFrames(frames)))
  await expect(passButton).toBeEnabled({ timeout: 15_000 })
  await passButton.click()
  await waitOppLife(page, (opp?.life ?? 0) - 2, 'Arc Trail resuelto (oponente -2)', 45_000)
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  await test.info().attach('ws-frames', { body: `${frames.join('\n')}\n${sent.join('\n')}`, contentType: 'text/plain' })
})

test('Boros Charm {R}{W}: GAME_CHOOSE_ABILITY del modo "4 damage" y pago multi-color', async ({ page }) => {
  const { frames, sent, pageErrors, passButton } = await startAdvancedGame(page)
  const borosId = await waitPlayable(page, 'Boros Charm', 14)
  if (!borosId) throw new Error('Boros Charm no fue jugable en ~14 turnos (¿sin Mountain+Plains sin girar?)')
  const cursor = parsedLen(page)
  await clickHandCard(page, 'Boros Charm')
  // el modo llega como GAME_CHOOSE_ABILITY (chooseMode -> AbilityPickerView), no como
  // GAME_CHOOSE_CHOICE (verificado contra el servidor en human-test)
  await waitFrame(page, (f) => f.method === 'GAME_CHOOSE_ABILITY', 'GAME_CHOOSE_ABILITY del modo de Boros Charm', 30_000, cursor)
  const modeButton = page.locator('.feedback-dialog .feedback-options').getByRole('button', { name: /4 damage|4 daño|deals 4/i }).first()
  await expect(modeButton, 'modo "4 damage" de Boros Charm').toBeVisible({ timeout: 15_000 })
  await modeButton.click()
  const target = await waitFrame(
    page,
    (f) => f.method === 'GAME_TARGET' && !/discard/i.test(String(f.data?.message ?? '')),
    'GAME_TARGET de Boros Charm',
    30_000,
    cursor,
  )
  await targetOpponent(page, target, 'objetivo de Boros Charm')
  await payMana(page)
  // leer la vida ANTES de pasar prioridad (la resolución en testMode es casi instantánea)
  const opp = opponentPlayer(lastGameView(parseFrames(frames)))
  await expect(passButton).toBeEnabled({ timeout: 15_000 })
  await passButton.click()
  await waitOppLife(page, (opp?.life ?? 0) - 4, 'Boros Charm resuelto (oponente -4)', 45_000)
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  await test.info().attach('ws-frames', { body: `${frames.join('\n')}\n${sent.join('\n')}`, contentType: 'text/plain' })
})

test('Walking Ballista {X}{X}: GAME_CHOOSE_ABILITY "Cast", X=4 y 4 contadores en el campo', async ({ page }) => {
  const { frames, sent, pageErrors, passButton } = await startAdvancedGame(page, { minUntapped: 8, needPlains: false })
  let ballistaId: string | null = null
  for (let w = 0; w < 24 && !ballistaId; w++) {
    if (gameEnded(frames)) throw new Error('la partida terminó esperando Walking Ballista')
    if (!(await passUntilMyMainPhase(page, 90_000))) throw new Error('la partida terminó esperando mi main phase (Walking Ballista)')
    const candidate = await isPlayable(page, 'Walking Ballista')
    if (candidate) {
      ballistaId = candidate
      break
    }
    const plainsId = await isPlayable(page, 'Plains')
    const mountainId = await isPlayable(page, 'Mountain')
    if (plainsId || mountainId) {
      await clickHandCard(page, plainsId ? 'Plains' : 'Mountain')
      await page.waitForTimeout(600)
      if (await passButton.isEnabled()) {
        await passButton.click()
      }
    } else if (await passButton.isEnabled()) {
      await passButton.click()
    }
    await waitFrame(page, hasMyPriority, `prioridad propia esperando Walking Ballista (${w})`, 60_000)
  }
  if (!ballistaId) throw new Error('Walking Ballista no fue jugable con 8+ maná en ~24 turnos (robo adverso)')
  const cursor = parsedLen(page)
  await clickHandCard(page, 'Walking Ballista')
  // las criaturas con habilidades activadas piden GAME_CHOOSE_ABILITY ("Cast") antes del X
  await waitFrame(page, (f) => f.method === 'GAME_CHOOSE_ABILITY', 'GAME_CHOOSE_ABILITY del Walking Ballista', 30_000, cursor)
  const castButton = page.locator('.feedback-dialog .feedback-options').getByRole('button', { name: /Cast/i }).first()
  await expect(castButton, 'opción "Cast" del Walking Ballista').toBeVisible({ timeout: 15_000 })
  await castButton.click()
  await waitFrame(page, (f) => f.method === 'GAME_GET_AMOUNT' || f.method === 'GAME_SELECT_AMOUNT', 'GAME_GET_AMOUNT del Walking Ballista', 30_000, cursor)
  await resolveInteger(page, 4, 'Walking Ballista')
  await payMana(page)
  await expect(passButton).toBeEnabled({ timeout: 15_000 })
  await passButton.click()
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
    60_000,
  )
  const ballistaView = myBattlefield(lastGameView(parseFrames(frames)))
  const ballista = Object.values(ballistaView).find((p) => p.name === 'Walking Ballista' || p.displayName === 'Walking Ballista')
  expect(ballista, 'Walking Ballista debería estar en el campo').toBeTruthy()
  const counterTotal = (ballista?.counters ?? []).reduce((sum, c) => sum + (c.count ?? 0), 0)
  expect(counterTotal, 'contadores totales del Walking Ballista').toBe(4)
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  await test.info().attach('ws-frames', { body: `${frames.join('\n')}\n${sent.join('\n')}`, contentType: 'text/plain' })
})
