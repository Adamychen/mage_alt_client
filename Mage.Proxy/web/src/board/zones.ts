import type { GameView } from '../net/types'

export const CARD_W = 146
export const CARD_H = 204

export interface Slot {
  x: number
  y: number
}

export interface ZoneLayout {
  w: number
  h: number
  scale: number
  oppHeader: Slot
  myHeader: Slot
  oppBattle: Slot
  myBattle: Slot
  myHand: Slot
  stack: Slot
  oppPiles: { library: Slot; graveyard: Slot; exile: Slot }
  myPiles: { library: Slot; graveyard: Slot; exile: Slot }
}

export function computeZones(w: number, h: number): ZoneLayout {
  const scale = Math.min(w / 1600, h / 900)
  const cw = CARD_W * scale
  const ch = CARD_H * scale

  return {
    w,
    h,
    scale,
    oppHeader: { x: 16, y: 10 },
    myHeader: { x: 16, y: h - 34 },
    oppBattle: { x: 16, y: 48 },
    myBattle: { x: 16, y: h - ch - 100 },
    myHand: { x: w / 2, y: h - ch - 12 },
    stack: { x: w / 2 - cw / 2, y: h / 2 - ch / 2 },
    oppPiles: {
      library: { x: w - cw - 12, y: 48 },
      graveyard: { x: w - cw * 2 - 24, y: 48 },
      exile: { x: w - cw * 3 - 36, y: 48 },
    },
    myPiles: {
      library: { x: w - cw - 12, y: h - ch - 100 },
      graveyard: { x: w - cw * 2 - 24, y: h - ch - 100 },
      exile: { x: w - cw * 3 - 36, y: h - ch - 100 },
    },
  }
}

/** Distribuye las filas de oponentes en la mitad superior sin apilarlas todas en y=48. */
export function opponentBattleZone(zones: ZoneLayout, index: number, opponentCount: number): Slot {
  const firstY = zones.oppBattle.y
  const lastY = Math.max(firstY, zones.h / 2 - CARD_H * zones.scale * 0.8)
  const step = opponentCount <= 1 ? 0 : (lastY - firstY) / (opponentCount - 1)
  return { x: zones.oppBattle.x, y: firstY + index * step }
}

export function handFanned(zone: Slot, count: number, _scale: number, w: number, cardW: number): Slot[] {
  if (count === 0) return []
  const maxW = w * 0.9
  const spacing = Math.min((maxW - cardW) / Math.max(count - 1, 1), cardW * 1.35)
  const startX = zone.x - (spacing * (count - 1)) / 2
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * spacing, y: zone.y }))
}

export function battlefieldRow(zone: Slot, count: number, _scale: number, cardW: number): Slot[] {
  const spacing = cardW * 0.88
  const startX = zone.x + cardW / 2
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * spacing, y: zone.y }))
}

export function isStackEmpty(game: GameView): boolean {
  return !game.stack || Object.keys(game.stack).length === 0
}
