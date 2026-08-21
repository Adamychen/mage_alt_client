import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PileOverlay from './PileOverlay'
import type { CardView } from '../net/types'

describe('PileOverlay', () => {
  it('renders graveyard / exile cards list with close button', () => {
    const onClose = vi.fn()
    const cards: Record<string, CardView> = {
      'c-1': { id: 'c-1', name: 'Lightning Bolt', manaValue: 1 },
      'c-2': { id: 'c-2', name: 'Counterspell', manaValue: 2 },
    }

    const { getByText, getByTitle } = render(
      <PileOverlay title="Cementerio" cards={cards} onClose={onClose} />
    )

    expect(getByText('Cementerio (2 cartas)')).not.toBeNull()
    const closeBtn = getByTitle('Cerrar (Esc)')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('renders library with revealed top card, position badges, and face-down cards', () => {
    const onClose = vi.fn()
    const cards: Record<string, CardView> = {
      'lib-top': {
        id: 'lib-top',
        name: 'Delver of Secrets',
        manaValue: 1,
        faceDown: false,
      },
      'lib-2': {
        id: 'lib-2',
        name: 'Carta #2',
        manaValue: 0,
        faceDown: true,
      },
      'lib-3': {
        id: 'lib-3',
        name: 'Carta #3',
        manaValue: 0,
        faceDown: true,
      },
    }

    const { getByText, container } = render(
      <PileOverlay
        title="Biblioteca de Jugador"
        cards={cards}
        onClose={onClose}
        isLibrary={true}
      />
    )

    expect(getByText('Biblioteca de Jugador (3 cartas)')).not.toBeNull()
    expect(container.textContent).toContain('1 carta revelada · #1 es la carta superior (Top)')

    // Check position badges
    expect(getByText('★ #1 TOP')).not.toBeNull()
    expect(getByText('#2')).not.toBeNull()
    expect(getByText('#3')).not.toBeNull()

    // Top card shows name, face-down cards show back image
    expect(getByText('Delver of Secrets')).not.toBeNull()
    const backImages = container.querySelectorAll('img[src="https://cards.scryfall.io/back.png"]')
    expect(backImages.length).toBeGreaterThanOrEqual(2)
  })

  it('closes on Escape key press', () => {
    const onClose = vi.fn()
    render(<PileOverlay title="Exilio" cards={{}} onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
