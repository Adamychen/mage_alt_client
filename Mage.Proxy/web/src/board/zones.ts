import type { GameView } from '../net/types'

export const CARD_W = 120
export const CARD_H = 168

export const SLOT_PAD = 4

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

  // Zone boundaries (in pixels, relative to canvas)
  oppZone: { top: number; bottom: number }
  myZone: { top: number; bottom: number }
  stackZone: { y: number; height: number }

  // Stack slots (horizontal)
  stackSlot(index: number, count: number): Slot

  // Hand Y positions
  oppHandY: number
  myHandY: number
  myHand: Slot
  oppHand: Slot

  // Piles (always in corners of each player zone)
  oppPiles: { library: Slot; graveyard: Slot; exile: Slot }
  myPiles: { library: Slot; graveyard: Slot; exile: Slot }

  // Battle center points
  oppBattleCenterY: number
  myBattleCenterY: number

  // Legacy aliases (para compatibilidad con BoardScene.ts)
  oppHeader: Slot
  myHeader: Slot
  oppBattle: Slot
  myBattle: Slot

  dividerY: number
}

/**
 * Zone layout based on canvas aspect ratio and internal proportions.
 * - Upper 25%: opponent battlefield
 * - Middle ~10%: stack (horizontal, centered)
 * - Lower 25%: player battlefield + hand
 * Hands are at the outer edges of their zones. Piles stay in corners.
 */
export function computeZones(w: number, h: number): ZoneLayout {
  // Zone heights (proportions of canvas height)
  const oppZoneH = Math.floor(h * 0.25)
  const myZoneH = Math.floor(h * 0.25)
  const stackH = Math.floor(h * 0.08)

  // Zone positions (with top/bottom margins of 3%)
  const marginY = Math.floor(h * 0.03)
  const oppZoneTop = marginY
  const oppZoneBottom = oppZoneTop + oppZoneH
  const myZoneTop = h - myZoneH - marginY
  const myZoneBottom = myZoneTop + myZoneH

  // Stack centered between zones
  const stackY = Math.floor((oppZoneBottom + myZoneTop) / 2 - stackH / 2)

  const marginX = Math.floor(w * 0.04)
  const pileSpacing = 8

  // Card sizing: scale to fit zone height (never larger than original)
  const zoneCardH = oppZoneH * 0.85
  const scale = Math.min(zoneCardH / CARD_H, 1.0)
  const cw = CARD_W * scale

  // Hand Y positions (within each zone, toward outer edge)
  const oppHandY = oppZoneTop + Math.floor(CARD_H * scale * 0.55)
  const myHandY = myZoneBottom - Math.floor(CARD_H * scale * 0.55)

  // Piles on right side, near edges
  const pileW = 36 * (w / CARD_W) + pileSpacing
  const pileStartX = w - marginX - Math.floor(32 * (w / CARD_W))
  const oppPileY = oppZoneTop + Math.floor(CARD_H * scale * 0.55) - 19
  const myPileY = myZoneBottom - Math.floor(CARD_H * scale * 0.55) - 19
  const oppPiles = {
    library:   { x: pileStartX, y: oppPileY },
    graveyard: { x: pileStartX + pileW, y: oppPileY },
    exile:     { x: pileStartX + 2 * pileW, y: oppPileY },
  }
  const myPiles = {
    library:   { x: pileStartX, y: myPileY },
    graveyard: { x: pileStartX + pileW, y: myPileY },
    exile:     { x: pileStartX + 2 * pileW, y: myPileY },
  }

  const stackCenterX = w / 2

  function ch() { return CARD_H * scale }

  return {
    w, h, scale, offX: 0, offY: 0, worldW: w, worldH: h,

    oppZone: { top: oppZoneTop, bottom: oppZoneBottom },
    myZone: { top: myZoneTop, bottom: myZoneBottom },
    stackZone: { y: stackY, height: stackH },

    stackSlot: (index: number, _count: number) => ({
      x: stackCenterX + index * (cw + 20),
      y: stackY + stackH / 2 - ch(),
    }),

    oppHandY,
    myHandY,
    myHand: { x: w / 2, y: myHandY },
    oppHand: { x: w - marginX, y: oppHandY },

    oppPiles,
    myPiles,

    oppBattleCenterY: Math.floor(oppZoneTop + oppZoneH * 0.45),
    myBattleCenterY: Math.floor(myZoneTop + myZoneH * 0.55),

    // Legacy aliases (BoardScene.ts usa estos nombres)
    oppHeader: { x: marginX, y: oppZoneTop },
    myHeader: { x: marginX, y: myZoneBottom + 20 },
    oppBattle: { x: marginX, y: Math.floor(oppZoneTop + oppZoneH * 0.45) },
    myBattle: { x: marginX, y: Math.floor(myZoneTop + myZoneH * 0.45) },

    dividerY: Math.floor((oppZoneBottom + myZoneTop) / 2),
  }
}

/** Auto-grid layout for battlefield cards.
 * Cards are centered and evenly spaced within the available width.
 * If too many, they wrap into rows. Cards shrink proportionally to fit.
 */
export function battlefieldAutoGrid(
  zoneCenterY: number,
  count: number,
  zones: ZoneLayout,
): Slot[] {
  if (count === 0) return []

  const availableW = zones.w * 0.78
  const baseCardW = CARD_W * zones.scale
  const maxPerRow = Math.max(1, Math.floor((availableW + SLOT_PAD) / (baseCardW + SLOT_PAD)))

  const cols = Math.min(count, maxPerRow)
  const rows = Math.ceil(count / cols)

  // Ensure cards fit within available width
  const totalRowWidth = cols * baseCardW + (cols - 1) * SLOT_PAD
  const cardScale = Math.min(availableW / totalRowWidth, 1.0)
  const effectiveCardW = baseCardW * cardScale
  const effectiveCardH = CARD_H * zones.scale * cardScale

  const slots: Slot[] = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = zones.w / 2 - totalRowWidth / 2 + col * (effectiveCardW + SLOT_PAD) + effectiveCardW / 2
    const y = zoneCenterY - (rows - 1) * (effectiveCardH + SLOT_PAD) / 2 + row * (effectiveCardH + SLOT_PAD)
    slots.push({ x, y })
  }

  return slots
}

/** Alias for opponent battlefield. */
export function opponentBattleAutoGrid(
  zoneCenterY: number,
  count: number,
  zones: ZoneLayout,
): Slot[] {
  return battlefieldAutoGrid(zoneCenterY, count, zones)
}

/** Hand fan layout — cards overlap horizontally for a nice spread. */
export function handFanned(zone: Slot, count: number, scale: number, w?: number): Slot[] {
  if (count === 0) return []

  const baseCardW = CARD_W * scale
  // Default world width when not provided: matches old cardW×8 default
  const worldW = w ?? CARD_W * 8

  // maxW: total width available for the fan (same proportion as old code)
  const maxW = Math.min(worldW * 0.65, count * baseCardW + SLOT_PAD)
  const minSpacing = baseCardW * 0.65

  if (count === 1) {
    return [{ x: zone.x, y: zone.y }]
  }

  // Spacing: distribute cards to fit within maxW, but never less than minSpacing
  const fittedSpacing = (maxW - baseCardW) / (count - 1)
  const spacing = Math.max(minSpacing, fittedSpacing > 0 ? fittedSpacing : minSpacing)

  // Center the fan at zone.x — the total width of the fan is spacing*(count-1)
  const startX = zone.x - (spacing * (count - 1)) / 2

  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * spacing,
    y: zone.y,
  }))
}

/** Legacy single-row battlefield layout. */
/** Legacy alias for opponent battlefield (compatibilidad con código antiguo). */
export function opponentBattleZone(zones: ZoneLayout, index: number, _opponentCount: number): Slot {
  return { x: zones.oppBattle.x, y: zones.oppZone.top + index * (CARD_H * zones.scale + SLOT_PAD) }
}

export function battlefieldRow(zone: Slot, count: number, _scale: number, cardW: number, worldW: number): Slot[] {
  if (count === 0) return []
  const available = worldW * 0.70 - cardW
  const spacing = Math.min(cardW * 0.85, available / Math.max(count - 1, 1))
  const startX = zone.x + cardW / 2
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * spacing, y: zone.y }))
}

/** Multi-row battlefield layout (legacy). */
export function battlefieldRows(zone: Slot, count: number, scale: number, cardW: number, worldW: number): Slot[] {
  if (count === 0) return []
  const perRow = 7
  const rows = Math.ceil(count / perRow)
  const slots: Slot[] = []
  for (let r = 0; r < rows; r++) {
    const rowStart = r * perRow
    const rowEnd = Math.min(rowStart + perRow, count)
    const rowY = zone.y - r * (CARD_H * scale + SLOT_PAD)
    const rowCount = rowEnd - rowStart
    if (rowCount === 0) continue
    const available = worldW * 0.70 - cardW
    const spacing = Math.min(cardW * 0.85, available / Math.max(rowCount - 1, 1))
    const startX = zone.x + cardW / 2
    for (let i = 0; i < rowCount; i++) {
      slots.push({ x: startX + i * spacing, y: rowY })
    }
  }
  return slots
}

export function isStackEmpty(game: GameView): boolean {
  return !game.stack || Object.keys(game.stack).length === 0
}
