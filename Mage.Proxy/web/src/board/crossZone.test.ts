import { describe, expect, it } from 'vitest'
import { crossZonePlayables } from '../board/crossZone'
import { makeGameView, makePlayer } from '../__fixtures__/gameViews'
import type { GameView } from '../net/types'

/** La "ray" cross-zone: derivada de canPlayObjects, filtrando mano y
 *  battlefield (los permanents en juego se juegan por el tablero, no por
 *  el rayo). El pago de maná (basicManaAbilities) queda fuera. */

function viewWithCrossZone(stats: GameView['canPlayObjects']): GameView {
  return makeGameView({
    players: [
      makePlayer({
        playerId: 'me',
        name: 'Me',
        controlled: true,
        graveyard: { 'g-1': { name: 'Grave One', manaValue: 1, expansionSetCode: 'T', cardNumber: '0', parentId: 'g-1', id: 'g-1' } },
        exile: { 'e-1': { name: 'Exile One', manaValue: 1, expansionSetCode: 'T', cardNumber: '0', parentId: 'e-1', id: 'e-1' } },
       }),
     ],
    myHand: { 'h-1': { name: 'Hand One', manaValue: 1, expansionSetCode: 'T', cardNumber: '0', parentId: 'h-1', id: 'h-1' } },
    canPlayObjects: stats,
    })
}

describe('crossZonePlayables', () => {
  it('no devuelve nada sin canPlayObjects', () => {
    expect(crossZonePlayables(makeGameView({}))).toEqual([])
    expect(crossZonePlayables(null)).toEqual([])
   })

  it('excluye las cartas de la mano (se juegan por la mano, no por el rayo)', () => {
    const out = crossZonePlayables(viewWithCrossZone({ objects: { 'h-1': { basicCastAbilities: [{ id: 'h-1', value: 'cast' }] } } }))
    expect(out).toEqual([])
    })

  it('lista una carta jugable desde el cementerio con la metadata resuelta de la zona', () => {
    const out = crossZonePlayables(viewWithCrossZone({ objects: { 'g-1': { other: [{ id: 'g-1', value: 'other' }] } } }))
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('g-1')
    expect(out[0].zone).toBe('graveyard')
    expect(out[0].card.name).toBe('Grave One')
    })

  it('lista una carta jugable desde exilio', () => {
    const out = crossZonePlayables(viewWithCrossZone({ objects: { 'e-1': { other: [{ id: 'e-1', value: 'other' }] } } }))
    expect(out[0].zone).toBe('exile')
    expect(out[0].card.name).toBe('Exile One')
    })

  it('usa el value del record como fallback cuando no hay metadata de zona', () => {
    const out = crossZonePlayables(viewWithCrossZone({ objects: { 'x-9': { basicCastAbilities: [{ id: 'x-9', value: 'Cast from anywhere' }] } } }))
    expect(out[0].id).toBe('x-9')
    expect(out[0].value).toBe('Cast from anywhere')
    expect(out[0].card.name).toBe('Cast from anywhere')
    })

  it('excluye basicManaAbilities (pago de maná, no es un lanzamiento)', () => {
    const out = crossZonePlayables(viewWithCrossZone({ objects: { 'p-1': { basicManaAbilities: [{ id: 'p-1', value: 'mana' }] } } }))
    expect(out).toEqual([])
    })

  it('incluye la carta si viene solo en basicPlayAbilities o basicCastAbilities', () => {
    const out = crossZonePlayables(viewWithCrossZone({ objects: { 'g-1': { basicPlayAbilities: [{ id: 'g-1', value: 'play' }] } } }))
    expect(out[0].id).toBe('g-1')
    })
})
