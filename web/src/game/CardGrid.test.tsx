import { render, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CardGrid from './CardGrid'
import type { FeedbackPrompt } from './feedback'

function makePrompt(overrides: Partial<FeedbackPrompt> = {}): FeedbackPrompt {
  return {
    method: 'GAME_TARGET',
    gameId: 'g-1',
    title: 'Search your library',
    message: 'Choose a creature card',
    mode: 'uuid',
    options: [],
    min: 0,
    max: 1,
    required: true,
    cards: [
      { id: 'c-1', name: 'Grizzly Bears', expansionSetCode: 'IMA', cardNumber: '165' },
      { id: 'c-2', name: 'Lightning Bolt', expansionSetCode: 'M10', cardNumber: '147' },
      { id: 'c-3', name: 'Island', expansionSetCode: 'M21', cardNumber: '237' },
    ],
    ...overrides,
  }
}

describe('CardGrid', () => {
  it('renders all cards in the grid', () => {
    const { container } = render(<CardGrid prompt={makePrompt()} selected={[]} setSelected={vi.fn()} send={vi.fn()} cancel={vi.fn()} busy={false} />)
    expect(container.textContent).toContain('Grizzly Bears')
    expect(container.textContent).toContain('Lightning Bolt')
    expect(container.textContent).toContain('Island')
  })

  it('shows the prompt message', () => {
    const { container } = render(<CardGrid prompt={makePrompt()} selected={[]} setSelected={vi.fn()} send={vi.fn()} cancel={vi.fn()} busy={false} />)
    expect(container.textContent).toContain('Choose a creature card')
  })

  it('shows the search filter input and card count badge', () => {
    const { container } = render(<CardGrid prompt={makePrompt()} selected={[]} setSelected={vi.fn()} send={vi.fn()} cancel={vi.fn()} busy={false} />)
    expect(container.querySelector('input[placeholder]')).toBeTruthy()
    expect(container.querySelector('.card-grid-count-badge')?.textContent).toContain('3 cartas')
  })

  it('filters cards by name', () => {
    const cards = Array.from({ length: 10 }, (_, i) => ({
      id: `c-${i}`, name: i === 3 ? 'Volcanic Hammer' : `Card ${i}`, expansionSetCode: 'TEST', cardNumber: String(i),
    }))
    const { container } = render(<CardGrid prompt={makePrompt({ cards })} selected={[]} setSelected={vi.fn()} send={vi.fn()} cancel={vi.fn()} busy={false} />)
    const input = container.querySelector('input[placeholder]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Volcanic' } })
    expect(container.textContent).toContain('Volcanic Hammer')
    expect(container.textContent).not.toContain('Card 0')
  })

  it('shows cancel button and calls cancel', () => {
    const cancel = vi.fn()
    const { container } = render(<CardGrid prompt={makePrompt()} selected={[]} setSelected={vi.fn()} send={vi.fn()} cancel={cancel} busy={false} />)
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Cancelar'))!
    cancelBtn.click()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('shows confirm button for multi-select', () => {
    const { container } = render(<CardGrid prompt={makePrompt({ max: 3 })} selected={['c-1', 'c-2']} setSelected={vi.fn()} send={vi.fn()} cancel={vi.fn()} busy={false} />)
    expect(container.textContent).toContain('Confirmar')
  })

  it('does not show confirm button for single-select', () => {
    const { container } = render(<CardGrid prompt={makePrompt({ max: 1 })} selected={[]} setSelected={vi.fn()} send={vi.fn()} cancel={vi.fn()} busy={false} />)
    expect(container.textContent).not.toContain('Confirmar')
  })

  it('disables cancel button when busy', () => {
    const { container } = render(<CardGrid prompt={makePrompt()} selected={[]} setSelected={vi.fn()} send={vi.fn()} cancel={vi.fn()} busy={true} />)
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Cancelar')) as HTMLButtonElement
    expect(cancelBtn.disabled).toBe(true)
  })

  it('shows empty state when filter matches nothing', () => {
    const cards = Array.from({ length: 10 }, (_, i) => ({
      id: `c-${i}`, name: `Card ${i}`, expansionSetCode: 'TEST', cardNumber: String(i),
    }))
    const { container } = render(<CardGrid prompt={makePrompt({ cards })} selected={[]} setSelected={vi.fn()} send={vi.fn()} cancel={vi.fn()} busy={false} />)
    const input = container.querySelector('input[placeholder]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'zzzznothing' } })
    expect(container.textContent).toContain('No se encontraron cartas')
  })

  it('shows optional finish button when required is false', () => {
    const { container } = render(<CardGrid prompt={makePrompt({ required: false, max: 3 })} selected={[]} setSelected={vi.fn()} send={vi.fn()} cancel={vi.fn()} busy={false} />)
    expect(container.textContent).toContain('Terminar selección')
  })
})
