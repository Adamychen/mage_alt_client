/**
 * Derrota del humano (el Sim gana 2-0): el humano lanza Bolts pero no hacen
 * daño (simWinsGame: [1, 2]), el match termina 0-2 y el diálogo dice
 * "You lost the match". Verifica que el flujo de derrota también vuelve
 * al lobby correctamente.
 */

import { test, expect } from './fixtures'
import { humanLosesScenario } from '../fixtures/scenarios/humanLosesGame2'
import { withFakeServer } from './support/fake-backend'
import { startGame } from './support/start-game'
import { framesOf, lastGameView, nextManaSource, opponentPlayer, parseFrames, parsedLen, parseSent, sentOf, waitFrame, waitFrameAt } from './support/frames'
import { targetOpponent, waitPlayable } from './support/game-screen'
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

async function waitGameToEnd(page: import('@playwright/test').Page, helper: HumanHelper, gameId: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    if (gameEndedIn(page, gameId)) return
    const boltId = await waitPlayable(page, 'Lightning Bolt', { minUntapped: 1 })
    if (!boltId) break
    const castAt = parsedLen(page)
    expect(await helper.playCard(boltId), 'lanzar Bolt por WS').toBeTruthy()
    await targetOpponent(page, undefined as never, 'Bolt', helper).catch(() => {})
    try {
      await payManaFast(page, helper, castAt)
    } catch {
      // ignore
    }
  }
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

test('derrota: el Sim gana 2-0 y el match termina con "You lost the match"', { tag: '@fullflow' }, async ({ page }) => {
  await withFakeServer(() => humanLosesScenario(), async () => {
    const { helper, pageErrors } = await startGame(page, {
      prefix: 'defeat',
      tableName: 'sim-wins-test',
      deck: 'Mage Web bolt',
      simDeck: 'Mage Web AI lands',
      winsNeeded: 2,
    })

    const game1Id = currentGameId(page)
    expect(game1Id, 'gameId de la partida 1').toBeTruthy()

    // ── game 1: el Sim gana (los Bolts no hacen daño) ───────────────────────
    await waitGameToEnd(page, helper, game1Id!)
    const end1 = await waitFrame(
      page,
      (f) => f.method === 'END_GAME_INFO' && /lost/i.test(String((f.data as { matchInfo?: string } | null)?.matchInfo ?? '')),
      'END_GAME_INFO tras game 1 (el humano perdió)',
      20_000,
    )
    expect((end1.data as { loses?: number } | null)?.loses, 'loses=1 tras game 1').toBe(1)

    // el match continúa (winsNeeded=2, humano tiene 0 wins)
    const sideboard1 = await waitFrameAt(page, (f) => f.method === 'SIDEBOARD', 'SIDEBOARD tras game 1')
    await expect
      .poll(() => parseSent(sentOf(page)).some((s) => s.action === 'submitDeck'), { timeout: 10_000 })
      .toBeTruthy()

    // ── game 2: el Sim gana 2-0 → match over ─────────────────────────────────
    const start2 = await waitFrameAt(page, (f) => f.method === 'START_GAME', 'START_GAME game 2', 30_000, sideboard1.index + 1)
    await waitGameToEnd(page, helper, start2.frame.objectId ?? '')

    await expect(page.locator('.end-dialog')).toContainText('You lost the match!', { timeout: 20_000 })
    const end2 = [...parseFrames(framesOf(page))].reverse().find((f) => f.method === 'END_GAME_INFO')
    expect((end2?.data as { loses?: number } | null)?.loses, 'loses=2 al perder el match').toBe(2)
    expect((end2?.data as { matchInfo?: string } | null)?.matchInfo ?? '', 'matchInfo marca derrota').toMatch(/lost/i)

    await page.getByRole('button', { name: 'Volver al lobby' }).click()
    await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible({ timeout: 15_000 })
    expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  })
})