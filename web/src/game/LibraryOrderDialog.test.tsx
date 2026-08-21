import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LibraryOrderDialog from './LibraryOrderDialog'
import type { FeedbackPrompt } from './feedback'

describe('LibraryOrderDialog', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders top of library cards and allows reordering with arrows', () => {
    const send = vi.fn()
    const cancel = vi.fn()

    const prompt: FeedbackPrompt = {
      method: 'GAME_CHOOSE_CARDS_ORDER',
      gameId: 'g-1',
      title: 'Adivinar (Scry 3)',
      message: 'Pon las cartas arriba o en el fondo de la biblioteca en el orden deseado.',
      mode: 'order',
      options: [
        { id: 'card-1', label: 'Lightning Bolt', value: 'card-1' },
        { id: 'card-2', label: 'Counterspell', value: 'card-2' },
        { id: 'card-3', label: 'Brainstorm', value: 'card-3' },
      ],
      min: 0,
      max: 3,
    }

    const { container, getByText } = render(
      <LibraryOrderDialog prompt={prompt} send={send} cancel={cancel} busy={false} />
    )

    expect(getByText('Adivinar (Scry 3)')).not.toBeNull()
    expect(getByText('Lightning Bolt')).not.toBeNull()
    expect(getByText('Counterspell')).not.toBeNull()
    expect(getByText('Brainstorm')).not.toBeNull()

    // Move second card (Counterspell) left (to position #1)
    const arrowBtns = container.querySelectorAll('.btn-arrow')
    // arrowBtns: [card1-left, card1-right, card2-left, card2-right, card3-left, card3-right]
    fireEvent.click(arrowBtns[2]) // left arrow on card-2

    // Now Counterspell is first
    const cardCards = container.querySelectorAll('.order-card-card')
    expect(cardCards[0].textContent).toContain('Counterspell')
    expect(cardCards[1].textContent).toContain('Lightning Bolt')
  })

  it('moves cards between top and bottom zones and handles quick buttons', () => {
    const send = vi.fn()
    const cancel = vi.fn()

    const prompt: FeedbackPrompt = {
      method: 'GAME_CHOOSE_CARDS_ORDER',
      gameId: 'g-1',
      title: 'Scry 2',
      message: 'Scry 2',
      mode: 'order',
      options: [
        { id: 'card-1', label: 'Lightning Bolt', value: 'card-1' },
        { id: 'card-2', label: 'Counterspell', value: 'card-2' },
      ],
      min: 0,
      max: 2,
    }

    const { getByText } = render(
      <LibraryOrderDialog prompt={prompt} send={send} cancel={cancel} busy={false} />
    )

    // Send all to bottom
    const allToBottomBtn = getByText('⬇️ Todas al fondo')
    fireEvent.click(allToBottomBtn)

    expect(getByText('Confirmar orden (0 arriba, 2 fondo)')).not.toBeNull()

    // Send all back to top
    const allToTopBtn = getByText('⬆️ Todas arriba')
    fireEvent.click(allToTopBtn)

    expect(getByText('Confirmar orden (2 arriba, 0 fondo)')).not.toBeNull()

    // Click confirm
    const confirmBtn = getByText('Confirmar orden (2 arriba, 0 fondo)')
    fireEvent.click(confirmBtn)
    expect(send).toHaveBeenCalled()
  })

  it('detects Surveil and changes bottom zone label to Graveyard', () => {
    const send = vi.fn()
    const cancel = vi.fn()

    const prompt: FeedbackPrompt = {
      method: 'GAME_CHOOSE_CARDS_ORDER',
      gameId: 'g-1',
      title: 'Surveil 1',
      message: 'Surveil 1: You may put the card into your graveyard.',
      mode: 'order',
      options: [
        { id: 'card-consider', label: 'Consider', value: 'card-consider' },
      ],
      min: 0,
      max: 1,
    }

    const { getByText } = render(
      <LibraryOrderDialog prompt={prompt} send={send} cancel={cancel} busy={false} />
    )

    expect(getByText('⬇️ Al Cementerio')).not.toBeNull()
    expect(getByText('☠️ Todas al cementerio')).not.toBeNull()
  })

  it('handles cancel button click', () => {
    const send = vi.fn()
    const cancel = vi.fn()

    const prompt: FeedbackPrompt = {
      method: 'GAME_CHOOSE_CARDS_ORDER',
      gameId: 'g-1',
      title: 'Order Cards',
      message: 'Choose card order',
      mode: 'order',
      options: [{ id: 'card-1', label: 'Card 1', value: 'card-1' }],
      min: 0,
      max: 1,
    }

    const { getByText } = render(
      <LibraryOrderDialog prompt={prompt} send={send} cancel={cancel} busy={false} />
    )

    const cancelBtn = getByText('Cancelar')
    fireEvent.click(cancelBtn)
    expect(cancel).toHaveBeenCalled()
  })
})
