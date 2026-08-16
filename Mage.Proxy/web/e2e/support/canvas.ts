/**
 * Replicas del layout del tablero (src/board/zones.ts) y helpers de clic sobre
 * el canvas de Pixi. Unifican las variantes de targeting/spells: priorizan el
 * clic lógico de la escena (__mageScene.click), luego la posición real de la
 * carta en el escenario y solo como fallback las coordenadas calculadas.
 */

import { expect, type Page } from '@playwright/test'
import { controlledPlayer, framesOf, lastGameView, myBattlefield, myHandEntries, parseFrames } from './frames'
import { liveSceneCard, sceneClick } from './scene'

export const CARD_W = 146
export const CARD_H = 204

export interface ZoneLayout {
  w: number
  h: number
  scale: number
  oppHeader: { x: number; y: number }
  myHeader: { x: number; y: number }
  myHand: { x: number; y: number }
  myBattle: { x: number; y: number }
}

export function computeZones(w: number, h: number): ZoneLayout {
  const scale = Math.min(w / 1600, h / 900)
  const worldH = 900 * scale
  const offY = (h - worldH) / 2
  const ch = CARD_H * scale
  const X = (x: number) => (w - 1600 * scale) / 2 + x * scale
  const Y = (y: number) => offY + y * scale
  return {
    w,
    h,
    scale,
    oppHeader: { x: X(16), y: Y(10) },
    myHeader: { x: X(16), y: Y(900 - 34) },
    myHand: { x: X(800), y: Y(900 - 12) - ch },
    myBattle: { x: X(16), y: Y(900 - 100) - ch },
  }
}

export function handFanned(zone: { x: number; y: number }, count: number, scale: number, w: number): { x: number; y: number }[] {
  if (count === 0) return []
  const cardW = CARD_W * scale
  const maxW = w * 0.9
  const spacing = Math.min((maxW - cardW) / Math.max(count - 1, 1), cardW * 1.35)
  const startX = zone.x - (spacing * (count - 1)) / 2
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * spacing, y: zone.y }))
}

export function battlefieldRow(zone: { x: number; y: number }, count: number, scale: number): { x: number; y: number }[] {
  const cardW = CARD_W * scale
  const spacing = cardW * 0.88
  const startX = zone.x + cardW / 2
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * spacing, y: zone.y }))
}

export async function canvasBox(page: Page) {
  const canvas = page.locator('.board-wrap canvas')
  await expect(canvas).toBeVisible({ timeout: 60_000 })
  return await canvas.boundingBox()
}

/** Clic en una carta de la mano por nombre (escena → posición → zona). */
export async function clickHandCard(page: Page, name: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const view = lastGameView(parseFrames(framesOf(page)))
    const hand = myHandEntries(view)
    const index = hand.findIndex(([, card]) => card.name === name || card.displayName === name)
    const count = hand.length
    if (index < 0 || count === 0) return false
    const cardId = hand[index][0]
    if (await sceneClick(page, cardId)) return true
    const live = await liveSceneCard(page, cardId)
    const box = await canvasBox(page)
    if (!box) return false
    if (live) {
      await page.mouse.click(box.x + live.x, box.y + live.y)
      return true
    }
    const zones = computeZones(box.width, box.height)
    const slots = handFanned(zones.myHand, count, zones.scale, box.width)
    const slot = slots[index]
    await page.mouse.click(box.x + slot.x, box.y + slot.y)
    return true
  }
  return false
}

/** Clic en un permanente del battlefield por UUID (escena → posición → zona). */
export async function clickBattlefieldCard(page: Page, cardId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await sceneClick(page, cardId)) return true
    const live = await liveSceneCard(page, cardId)
    const box = await canvasBox(page)
    if (!box) return false
    if (live) {
      await page.mouse.click(box.x + live.x, box.y + live.y)
      return true
    }
    break
  }
  const view = lastGameView(parseFrames(framesOf(page)))
  const entries = Object.keys(myBattlefield(view))
  const index = entries.indexOf(cardId)
  if (index < 0) return false
  const box = await canvasBox(page)
  if (!box) return false
  const zones = computeZones(box.width, box.height)
  const slots = battlefieldRow(zones.myBattle, entries.length, zones.scale)
  const slot = slots[index]
  await page.mouse.click(box.x + slot.x, box.y + slot.y)
  return true
}

/** Clic en el header (zona de vida) de un jugador oponente por playerId. */
export async function clickPlayerTarget(page: Page, playerId: string): Promise<boolean> {
  const box = await canvasBox(page)
  if (!box) return false
  const zones = computeZones(box.width, box.height)
  const view = lastGameView(parseFrames(framesOf(page)))
  const players = (view?.players ?? []) as { playerId?: string; controlled?: boolean }[]
  const opponents = players.filter((p) => !p.controlled)
  const index = opponents.findIndex((p) => p.playerId === playerId)
  if (index < 0) return false
  const y = zones.oppHeader.y + index * 24
  await page.mouse.click(box.x + zones.oppHeader.x + 8, box.y + y - 4)
  return true
}

/** Clic en el header de un jugador cualquiera (controlado o no) por playerId. */
export async function clickPlayerHeader(page: Page, playerId: string): Promise<boolean> {
  const box = await canvasBox(page)
  if (!box) return false
  const zones = computeZones(box.width, box.height)
  const view = lastGameView(parseFrames(framesOf(page)))
  const players = (view?.players ?? []) as { playerId?: string; controlled?: boolean }[]
  const player = players.find((p) => p.playerId === playerId)
  if (!player) return false
  if (player.controlled) {
    await page.mouse.click(box.x + zones.myHeader.x + 8, box.y + zones.myHeader.y - 4)
    return true
  }
  const opponents = players.filter((p) => !p.controlled)
  const index = opponents.findIndex((p) => p.playerId === playerId)
  if (index < 0) return false
  await page.mouse.click(box.x + zones.oppHeader.x + 8, box.y + zones.oppHeader.y + index * 24 - 4)
  return true
}

export function controlledPlayerId(view: Record<string, unknown> | null): string | null {
  return controlledPlayer(view)?.playerId ?? null
}