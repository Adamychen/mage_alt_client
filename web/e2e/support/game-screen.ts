/**
 * Page objects de los diálogos de partida (feedback-dialog) y los "drivers" de
 * acciones frágiles (pago de maná, objetivo al oponente, X integer). Las
 * acciones van por WS (determinista); los diálogos se verifican por UI.
 */

import { expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import type { HumanHelper } from '../wshelper'
import {
  countUntappedLands,
  crossZoneIdInView,
  escapeRegExp,
  framesOf,
  gameEndReason,
  gameEnded,
  gameViewOf,
  lastGameView,
  myHandEntries,
  nextManaSource,
  opponentPlayer,
  parseFrames,
  parseSent,
  playableInView,
  requiredSourceName,
  sentOf,
  waitFrameAt,
  type GameFrame,
} from './frames'
import { parsedLen } from './frames'

export function feedbackDialog(page: Page) {
  return page.locator('.feedback-dialog, .targeting-bar, .mana-prompt-bar')
}

export async function expectFeedbackDialog(page: Page, title: string, timeoutMs = 15_000): Promise<void> {
  await expect(feedbackDialog(page)).toContainText(title, { timeout: timeoutMs })
}

export function dumpE2E(page: Page, tag: string): void {
  try {
    const frames = framesOf(page)
    const sent = sentOf(page)
    const file = `/tmp/e2e-${tag}-${Date.now()}.jsonl`
    const lines: string[] = []
    for (const f of frames) lines.push(JSON.stringify(f))
    lines.push('=====SENT=====')
    for (const s of sent) lines.push(JSON.stringify(s))
    fs.writeFileSync(file, lines.join('\n'))
    console.log(`[dbg] dump ${file} frames=${frames.length} sent=${sent.length}`)
  } catch {
    /* noop */
  }
}

/** Resuelve el diálogo integer (GAME_GET_AMOUNT/GAME_SELECT_AMOUNT) con X=expected. */
export async function resolveInteger(page: Page, expected: number, label: string): Promise<void> {
  const input = page.getByLabel('Cantidad', { exact: true })
  await expect(input, `diálogo integer de ${label}`).toBeVisible({ timeout: 15_000 })
  const max = await input.getAttribute('max')
  if (max === null || Number(max) < expected) throw new Error(`el diálogo integer de ${label} no admite ${expected}`)
  await input.fill(String(expected))
  await page.getByRole('button', { name: 'Enviar' }).click()
  expect(
    parseSent(sentOf(page)).some((s) => s.action === 'sendPlayerInteger' && String(s.args?.value) === String(expected)),
    `${label} X=${expected} debería haberse enviado al proxy`,
  ).toBeTruthy()
}

/** Resuelve un GAME_TARGET eligiendo al jugador oponente. El envío del UUID va
 *  por WS (determinista); las aserciones visuales del targeting ya se hicieron
 *  ANTES (el diálogo queda abierto hasta responder). Fallback al botón del diálogo. */
export async function targetOpponent(page: Page, _target: GameFrame, label: string, helper: HumanHelper): Promise<void> {
  const opp = opponentPlayer(lastGameView(parseFrames(framesOf(page))))
  if (opp?.playerId) {
    expect(await helper.playCard(opp.playerId), label).toBeTruthy()
    return
  }
  const dialog = feedbackDialog(page)
  const oppName = opp?.name
  const button = oppName
    ? dialog.getByRole('button', { name: new RegExp(escapeRegExp(oppName)) }).first()
    : dialog.getByRole('button').first()
  await expect(button, label).toBeVisible({ timeout: 15_000 })
  await button.click()
}

/** Paga el maná del hechizo en curso. El diálogo "Pagar maná" se VERIFICA por UI
 *  (render de la página); el pago en sí va por WS (determinista: el clic por
 *  escena en los sources es una carrera con partidas rápidas). */
export async function payMana(page: Page, helper: HumanHelper): Promise<void> {
  try {
    await payManaInner(page, helper)
  } catch (e) {
    dumpE2E(page, 'payMana-fallback')
    throw e
  }
}

async function payManaInner(page: Page, helper: HumanHelper): Promise<void> {
  // lookback: el primer GAME_PLAY_MANA puede haber llegado mientras la acción
  // anterior terminaba (p. ej. la verificación del target); un cursor estricto
  // lo saltaría y esperaría un ask que ya no llega
  let cursor = Math.max(0, parsedLen(page) - 10)
  for (let i = 0; i < 14; i++) {
    const { frame: mana, index: manaIndex } = await waitFrameAt(page, (f) => f.method === 'GAME_PLAY_MANA', `GAME_PLAY_MANA (${i})`, 15_000, cursor)
    // verificación UI del diálogo de pago
    await expectFeedbackDialog(page, 'Pagar maná', 10_000)
    cursor = manaIndex + 1
    // pagar el color que el servidor pide (el ask trae "Pay {R}{W}…"): una Plains no
    // puede pagar {R} y el servidor re-pregunta en bucle si el clic no sirve
    const preferredName = requiredSourceName(mana.data?.message as string | undefined)
    // el view del ask puede ir stale (fuentes ya tapadas en frames viejos): el
    // pago del ask anterior se propaga con retraso. REINTENTAR la lectura hasta
    // ver una fuente sin girar — la lectura única era la raíz de "sin fuente".
    let sourceId: string | null = null
    for (let attempt = 0; attempt < 20 && !sourceId; attempt++) {
      sourceId = nextManaSource(lastGameView(parseFrames(framesOf(page))), preferredName)
      if (!sourceId) await page.waitForTimeout(150)
    }
    if (!sourceId) throw new Error(`sin fuente de maná para "${String(mana.data?.message ?? '').slice(0, 40)}"`)
    expect(await helper.playCard(sourceId), `pago de maná por WS (intento ${i})`).toBeTruthy()
    // tras el pago, esperar el SIGUIENTE ask de maná; si no llega (5s), el pago
    // está completo. OJO: no salir por hasMyPriority — un SELECT durante el pago
    // incompleto (el helper lo aguanta con payingUntil) no significa el final.
    let nextIndex = -1
    try {
      const next = await waitFrameAt(page, (f) => f.method === 'GAME_PLAY_MANA', `siguiente ask de maná (${i})`, 5_000, cursor)
      nextIndex = next.index
    } catch {
      nextIndex = -1
    }
    if (nextIndex < 0) return
    // el ask siguiente sigue sin pagar: no avanzar el cursor más allá de él,
    // o la siguiente iteración esperaría un ask posterior que nunca llega
    cursor = nextIndex
  }
  throw new Error('no se pudo pagar el maná del hechizo')
}

export interface WaitPlayableOptions {
  timeoutMs?: number
  minUntapped?: number
  needPlains?: boolean
}

/** Espera a que una carta sea jugable en MI main phase con SUFICIENTE maná
 *  (el HumanHelper desarrolla tierras en paralelo). Se exige MI main phase: como
 *  instantáneo la carta es "jugable" también en el turno del rival y clicar ahí
 *  es una carrera con la ventana (flake). El maná mínimo es clave: los X-cost
 *  son "jugables" con X=0 y sin maná suficiente el pago del test falla. La
 *  jugabilidad se lee de los frames (canPlayObjects de los GAME_SELECT es
 *  autoritativo), no de la escena. */
export async function waitPlayable(
  page: Page,
  name: string,
  opts: WaitPlayableOptions = {},
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? 30_000
  const minUntapped = opts.minUntapped ?? 1
  const needPlains = opts.needPlains ?? false
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (gameEnded(framesOf(page))) return null
    const view = lastGameView(parseFrames(framesOf(page)))
    const me = controlledPlayerOf(view)
    const myMain = !!view && me?.isActive === true && view.phase === 'PRECOMBAT_MAIN'
    if (myMain) {
      const lands = countUntappedLands(view)
      if (lands.count >= minUntapped && (!needPlains || lands.plains >= 1)) {
        const id = playableInView(view, name)
        if (id) return id
      }
    }
    await page.waitForTimeout(250)
  }
  const dump = parseFrames(framesOf(page))
    .slice(-20)
    .map((f) => {
      const v = gameViewOf(f)
      if (!v) return f.method
      const me = controlledPlayerOf(v)
      const objs = (v.canPlayObjects as Record<string, unknown> | undefined)?.objects as Record<string, unknown> | undefined
      const hand = myHandEntries(v).map(([, c]) => c.name)
      return `${f.method} t${v.turn} ${v.phase} act=${(me as { isActive?: boolean } | undefined)?.isActive} cpo=${objs ? Object.keys(objs).length : '-'} hand=${hand.join('/')}`
    })
  console.log(`[dbg] waitPlayable(${name}) agotado: ${JSON.stringify(dump)} — ${gameEndReason(page)}`)
  return null
}

function controlledPlayerOf(view: Record<string, unknown> | null) {
  const players = (view?.players ?? []) as { playerId?: string; isActive?: boolean; controlled?: boolean }[]
  return players.find((p) => p.controlled)
}

/** Espera a que una carta sea jugable DESDE OTRA ZONA (el "ray": cementerio/
 *  exilio) en MI main phase. La jugabilidad se lee de canPlayObjects del frame
 *  (autoritativo), igual que waitPlayable. minUntapped puede ser 0: el pago del
 *  coste llega DESPUÉS del cast, así que el helper desarrolla las tierras mientras
 *  el cast en curso; lo que evita es que el fallback del helper pase la ventana
 *  antes de que el test actúe. */
export async function waitCrossZonePlayable(
  page: Page,
  name: string,
  opts: WaitPlayableOptions = {},
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? 30_000
  const minUntapped = opts.minUntapped ?? 0
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (gameEnded(framesOf(page))) return null
    const view = lastGameView(parseFrames(framesOf(page)))
    const me = controlledPlayerOf(view)
    const myMain = !!view && me?.isActive === true && view.phase === 'PRECOMBAT_MAIN'
    if (myMain) {
      const lands = countUntappedLands(view)
      if (lands.count >= minUntapped) {
        const id = crossZoneIdInView(view, name)
        if (id) return id
         }
       }
    await page.waitForTimeout(250)
     }
  console.log(`[dbg] waitCrossZonePlayable(${name}) agotado — ${gameEndReason(page)}`)
  return null
}