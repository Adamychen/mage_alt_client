import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LibraryOrderDialog from './LibraryOrderDialog'
import type { FeedbackPrompt } from './feedback'

describe('LibraryOrderDialog', () => {
  it('renders top of library cards and allows reordering and moving to bottom', () => {
    const send = vi.fn()
    const cancel = vi.fn()

    const prompt: FeedbackPrompt = {
      method: 'GAME_CHOOSE_CARDS_ORDER',
      gameId: 'g-1',
      title: 'Adivinar (Scry 2)',
      message: 'Pon las cartas arriba o en el fondo de la biblioteca en el orden deseado.',
      mode: 'order',
      options: [
        { id: 'card-1', label: 'Lightning Bolt', value: 'card-1' },
        { id: 'card-2', label: 'Counterspell', value: 'card-2' },
      ],
      min: 0,
      max: 2,
    }

    const { container, getByText } = render(
      <LibraryOrderDialog prompt={prompt} send={send} cancel={cancel} busy={false} />
    )

    expect(getByText('Adivinar (Scry 2)')).not.toBeNull()
    expect(getByText('#1')).not.toBeNull()
    expect(getByText('#2')).not.toBeNull()

    // Move first card to bottom
    const toBottomBtns = container.querySelectorAll('.btn-to-bottom')
    expect(toBottomBtns.length).toBe(2)
    fireEvent.click(toBottomBtns[0])

    // Now 1 top card (#1) and 1 bottom card
    expect(getByText('Confirmar orden (1 arriba, 1 fondo)')).not.toBeNull()

    // Click confirm
    const confirmBtn = getByText('Confirmar orden (1 arriba, 1 fondo)')
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
})
