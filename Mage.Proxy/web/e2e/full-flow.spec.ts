import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const SHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')
const FINAL_SHOT = path.join(SHOTS_DIR, 'full-flow-final.png')

test('flujo completo: login -> lobby -> demo IA vs IA (espectador) -> tablero avanza sin errores', async ({ page }) => {
  // (a) capturar todos los pageerror y console error
  const pageErrors: Error[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  const wsFrames: string[] = []
  page.on('websocket', (ws) => {
    ws.on('framesent', (e) => wsFrames.push(`>> ${String(e.payload).slice(0, 200)}`))
    ws.on('framereceived', (e) => wsFrames.push(`<< ${String(e.payload).slice(0, 300)}`))
  })

  // (b) formulario de login
  await page.goto('/')
  await expect(page.locator('form.login-card')).toBeVisible()

  // (c) credenciales únicas -> Conectar (XMage limita el nombre a 14 caracteres)
  const username = `e2e-${String(Date.now()).slice(-10)}`
  await page.getByLabel('Servidor del proxy (host)').fill('localhost')
  await page.getByLabel('Puerto del servidor XMage').fill('17171')
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill('x')
  await page.getByRole('button', { name: 'Conectar' }).click()

  // (d) lobby (el broadcast de mesas llega cada ~2s)
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: /Mesas/ })).toBeVisible({ timeout: 30_000 })

  // (e) crear mesa IA vs IA y entrar como espectador
  await page.getByRole('button', { name: /Demo IA vs IA/ }).click()

  // (f) pantalla de partida + canvas de Pixi montado en .board-wrap
  await expect(page.locator('.game-top').getByText(/Partida/).first()).toBeVisible({ timeout: 60_000 })
  const canvas = page.locator('.board-wrap canvas')
  await expect(canvas).toBeVisible({ timeout: 60_000 })
  const gameStatus = page.getByTestId('game-status')
  await expect(gameStatus).toBeVisible()
  const initialGameStatus = await gameStatus.textContent()
  await page.waitForTimeout(2500)

  // (g) entrada del espectador en el GameLog (markup real: .gamelog-list > .gamelog-entry)
  await expect(page.locator('.gamelog-list')).toContainText(/Espectador: mirando la partida/, {
    timeout: 30_000,
  })

  // (h) verificación de avance: el tablero debe redibujarse (bytes del canvas cambian)
  let baseline: Buffer | null = null
  let changed = false
  let semanticChanged = false
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if ((await canvas.count()) === 0) {
      // la partida terminó y el tablero desapareció -> la partida avanzó de hecho
      changed = true
      semanticChanged = true
      break
    }
    let shot: Buffer | null = null
    try {
      shot = await canvas.screenshot()
    } catch {
      // el canvas puede estar desmontándose a mitad de captura; reintenta
    }
    if (shot) {
      if (!baseline) {
        baseline = shot
      } else if (Buffer.compare(baseline, shot) !== 0) {
        changed = true
        break
      }
    }
    const currentGameStatus = await gameStatus.textContent().catch(() => null)
    if (currentGameStatus && currentGameStatus !== initialGameStatus) semanticChanged = true
    if (semanticChanged) changed = true
    await page.waitForTimeout(3000)
  }
  expect(semanticChanged, 'el estado semántico de la partida debería avanzar').toBeTruthy()
  expect(changed, 'el tablero debería redibujarse: la partida IA vs IA no avanza').toBeTruthy()

  // (i) aserciones finales: cero pageerrors y cero errores fatales de consola
  expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  const fatalConsoleErrors = consoleErrors.filter((t) =>
    /Unhandled error|An error occurred in the/.test(t),
  )
  expect(fatalConsoleErrors, `console fatales: ${fatalConsoleErrors.join(' | ')}`).toEqual([])

  // (j) screenshot final de página completa
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  await page.screenshot({ path: FINAL_SHOT, fullPage: true })

  // anexar evidencia al informe HTML
  await test.info().attach('pageerrors', {
    body: JSON.stringify(pageErrors.map(String), null, 2),
    contentType: 'application/json',
  })
  await test.info().attach('console-errors', {
    body: JSON.stringify(consoleErrors, null, 2),
    contentType: 'application/json',
  })
  await test.info().attach('ws-frames', {
    body: wsFrames.join('\n'),
    contentType: 'text/plain',
  })
})
