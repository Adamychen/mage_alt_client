import { describe, expect, it } from 'vitest'
import { battlefieldRow, computeZones, handFanned, isStackEmpty, opponentBattleZone } from './zones'
import { makeCard, minimalGameView } from '../__fixtures__/gameViews'

describe('computeZones', () => {
  it('scales 1:1 at 1600x900', () => {
    const z = computeZones(1600, 900)
    expect(z.scale).toBe(1)
    expect(z.oppHeader).toEqual({ x: 16, y: 10 })
    expect(z.myHeader).toEqual({ x: 16, y: 866 })
    expect(z.oppBattle).toEqual({ x: 16, y: 48 })
    expect(z.myBattle).toEqual({ x: 16, y: 596 })
    expect(z.myHand).toEqual({ x: 800, y: 684 })
    expect(z.stack).toEqual({ x: 727, y: 348 })
    expect(z.oppPiles.library).toEqual({ x: 1442, y: 48 })
    expect(z.oppPiles.graveyard).toEqual({ x: 1284, y: 48 })
    expect(z.oppPiles.exile).toEqual({ x: 1126, y: 48 })
    expect(z.myPiles.library).toEqual({ x: 1442, y: 596 })
    expect(z.myPiles.graveyard).toEqual({ x: 1284, y: 596 })
    expect(z.myPiles.exile).toEqual({ x: 1126, y: 596 })
  })

  it('scales to 0.5 at 800x450 (diseño completo escalado)', () => {
    const z = computeZones(800, 450)
    expect(z.scale).toBe(0.5)
    expect(z.oppHeader).toEqual({ x: 8, y: 5 })
    expect(z.myHeader).toEqual({ x: 8, y: 433 })
    expect(z.myBattle).toEqual({ x: 8, y: 298 })
    expect(z.myHand).toEqual({ x: 400, y: 342 })
    expect(z.stack).toEqual({ x: 363.5, y: 174 })
    expect(z.oppPiles.library).toEqual({ x: 721, y: 24 })
  })

  it('centra el mundo horizontalmente en ventanas anchas', () => {
    const z = computeZones(2000, 1000)
    expect(z.scale).toBeCloseTo(10 / 9, 5)
    expect(z.offX).toBeCloseTo(111.111, 2)
    expect(z.offY).toBeCloseTo(0, 5)
    expect(z.oppHeader.x).toBeCloseTo(111.111 + 16 * (10 / 9), 2)
    expect(z.myHand.y).toBeCloseTo(1000 - 204 * (10 / 9) - 12 * (10 / 9), 2)
    expect(z.stack.x).toBeCloseTo(2000 / 2 - 146 * (10 / 9) / 2, 2)
  })

  it('centra el mundo verticalmente en ventanas altas', () => {
    const z = computeZones(800, 1200)
    expect(z.scale).toBe(0.5)
    expect(z.offX).toBe(0)
    expect(z.offY).toBe(375)
    expect(z.myHand.y).toBe(375 + 444 - 102)
    expect(z.oppHeader.y).toBe(375 + 5)
  })
})

describe('handFanned', () => {
  it('returns [] for zero cards', () => {
    expect(handFanned({ x: 800, y: 700 }, 0, 1, 1600, 146)).toEqual([])
  })

  it('centers a single card at the zone anchor', () => {
    expect(handFanned({ x: 800, y: 700 }, 1, 1, 1600, 146)).toEqual([{ x: 800, y: 700 }])
  })

  it('spaces multiple cards evenly and keeps them centered', () => {
    const slots = handFanned({ x: 800, y: 700 }, 5, 1, 1600, 146)
    expect(slots).toHaveLength(5)
    expect(slots[0].x).toBeCloseTo(405.8, 5)
    expect(slots[1].x - slots[0].x).toBeCloseTo(197.1, 5)
    expect(slots[4].x - slots[3].x).toBeCloseTo(197.1, 5)
    expect(slots[0].x + slots[4].x).toBeCloseTo(1600, 5)
    expect(slots.every((s) => s.y === 700)).toBe(true)
  })

  it('caps the spacing when the fan would overflow the board width', () => {
    const slots = handFanned({ x: 400, y: 700 }, 12, 0.5, 800, 146)
    const maxW = 800 * 0.9
    const spacing = (maxW - 146) / 11
    expect(spacing).toBeLessThan(146 * 1.35)
    expect(slots[1].x - slots[0].x).toBeCloseTo(spacing, 5)
    expect(slots[0].x).toBeCloseTo(400 - (spacing * 11) / 2, 5)
    expect(slots[0].x).toBeGreaterThanOrEqual(0)
  })
})

describe('battlefieldRow', () => {
  it('starts at the zone plus half a card and spaces by 0.88 of the card width', () => {
    const slots = battlefieldRow({ x: 16, y: 596 }, 3, 1, 146, 1600)
    expect(slots).toHaveLength(3)
    expect(slots[0]).toEqual({ x: 89, y: 596 })
    expect(slots[1].x - slots[0].x).toBeCloseTo(146 * 0.88, 5)
    expect(slots[2].x - slots[1].x).toBeCloseTo(146 * 0.88, 5)
  })

  it('returns [] for zero permanents', () => {
    expect(battlefieldRow({ x: 16, y: 596 }, 0, 1, 146, 1600)).toEqual([])
  })

  it('compresses the spacing so a huge battlefield never overflows the world width', () => {
    const slots = battlefieldRow({ x: 16, y: 596 }, 40, 1, 146, 1600)
    const spacing = (1600 - 2 * 16 - 146) / 39
    expect(spacing).toBeLessThan(146 * 0.88)
    expect(slots[1].x - slots[0].x).toBeCloseTo(spacing, 5)
    expect(slots[slots.length - 1].x + 73).toBeLessThanOrEqual(1600 - 16)
  })

  it('keeps a single row even with many permanents (no vertical overlap)', () => {
    const slots = battlefieldRow({ x: 16, y: 596 }, 40, 1, 146, 1600)
    expect(new Set(slots.map((s) => s.y)).size).toBe(1)
  })
})

describe('opponentBattleZone', () => {
  it('keeps a single opponent in the original row', () => {
    const zones = computeZones(1600, 900)
    expect(opponentBattleZone(zones, 0, 1)).toEqual(zones.oppBattle)
  })

  it('gives multiple opponents distinct rows', () => {
    const zones = computeZones(1600, 900)
    const rows = [0, 1, 2].map((i) => opponentBattleZone(zones, i, 3))
    expect(new Set(rows.map((row) => row.y)).size).toBe(3)
    expect(rows[0].y).toBeLessThan(rows[1].y)
    expect(rows[1].y).toBeLessThan(rows[2].y)
  })
})

describe('isStackEmpty', () => {
  it('is true when stack is null', () => {
    const game = { ...minimalGameView, stack: null as unknown as typeof minimalGameView.stack }
    expect(isStackEmpty(game)).toBe(true)
  })

  it('is true when stack is an empty object', () => {
    expect(isStackEmpty(minimalGameView)).toBe(true)
  })

  it('is false when the stack has cards', () => {
    const game = { ...minimalGameView, stack: { 's-1': makeCard({ name: 'Lightning Bolt' }) } }
    expect(isStackEmpty(game)).toBe(false)
  })
})
