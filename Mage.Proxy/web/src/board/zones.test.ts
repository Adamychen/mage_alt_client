import { describe, expect, it } from 'vitest'
import { battlefieldRow, battlefieldRows, computeZones, handFanned, isStackEmpty, opponentBattleZone } from './zones'
import { minimalGameView } from '../__fixtures__/gameViews'

describe('computeZones', () => {
  it('fills the canvas completely', () => {
    const z = computeZones(920, 718)
    // Scale is based on zone card height (25% of canvas minus margin, * 0.85)
    const zoneH = Math.floor(718 * 0.25)
    const expectedScale = Math.min(zoneH * 0.85 / 168, 1.0)
    expect(z.scale).toBeCloseTo(expectedScale, 2)
    expect(z.worldW).toBe(920)
    expect(z.worldH).toBe(718)
    expect(z.offX).toBe(0)
    expect(z.offY).toBe(0)
  })

  it('opponent zone is above player zone', () => {
    const z = computeZones(920, 718)
    expect(z.oppZone.top).toBeLessThan(z.myZone.top)
  })

  it('divider is between battlefields', () => {
    const z = computeZones(920, 718)
    expect(z.dividerY).toBeGreaterThan(z.oppZone.bottom)
    expect(z.dividerY).toBeLessThan(z.myZone.top)
  })

  it('hand is centered horizontally and near bottom', () => {
    const z = computeZones(920, 718)
    expect(z.myHand.x).toBeCloseTo(460, 0)
    expect(z.myHand.y).toBeGreaterThan(z.myZone.top)
  })

  it('piles are on the right side', () => {
    const z = computeZones(920, 718)
    expect(z.myPiles.library.x).toBeGreaterThan(z.w * 0.5)
  })

  it('card size scales with canvas height', () => {
    const small = computeZones(600, 400)
    const large = computeZones(1200, 800)
    expect(large.scale).toBeGreaterThan(small.scale)
  })
})

describe('handFanned', () => {
  it('returns [] for zero cards', () => {
    expect(handFanned({ x: 450, y: 700 }, 0, 1)).toEqual([])
  })

  it('centers a single card', () => {
    const result = handFanned({ x: 450, y: 700 }, 1, 1)
    expect(result).toEqual([{ x: 450, y: 700 }])
  })

  it('spaces multiple cards evenly and centered', () => {
    const slots = handFanned({ x: 450, y: 700 }, 5, 1)
    expect(slots).toHaveLength(5)
    expect(slots[0].y).toBe(700)
  })

  it('caps spacing when overflow', () => {
    const slots = handFanned({ x: 225, y: 700 }, 12, 0.5)
    expect(slots).toHaveLength(12)
    expect((slots[0].x + slots[11].x) / 2).toBeCloseTo(225, 0)
  })
})

describe('battlefieldRow', () => {
  it('starts at zone center and spaces by 0.85 of card width', () => {
    const slots = battlefieldRow({ x: 20, y: 300 }, 3, 1, 100, 1200)
    expect(slots).toHaveLength(3)
    expect(slots[0]).toEqual({ x: 70, y: 300 })
    expect(slots[1].x - slots[0].x).toBeCloseTo(100 * 0.85, 5)
  })

  it('returns [] for zero permanents', () => {
    expect(battlefieldRow({ x: 20, y: 300 }, 0, 1, 100, 1200)).toEqual([])
  })

  it('compresses spacing for large battlefields', () => {
    const slots = battlefieldRow({ x: 20, y: 300 }, 20, 1, 100, 1200)
    const available = 1200 * 0.70 - 100
    const spacing = available / 19
    expect(spacing).toBeLessThan(100 * 0.85)
    expect(slots[1].x - slots[0].x).toBeCloseTo(spacing, 5)
  })
})

describe('battlefieldRows', () => {
  it('returns [] for zero permanents', () => {
    expect(battlefieldRows({ x: 20, y: 300 }, 0, 1, 100, 1200)).toEqual([])
  })

  it('puts up to 7 per row', () => {
    const slots = battlefieldRows({ x: 20, y: 300 }, 7, 1, 100, 1200)
    expect(slots).toHaveLength(7)
    expect(new Set(slots.map((s) => s.y)).size).toBe(1)
  })

  it('creates new rows exceeding 7', () => {
    const slots = battlefieldRows({ x: 20, y: 300 }, 14, 1, 100, 1200)
    expect(slots).toHaveLength(14)
    expect(new Set(slots.map((s) => s.y)).size).toBe(2)
  })
})

describe('opponentBattleZone', () => {
  it('single opponent returns original row', () => {
    const zones = computeZones(920, 718)
    expect(opponentBattleZone(zones, 0, 1)).toEqual({ x: zones.oppBattle.x, y: zones.oppZone.top })
  })

  it('multiple opponents get distinct rows', () => {
    const zones = computeZones(920, 718)
    const rows = [0, 1, 2].map((i) => opponentBattleZone(zones, i, 3))
    expect(rows[0].y).toBeLessThan(rows[1].y)
    expect(rows[1].y).toBeLessThan(rows[2].y)
  })
})

describe('isStackEmpty', () => {
  it('null stack', () => {
    expect(isStackEmpty({ ...minimalGameView, stack: null } as any)).toBe(true)
  })

  it('empty object', () => {
    expect(isStackEmpty(minimalGameView)).toBe(true)
  })

  it('has cards', () => {
    const game = { ...minimalGameView, stack: { 's-1': { id: 'c1', name: 'Lightning Bolt' } as any } }
    expect(isStackEmpty(game as any)).toBe(false)
  })
})
