/**
 * Estado del escenario en vivo publicado por la app en window.__mageScene
 * (BoardScene). Sustituye a los byte-diffs del canvas: los tests asertan sobre
 * este estado (determinista) y el DOM, NO sobre píxeles.
 */

import type { Page } from '@playwright/test'
import { framesOf, lastGameView, myHandEntries, parseFrames, playableInView } from './frames'

export interface SceneCardPosition {
  x: number
  y: number
}

export interface SceneState {
  cards?: Record<string, SceneCardPosition>
  playable?: string[]
  game?: { turn?: number; phase?: string; step?: string; priority?: boolean }
}

export interface SceneTargeting {
  active: boolean
  source: string | null
  ids: string[]
  chosen: string[]
}

/** Estado del escenario expuesto por la app (posiciones + playables en vivo). */
export async function sceneState(page: Page): Promise<SceneState | null> {
  const scene = await page.evaluate(() => (globalThis as unknown as { __mageScene?: SceneState }).__mageScene ?? null)
  return scene && typeof scene === 'object' ? scene : null
}

/** Devuelve true si el hook de escenario existe (build con soporte E2E). */
export async function sceneHookAvailable(page: Page): Promise<boolean> {
  return (await page.evaluate(() => (globalThis as unknown as { __mageScene?: unknown }).__mageScene !== undefined)) === true
}

/** Clic lógico por UUID en el escenario (el hook de la app despacha el click real,
 *  mucho más fiable que clicar coordenadas del canvas con partidas rápidas). */
export async function sceneClick(page: Page, id: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const ok =
      (await page.evaluate(
        (cardId) => (globalThis as unknown as { __mageScene?: { click?: (id: string) => boolean } }).__mageScene?.click?.(cardId) ?? false,
        id,
      )) === true
    if (ok) return true
    await page.waitForTimeout(200)
  }
  return false
}

/** Posición real en el canvas de la carta con `id`, o null si aún no está en el escenario. */
export async function liveSceneCard(page: Page, id: string): Promise<SceneCardPosition | null> {
  const scene = await sceneState(page)
  if (!scene) return null
  const slot = scene.cards?.[id]
  return slot && typeof slot.x === 'number' && typeof slot.y === 'number' ? slot : null
}

/** ¿La carta (por UUID) está jugable según el estado REAL de la app? */
export async function playableInScene(page: Page, id: string | null): Promise<boolean> {
  if (!id) return false
  const scene = await sceneState(page)
  return Array.isArray(scene?.playable) && scene.playable.includes(id)
}

/** Id de la carta por nombre si está en la lista de jugables EN VIVO de la app. */
export async function playableInSceneByName(page: Page, name: string): Promise<string | null> {
  const scene = await sceneState(page)
  const playable = Array.isArray(scene?.playable) ? scene.playable : []
  if (playable.length === 0) return null
  const view = lastGameView(parseFrames(framesOf(page)))
  const entry = myHandEntries(view).find(([, card]) => card.name === name || card.displayName === name)
  return entry && playable.includes(entry[0]) ? entry[0] : null
}

/** ¿La carta por nombre está jugable? Prioriza el estado real de la app; el
 *  canPlayObjects de los frames es intermitente (el servidor no lo manda en
 *  todos los GAME_UPDATE) y clicar contra él falla en ventanas perdidas.
 *  La app puede ir un render por detrás: si la carta está en mano y la app aún
 *  no la marca jugable, se reintenta antes de devolver null. */
export async function isPlayable(page: Page, name: string): Promise<string | null> {
  const view = lastGameView(parseFrames(framesOf(page)))
  const id = myHandEntries(view).find(([, card]) => card.name === name || card.displayName === name)?.[0] ?? null
  if (id && (await playableInScene(page, id))) return id
  if (!(await sceneHookAvailable(page))) {
    return playableInView(view, name)
  }
  if (id) {
    for (let attempt = 0; attempt < 6; attempt++) {
      await page.waitForTimeout(200)
      if (await playableInScene(page, id)) return id
    }
  }
  return null
}

/** Estado del targeting EN VIVO de la escena (determinista; sustituye a los
 *  byte-diffs del canvas, que dependen del render por detrás de los frames). */
export async function sceneTargeting(page: Page): Promise<SceneTargeting | null> {
  try {
    return (await page.evaluate(() => {
      const s = (globalThis as unknown as { __mageScene?: { targeting?: SceneTargeting } }).__mageScene
      return s?.targeting ?? null
    })) as SceneTargeting | null
  } catch {
    return null
  }
}

export async function waitSceneTargeting(
  page: Page,
  predicate: (t: SceneTargeting) => boolean,
  label: string,
  timeoutMs = 15_000,
): Promise<SceneTargeting> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const t = await sceneTargeting(page)
    if (t && predicate(t)) return t
    await page.waitForTimeout(200)
  }
  const last = await sceneTargeting(page)
  throw new Error(`timeout esperando ${label} (último targeting: ${JSON.stringify(last)})`)
}