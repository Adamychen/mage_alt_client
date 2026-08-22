import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from './fixtures'
import { FAKE_MODE } from './dual'
import { combatMultiBlockScenario } from '../fixtures/scenarios/combatMultiBlock'
import { withFakeServer } from './support/fake-backend'
import { startGame } from './support/start-game'
import { sceneClick, waitSceneCombat } from './support/scene'

test.skip(!FAKE_MODE, 'Solo fake: reproduce el flujo determinista de asignación de daño con múltiples bloqueadores.')

const SHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')

test('combate multi-bloqueador: declaración de múltiples bloqueadores, orden de asignación de daño y distribución de daño @combat', async ({ page }) => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })

  await withFakeServer(() => combatMultiBlockScenario(), async () => {
    const { pageErrors } = await startGame(page, {
      prefix: 'cmb',
      tableName: 'combat-multi-block',
      skipCombat: true,
    })

    // 1. Declaración de Atacante (Colossal Dreadmaw)
    const dreadmawId = 'my-dreadmaw'
    await waitSceneCombat(page, (c) => c.active && c.mode === 'attack', 'ventana de ataque', 20_000)
    expect(await sceneClick(page, dreadmawId), 'clic para declarar atacante').toBeTruthy()

    // Confirmar atacantes
    await page.getByRole('button', { name: 'Confirmar atacantes', exact: true }).click()

    // 2. Sim declara 2 bloqueadores (Grizzly Bears y Raging Goblin)
    // Captura 7: Flechas de bloqueo múltiples convergiendo en Colossal Dreadmaw
    await page.waitForTimeout(400)
    const multiBlockShot = await page.screenshot({ fullPage: true })
    fs.writeFileSync(path.join(SHOTS_DIR, 'combat-07-multiple-blockers-declared.png'), multiBlockShot)

    // 3. Aparece el diálogo de Ordenar Bloqueadores (Damage Assignment Order)
    const orderDialog = page.locator('.library-order-dialog')
    await expect(orderDialog).toBeVisible({ timeout: 10_000 })
    await expect(orderDialog).toContainText('Ordenar Bloqueadores')
    await expect(orderDialog).toContainText('Grizzly Bears')
    await expect(orderDialog).toContainText('Raging Goblin')

    // Esperar a que las imágenes Scryfall se carguen
    await page.waitForTimeout(800)

    // Captura 8: Diálogo centrado de orden de bloqueadores para asignación de daño
    const orderShot = await page.screenshot({ fullPage: true })
    fs.writeFileSync(path.join(SHOTS_DIR, 'combat-08-damage-assignment-order.png'), orderShot)

    // Confirmar orden de bloqueadores
    await page.getByRole('button', { name: /Confirmar orden/i }).click()

    // 4. Aparece el diálogo de Distribución de Daño (Multi-Amount)
    const multiAmountDialog = page.locator('.feedback-multi-amount')
    await expect(multiAmountDialog).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.feedback-dialog')).toContainText('Colossal Dreadmaw')

    // Captura 9: Diálogo de asignación numérica de daño de combate
    await page.waitForTimeout(200)
    const damageShot = await page.screenshot({ fullPage: true })
    fs.writeFileSync(path.join(SHOTS_DIR, 'combat-09-damage-distribution-amounts.png'), damageShot)

    // Enviar asignación de daño
    await page.locator('.feedback-multi-amount button.primary').click()

    // 5. Resolución de daño: los bloqueadores son destruidos
    await expect(page.locator('.feedback-dialog')).toBeHidden({ timeout: 5_000 })
    await page.waitForTimeout(300)
    const resolvedShot = await page.screenshot({ fullPage: true })
    fs.writeFileSync(path.join(SHOTS_DIR, 'combat-10-multi-block-resolved.png'), resolvedShot)

    expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  })
})
