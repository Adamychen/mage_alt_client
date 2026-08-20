import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { controlledPlayer, framesOf, lastGameView, opponentBattlefield, parseFrames } from './support/frames'
import { startGame } from './support/start-game'
import { combatScenario } from '../fixtures/scenarios/combat'
import { withFakeServer } from './support/fake-backend'

/** Verifica el combate del Sim (el HumanHelper mantiene los turnos del humano):
 *  criatura en el campo, ataque declarado y daño aplicado. */
async function waitForSimCombat(page: Page): Promise<{ goblin: boolean; attack: boolean; damaged: boolean }> {
  const deadline = Date.now() + 30_000
  const seen = { goblin: false, attack: false, damaged: false }
  while (Date.now() < deadline) {
    const view = lastGameView(parseFrames(framesOf(page)))
    if (view) {
      const battlefield = opponentBattlefield(view)
      seen.goblin =
        seen.goblin ||
        Object.values(battlefield).some((p) => p.name === 'Raging Goblin' || p.displayName === 'Raging Goblin')
      const combat = (view.combat ?? []) as Array<Record<string, unknown>>
      seen.attack =
        seen.attack ||
        combat.some((group) => {
          const attackers = group.attackers
          return (Array.isArray(attackers) && attackers.length > 0) || (!!attackers && typeof attackers === 'object' && Object.keys(attackers).length > 0)
        })
      const life = controlledPlayer(view)?.life
      seen.damaged = seen.damaged || (typeof life === 'number' && life < 20)
    }
    if (seen.goblin && seen.attack && seen.damaged) return seen
    await page.waitForTimeout(150)
  }
  return seen
}

function assertCombat(seen: { goblin: boolean; attack: boolean; damaged: boolean }) {
  expect(seen.goblin, 'el Sim debería lanzar el Raging Goblin (criatura en su campo)').toBeTruthy()
  expect(seen.attack, 'el Sim debería declarar atacantes (combate con atacantes)').toBeTruthy()
  expect(seen.damaged, 'el daño de combate debería bajar la vida del humano por debajo de 20').toBeTruthy()
}

test('combate determinista: el Sim lanza una criatura, ataca con todo y el daño baja la vida', { tag: '@combat' }, async ({ page }) => {
  await withFakeServer(() => combatScenario(), async () => {
    const { frames, pageErrors } = await startGame(page, {
      prefix: 'cb',
      tableName: 'combat-test',
      // mazo humano solo tierras: la partida no avanza sola (nada que lanzar) y el
      // Sim (tierras + Raging Goblin) ataca; el helper pasa las prioridades
      deck: 'Mage Web lands',
      simDeck: 'Mage Web combat sim',
    })
    void frames

    // el Sim juega tierra y lanza el Raging Goblin (mano determinista: 4 Mountain + 2 Goblin),
    // ataca con todo (haste: el mismo turno en que entra) y el daño baja la vida del humano
    const seen = await waitForSimCombat(page)
    assertCombat(seen)

    expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  })
})