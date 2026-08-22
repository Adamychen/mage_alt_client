import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from './fixtures'
import { FAKE_MODE } from './dual'

test.skip(!FAKE_MODE, 'Solo fake: depende del guion determinista del FixtureServer (ventanas de prioridad/mazo scripteado). En real el helper auto-pasa y el servidor avanza por timers: ver lección en PROJECT.md.')
import type { Page } from '@playwright/test'
import { combatHumanAttackScenario, combatHumanBlockScenario } from '../fixtures/scenarios/combatHuman'
import { withFakeServer } from './support/fake-backend'
import { startGame } from './support/start-game'
import {
  controlledPlayer,
  framesOf,
  lastGameView,
  myBattlefield,
  opponentPlayer,
  parseFrames,
  parseSent,
  sentOf,
} from './support/frames'
import { sceneClick, waitSceneCombat, type SceneCombat } from './support/scene'
import { dumpE2E, payMana, waitPlayable } from './support/game-screen'
import type { HumanHelper } from './wshelper'

const SHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')

/** Id del campo propio de la criatura por nombre (null si aún no está). */
function myCreatureId(page: Page, name: string): string | null {
  const view = lastGameView(parseFrames(framesOf(page)))
  const battle = myBattlefield(view)
  for (const [id, perm] of Object.entries(battle)) {
    if (perm.name === name || perm.displayName === name) return id
  }
  return null
}

/** Criatura propia en el campo: si está en mano jugable (real), lanzarla por la
 *  UI y pagar el maná; si ya está en el campo (fake), devolver su id. */
async function ensureCreature(page: Page, helper: HumanHelper, name: string): Promise<string> {
  const existing = myCreatureId(page, name)
  if (existing) return existing
  // en real la partida tarda en arrancar (mulligan en cadena humano+Sim): esperar
  // la jugabilidad por FRAMES (waitPlayable, 30s), no por la escena (isPlayable
  // solo sondea ~1.2s y la ventana real llega 1-3s después del GAME_INIT)
  const playable = await waitPlayable(page, name, { minUntapped: 1 })
  if (!playable) {
    dumpE2E(page, 'combat-human-playable')
    throw new Error(`el humano debería tener ${name} jugable en mano`)
  }
  expect(await sceneClick(page, playable), `clic para lanzar ${name}`).toBeTruthy()
  await payMana(page, helper)
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const id = myCreatureId(page, name)
    if (id) return id
    await page.waitForTimeout(200)
  }
  throw new Error(`${name} no entró al campo a tiempo`)
}

/** Confirma las ventanas de ataque propias hasta que aparezca la de bloqueo
 *  (en real, el humano también abre ataque en sus turnos; en fake no). */
async function confirmMyAttackWindows(page: Page): Promise<SceneCombat> {
  for (let i = 0; i < 4; i++) {
    const combat = await waitSceneCombat(page, (c) => c.active, `ventana de combate (${i})`, 25_000)
    if (combat.mode !== 'attack') return combat
    await page.getByRole('button', { name: 'Confirmar atacantes', exact: true }).click()
  }
  throw new Error('demasiadas ventanas de ataque sin llegar al bloqueo')
}

test('combate humano: el humano declara atacantes por la UI y el daño baja la vida del Sim', { tag: '@combat' }, async ({ page }) => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  await withFakeServer(() => combatHumanAttackScenario(), async () => {
    const { helper, pageErrors } = await startGame(page, {
      prefix: 'cba',
      tableName: 'combat-human-attack',
      deck: 'Mage Web combat human',
      simDeck: 'Mage Web AI lands',
      skipCombat: true,
    })

    // criatura propia en el campo (turno 1-2) para poder atacar
    const goblinId = await ensureCreature(page, helper, 'Raging Goblin')

    // pasar el main tras lanzar la criatura (por WS: el fallback interno del
    // helper muere si coincide con el pago de maná y la ventana quedaría abierta)
    expect(await helper.passPriority(), 'pasar el main tras lanzar la criatura').toBeTruthy()

    // ventana de declaración de atacantes: la criatura es clicable
    let combat: SceneCombat
    try {
      combat = await waitSceneCombat(page, (c) => c.active && c.mode === 'attack', 'ventana de ataque', 25_000)
    } catch (e) {
      dumpE2E(page, 'combat-human-attack-window')
      throw e
    }
    expect(combat.selectable, 'la criatura debería ser seleccionable como atacante').toContain(goblinId)

    // Captura 1: Selección de atacantes activa
    await page.waitForTimeout(200)
    const attackSelectShot = await page.screenshot({ fullPage: true })
    fs.writeFileSync(path.join(SHOTS_DIR, 'combat-01-attack-selection.png'), attackSelectShot)

    // clic en la criatura → declarada como atacante (✓ en el canvas)
    expect(await sceneClick(page, goblinId), 'clic para declarar atacante').toBeTruthy()
    await waitSceneCombat(page, (c) => c.chosen.includes(goblinId), 'atacante declarado')

    // Captura 2: Atacante declarado (flecha roja / espada hacia el oponente)
    await page.waitForTimeout(200)
    const attackDeclaredShot = await page.screenshot({ fullPage: true })
    fs.writeFileSync(path.join(SHOTS_DIR, 'combat-02-attack-declared.png'), attackDeclaredShot)

    // confirmar el paso de combate
    await page.getByRole('button', { name: 'Confirmar atacantes', exact: true }).click()
    expect(
      parseSent(sentOf(page)).some((s) => s.action === 'sendPlayerUUID' && String(s.args?.value) === goblinId),
      'el UUID del atacante debería haberse enviado al proxy',
    ).toBeTruthy()

    // el daño de combate del humano baja la vida del Sim (20 → 19)
    await expect(page.locator('.player-info-bar.opp .life-value')).toHaveText('19', { timeout: 20_000 })
    expect(opponentPlayer(lastGameView(parseFrames(framesOf(page))))?.life, 'el daño de combate debería bajar al Sim a 19').toBe(19)

    // Captura 3: Daño de combate resuelto (vida del oponente en 19)
    await page.waitForTimeout(150)
    const attackResolvedShot = await page.screenshot({ fullPage: true })
    fs.writeFileSync(path.join(SHOTS_DIR, 'combat-03-attack-damage-resolved.png'), attackResolvedShot)

    expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  })
})

test('combate humano: el humano bloquea por la UI y el ataque del Sim no hace daño', { tag: '@combat' }, async ({ page }) => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  await withFakeServer(() => combatHumanBlockScenario(), async () => {
    const { helper, pageErrors } = await startGame(page, {
      prefix: 'cbb',
      tableName: 'combat-human-block',
      deck: 'Mage Web combat human',
      simDeck: 'Mage Web block sim',
      skipCombat: true,
    })

    // criatura propia en el campo para bloquear
    const blockerId = await ensureCreature(page, helper, 'Raging Goblin')

    // pasar el main tras lanzar la criatura (abre MI ventana de ataque)
    expect(await helper.passPriority(), 'pasar el main tras lanzar la criatura').toBeTruthy()

    // confirmar mis ventanas de ataque (en real el humano también puede atacar)
    // y llegar a la ventana de bloqueo del ataque del Sim
    const combat = await confirmMyAttackWindows(page)
    expect(combat.mode, 'la ventana de bloqueo debería estar activa').toBe('block')
    expect(combat.selectable, 'la criatura debería ser seleccionable como bloqueador').toContain(blockerId)

    // Captura 4: Ataque entrante del Sim (ventana de bloqueo abierta)
    await page.waitForTimeout(200)
    const incomingSimShot = await page.screenshot({ fullPage: true })
    fs.writeFileSync(path.join(SHOTS_DIR, 'combat-04-incoming-sim-attack.png'), incomingSimShot)

    // vida justo antes de bloquear (en real el Sim ya hizo 1 de daño sin
    // bloqueador en su turno 1; en fake el daño llega solo con el ataque bloqueado)
    const lifeBefore = controlledPlayer(lastGameView(parseFrames(framesOf(page))))?.life as number

    // clic en el bloqueador → bloquea al atacante
    expect(await sceneClick(page, blockerId), 'clic para declarar bloqueador').toBeTruthy()
    expect(
      parseSent(sentOf(page)).some((s) => s.action === 'sendPlayerUUID' && String(s.args?.value) === blockerId),
      'el UUID del bloqueador debería haberse enviado al proxy',
    ).toBeTruthy()

    // Captura 5: Bloqueador declarado
    await page.waitForTimeout(200)
    const blockDeclaredShot = await page.screenshot({ fullPage: true })
    fs.writeFileSync(path.join(SHOTS_DIR, 'combat-05-block-declared.png'), blockDeclaredShot)

    // en fake la ventana persiste (posibleBlockers sigue listando al bloqueador):
    // confirmarla con el botón; en real el helper ya confirmó el re-select vacío
    const confirmButton = page.getByRole('button', { name: 'Confirmar bloqueadores', exact: true })
    if (await confirmButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmButton.click()
    }

    // el ataque quedó bloqueado: mi vida NO baja al empezar mi siguiente turno
    const deadline = Date.now() + 25_000
    while (Date.now() < deadline) {
      const view = lastGameView(parseFrames(framesOf(page)))
      const me = controlledPlayer(view)
      if (view?.step === 'PRECOMBAT_MAIN' && me?.isActive === true) break
      await page.waitForTimeout(250)
    }
    const me = controlledPlayer(lastGameView(parseFrames(framesOf(page))))
    expect((me as { life?: number } | undefined)?.life, 'el bloqueo debería evitar el daño de combate').toBe(lifeBefore)

    // Captura 6: Resolución de bloqueo (sin daño recibido)
    await page.waitForTimeout(200)
    const blockResolvedShot = await page.screenshot({ fullPage: true })
    fs.writeFileSync(path.join(SHOTS_DIR, 'combat-06-block-resolved.png'), blockResolvedShot)

    expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  })
})
