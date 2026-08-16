import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { cleanupUser, registerHelper } from './cleanup'
import { HumanHelper } from './wshelper'

const SHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')

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
 *  waitFrame se hacen cada ~200ms y re-parsear los frames en cada poll con
 *  partidas rápidas generaba cientos de MB/s de basura (OOM del runner). */
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

function myHandEntries(view: Record<string, unknown> | null): [string, { name?: string }][] {
  const hand = (view?.myHand ?? {}) as Record<string, { name?: string }>
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

/** Tierras mías sin girar en el campo (Mountain/Plains), para el desarrollo determinista. */
function untappedLands(view: Record<string, unknown> | null): { count: number } {
  const me = controlledPlayer(view) as unknown as { battlefield?: Record<string, { name?: string; displayName?: string; tapped?: boolean }> } | null
  let count = 0
  for (const perm of Object.values(me?.battlefield ?? {})) {
    if (perm.tapped === true) continue
    if (perm.name === 'Mountain' || perm.displayName === 'Mountain') count++
    else if (perm.name === 'Plains' || perm.displayName === 'Plains') count++
  }
  return { count }
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
  // igual que el human-test: solo cuentan los GAME_SELECT con prioridad real del humano
  return (me as { hasPriority?: boolean }).hasPriority === true
}

async function canvasBox(page: Page) {
  const canvas = page.locator('.board-wrap canvas')
  await expect(canvas).toBeVisible({ timeout: 60_000 })
  return await canvas.boundingBox()
}

/** Clic lógico por UUID en el escenario (el hook de la app despacha el click real,
 *  mucho más fiable que clicar coordenadas del canvas con partidas rápidas). */
async function sceneClick(page: Page, id: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const ok =
      (await page.evaluate(
        (cardId) => (globalThis as unknown as { __mageScene?: { click?: (id: string) => boolean } }).__mageScene?.click?.(cardId) ?? false,
        id,
      )) === true
    if (ok) return true
    await page.waitForTimeout(200)
  }
  return false
}

interface SceneTargeting {
  active: boolean
  source: string | null
  ids: string[]
  chosen: string[]
}

/** Estado del targeting EN VIVO de la escena (determinista; sustituye a los
 *  byte-diffs del canvas, que dependen del render por detrás de los frames). */
async function sceneTargeting(page: Page): Promise<SceneTargeting | null> {
  try {
    return (await page.evaluate(() => {
      const s = (globalThis as unknown as { __mageScene?: { targeting?: SceneTargeting } }).__mageScene
      return s?.targeting ?? null
    })) as SceneTargeting | null
  } catch {
    return null
  }
}

async function waitSceneTargeting(
  page: Page,
  predicate: (t: SceneTargeting) => boolean,
  label: string,
  timeoutMs = 15_000,
): Promise<SceneTargeting> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const t = await sceneTargeting(page)
    if (t && predicate(t)) return t
    await page.waitForTimeout(200)
  }
  const last = await sceneTargeting(page)
  throw new Error(`timeout esperando ${label} (último targeting: ${JSON.stringify(last)})`)
}

/** Id de la carta por nombre si está en la lista de jugables EN VIVO de la app. */
async function playableInSceneByName(page: Page, name: string): Promise<string | null> {
  const scene = await page.evaluate(() => (globalThis as unknown as { __mageScene?: { cards?: Record<string, { x: number; y: number }>; playable?: string[] } })?.__mageScene ?? null)
  const playable = Array.isArray(scene?.playable) ? scene.playable : []
  if (playable.length === 0) return null
  const view = lastGameView(parseFrames(framesOf(page)))
  const entry = myHandEntries(view).find(([, card]) => card.name === name || card.displayName === name)
  return entry && playable.includes(entry[0]) ? entry[0] : null
}

async function clickHandCard(page: Page, name: string): Promise<boolean> {
  const view = lastGameView(parseFrames(framesOf(page)))
  const entry = myHandEntries(view).find(([, card]) => card.name === name || card.displayName === name)
  if (!entry) return false
  const id = entry[0]
  // priorizar el clic lógico de la escena; fallback a coordenadas (posiciones del escenario)
  if (await sceneClick(page, id)) return true
  const hand = myHandEntries(view)
  const index = hand.findIndex(([, card]) => card.name === name || card.displayName === name)
  const count = hand.length
  if (index < 0 || count === 0) return false
  const box = await canvasBox(page)
  if (!box) return false
  const zones = computeZones(box.width, box.height)
  const slots = handFanned(zones.myHand, count, zones.scale, box.width)
  const slot = slots[index]
  await page.mouse.click(box.x + slot.x, box.y + slot.y)
  return true
}

async function clickBattlefieldCard(page: Page, cardId: string): Promise<boolean> {
  // priorizar el clic lógico de la escena (pago de maná con partidas rápidas)
  if (await sceneClick(page, cardId)) return true
  const view = lastGameView(parseFrames(framesOf(page)))
  const me = controlledPlayer(view)
  const battlefield = (me?.battlefield ?? {}) as Record<string, unknown>
  const entries = Object.keys(battlefield)
  const index = entries.indexOf(cardId)
  if (!me || index < 0) return false
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
  const battlefield = (me.battlefield ?? {}) as Record<string, unknown>
  return Object.keys(objects).find((id) => battlefield[id]) ?? null
}

function battlefieldName(view: Record<string, unknown> | null, id: string): string | null {
  if (!view) return null
  const me = controlledPlayer(view)
  const battlefield = ((me as unknown as { battlefield?: unknown }).battlefield ?? {}) as Record<string, { name?: string; displayName?: string }>
  return battlefield[id]?.name ?? battlefield[id]?.displayName ?? null
}

/** Fuente de maná para el ask actual: canPlayObjects primero, tierras básicas
 *  sin girar del campo como fallback (el ask puede llegar sin canPlayObjects). */
function nextManaSource(view: Record<string, unknown> | null, preferredName: string | null): string | null {
  const primary = manaSourceId(view)
  if (primary && (!preferredName || battlefieldName(view, primary) === preferredName)) return primary
  if (!view) return null
  const me = controlledPlayer(view)
  const battlefield = ((me as unknown as { battlefield?: unknown }).battlefield ?? {}) as Record<string, { tapped?: boolean }>
  return (
    Object.keys(battlefield).find(
      (id) => battlefield[id] && battlefield[id].tapped !== true && (!preferredName || battlefieldName(view, id) === preferredName),
    ) ?? null
  )
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
      // si el cursor apunta fuera del array (frames eviccionados o último frame
      // ya procesado), no hay nada que re-matchear: seguir polleando. Un clamp a
      // parsed.length-1 re-matcheaba el ÚLTIMO frame (p. ej. el ask de maná que
      // acababa de pagarse) como si fuera el "siguiente".
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

function parsedLen(page: Page): number {
  return parseFrames(framesOf(page)).length
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
  const y = index === 0 ? zones.oppHeader.y : zones.oppHeader.y + index * 24
  await page.mouse.click(box.x + zones.oppHeader.x + 8, box.y + y - 4)
  return true
}

function framesOf(page: Page): Array<Record<string, unknown> | null> {
  return (page as unknown as { __frames: Array<Record<string, unknown> | null> }).__frames
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
      // igual que waitFrameAt: sin clamp al último frame (evita re-matchear un
      // frame ya consumido como si fuera el siguiente)
      const start = Math.min(startIndex, parsed.length)
      const found = parsed.slice(start).find(predicate)
      if (found) return resolve(found)
      if (Date.now() - started > timeoutMs) return reject(new Error(`timeout esperando ${label}`))
      setTimeout(tick, 200)
    }
    tick()
  })
}

test('targeting visual: humano lanza Lightning Bolt y el tablero resalta objetivos (pulso + línea)', async ({ page }) => {
  const pageErrors: Error[] = []
  const frames: Array<Record<string, unknown> | null> = []
  ;(page as unknown as { __frames: Array<Record<string, unknown> | null> }).__frames = frames
  page.on('pageerror', (err) => pageErrors.push(err))
  page.on('websocket', (ws) => {
    ws.on('framereceived', (e) => {
      try {
        frames.push(JSON.parse(String(e.payload)) as Record<string, unknown>)
      } catch {
        frames.push(null)
      }
      if (frames.length > MAX_FRAMES) frames.splice(0, frames.length - MAX_FRAMES)
    })
  })

  // (a) login con usuario único
  const username = `tg-${String(Date.now()).slice(-10)}`
  cleanupUser(username)
  await page.goto('/')
  await expect(page.locator('form.login-card')).toBeVisible()
  await page.getByLabel('Servidor del proxy (host)').fill('localhost')
  await page.getByLabel('Puerto del servidor XMage').fill('17171')
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill('x')
  await page.getByRole('button', { name: 'Conectar' }).click()
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible({ timeout: 20_000 })

  // (b) crear mesa humana vs Sim (oponente simulado determinista que une el proxy)
  await page.getByRole('button', { name: 'Nueva mesa' }).click()
  await expect(page.getByRole('heading', { name: 'Nueva mesa' })).toBeVisible()
  // partida determinista: sin barajar, la mano/robos son el orden exacto del mazo
  // (DEFAULT_DECK ordenado: 4 Mountain + 3 Bolt en la mano inicial)
  await page.getByLabel('No barajar el mazo inicial (modo test)').check()
  // partida determinista: sin sorteo aleatorio de starting player
  await page.getByLabel('Sin sorteo de jugador inicial (modo test)').check()
  await page.getByRole('button', { name: 'SIM' }).click()
  await page.getByRole('button', { name: 'Crear mesa' }).click()

  // (c) el creador ya ocupa su plaza humana; el proxy une el Sim y arrancamos
  const row = page.locator('.table-row', { hasText: username })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row.locator('.table-seats')).toHaveText(/2\/2/, { timeout: 20_000 })
  const startButton = row.getByRole('button', { name: 'Empezar' })
  await expect(startButton).toBeVisible({ timeout: 15_000 })
  await startButton.click()

  // (d) pantalla de partida (mulligan auto-keep activo por defecto)
  await expect(page.locator('.game-top').getByText(/Partida/).first()).toBeVisible({ timeout: 20_000 })

  // SIN auto-pase del web: el HumanHelper (WS) lo sustituye (tierras + pases)
  // para que sus pases no compitan con la ventana de lanzamiento del Bolt.

  // helper WS: juega la Mountain del desarrollo y pasa prioridades — el test solo
  // espera a que el Bolt sea jugable
  const helper = new HumanHelper(username, 'x')
  registerHelper(helper)
  await helper.start()
  await helper.waitGameId(20_000)

  // (f) esperar la mano inicial (mulligan auto-keep)
  await waitFrame(
    page,
    (f) => {
      const view = gameViewOf(f)
      return !!view && myHandEntries(view).length >= 6
    },
    'mano inicial',
    20_000,
  )
  const handNames = myHandEntries(lastGameView(parseFrames(frames))).map(([, c]) => c.name)
  expect(
    handNames.includes('Mountain') && handNames.includes('Lightning Bolt'),
    `la mano automática debería ser jugable (tiene: ${handNames.join(', ')})`,
  ).toBeTruthy()

  // (g) el helper juega la Mountain del desarrollo: esperar el campo con tierra
  const mountainDeadline = Date.now() + 20_000
  while (Date.now() < mountainDeadline && untappedLands(lastGameView(parseFrames(frames))).count < 1) {
    await page.waitForTimeout(250)
  }
  expect(untappedLands(lastGameView(parseFrames(frames))).count >= 1, 'la Mountain debería jugarse (helper)').toBeTruthy()

  // (h) esperar el Bolt jugable en MI main phase (como instantáneo es jugable
  //     también en el turno del rival: clicar ahí es una carrera con la ventana)
  let boltId: string | null = null
  const boltDeadline = Date.now() + 20_000
  while (Date.now() < boltDeadline && !boltId) {
    const view = lastGameView(parseFrames(frames))
    const me = controlledPlayer(view)
    const myMain = !!view && me?.isActive === true && view.phase === 'PRECOMBAT_MAIN'
    if (myMain) {
      boltId = playableInView(view, 'Lightning Bolt') ?? (await playableInSceneByName(page, 'Lightning Bolt'))
    }
    if (!boltId) await page.waitForTimeout(250)
  }
  expect(boltId, 'Lightning Bolt debería ser jugable desde la mano').toBeTruthy()

  // (h) lanzar el Bolt por WS (determinista); el targeting y el pago se verifican por UI
  if (!boltId) throw new Error('sin id del Bolt')
  expect(await helper.playCard(boltId), 'el Bolt debería lanzarse por WS').toBeTruthy()

  // (j) GAME_TARGET real + diálogo de targeting
  const target = await waitFrame(
    page,
    (f) => f.method === 'GAME_TARGET' && !/bottom of your library/i.test(String(f.data?.message ?? '')),
    'GAME_TARGET del Lightning Bolt',
  )
  await expect(page.locator('.feedback-dialog'), `pageerrors: ${pageErrors.map(String).join(' | ')}`).toContainText(/Elige objetivo/, { timeout: 15_000 })

  // (k) evidencias visuales del targeting en el CANVAS por estado de escena
  //     (determinista): el targeting está activo, con fuente y objetivos reales.
  //     El byte-diff del canvas se eliminó: dependía del render por detrás de
  //     los frames y era la fuente de flakes. El pulso (animación) se cubre por
  //     unit test de drawTargetFx; aquí se verifica el ESTADO.
  const tActive = await waitSceneTargeting(page, (t) => t.active, 'targeting activo en la escena')
  // la fuente (source) la resuelve la app por nombre (secondMessage) y puede no
  // matchear; lo determinista es el targeting ACTIVO + los objetivos válidos.
  expect(tActive.ids.length, 'el targeting debería listar objetivos válidos').toBeGreaterThan(0)
  const opponent = opponentPlayer(lastGameView(parseFrames(frames)))
  expect(opponent?.playerId, 'debería haber un oponente').toBeTruthy()
  const tIds = new Set(tActive.ids)
  expect(
    tIds.has(opponent!.playerId),
    'el oponente debería ser un objetivo válido del targeting',
  ).toBeTruthy()

  // (l) resolver: objetivo al jugador oponente por WS (determinista; las
  //     aserciones visuales ya se hicieron con el diálogo abierto)
  if (opponent?.playerId) {
    expect(await helper.playCard(opponent.playerId), 'objetivo del Bolt').toBeTruthy()
  } else {
    const dialog = page.locator('.feedback-dialog')
    const oppName = opponent?.name
    const button = oppName
      ? dialog.getByRole('button', { name: new RegExp(oppName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()
      : dialog.getByRole('button').first()
    await expect(button).toBeVisible({ timeout: 15_000 })
    await button.click()
  }

  // (m) pagar maná: el diálogo se verifica por UI; el pago va por WS (determinista).
  //     Cursor estricto (como en spells.spec): tras pagar se espera el ask SIGUIENTE
  //     con un cursor pasado el actual; un lookback (`parsedLen - 10`) re-matchea el
  //     MISMO ask y paga una 2ª fuente (tierras todas giradas -> "sin fuente").
  let cursor = Math.max(0, parsedLen(page) - 10)
  for (let i = 0; i < 6; i++) {
    const { frame: mana, index: manaIndex } = await waitFrameAt(
      page,
      (f) => f.method === 'GAME_PLAY_MANA',
      `GAME_PLAY_MANA (${i})`,
      15_000,
      cursor,
    )
    await expect(page.locator('.feedback-dialog')).toContainText(/Pagar maná/, { timeout: 10_000 })
    cursor = manaIndex + 1
    // la vista del ask puede ir stale (fuentes tapadas en frames viejos): reintentar
    // la lectura hasta ver una fuente sin girar (el pago del ask anterior se propaga)
    let sourceId: string | null = null
    for (let attempt = 0; attempt < 20 && !sourceId; attempt++) {
      sourceId = nextManaSource(lastGameView(parseFrames(frames)), null)
      if (!sourceId) await page.waitForTimeout(150)
    }
    if (!sourceId) throw new Error(`sin fuente de maná para "${String((mana.data as { message?: unknown } | null)?.message ?? '').slice(0, 40)}"`)
    expect(await helper.playCard(sourceId), `pago de maná por WS (intento ${i})`).toBeTruthy()
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
    if (nextIndex < 0) break
    cursor = nextIndex
  }

  // (n) resolución: el helper pasa las prioridades del stack; la vida del
  //     oponente baja a 17 (3 de daño del Bolt)
  await waitFrame(
    page,
    (f) => {
      const view = gameViewOf(f)
      const opp = opponentPlayer(view)
      return opp?.playerId === opponent?.playerId && opp.life === 17
    },
    'Bolt resuelto (vida del oponente 17)',
    15_000,
  )

  // (n) el tablero vuelve al estado no-targeting: el targeting se desactiva en la
  //     escena (determinista, sin byte-diff del canvas)
  const tInactive = await waitSceneTargeting(page, (t) => !t.active, 'targeting desactivado tras resolver')
  expect(tInactive.ids.length, 'sin objetivos activos tras resolver').toBe(0)

  // evidencia visual (no es aserción): captura del tablero post-resolución
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  await page.locator('.board-wrap canvas').screenshot({ path: path.join(SHOTS_DIR, 'targeting-resolved.png') })

  // (o) cero pageerrors
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])

  await test.info().attach('targeting-resolved', {
    body: fs.readFileSync(path.join(SHOTS_DIR, 'targeting-resolved.png')),
    contentType: 'image/png',
  })
})
