import { test, expect } from './fixtures'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clickPlayerHeader } from './support/canvas'
import { targetIdsOf, lastGameView, myBattlefield, opponentPlayer, parseFrames, waitFrame, waitFrameAt, parsedLen, gameViewOf, waitOppLife } from './support/frames'
import { expectFeedbackDialog, payMana, resolveInteger, targetOpponent, waitPlayable } from './support/game-screen'
import { startGame } from './support/start-game'
import { spellsScenario } from '../fixtures/scenarios/spells'
import { withFakeServer } from './support/fake-backend'

const SHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')
const TARGETING_SHOT = path.join(SHOTS_DIR, 'spells-targeting.png')

function controlledOf(view: Record<string, unknown> | null) {
  const players = (view?.players ?? []) as { playerId?: string; controlled?: boolean }[]
  return players.find((p) => p.controlled)
}

test.describe('Blaze', { tag: '@spells' }, () => {
  test('Blaze {X}{R}: diálogo integer X=2, targeting visual y pago de maná', async ({ page }) => {
  await withFakeServer(() => spellsScenario('blaze'), async () => {
  const { frames, pageErrors, helper } = await startGame(page, { prefix: 'sp', tableName: 'blaze-test', deck: 'Mage Web advanced' })
  const canvas = page.locator('.board-wrap canvas')
  const blazeId = await waitPlayable(page, 'Blaze', { timeoutMs: 30_000, minUntapped: 3 })
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
  await expectFeedbackDialog(page, 'Elige objetivo')
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
  })
})

test.describe('Arc Trail', { tag: '@spells' }, () => {
  test('Arc Trail {1}{R}: dos objetivos (segundo ask o auto-elección) y resolución', async ({ page }) => {
  await withFakeServer(() => spellsScenario('arc'), async () => {
  const { frames, pageErrors, helper } = await startGame(page, { prefix: 'sp', tableName: 'arc-test', deck: 'Mage Web advanced' })
  const arcId = await waitPlayable(page, 'Arc Trail', { timeoutMs: 30_000, minUntapped: 2 })
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
  await expectFeedbackDialog(page, 'Elige objetivo')
  await targetOpponent(page, arc1, 'primer objetivo de Arc Trail', helper)
  // El 2º objetivo es "any other target": solo se re-dispara si hay otro objetivo
  // legal (p. ej. una criatura en juego); si no, el servidor lo auto-elige y va
  // directo al pago de maná (los dos Target de Arc Trail son objetos separados y
  // NO pueblan options.chosenTargets).
  try {
    const arc2 = await waitFrameAt(
      page,
      (f) => f.method === 'GAME_TARGET' && !/discard/i.test(String(f.data?.message ?? '')),
      'GAME_TARGET #2 de Arc Trail (re-disparo)',
      8_000,
      arc1Idx + 1,
    )
    const me = controlledOf(lastGameView(parseFrames(frames)))
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
  })
})

test.describe('Boros Charm', { tag: '@spells' }, () => {
  test('Boros Charm {R}{W}: GAME_CHOOSE_ABILITY del modo "4 damage" y pago multi-color', async ({ page }) => {
  await withFakeServer(() => spellsScenario('boros'), async () => {
  const { frames, pageErrors, helper } = await startGame(page, { prefix: 'sp', tableName: 'boros-test', deck: 'Mage Web advanced' })
  const borosId = await waitPlayable(page, 'Boros Charm', { timeoutMs: 30_000, minUntapped: 2, needPlains: true })
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
  })
})

test.describe('Walking Ballista', { tag: '@spells' }, () => {
  test('Walking Ballista {X}{X}: GAME_CHOOSE_ABILITY "Cast", X=4 y 4 contadores en el campo', async ({ page }) => {
  await withFakeServer(() => spellsScenario('ballista'), async () => {
  const { frames, pageErrors, helper } = await startGame(page, { prefix: 'sp', tableName: 'ballista-test', deck: 'Mage Web advanced' })
  const ballistaId = await waitPlayable(page, 'Walking Ballista', { timeoutMs: 60_000, minUntapped: 8 })
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
  })
})