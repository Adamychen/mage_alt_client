import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

const SHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')

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

async function clickHandCard(page: Page, name: string): Promise<boolean> {
  const view = lastGameView(parseFrames(framesOf(page)))
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

function framesOf(page: Page): string[] {
  return (page as unknown as { __frames: string[] }).__frames
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

test.describe.configure({ retries: 2 })

test('targeting visual: humano lanza Lightning Bolt y el tablero resalta objetivos (pulso + línea)', async ({ page }) => {
  test.setTimeout(240_000)

  const pageErrors: Error[] = []
  const frames: string[] = []
  ;(page as unknown as { __frames: string[] }).__frames = frames
  page.on('pageerror', (err) => pageErrors.push(err))
  page.on('websocket', (ws) => {
    ws.on('framereceived', (e) => frames.push(`<< ${String(e.payload)}`))
  })

  // (a) login con usuario único
  const username = `tg-${String(Date.now()).slice(-10)}`
  await page.goto('/')
  await expect(page.locator('form.login-card')).toBeVisible()
  await page.getByLabel('Servidor del proxy (host)').fill('localhost')
  await page.getByLabel('Puerto del servidor XMage').fill('17171')
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill('x')
  await page.getByRole('button', { name: 'Conectar' }).click()
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible({ timeout: 30_000 })

  // (b) crear mesa humana vs IA (por defecto: HUMAN + COMPUTER_MAD)
  await page.getByRole('button', { name: 'Nueva mesa' }).click()
  await expect(page.getByRole('heading', { name: 'Nueva mesa' })).toBeVisible()
  await page.getByRole('button', { name: 'Crear mesa' }).click()

  // (c) el creador ya ocupa su plaza humana; unir la IA y arrancar
  const row = page.locator('.table-row', { hasText: username })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await expect(row.locator('.table-seats')).toHaveText(/1\/2/, { timeout: 15_000 })
  await row.getByRole('button', { name: 'Unirse IA' }).click()
  await expect(row.locator('.table-seats')).toHaveText(/2\/2/, { timeout: 15_000 })
  const startButton = row.getByRole('button', { name: 'Empezar' })
  await expect(startButton).toBeVisible({ timeout: 15_000 })
  await startButton.click()

  // (d) pantalla de partida (mulligan auto-keep activo por defecto)
  await expect(page.locator('.game-top').getByText(/Partida/).first()).toBeVisible({ timeout: 60_000 })

  // (e) sorteo de "starting player": si el humano gana, llega un GAME_TARGET bloqueante
  let startupCursor = frames.length
  for (let i = 0; i < 2; i++) {
    let ask: GameFrame | null = null
    try {
      ask = await waitFrame(
        page,
        (f) => f.method === 'GAME_TARGET' && /starting player/i.test(String(f.data?.message ?? '')),
        'sorteo de starting player',
        12_000,
        startupCursor,
      )
    } catch {
      break
    }
    startupCursor = frames.length
    const dialog = page.locator('.feedback-dialog')
    const button = dialog.getByRole('button').first()
    await expect(button).toBeVisible({ timeout: 15_000 })
    await button.click()
    await page.waitForTimeout(800)
  }

  // (f) el auto-keep resuelve el mulligan; la mano debe contener Mountain y Lightning Bolt
  //     (si no, esta partida no es jugable: el test reintenta desde cero)
  await waitFrame(
    page,
    (f) => {
      const view = gameViewOf(f)
      return !!view && myHandEntries(view).length <= 7 && hasMyPriority(f)
    },
    'mano definitiva con prioridad',
    60_000,
  )
  const handNames = myHandEntries(lastGameView(parseFrames(frames))).map(([, c]) => c.name)
  expect(
    handNames.includes('Mountain') && handNames.includes('Lightning Bolt'),
    `la mano automática debería ser jugable (tiene: ${handNames.join(', ')})`,
  ).toBeTruthy()

  // (g) jugar la Mountain cuando toque prioridad
  const passButton = page.getByRole('button', { name: 'Pasar prioridad' })
  let mountainPlayed = false
  for (let turn = 0; turn < 8 && !mountainPlayed; turn++) {
    if (playableInView(lastGameView(parseFrames(frames)), 'Mountain')) {
      await clickHandCard(page, 'Mountain')
      mountainPlayed = true
      break
    }
    if (await passButton.isEnabled()) {
      await passButton.click()
      await page.waitForTimeout(400)
    }
    await waitFrame(page, hasMyPriority, `prioridad propia (turno ${turn})`, 45_000)
  }
  expect(mountainPlayed, 'la Mountain debería poder jugarse').toBeTruthy()

  // (h) esperar prioridad con Lightning Bolt jugable
  let boltId: string | null = null
  for (let turn = 0; turn < 8 && !boltId; turn++) {
    boltId = playableInView(lastGameView(parseFrames(frames)), 'Lightning Bolt')
    if (boltId) break
    if (await passButton.isEnabled()) {
      await passButton.click()
      await page.waitForTimeout(400)
    }
    await waitFrame(page, hasMyPriority, `prioridad para Bolt (turno ${turn})`, 45_000)
  }
  expect(boltId, 'Lightning Bolt debería ser jugable desde la mano').toBeTruthy()

  // (h) baseline del canvas antes del targeting
  const canvas = page.locator('.board-wrap canvas')
  const beforeShot = await canvas.screenshot()

  // (i) lanzar el Bolt (clic sobre la carta de la mano)
  await clickHandCard(page, 'Lightning Bolt')

  // (j) GAME_TARGET real + diálogo de targeting
  const target = await waitFrame(
    page,
    (f) => f.method === 'GAME_TARGET' && !/bottom of your library/i.test(String(f.data?.message ?? '')),
    'GAME_TARGET del Lightning Bolt',
  )
  await expect(page.locator('.feedback-dialog')).toContainText(/Elige objetivo/, { timeout: 15_000 })

  // (k) evidencias visuales del targeting en el canvas: pulso (2 capturas difieren) y
  //     render distinto al estado previo (outline pulsante + líneas punteadas).
  //     El screenshot de elemento incluye el backdrop DOM del diálogo (oscurece);
  //     se vuelve transparente para que la captura muestre la pulsación real.
  await page.waitForTimeout(250)
  await page.locator('.feedback-backdrop').evaluate((el) => {
    el.style.background = 'transparent'
  })
  const shotA = await canvas.screenshot()
  await page.waitForTimeout(400)
  const shotB = await canvas.screenshot()
  expect(Buffer.compare(beforeShot, shotA) !== 0, 'el canvas debe cambiar al entrar en targeting').toBeTruthy()
  expect(Buffer.compare(shotA, shotB) !== 0, 'el resaltado de objetivos debe pulsar (animación en el canvas)').toBeTruthy()
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  fs.writeFileSync(path.join(SHOTS_DIR, 'targeting-bolt.png'), shotB)

  // (l) resolver: objetivo al jugador oponente (anillo pulsante sobre su header)
  const opponent = opponentPlayer(lastGameView(parseFrames(frames)))
  const targetData = target.data
  const targetIds = Array.isArray(targetData?.targets) ? (targetData.targets as string[]).map(String) : []
  if (opponent?.playerId && targetIds.includes(opponent.playerId)) {
    await clickPlayerTarget(page, opponent.playerId)
  } else {
    const dialog = page.locator('.feedback-dialog')
    const oppName = opponent?.name
    const button = oppName
      ? dialog.getByRole('button', { name: new RegExp(oppName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()
      : dialog.getByRole('button').first()
    await expect(button).toBeVisible({ timeout: 15_000 })
    await button.click()
  }

  // (m) pagar maná: el servidor manda GAME_PLAY_MANA y el pago puede requerir dos pasos:
  //     clic en la fuente del tablero (Mountain) y luego usar la reserva (sendPlayerManaType)
  for (let i = 0; i < 6; i++) {
    const mana = await waitFrame(page, (f) => f.method === 'GAME_PLAY_MANA', `GAME_PLAY_MANA (${i})`, 30_000)
    await expect(page.locator('.feedback-dialog')).toContainText(/Pagar maná/, { timeout: 10_000 })
    const sourceId = manaSourceId(gameViewOf(mana))
    if (sourceId) {
      const clicked = await clickBattlefieldCard(page, sourceId)
      expect(clicked, `clic sobre la fuente de maná (intento ${i})`).toBeTruthy()
    } else {
      const poolButton = page.locator('.feedback-dialog').getByRole('button', { name: /Pagar reserva/i }).first()
      await expect(poolButton, `botón de reserva de maná (intento ${i})`).toBeVisible({ timeout: 10_000 })
      await poolButton.click()
    }
    const next = await waitFrame(
      page,
      (f) => f.method === 'GAME_PLAY_MANA' || hasMyPriority(f),
      `maná pagado o nuevo ask (${i})`,
      30_000,
    )
    if (next.method !== 'GAME_PLAY_MANA') break
  }

  // (m2) el Bolt está pagado y en el stack: pasar prioridad para que resuelva
  const passButton2 = page.getByRole('button', { name: 'Pasar prioridad' })
  await expect(passButton2).toBeEnabled({ timeout: 15_000 })
  await passButton2.click()

  // (n) resolución: la vida del oponente baja a 17 (3 de daño del Bolt)
  await waitFrame(
    page,
    (f) => {
      const view = gameViewOf(f)
      const opp = opponentPlayer(view)
      return opp?.playerId === opponent?.playerId && opp.life === 17
    },
    'Bolt resuelto (vida del oponente 17)',
    60_000,
  )

  // (n) el tablero vuelve al estado no-targeting (la línea punteada desaparece)
  await page.waitForTimeout(600)
  const afterShot = await canvas.screenshot()
  expect(Buffer.compare(afterShot, shotB) !== 0, 'el canvas debe cambiar al resolver el targeting').toBeTruthy()

  // (o) cero pageerrors
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])

  await test.info().attach('targeting-bolt', {
    body: fs.readFileSync(path.join(SHOTS_DIR, 'targeting-bolt.png')),
    contentType: 'image/png',
  })
})
