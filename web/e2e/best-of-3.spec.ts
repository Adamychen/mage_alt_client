/**
 * Best-of-3 (first to 2 wins): el flujo es idéntico al Bo2 existente pero
 * el match se decide en la partida 3 (1-1 → game 3). Verifica que el marcador
 * llegue a winsNeeded=2 en game 3 sin dialogillo de "match point".
 */

import { test, expect } from './fixtures'
import { bestOf3Scenario } from '../fixtures/scenarios/bestOf3'
import { withFakeServer } from './support/fake-backend'
import { startGame } from './support/start-game'
import { framesOf, lastGameView, nextManaSource, opponentPlayer, parseFrames, parsedLen, parseSent, sentOf, waitFrame, waitFrameAt } from './support/frames'
import { targetOpponent, waitPlayable, dumpE2E } from './support/game-screen'
import type { HumanHelper } from './wshelper'

function gameEndedIn(page: import('@playwright/test').Page, gameId: string): boolean {
  return parseFrames(framesOf(page)).some(
    (f) => (f.method === 'GAME_OVER' || f.method === 'END_GAME_INFO') && f.objectId === gameId,
  )
}

function currentGameId(page: import('@playwright/test').Page): string | null {
  const parsed = parseFrames(framesOf(page))
  for (const f of [...parsed].reverse()) {
    if (f.method === 'START_GAME' && f.objectId) return f.objectId
    if (f.method === 'GAME_INIT' && f.objectId) return f.objectId
  }
  return null
}

async function winGameWithBolts(page: import('@playwright/test').Page, helper: HumanHelper, gameId: string): Promise<void> {
  for (let i = 0; i < 9; i++) {
    if (gameEndedIn(page, gameId)) return
    if (!(await castBolt(page, helper))) break
  }
  const opp = opponentPlayer(lastGameView(parseFrames(framesOf(page))))
  expect(
    opp == null || (opp.life ?? 20) <= 0 || gameEndedIn(page, gameId),
    `el Sim debería estar muerto (life=${opp?.life})`,
  ).toBeTruthy()
}

async function castBolt(page: import('@playwright/test').Page, helper: HumanHelper): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const boltId = await waitPlayable(page, 'Lightning Bolt', { minUntapped: 1 })
    if (!boltId) return false
    const castAt = parsedLen(page)
    expect(await helper.playCard(boltId), 'lanzar Bolt por WS').toBeTruthy()
    await targetOpponent(page, undefined as never, 'Bolt', helper)
    try {
      await payManaFast(page, helper, castAt)
      return true
    } catch (e) {
      if (attempt === 2) throw e
      await page.waitForTimeout(800)
    }
  }
  return false
}

async function payManaFast(page: import('@playwright/test').Page, helper: HumanHelper, fromIndex: number): Promise<void> {
  let cursor = fromIndex
  for (let i = 0; i < 6; i++) {
    const { frame: mana, index: manaIndex } = await waitFrameAt(
      page,
      (f) => f.method === 'GAME_PLAY_MANA',
      `GAME_PLAY_MANA (${i})`,
      10_000,
      cursor,
    )
    cursor = manaIndex + 1
    let sourceId: string | null = null
    for (let attempt = 0; attempt < 20 && !sourceId; attempt++) {
      sourceId = nextManaSource(lastGameView(parseFrames(framesOf(page))), null)
      if (!sourceId) await page.waitForTimeout(150)
    }
    if (!sourceId) throw new Error(`sin fuente de maná para "${String(mana.data?.message ?? '').slice(0, 40)}"`)
    expect(await helper.playCard(sourceId), `pago de maná por WS (intento ${i})`).toBeTruthy()
    try {
      const next = await waitFrameAt(page, (f) => f.method === 'GAME_PLAY_MANA', `siguiente ask (${i})`, 5_000, cursor)
      cursor = next.index
    } catch {
      return
    }
  }
  throw new Error('no se pudo pagar el maná del Bolt')
}

test('best-of-3: el match se decide en game 3 (1-1 antes)', { tag: '@fullflow' }, async ({ page }) => {
  await withFakeServer(() => bestOf3Scenario(), async () => {
    const { helper, pageErrors } = await startGame(page, {
      prefix: 'bo3',
      tableName: 'best-of-3-test',
      deck: 'Mage Web bolt',
      simDeck: 'Mage Web AI lands',
      winsNeeded: 2,
    })

    const game1Id = currentGameId(page)
    expect(game1Id, 'gameId de la partida 1').toBeTruthy()

    // ── partida 1: humano gana ──────────────────────────────────────────────
    await winGameWithBolts(page, helper, game1Id!)
    const end1 = await waitFrame(
      page,
      (f) => f.method === 'END_GAME_INFO' && /one more win/i.test(String((f.data as { matchInfo?: string } | null)?.matchInfo ?? '')),
      'END_GAME_INFO tras game 1 (match continúa)',
      20_000,
    )
    expect((end1.data as { wins?: number } | null)?.wins, 'wins=1 tras game 1').toBe(1)

    const sideboard1 = await waitFrameAt(page, (f) => f.method === 'SIDEBOARD', 'SIDEBOARD tras game 1')
    await expect
      .poll(() => parseSent(sentOf(page)).some((s) => s.action === 'submitDeck'), { timeout: 10_000 })
      .toBeTruthy()

    // ── partida 2 ────────────────────────────────────────────────────────────
    const start2 = await waitFrameAt(page, (f) => f.method === 'START_GAME', 'START_GAME game 2', 30_000, sideboard1.index + 1)
    await winGameWithBolts(page, helper, start2.frame.objectId ?? '')
    const end2 = await waitFrame(
      page,
      (f) => f.method === 'END_GAME_INFO' && /one more win/i.test(String((f.data as { matchInfo?: string } | null)?.matchInfo ?? '')),
      'END_GAME_INFO tras game 2 (1-1, falta game 3)',
      20_000,
    )
    expect((end2.data as { wins?: number } | null)?.wins, 'wins=1 tras game 2 (el humano perdió)').toBe(1)

    const sideboard2 = await waitFrameAt(page, (f) => f.method === 'SIDEBOARD', 'SIDEBOARD tras game 2')
    await expect
      .poll(() => parseSent(sentOf(page)).some((s) => s.action === 'submitDeck'), { timeout: 10_000 })
      .toBeTruthy()

    // ── partida 3: decide el match ───────────────────────────────────────────
    const start3 = await waitFrameAt(page, (f) => f.method === 'START_GAME', 'START_GAME game 3', 30_000, sideboard2.index + 1)
    await winGameWithBolts(page, helper, start3.frame.objectId ?? '')

    await expect(page.locator('.end-dialog')).toContainText('You won the match!', { timeout: 20_000 })
    const end3 = [...parseFrames(framesOf(page))].reverse().find((f) => f.method === 'END_GAME_INFO')
    expect((end3?.data as { wins?: number } | null)?.wins, 'wins=2 al ganar el match').toBe(2)

    await page.getByRole('button', { name: 'Volver al lobby' }).click()
    await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible({ timeout: 15_000 })
    expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  })
})