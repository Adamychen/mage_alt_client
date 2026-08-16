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
  offX: number
  offY: number
  worldW: number
  worldH: number
  oppHeader: Slot
  myHeader: Slot
  oppBattle: Slot
  myBattle: Slot
  myHand: Slot
  stack: Slot
  oppPiles: { library: Slot; graveyard: Slot; exile: Slot }
  myPiles: { library: Slot; graveyard: Slot; exile: Slot }
}

/** El tablero se diseña sobre un mundo virtual de 1600×900 y se CENTRA en el canvas
 *  real (letterbox): el conjunto queda centrado en cualquier tamaño de ventana. */
export function computeZones(w: number, h: number): ZoneLayout {
  const scale = Math.min(w / 1600, h / 900)
  const worldW = 1600 * scale
  const worldH = 900 * scale
  const offX = (w - worldW) / 2
  const offY = (h - worldH) / 2
  const cw = CARD_W * scale
  const ch = CARD_H * scale
  const X = (x: number) => offX + x * scale
  const Y = (y: number) => offY + y * scale

  return {
    w,
    h,
    scale,
    offX,
    offY,
    worldW,
    worldH,
    oppHeader: { x: X(16), y: Y(10) },
    myHeader: { x: X(16), y: Y(900 - 34) },
    oppBattle: { x: X(16), y: Y(48) },
    myBattle: { x: X(16), y: Y(900 - 100) - ch },
    myHand: { x: X(800), y: Y(900 - 12) - ch },
    stack: { x: X(800) - cw / 2, y: Y(450) - ch / 2 },
    oppPiles: {
      library: { x: X(1600) - cw - X(12), y: Y(48) },
      graveyard: { x: X(1600) - cw * 2 - X(24), y: Y(48) },
      exile: { x: X(1600) - cw * 3 - X(36), y: Y(48) },
    },
    myPiles: {
      library: { x: X(1600) - cw - X(12), y: Y(900 - 100) - ch },
      graveyard: { x: X(1600) - cw * 2 - X(24), y: Y(900 - 100) - ch },
      exile: { x: X(1600) - cw * 3 - X(36), y: Y(900 - 100) - ch },
    },
  }
}

/** Distribuye las filas de oponentes en la mitad superior sin apilarlas todas en y=48.
 *  El límite inferior se calcula sobre el mundo virtual centrado (no el canvas real). */
export function opponentBattleZone(zones: ZoneLayout, index: number, opponentCount: number): Slot {
  const firstY = zones.oppBattle.y
  const lastY = Math.max(firstY, zones.offY + zones.worldH / 2 - CARD_H * zones.scale * 0.8)
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

/** Una sola fila comprimida: con muchos permanentes el espaciado se estrecha para
 *  que el campo nunca desborde por la derecha (tableros grandes / demos multi-IA). */
export function battlefieldRow(zone: Slot, count: number, _scale: number, cardW: number, worldW: number): Slot[] {
  if (count === 0) return []
  const available = worldW - 2 * 16 * _scale - cardW
  const spacing = Math.min(cardW * 0.88, available / Math.max(count - 1, 1))
  const startX = zone.x + cardW / 2
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * spacing, y: zone.y }))
}

export function isStackEmpty(game: GameView): boolean {
  return !game.stack || Object.keys(game.stack).length === 0
}
