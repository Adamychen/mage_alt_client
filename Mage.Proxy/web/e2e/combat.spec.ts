import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cleanupUser, registerHelper } from './cleanup'
import { HumanHelper } from './wshelper'

// tope de frames WS retenidos por test (evita el OOM con partidas rápidas)
const MAX_FRAMES = 500

interface GameFrame {
  method: string
  data?: Record<string, unknown> & { gameView?: Record<string, unknown> }
}

function parseFrames(frames: Array<Record<string, unknown> | null>): GameFrame[] {
  const out: GameFrame[] = []
  for (const frame of frames) {
    if (!frame || typeof frame !== 'object') continue
    if (typeof frame.method === 'string') {
      out.push({ method: frame.method, data: frame.data as GameFrame['data'] })
    }
  }
  return out
}

function framesOf(page: Page): string[] {
  return (page as unknown as { __frames: string[] }).__frames
}

function gameViewOf(frame: GameFrame): Record<string, unknown> | null {
  const data = frame.data
  if (!data) return null
  if (data.gameView && typeof data.gameView === 'object') return data.gameView
  if ('myHand' in data && 'phase' in data) return data
  return null
}

function lastGameView(frames: GameFrame[]): Record<string, unknown> | null {
  for (const frame of [...frames].reverse()) {
    const view = gameViewOf(frame)
    if (view) return view
  }
  return null
}

function controlledPlayer(view: Record<string, unknown> | null) {
  const players = (view?.players ?? []) as { playerId?: string; name?: string; controlled?: boolean; life?: number }[]
  return players.find((p) => p.controlled)
}

function opponentBattlefield(view: Record<string, unknown> | null): Record<string, { name?: string; displayName?: string }> {
  const players = (view?.players ?? []) as { playerId?: string; controlled?: boolean; battlefield?: unknown }[]
  const opp = players.find((p) => !p.controlled)
  if (!opp) return {}
  return ((opp.battlefield ?? {}) as Record<string, { name?: string; displayName?: string }>)
}

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

test('combate determinista: el Sim lanza una criatura, ataca con todo y el daño baja la vida', async ({ page }) => {
  const pageErrors: Error[] = []
  const frames: Array<Record<string, unknown> | null> = []
  ;(page as unknown as { __frames: Array<Record<string, unknown> | null> }).__frames = frames
  page.on('pageerror', (err) => pageErrors.push(err))
  page.on('websocket', (ws) => {
    ws.on('framereceived', (e) => {
      try {
        frames.push(JSON.parse(String(e.payload)) as Record<string, unknown>)
      } catch {
        frames.push(null)
      }
      if (frames.length > MAX_FRAMES) frames.splice(0, frames.length - MAX_FRAMES)
    })
  })

  // login con usuario único
  const username = `cb-${String(Date.now()).slice(-10)}`
  cleanupUser(username)
  await page.goto('/')
  await expect(page.locator('form.login-card')).toBeVisible()
  await page.getByLabel('Servidor del proxy (host)').fill('localhost')
  await page.getByLabel('Puerto del servidor XMage').fill('17171')
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill('x')
  await page.getByRole('button', { name: 'Conectar' }).click()
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible({ timeout: 20_000 })

  // crear mesa humana (solo tierras) vs Sim (tierras + Raging Goblin)
  await page.getByRole('button', { name: 'Nueva mesa' }).click()
  await expect(page.getByRole('heading', { name: 'Nueva mesa' })).toBeVisible()
  await page.getByLabel('Tu mazo').selectOption('Mage Web lands')
  await page.getByLabel('No barajar el mazo inicial (modo test)').check()
  await page.getByLabel('Sin sorteo de jugador inicial (modo test)').check()
  await page.getByRole('button', { name: 'SIM' }).click()
  await page.getByLabel('Mazo del Sim').selectOption('Mage Web combat sim')
  await page.getByRole('button', { name: 'Crear mesa' }).click()

  const row = page.locator('.table-row', { hasText: username })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row.locator('.table-seats')).toHaveText(/2\/2/, { timeout: 20_000 })
  const startButton = row.getByRole('button', { name: 'Empezar' })
  await expect(startButton).toBeVisible({ timeout: 15_000 })
  await startButton.click()

  // SIN auto-pase del web: el HumanHelper (WS) pasa las prioridades del humano.

  // helper WS: pasa prioridades y descarta la mano creciente del humano
  // (mazo solo tierras, sin gastos) — la partida avanza sola
  const helper = new HumanHelper(username, 'x')
  registerHelper(helper)
  await helper.start()
  await helper.waitGameId(20_000)

  // el Sim juega tierra y lanza el Raging Goblin (mano determinista: 4 Mountain + 2 Goblin),
  // ataca con todo (haste: el mismo turno en que entra) y el daño baja la vida del humano
  const seen = await waitForSimCombat(page)
  assertCombat(seen)

  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
})