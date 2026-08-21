import { render, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DeckManager, { parseArenaDeck } from './DeckManager'

describe('DeckManager & parseArenaDeck', () => {
  it('parses MTG Arena export decklist text properly', () => {
    const arenaText = `
Deck
4 Lightning Bolt (M10) 146
20 Mountain (LEA) 292
2 Boros Charm (FDN) 721

Sideboard
2 Red Elemental Blast (4ED) 218
`
    const deck = parseArenaDeck(arenaText, 'Burn Deck')
    expect(deck).not.toBeNull()
    expect(deck?.name).toBe('Burn Deck')
    expect(deck?.cards.length).toBe(3)
    expect(deck?.cards[0]).toEqual({
      cardName: 'Lightning Bolt',
      setCode: 'M10',
      cardNumber: '146',
      amount: 4,
    })
    expect(deck?.cards[1]).toEqual({
      cardName: 'Mountain',
      setCode: 'LEA',
      cardNumber: '292',
      amount: 20,
    })
    expect(deck?.sideboard.length).toBe(1)
    expect(deck?.sideboard[0]).toEqual({
      cardName: 'Red Elemental Blast',
      setCode: '4ED',
      cardNumber: '218',
      amount: 2,
    })
  })

  it('handles standard plain card lines without set numbers', () => {
    const plainText = `
4 Counterspell
20 Island
`
    const deck = parseArenaDeck(plainText, 'Mono Blue')
    expect(deck).not.toBeNull()
    expect(deck?.cards.length).toBe(2)
    expect(deck?.cards[0].cardName).toBe('Counterspell')
    expect(deck?.cards[0].amount).toBe(4)
  })

  it('renders DeckManager and allows switching active deck', () => {
    render(<DeckManager />)

    expect(screen.getByText(/Mis Mazos/)).toBeDefined()
    expect(screen.getAllByText('Mage Web bolt').length).toBeGreaterThanOrEqual(1)

    // Switch to another deck
    const advancedDeck = screen.getByText('Mage Web advanced')
    fireEvent.click(advancedDeck)

    expect(screen.getAllByText('Walking Ballista').length).toBeGreaterThanOrEqual(1)
  })
})
