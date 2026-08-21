import { test, expect } from './fixtures'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  countUntappedLands,
  gameViewOf,
  lastGameView,
  myHandEntries,
  nextManaSource,
  opponentPlayer,
  parseFrames,
  parsedLen,
  playableInView,
  waitFrame,
  waitFrameAt,
} from './support/frames'
import { playableInSceneByName, waitSceneTargeting } from './support/scene'
import { startGame } from './support/start-game'
import { targetingScenario } from '../fixtures/scenarios/targeting'
import { withFakeServer } from './support/fake-backend'
import { feedbackDialog } from './support/game-screen'

const SHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')

test('targeting visual: humano lanza Lightning Bolt y el tablero resalta objetivos (pulso + línea)', { tag: '@targeting' }, async ({ page }) => {
  await withFakeServer(() => targetingScenario(), async () => {
  const { frames, pageErrors, helper } = await startGame(page, { prefix: 'tg', tableName: 'targeting-test' })

  // (a) esperar la mano inicial (mulligan auto-keep); el mazo automático es
  //     determinista (sin barajar): 4 Mountain + 3 Bolt en la mano inicial
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

  // (b) el helper juega la Mountain del desarrollo: esperar el campo con tierra
  const mountainDeadline = Date.now() + 20_000
  while (Date.now() < mountainDeadline && countUntappedLands(lastGameView(parseFrames(frames))).count < 1) {
    await page.waitForTimeout(250)
  }
  expect(countUntappedLands(lastGameView(parseFrames(frames))).count >= 1, 'la Mountain debería jugarse (helper)').toBeTruthy()

  // (c) esperar el Bolt jugable en MI main phase (como instantáneo es jugable
  //     también en el turno del rival: clicar ahí es una carrera con la ventana)
  let boltId: string | null = null
  const boltDeadline = Date.now() + 20_000
  while (Date.now() < boltDeadline && !boltId) {
    const view = lastGameView(parseFrames(frames))
    const me = controlledOf(view)
    const myMain = !!view && me?.isActive === true && view.phase === 'PRECOMBAT_MAIN'
    if (myMain) {
      boltId = playableInView(view, 'Lightning Bolt') ?? (await playableInSceneByName(page, 'Lightning Bolt'))
    }
    if (!boltId) await page.waitForTimeout(250)
  }
  expect(boltId, 'Lightning Bolt debería ser jugable desde la mano').toBeTruthy()

  // (d) lanzar el Bolt por WS (determinista); el targeting y el pago se verifican por UI
  if (!boltId) throw new Error('sin id del Bolt')
  expect(await helper.playCard(boltId), 'el Bolt debería lanzarse por WS').toBeTruthy()

  // (e) GAME_TARGET real + diálogo de targeting
  await waitFrame(
    page,
    (f) => f.method === 'GAME_TARGET' && !/bottom of your library/i.test(String(f.data?.message ?? '')),
    'GAME_TARGET del Lightning Bolt',
  )
  await expect(feedbackDialog(page), `pageerrors: ${pageErrors.map(String).join(' | ')}`).toContainText(/Lightning Bolt/, { timeout: 15_000 })

  // (f) evidencias visuales del targeting en el CANVAS por estado de escena
  //     (determinista): el targeting está activo, con fuente y objetivos reales.
  //     El pulso (animación) se cubre por unit test de drawTargetFx.
  const tActive = await waitSceneTargeting(page, (t) => t.active, 'targeting activo en la escena')
  expect(tActive.ids.length, 'el targeting debería listar objetivos válidos').toBeGreaterThan(0)
  const opponent = opponentPlayer(lastGameView(parseFrames(frames)))
  expect(opponent?.playerId, 'debería haber un oponente').toBeTruthy()
  const tIds = new Set(tActive.ids)
  expect(
    tIds.has(opponent!.playerId!),
    'el oponente debería ser un objetivo válido del targeting',
  ).toBeTruthy()

  // (g) resolver: objetivo al jugador oponente por WS (determinista; las
  //     aserciones visuales ya se hicieron con el diálogo abierto)
  if (opponent?.playerId) {
    expect(await helper.playCard(opponent.playerId), 'objetivo del Bolt').toBeTruthy()
  } else {
    const dialog = feedbackDialog(page)
    const oppName = opponent?.name
    const button = oppName
      ? dialog.getByRole('button', { name: new RegExp(oppName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()
      : dialog.getByRole('button').first()
    await expect(button).toBeVisible({ timeout: 15_000 })
    await button.click()
  }

  // (h) pagar maná: el diálogo se verifica por UI; el pago va por WS (determinista).
  //     Cursor estricto: tras pagar se espera el ask SIGUIENTE con un cursor
  //     pasado el actual; un lookback re-matchea el MISMO ask y pagaría una 2ª
  //     fuente (tierras todas giradas -> "sin fuente").
  let cursor = Math.max(0, parsedLen(page) - 10)
  for (let i = 0; i < 6; i++) {
    const { frame: mana, index: manaIndex } = await waitFrameAt(
      page,
      (f) => f.method === 'GAME_PLAY_MANA',
      `GAME_PLAY_MANA (${i})`,
      15_000,
      cursor,
    )
    await expect(page.locator('.feedback-dialog, .mana-prompt-bar')).toContainText(/Pagar maná/, { timeout: 10_000 })
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

  // (i) resolución: el helper pasa las prioridades del stack; la vida del
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

  // (j) el tablero vuelve al estado no-targeting: el targeting se desactiva en la
  //     escena (determinista, sin byte-diff del canvas)
  const tInactive = await waitSceneTargeting(page, (t) => !t.active, 'targeting desactivado tras resolver')
  expect(tInactive.ids.length, 'sin objetivos activos tras resolver').toBe(0)

  // evidencia visual (no es aserción): captura del tablero post-resolución
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  const resolved = path.join(SHOTS_DIR, 'targeting-resolved.png')
  await page.locator('.game-board').screenshot({ path: resolved })

  // (k) cero pageerrors
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])

  await test.info().attach('targeting-resolved', {
    body: fs.readFileSync(resolved),
    contentType: 'image/png',
  })
  })
})

function controlledOf(view: Record<string, unknown> | null) {
  const players = (view?.players ?? []) as { playerId?: string; isActive?: boolean; controlled?: boolean }[]
  return players.find((p) => p.controlled)
}