import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from './fixtures'
import { FAKE_MODE } from './dual'
import { startGame } from './support/start-game'
import { withFakeServer } from './support/fake-backend'
import { mechanicsScenario } from '../fixtures/scenarios/mechanics'

const SHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')

test.describe('Mechanics & Reminder Tray Widget', { tag: '@mechanics' }, () => {
  test('displays badges, hover card previews, and full interactive Mechanics Tray tabs', async ({ page }) => {
    fs.mkdirSync(SHOTS_DIR, { recursive: true })

    await withFakeServer(mechanicsScenario, async () => {
      const { pageErrors } = await startGame(page, {
        prefix: 'mech',
        tableName: 'Mechanics & Reminder Showcase',
        deck: 'Mage Web advanced',
      })

      expect(pageErrors).toEqual([])

      // 1. Verify PlayerInfoBar badges are rendered
      const myInfoBar = page.locator('.player-info-bar.my')
      await expect(myInfoBar.locator('.badge-monarch')).toBeVisible()
      await expect(myInfoBar.locator('.badge-ring')).toBeVisible()
      await expect(myInfoBar.locator('.badge-dungeon')).toBeVisible()
      await expect(myInfoBar.locator('.badge-daynight')).toBeVisible()

      // Take full initial board screenshot
      const fullBoardShot = await page.screenshot({ fullPage: true })
      fs.writeFileSync(path.join(SHOTS_DIR, 'mechanics-01-board-initial.png'), fullBoardShot)

      // 2. Open Mechanics Tab in right panel
      const mechanicsTabBtn = page.locator('.right-tab-btn', { hasText: 'Mecánicas' })
      await expect(mechanicsTabBtn).toBeVisible()
      await mechanicsTabBtn.click()

      const mechanicsTray = page.locator('.mechanics-tray')
      await expect(mechanicsTray).toBeVisible()

      // 3. Tab 1: The Ring (El Anillo)
      const ringBtn = mechanicsTray.locator('.mechanic-tab-btn', { hasText: 'El Anillo' })
      await ringBtn.click()
      await expect(mechanicsTray.locator('.panel-ring h3')).toContainText('El Anillo te tienta')
      await expect(mechanicsTray.locator('.ring-bearer-row')).toContainText('Samwise Gamgee')
      await expect(mechanicsTray.locator('.ring-level-badge')).toContainText('Nivel 2 / 4')

      const ringShot = await page.locator('.game-right-panel').screenshot()
      fs.writeFileSync(path.join(SHOTS_DIR, 'mechanics-02-ring-tab.png'), ringShot)

      // 4. Tab 2: Mazmorra (Dungeon)
      const dungeonBtn = mechanicsTray.locator('.mechanic-tab-btn', { hasText: 'Mazmorra' })
      await dungeonBtn.click()
      await expect(mechanicsTray.locator('.panel-dungeon h3')).toContainText('Undercity')
      await expect(mechanicsTray.locator('.dungeon-room-node.active-room')).toBeVisible()

      const dungeonShot = await page.locator('.game-right-panel').screenshot()
      fs.writeFileSync(path.join(SHOTS_DIR, 'mechanics-03-dungeon-tab.png'), dungeonShot)

      // 5. Tab 3: Día / Noche
      const dayNightBtn = mechanicsTray.locator('.mechanic-tab-btn', { hasText: 'Noche' })
      await dayNightBtn.click()
      await expect(mechanicsTray.locator('.panel-daynight')).toContainText('Es de NOCHE')
      await expect(mechanicsTray.locator('.panel-daynight')).toContainText('Transición de Ciclo')

      const dayNightShot = await page.locator('.game-right-panel').screenshot()
      fs.writeFileSync(path.join(SHOTS_DIR, 'mechanics-04-daynight-tab.png'), dayNightShot)

      // 6. Tab 4: Monarca
      const monarchBtn = mechanicsTray.locator('.mechanic-tab-btn', { hasText: 'Monarca' })
      await monarchBtn.click()
      await expect(mechanicsTray.locator('.panel-monarch h3')).toContainText('El Monarca')
      await expect(mechanicsTray.locator('.panel-monarch')).toContainText('Mage Web')

      const monarchShot = await page.locator('.game-right-panel').screenshot()
      fs.writeFileSync(path.join(SHOTS_DIR, 'mechanics-05-monarch-tab.png'), monarchShot)

      // Full board screenshot with the Mechanics Tray open
      const finalFullShot = await page.screenshot({ fullPage: true })
      fs.writeFileSync(path.join(SHOTS_DIR, 'mechanics-06-full-showcase.png'), finalFullShot)
    })
  })
})
