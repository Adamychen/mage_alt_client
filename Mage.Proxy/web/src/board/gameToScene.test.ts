import { describe, expect, it } from 'vitest'
import { buildPlacements, playableObjectIds, resolveTargetSourceId } from './gameToScene'
import { computeZones } from './zones'
import { playerGameView, spectatorGameView, spectatorNoPlayersGameView } from '../__fixtures__/gameViews'

const zones = computeZones(1600, 900)

describe('buildPlacements', () => {
  it('regression: a game without players (spectator) does not throw and still lays out hand and stack', () => {
    expect(() => buildPlacements(spectatorNoPlayersGameView, zones)).not.toThrow()
    const placements = buildPlacements(spectatorNoPlayersGameView, zones)
    const hand = placements.filter((p) => p.group === 'myHand')
    expect(hand).toHaveLength(1)
    expect(hand[0].card.name).toBe('Counterspell')
    const stack = placements.filter((p) => p.group === 'stack')
    expect(stack).toHaveLength(1)
    expect(stack[0].card.name).toBe('Lightning Bolt')
  })

  it('lays out the controlled player battlefield, hand and piles', () => {
    const placements = buildPlacements(playerGameView, zones)
    const myBattle = placements.filter((p) => p.group === 'myBattle')
    expect(myBattle).toHaveLength(2)
    expect(myBattle.map((p) => p.id).sort()).toEqual(['p-tapped', 'p-untapped'])
    const untapped = myBattle.find((p) => p.id === 'p-untapped')
    expect(untapped?.rotation).toBe(0)
    const tapped = myBattle.find((p) => p.id === 'p-tapped')
    expect(tapped?.rotation).toBe(Math.PI / 2)
    const myHand = placements.filter((p) => p.group === 'myHand')
    expect(myHand).toHaveLength(1)
    expect(myHand[0].card.name).toBe('Counterspell')
    expect(myHand[0].faceDown).toBe(false)
    expect(myHand[0].sourceId).toBe('h-1')
  })

  it('exposes XMage playable object UUIDs without visual-zone prefixes', () => {
    const game = {
      ...playerGameView,
      canPlayObjects: {
        objects: {
          'h-1': { basicCastAbilities: [{ id: 'ability-1', value: 'Cast Counterspell' }] },
          'p-untapped': { basicManaAbilities: [] },
        },
      },
    }
    expect(playableObjectIds(game)).toEqual(['h-1', 'p-untapped'])
  })

  it('rotates opponent tapped permanents the other way', () => {
    const placements = buildPlacements(playerGameView, zones)
    const opp = placements.find((p) => p.group === 'oppBattle' && p.id === 'p-opp-tapped')
    expect(opp?.rotation).toBe(-Math.PI / 2)
  })

  it('marks opponent hands as face down', () => {
    const placements = buildPlacements(playerGameView, zones)
    const oppHand = placements.filter((p) => p.group === 'oppHand')
    expect(oppHand).toHaveLength(1)
    expect(oppHand[0].faceDown).toBe(true)
    expect(oppHand[0].card.name).toBe('?')
    expect(oppHand[0].id).toBe('oh-1')
  })

  it('keeps placement ids stable when the same snapshot is mapped twice', () => {
    const first = buildPlacements(playerGameView, zones).map((p) => p.id)
    const second = buildPlacements(playerGameView, zones).map((p) => p.id)
    expect(second).toEqual(first)
    expect(new Set(first).size).toBe(first.length)
  })

  it('renders watched hands face up for spectators with permission', () => {
    const game = {
      ...spectatorGameView,
      watchedHands: { Alice: { 'watched-1': { id: 'watched-1', name: 'Forest' } } },
    }
    const watched = buildPlacements(game, zones).filter((p) => p.group === 'watchedHand')
    expect(watched).toHaveLength(1)
    expect(watched[0].faceDown).toBe(false)
    expect(watched[0].card.name).toBe('Forest')
  })

  it('shows only the top card of graveyard and exile, plus a face-down library', () => {
    const placements = buildPlacements(playerGameView, zones)
    const library = placements.filter((p) => p.group === 'myLibrary')
    expect(library).toHaveLength(1)
    expect(library[0].faceDown).toBe(true)
    const graveyard = placements.filter((p) => p.group === 'myGraveyard')
    expect(graveyard).toHaveLength(1)
    expect(graveyard[0].card.name).toBe('Grave Last')
    const exile = placements.filter((p) => p.group === 'myExile')
    expect(exile).toHaveLength(1)
    expect(exile[0].card.name).toBe('Exile Last')
  })

  it('spectator with an empty players list produces no battlefield but keeps the stack', () => {
    const placements = buildPlacements(spectatorGameView, zones)
    expect(placements.filter((p) => p.group === 'myBattle')).toHaveLength(0)
    expect(placements.filter((p) => p.group === 'myHand')).toHaveLength(0)
    expect(placements.filter((p) => p.group === 'stack')).toHaveLength(1)
  })
})

describe('resolveTargetSourceId', () => {
  it('finds the spell on the stack by name (sourceId of its placement)', () => {
    const id = resolveTargetSourceId(spectatorNoPlayersGameView, 'Lightning Bolt')
    expect(id).toBe('s-1')
    const placement = buildPlacements(spectatorNoPlayersGameView, zones).find((p) => p.group === 'stack')
    expect(placement?.sourceId).toBe(id)
  })

  it('falls back to a battlefield permanent when the source is an activated ability', () => {
    const game = {
      ...playerGameView,
      stack: {},
    }
    const id = resolveTargetSourceId(game, 'Serra Angel')
    expect(id).toBe('p-untapped')
  })

  it('returns undefined when the source name is unknown or missing', () => {
    expect(resolveTargetSourceId(spectatorNoPlayersGameView, 'Not On Board')).toBeUndefined()
    expect(resolveTargetSourceId(spectatorNoPlayersGameView, undefined)).toBeUndefined()
  })
})
