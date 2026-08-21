import { test, expect } from './fixtures'
import { FAKE_MODE } from './dual'

test.skip(!FAKE_MODE, 'Solo fake: depende del guion determinista del FixtureServer (ventanas de prioridad/mazo scripteado). En real el helper auto-pasa y el servidor avanza por timers: ver lección en PROJECT.md.')
import { crossZoneScenario } from '../fixtures/scenarios/crossZone'
import { startGame } from './support/start-game'
import { withFakeServer } from './support/fake-backend'
import { waitCrossZonePlayable, expectFeedbackDialog, payMana } from './support/game-screen'
import { lastGameView, opponentPlayer, parseFrames, waitOppLife } from './support/frames'
import { crossZoneInScene } from './support/scene'

/**
 * El "ray" de XMage: lanzar una carta desde otra zona (cementerio o exilio).
 * La carta NO está en la mano: se muestra en el icono del rayo de la resource
 * bar y se elige en el overlay que abre al hacer clic. El pago de maná llega
 * DESPUÉS del cast (el helper desarrolla las tierras mientras el cast está en
 * curso), igual que en el servidor real.
 */

test.describe('Cross-zone cast (ray)', { tag: '@crosszone' }, () => {
  test('Arc Trail desde el cementerio: clic en el rayo, selección en overlay y resolución', async ({ page }) => {
   await withFakeServer(() => crossZoneScenario('graveyard-cast'), async () => {
    const { frames, pageErrors, helper } = await startGame(page, { prefix: 'cz', tableName: 'cz-test' })
    const board = page.locator('.game-board')

     // esperar la mano inicial (mulligan auto-keep)
    await waitCrossZonePlayable(page, 'Arc Trail', { timeoutMs: 30_000, minUntapped: 0 })
    const arcId = await waitCrossZonePlayable(page, 'Arc Trail', { timeoutMs: 30_000, minUntapped: 0 })
    if (!arcId) throw new Error('Arc Trail no fue jugable desde el cementerio en 30s')

     // (a) el estado de escena expone la carta como jugable desde otra zona
    expect(await crossZoneInScene(page, arcId), 'Arc Trail debería estar en la escena como cross-zone jugable').toBe(true)

     // (b) abrir el overlay del rayo y hacer clic en la carta
    const rayButton = page.locator('.ray-stack')
    await expect(rayButton, 'el icono del rayo debería ser visible').toBeVisible({ timeout: 10_000 })
    await rayButton.click()

    const overlay = page.locator('.cross-zone-overlay')
    await expect(overlay, 'el overlay cross-zone debería abrirse').toBeVisible({ timeout: 10_000 })
    const arcCard = overlay.locator('[data-card-id]', { hasText: 'Arc Trail' }).first()
    await expect(arcCard, 'Arc Trail en el overlay').toBeVisible({ timeout: 10_000 })
    await arcCard.click()

     // (c) el cast en curso: el diálogo de objetivo aparece (la carta se lanzó
     //     por sendPlayerUUID desde el overlay). El sourceName puede no estar
     //     en el GAME_TARGET (fallback "Objetivo").
    await expect(page.locator('.targeting-bar, .feedback-dialog')).toBeVisible({ timeout: 15_000 })
    const opp = opponentPlayer(lastGameView(parseFrames(frames)))
    if (opp?.playerId) {
      expect(await helper.playCard(opp.playerId), 'objetivo del Arc Trail').toBeTruthy()
     }
    await payMana(page, helper)
    await waitOppLife(page, (opp?.life ?? 20) - 2, 'Arc Trail resuelto (oponente -2)', 15_000)

    expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
     // no es aserción: evidencia visual del tablero post-resolución
    await board.screenshot({ path: 'e2e/shots/cross-zone-resolved.png' })
    })
    })

  test('Arc Trail desde exilio: mismo flujo con la carta en exilio', async ({ page }) => {
   await withFakeServer(() => crossZoneScenario('exile-cast'), async () => {
    const { frames, pageErrors, helper } = await startGame(page, { prefix: 'czx', tableName: 'cz-exile-test' })
    const board = page.locator('.game-board')

    const arcId = await waitCrossZonePlayable(page, 'Arc Trail', { timeoutMs: 30_000, minUntapped: 0 })
    if (!arcId) throw new Error('Arc Trail no fue jugable desde exilio en 30s')

    const rayButton = page.locator('.ray-stack')
    await expect(rayButton, 'el icono del rayo debería ser visible').toBeVisible({ timeout: 10_000 })
    await rayButton.click()

    const overlay = page.locator('.cross-zone-overlay')
    await expect(overlay, 'el overlay cross-zone debería abrirse').toBeVisible({ timeout: 10_000 })
    const arcCard = overlay.locator('[data-card-id]', { hasText: 'Arc Trail' }).first()
    await expect(arcCard, 'Arc Trail en el overlay').toBeVisible({ timeout: 10_000 })
    await arcCard.click()

    // el sourceName puede no estar en el GAME_TARGET (fallback "Objetivo")
    await expect(page.locator('.targeting-bar, .feedback-dialog')).toBeVisible({ timeout: 15_000 })
    const opp = opponentPlayer(lastGameView(parseFrames(frames)))
    if (opp?.playerId) {
      expect(await helper.playCard(opp.playerId), 'objetivo del Arc Trail (exilio)').toBeTruthy()
     }
    await payMana(page, helper)
    await waitOppLife(page, (opp?.life ?? 20) - 2, 'Arc Trail desde exilio resuelto (oponente -2)', 15_000)

    expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
    await board.screenshot({ path: 'e2e/shots/cross-zone-exile-resolved.png' })
    })
    })
})
