import { test, expect } from './fixtures'
import { FAKE_MODE } from './dual'

test.skip(!FAKE_MODE, 'Solo fake: depende del guion determinista del FixtureServer.')
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startGame } from './support/start-game'
import { withFakeServer } from './support/fake-backend'
import { allInteractionsScenario } from '../fixtures/scenarios/allInteractions'
import { parsedLen, waitFrame } from './support/frames'

const SHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')

test('interacciones completas de MTG: GAME_ASK, GAME_CHOOSE_COLOR, GAME_CHOOSE_PILE, CardGrid (tutor), Scry y Commander', { tag: '@interactions' }, async ({ page }) => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })

  await withFakeServer(() => allInteractionsScenario(), async () => {
    const { pageErrors } = await startGame(page, {
      prefix: 'int',
      tableName: 'all-interactions-test',
      deck: 'Mage Web advanced',
      simDeck: 'Mage Web advanced',
      skipAsks: true,
    })

    let cursor = 0

    // ─────────────────────────────────────────────────────────────
    // 1. GAME_ASK (Pregunta binaria Sí/No, ej. Shockland)
    // ─────────────────────────────────────────────────────────────
    await waitFrame(page, (f) => f.method === 'GAME_ASK', 'GAME_ASK de Shockland', 15_000, cursor)
    const askDialog = page.locator('.feedback-dialog')
    await expect(askDialog, 'diálogo GAME_ASK visible').toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(300)
    fs.writeFileSync(path.join(SHOTS_DIR, 'interaction-01-game-ask.png'), await page.screenshot({ fullPage: true }))

    cursor = parsedLen(page)
    const yesButton = askDialog.getByRole('button', { name: /sí|yes|confirmar/i }).first()
    await yesButton.click()

    // ─────────────────────────────────────────────────────────────
    // 2. GAME_CHOOSE_COLOR / GAME_CHOOSE_CHOICE (Selector de color)
    // ─────────────────────────────────────────────────────────────
    await waitFrame(page, (f) => f.method === 'GAME_CHOOSE_CHOICE', 'GAME_CHOOSE_CHOICE de color', 15_000, cursor)
    const greenBtn = page.locator('.feedback-dialog .feedback-options').getByRole('button', { name: /green|verde/i }).first()
    await expect(greenBtn, 'selector de color visible').toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(300)
    fs.writeFileSync(path.join(SHOTS_DIR, 'interaction-02-choose-color.png'), await page.screenshot({ fullPage: true }))

    cursor = parsedLen(page)
    await greenBtn.click()

    // ─────────────────────────────────────────────────────────────
    // 3. GAME_CHOOSE_PILE (Elección de pila, ej. Fact or Fiction)
    // ─────────────────────────────────────────────────────────────
    await waitFrame(page, (f) => f.method === 'GAME_CHOOSE_PILE', 'GAME_CHOOSE_PILE de Fact or Fiction', 15_000, cursor)
    const pile1Btn = page.locator('.feedback-dialog .feedback-options').getByRole('button', { name: /pila 1|pile 1/i }).first()
    await expect(pile1Btn, 'elección de pila visible').toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(300)
    fs.writeFileSync(path.join(SHOTS_DIR, 'interaction-03-choose-pile.png'), await page.screenshot({ fullPage: true }))

    cursor = parsedLen(page)
    await pile1Btn.click()

    // ─────────────────────────────────────────────────────────────
    // 4. GAME_TARGET con CardGrid (Tutor / Búsqueda en biblioteca)
    // ─────────────────────────────────────────────────────────────
    await waitFrame(page, (f) => f.method === 'GAME_TARGET' && f.data?.cardsView1, 'GAME_TARGET CardGrid tutor', 15_000, cursor)
    const cardGrid = page.locator('.card-grid')
    await expect(cardGrid, 'cuadrícula CardGrid visible').toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(300)
    fs.writeFileSync(path.join(SHOTS_DIR, 'interaction-04-tutor-card-grid.png'), await page.screenshot({ fullPage: true }))

    cursor = parsedLen(page)
    const lotusCard = cardGrid.locator('[data-card-id="c-lotus"]')
    await expect(lotusCard, 'Black Lotus en CardGrid').toBeVisible({ timeout: 10_000 })
    await lotusCard.click()

    // ─────────────────────────────────────────────────────────────
    // 5. GAME_CHOOSE_CARDS_ORDER (Scry / Surveil / Reordenar biblioteca)
    // ─────────────────────────────────────────────────────────────
    await waitFrame(page, (f) => f.method === 'GAME_CHOOSE_CARDS_ORDER', 'GAME_CHOOSE_CARDS_ORDER de Scry', 15_000, cursor)
    const scryOverlay = page.locator('.library-order-dialog')
    await expect(scryOverlay, 'diálogo de Scry visible').toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(300)
    fs.writeFileSync(path.join(SHOTS_DIR, 'interaction-05-scry-library-order.png'), await page.screenshot({ fullPage: true }))

    cursor = parsedLen(page)
    const confirmOrderBtn = page.getByRole('button', { name: /confirmar orden/i })
    await expect(confirmOrderBtn, 'botón confirmar orden').toBeVisible({ timeout: 10_000 })
    await confirmOrderBtn.click()

    // ─────────────────────────────────────────────────────────────
    // 6. Zona de Comando: Comandante con Impuesto de Comandante (+2)
    // ─────────────────────────────────────────────────────────────
    await waitFrame(page, (f) => f.method === 'GAME_SELECT', 'GAME_SELECT de fase principal', 15_000, cursor)
    const commanderZone = page.locator('.command-zone.my')
    await expect(commanderZone, 'zona de comando visible').toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(300)
    fs.writeFileSync(path.join(SHOTS_DIR, 'interaction-06-commander-cast-tax.png'), await page.screenshot({ fullPage: true }))

    // ─────────────────────────────────────────────────────────────
    // 7. Hover en Carta con Desglose de Palabras Clave (MTG Keywords)
    // ─────────────────────────────────────────────────────────────
    const commanderCard = commanderZone.locator('.card-slot, .commander-slot').first()
    await commanderCard.hover()
    const floatingKeywords = page.locator('.floating-card-keywords')
    await expect(floatingKeywords, 'panel de keywords flotante en hover').toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(400)
    fs.writeFileSync(path.join(SHOTS_DIR, 'interaction-07-card-hover-keywords.png'), await page.screenshot({ fullPage: true }))

    // ─────────────────────────────────────────────────────────────
    // 8. Modal de Glosario y Wiki de MTG (Botón de Ayuda ❓)
    // ─────────────────────────────────────────────────────────────
    // Move mouse away to close hover
    await page.mouse.move(0, 0)
    await page.waitForTimeout(200)

    const helpBtn = page.locator('.sidebar-icon-btn[title*="Wiki"], .sidebar-icon-btn[title*="Ayuda"]')
    await expect(helpBtn, 'botón de ayuda/wiki').toBeVisible({ timeout: 5_000 })
    await helpBtn.click()

    const wikiModal = page.locator('.wiki-dialog')
    await expect(wikiModal, 'modal de wiki visible').toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(300)
    fs.writeFileSync(path.join(SHOTS_DIR, 'interaction-08-wiki-glossary-modal.png'), await page.screenshot({ fullPage: true }))

    expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  })
})
