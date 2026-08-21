/**
 * Match best-of-N (winsNeeded > 1, cierre 1v1 real): tras cada partida llega
 * END_GAME_INFO (resumen + marcador), el servidor pide el mazo con SIDEBOARD y
 * el web lo devuelve (submitDeck), y arranca la siguiente partida del match
 * (START_GAME con gameId NUEVO). Al llegar a winsNeeded, END_GAME_INFO marca
 * "won the match!" y el diálogo vuelve al lobby.
 *
 * El MISMO flujo corre en fake (escenario determinista: 7 Bolts × 3 de daño
 * por partida) y en real (el humano quema al Sim con Bolts de verdad).
 */

import { test, expect } from './fixtures'
import { FAKE_MODE } from './dual'

test.skip(!FAKE_MODE, 'Solo fake: depende del guion determinista del FixtureServer (ventanas de prioridad/mazo scripteado). En real el helper auto-pasa y el servidor avanza por timers: ver lección en PROJECT.md.')
import { bestOfNScenario } from '../fixtures/scenarios/bestOfN'
import { withFakeServer } from './support/fake-backend'
import { startGame } from './support/start-game'
import { framesOf, lastGameView, nextManaSource, opponentPlayer, parseFrames, parsedLen, parseSent, sentOf, waitFrame, waitFrameAt } from './support/frames'
import { targetOpponent, waitPlayable, dumpE2E } from './support/game-screen'
import type { HumanHelper } from './wshelper'

/** Marca el fin de una partida (GAME_OVER + END_GAME_INFO del match). */
function endInfoOf(page: import('@playwright/test').Page): { matchInfo?: string; wins?: number; winsNeeded?: number } | null {
  const parsed = parseFrames(framesOf(page))
  const end = [...parsed].reverse().find((f) => f.method === 'END_GAME_INFO')
  return (end?.data ?? null) as { matchInfo?: string; wins?: number; winsNeeded?: number } | null
}

/** ¿La partida CON ESTE gameId ya terminó? (el buffer acumula partidas viejas). */
function gameEndedIn(page: import('@playwright/test').Page, gameId: string): boolean {
  return parseFrames(framesOf(page)).some(
    (f) => (f.method === 'GAME_OVER' || f.method === 'END_GAME_INFO') && f.objectId === gameId,
  )
}

/** Id del juego actual (el último START_GAME/GAME_INIT del buffer). */
function currentGameId(page: import('@playwright/test').Page): string | null {
  const parsed = parseFrames(framesOf(page))
  for (const f of [...parsed].reverse()) {
    if (f.method === 'START_GAME' && f.objectId) return f.objectId
    if (f.method === 'GAME_INIT' && f.objectId) return f.objectId
  }
  return null
}

/** Quema al Sim con Bolts hasta que muere (una partida del match). */
async function winGameWithBolts(page: import('@playwright/test').Page, helper: HumanHelper, gameId: string): Promise<void> {
  for (let i = 0; i < 9; i++) {
    if (gameEndedIn(page, gameId)) return
    if (!(await castBolt(page, helper))) break
  }
  const opp = opponentPlayer(lastGameView(parseFrames(framesOf(page))))
  expect(
    opp == null || (opp.life ?? 20) <= 0 || gameEndedIn(page, gameId),
    `el Sim debería estar muerto (life=${opp?.life})`,
  ).toBeTruthy()
}

/** Lanza un Bolt con reintento: los frames pueden ir detrás del estado real y
 *  el cast caer en una ventana ya cerrada (el servidor lo ignora en silencio y
 *  el ask de maná nunca llega). Devuelve false si no hay Bolt jugable. */
async function castBolt(page: import('@playwright/test').Page, helper: HumanHelper): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const boltId = await waitPlayable(page, 'Lightning Bolt', { minUntapped: 1 })
    if (!boltId) return false
    // cursor estricto: el ask de maná de ESTE cast llega después de lanzarlo
    const castAt = parsedLen(page)
    expect(await helper.playCard(boltId), 'lanzar Bolt por WS').toBeTruthy()
    if (process.env.E2E_DEBUG === '1') {
      const view = lastGameView(parseFrames(framesOf(page)))
      const players = (view?.players ?? []).map((p) => [p.name, String(p.playerId).slice(0, 8), p.controlled])
      const opp = players.find((p) => !p[2])
      console.log('[spec] target debug players=', JSON.stringify(players), 'opp=', opp)
    }
    await targetOpponent(page, undefined as never, 'Bolt', helper)
    try {
      await payManaFast(page, helper, castAt)
      return true
    } catch (e) {
      if (attempt === 2) throw e
      // el cast se ignoró (ventana perdida): esperar a la siguiente
      await page.waitForTimeout(800)
    }
  }
  return false
}

/** Pago de maná por WS sin verificación del diálogo: el bucle de 7+ bolts por
 *  partida es demasiado rápido para el render del diálogo en el fake (el check
 *  por bolt era un flake). El render de "Pagar maná" ya lo cubren los specs de
 *  spells/targeting con UNA sola interacción. El cursor es ESTRICTO (sin
 *  lookback): un ask viejo ya pagado re-matcheado dejaría sin fuente. */
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

test('match best-of-N: END_GAME_INFO + SIDEBOARD + submitDeck + siguiente partida, y fin del match', { tag: '@fullflow' }, async ({ page }) => {
  await withFakeServer(() => bestOfNScenario(), async () => {
    const { helper, pageErrors } = await startGame(page, {
      prefix: 'bon',
      tableName: 'best-of-n-test',
      deck: 'Mage Web bolt',
      simDeck: 'Mage Web AI lands',
      winsNeeded: 2,
    })

    // ── partida 1: el humano gana con Bolts ────────────────────────────────
    const game1Id = currentGameId(page)
    expect(game1Id, 'gameId de la partida 1').toBeTruthy()
    try {
      await winGameWithBolts(page, helper, game1Id!)
    } catch (e) {
      dumpE2E(page, 'bestofn-game1')
      throw e
    }

    // resumen intermedio: el match continúa (falta 1 victoria). El diálogo solo
    // es visible mientras el servidor espera los sideboards (en fake es casi
    // instantáneo), así que la aserción va sobre los FRAMES del END_GAME_INFO.
    const endFrame = await waitFrame(
      page,
      (f) => f.method === 'END_GAME_INFO' && /one more win/i.test(String((f.data as { matchInfo?: string } | null)?.matchInfo ?? '')),
      'END_GAME_INFO intermedio (falta 1 victoria)',
      20_000,
    )
    expect((endFrame.data as { wins?: number } | null)?.wins, 'wins=1 tras la partida 1').toBe(1)
    expect((endFrame.data as { winsNeeded?: number } | null)?.winsNeeded, 'winsNeeded=2').toBe(2)

    // SIDEBOARD: el servidor pide el mazo y el web lo devuelve
    const sideboard = await waitFrameAt(page, (f) => f.method === 'SIDEBOARD', 'SIDEBOARD tras la partida 1')
    await expect
      .poll(() => parseSent(sentOf(page)).some((s) => s.action === 'submitDeck'), { timeout: 10_000 })
      .toBeTruthy()

    // partida 2: START_GAME con gameId NUEVO + GAME_INIT (el diálogo se cierra).
    // OJO: waitFrame sin cursor re-matchearía el START_GAME de la PARTIDA 1.
    const start2 = await waitFrameAt(page, (f) => f.method === 'START_GAME', 'START_GAME de la partida 2', 30_000, sideboard.index + 1)
    expect(start2.frame.objectId, 'la partida 2 debe tener un gameId distinto').toBeTruthy()
    await waitFrame(
      page,
      (f) => f.method === 'GAME_INIT' && f.objectId === start2.frame.objectId,
      'GAME_INIT de la partida 2',
      20_000,
      start2.index + 1,
    )

    // ── partida 2: el humano vuelve a ganar → el match termina ──────────────
    try {
      await winGameWithBolts(page, helper, start2.frame.objectId ?? '')
    } catch (e) {
      dumpE2E(page, 'bestofn-game2')
      throw e
    }
    try {
      await expect(page.locator('.end-dialog')).toContainText('You won the match!', { timeout: 20_000 })
    } catch (e) {
      dumpE2E(page, 'bestofn-matchover')
      throw e
    }
    const end2 = endInfoOf(page)
    expect(end2?.wins, 'wins=2 al final del match').toBe(2)
    expect(end2?.matchInfo ?? '', 'matchInfo debería marcar el match ganado').toMatch(/won the match/i)

    // vuelta al lobby con el resumen
    await page.getByRole('button', { name: 'Volver al lobby' }).click()
    await expect(page.getByRole('heading', { name: /Lobby|XMage Nexus/i })).toBeVisible({ timeout: 15_000 })
    expect(pageErrors, `pageerrors: ${pageErrors.map(String).join(' | ')}`).toEqual([])
  })
})
