/**
 * Helpers de clic sobre cartas del DOM. Usa el scene bridge (click lógico
 * por UUID) como ruta principal, y selectores DOM ([data-card-id]) como
 * fallback. Sin dependencias de Pixi/canvas.
 */

import type { Page } from '@playwright/test'
import { controlledPlayer, framesOf, lastGameView, myBattlefield, myHandEntries, parseFrames } from './frames'
import { sceneClick } from './scene'

/** Clic en una carta de la mano por nombre (sceneClick → DOM fallback). */
export async function clickHandCard(page: Page, name: string): Promise<boolean> {
  const view = lastGameView(parseFrames(framesOf(page)))
  const hand = myHandEntries(view)
  const entry = hand.find(([, card]) => card.name === name || card.displayName === name)
  if (!entry) return false
  const cardId = entry[0]

  if (await sceneClick(page, cardId)) return true

  const el = page.locator(`[data-card-id="${cardId}"]`)
  if (await el.count() > 0) {
    await el.first().click()
    return true
  }
  return false
}

/** Clic en un permanente del battlefield por UUID (sceneClick → DOM fallback). */
export async function clickBattlefieldCard(page: Page, cardId: string): Promise<boolean> {
  if (await sceneClick(page, cardId)) return true

  const el = page.locator(`[data-card-id="${cardId}"]`)
  if (await el.count() > 0) {
    await el.first().click()
    return true
  }
  return false
}

/** Clic en el header (zona de vida) de un jugador oponente por playerId. */
export async function clickPlayerTarget(page: Page, playerId: string): Promise<boolean> {
  const el = page.locator(`[data-player-id="${playerId}"] .player-info-bar`)
  if (await el.count() > 0) {
    await el.first().click()
    return true
  }

  const view = lastGameView(parseFrames(framesOf(page)))
  const players = (view?.players ?? []) as { playerId?: string; controlled?: boolean }[]
  const opponents = players.filter((p) => !p.controlled)
  const index = opponents.findIndex((p) => p.playerId === playerId)
  if (index < 0) return false

  const oppZones = page.locator('.opponent-zone')
  const zone = oppZones.nth(index)
  const infoBar = zone.locator('.player-info-bar')
  if (await infoBar.count() > 0) {
    await infoBar.first().click()
    return true
  }
  return false
}

/** Clic en el header de un jugador cualquiera (controlado o no) por playerId. */
export async function clickPlayerHeader(page: Page, playerId: string): Promise<boolean> {
  const view = lastGameView(parseFrames(framesOf(page)))
  const players = (view?.players ?? []) as { playerId?: string; controlled?: boolean }[]
  const player = players.find((p) => p.playerId === playerId)
  if (!player) return false

  if (player.controlled) {
    const infoBar = page.locator('.player-zone .player-info-bar')
    if (await infoBar.count() > 0) {
      await infoBar.first().click()
      return true
    }
    return false
  }

  return clickPlayerTarget(page, playerId)
}

export function controlledPlayerId(view: Record<string, unknown> | null): string | null {
  return controlledPlayer(view)?.playerId ?? null
}
