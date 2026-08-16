/**
 * Setup modular de partida para los E2E. `startGame` encapsula TODO el flujo
 * repetido en cada spec: captura de frames/pageerrors, login (con reintento del
 * switch de sesión del proxy), mesa humana vs Sim determinista, arranque y
 * helper WS. Cada test crea SU PROPIA partida (independencia total).
 */

import { expect, type Page } from '@playwright/test'
import { cleanupUser, registerHelper } from '../cleanup'
import { HumanHelper } from '../wshelper'
import { parsedLen } from './frames'

export const MAX_FRAMES = 500

export interface CaptureBuffers {
  frames: Array<Record<string, unknown> | null>
  sent: Array<Record<string, unknown> | null>
  pageErrors: Error[]
}

export function installCapture(page: Page, buffers: CaptureBuffers, maxFrames = MAX_FRAMES): void {
  ;(page as unknown as { __frames: Array<Record<string, unknown> | null> }).__frames = buffers.frames
  ;(page as unknown as { __sent: Array<Record<string, unknown> | null> }).__sent = buffers.sent
  page.on('pageerror', (err) => buffers.pageErrors.push(err))
  page.on('websocket', (ws) => {
    // con auto-pase los turnos vuelan y los frames se acumulan sin límite
    // (OOM: ~4GB en un minuto); se guardan solo los últimos MAX_FRAMES, ya
    // parseados (re-parsear en cada poll también agotaba el heap)
    ws.on('framereceived', (e) => {
      try {
        const f = JSON.parse(String(e.payload)) as Record<string, unknown>
        f.__t = Date.now()
        buffers.frames.push(f)
      } catch {
        buffers.frames.push(null)
      }
      if (buffers.frames.length > maxFrames) buffers.frames.splice(0, buffers.frames.length - maxFrames)
    })
    ws.on('framesent', (e) => {
      try {
        const f = JSON.parse(String(e.payload)) as Record<string, unknown>
        f.__t = Date.now()
        buffers.sent.push(f)
      } catch {
        buffers.sent.push(null)
      }
      if (buffers.sent.length > maxFrames) buffers.sent.splice(0, buffers.sent.length - maxFrames)
    })
  })
}

export interface LoginOptions {
  /** Reintentar "Conectar" si el lobby no aparece (switch de sesión del proxy). */
  retryLobby?: boolean
}

export async function login(page: Page, username: string, opts: LoginOptions = {}): Promise<void> {
  await page.goto('/')
  await expect(page.locator('form.login-card')).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Servidor del proxy (host)').fill('localhost')
  await page.getByLabel('Puerto del servidor XMage').fill('17171')
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill('x')
  const lobby = page.getByRole('heading', { name: 'Lobby' })
  const connect = page.getByRole('button', { name: 'Conectar' })
  await connect.click()
  if (opts.retryLobby) {
    // el switch de sesión del proxy tras un usuario anterior puede tardar o fallar
    // transitoriamente; el connect es idempotente, así que reintentar es seguro
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await expect(lobby).toBeVisible({ timeout: 15_000 })
        return
      } catch {
        await connect.click()
      }
    }
  }
  await expect(lobby).toBeVisible({ timeout: 20_000 })
}

export interface CreateTableOptions {
  tableName?: string
  /** Mazo del humano ('Mage Web advanced', 'Mage Web lands', ...). */
  deck?: string
  /** Mazo del asiento SIM ('Mage Web combat sim', ...). */
  simDeck?: string
  skipShuffle?: boolean
  skipStartingPlayer?: boolean
  /** Rellenar el asiento SIM (el proxy une un bot con su propia sesión). */
  sim?: boolean
}

export async function createTable(page: Page, tableName: string, opts: CreateTableOptions = {}): Promise<void> {
  await page.getByRole('button', { name: 'Nueva mesa' }).click()
  await expect(page.getByRole('heading', { name: 'Nueva mesa' })).toBeVisible()
  await page.getByLabel('Nombre').fill(tableName)
  if (opts.deck) await page.getByLabel('Tu mazo').selectOption(opts.deck)
  // partida determinista: sin barajar, la mano/robos son el orden exacto del mazo
  if (opts.skipShuffle ?? true) await page.getByLabel('No barajar el mazo inicial (modo test)').check()
  // partida determinista: sin sorteo aleatorio de starting player (el primer
  // jugador de la mesa empieza; no llega ningún GAME_TARGET de sorteo)
  if (opts.skipStartingPlayer ?? true) await page.getByLabel('Sin sorteo de jugador inicial (modo test)').check()
  // oponente simulado determinista: el proxy une el asiento SIM con su propia
  // sesión (mazo por defecto = solo tierras) y juega sin tiempos de IA
  if (opts.sim ?? true) await page.getByRole('button', { name: 'SIM' }).click()
  if (opts.simDeck) await page.getByLabel('Mazo del Sim').selectOption(opts.simDeck)
  await page.getByRole('button', { name: 'Crear mesa' }).click()
}

/** Espera a que la mesa del usuario esté lista (asiento SIM unido, botón Empezar). */
export async function waitTableReady(page: Page, tableName: string): Promise<void> {
  const row = page.locator('.table-row', { hasText: tableName }).first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  // el asiento SIM lo une el proxy inmediatamente: la mesa nace casi llena
  await expect(row.locator('.table-seats')).toHaveText(/2\/2/, { timeout: 20_000 })
  const startButton = row.getByRole('button', { name: 'Empezar' })
  await expect(startButton).toBeVisible({ timeout: 15_000 })
}

/** Arranca la partida (botón Empezar) y espera la pantalla de partida. */
export async function startMatch(page: Page, tableName: string): Promise<void> {
  const row = page.locator('.table-row', { hasText: tableName }).first()
  const startButton = row.getByRole('button', { name: 'Empezar' })
  await startButton.click()
  await expect(page.locator('.game-top').getByText(/Partida/).first()).toBeVisible({ timeout: 20_000 })
}

export interface GameSession {
  page: Page
  frames: Array<Record<string, unknown> | null>
  sent: Array<Record<string, unknown> | null>
  pageErrors: Error[]
  username: string
  helper: HumanHelper
  /** Índice del último frame procesado (cursor para waitFrame). */
  cursor(): number
}

export interface StartGameOptions extends CreateTableOptions {
  /** Prefijo del usuario único (sp/tg/cb/e2e...). */
  prefix?: string
  maxFrames?: number
}

/** Monta la partida (login → mesa → Sim → arranque), arranca el HumanHelper
 *  (desarrollo de tierras, descartes y asks por WS) y devuelve la sesión. */
export async function startGame(page: Page, opts: StartGameOptions = {}): Promise<GameSession> {
  const prefix = opts.prefix ?? 'e2e'
  const username = `${prefix}-${String(Date.now()).slice(-10)}`
  cleanupUser(username)
  const buffers: CaptureBuffers = { frames: [], sent: [], pageErrors: [] }
  installCapture(page, buffers, opts.maxFrames)
  await login(page, username, { retryLobby: true })
  const tableName = opts.tableName ?? `${username}-t`
  await createTable(page, tableName, opts)
  await waitTableReady(page, tableName)
  // el helper se conecta ANTES de arrancar la partida para capturar el
  // START_GAME/GAME_INIT desde el primer evento (el waitGameId espera)
  const helper = new HumanHelper(username, 'x')
  registerHelper(helper)
  await helper.start()
  await startMatch(page, tableName)
  await helper.waitGameId(20_000)
  return { page, ...buffers, username, helper, cursor: () => parsedLen(page) }
}