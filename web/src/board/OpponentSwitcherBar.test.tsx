import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OpponentSwitcherBar from './OpponentSwitcherBar'
import type { PlayerView } from '../net/types'

describe('OpponentSwitcherBar', () => {
  afterEach(() => {
    cleanup()
  })

  const mockOpponents = [
    {
      playerId: 'p2',
      name: 'Alice',
      life: 40,
      controlled: false,
    },
    {
      playerId: 'p3',
      name: 'Bob',
      life: 38,
      controlled: false,
    },
    {
      playerId: 'p4',
      name: 'Charlie',
      life: 32,
      controlled: false,
    },
  ] as unknown as PlayerView[]

  it('renders nothing when only 1 opponent', () => {
    const { container } = render(
      <OpponentSwitcherBar
        opponents={[mockOpponents[0]]}
        selectedOppId="p2"
        onSelectOpponent={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders pills for all opponents with life totals', () => {
    const onSelect = vi.fn()
    render(
      <OpponentSwitcherBar
        opponents={mockOpponents}
        selectedOppId="p2"
        onSelectOpponent={onSelect}
        activePlayerId="p2"
      />
    )

    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Bob')).toBeDefined()
    expect(screen.getByText('Charlie')).toBeDefined()
    expect(screen.getByText('TURNO')).toBeDefined()

    fireEvent.click(screen.getByText('Bob'))
    expect(onSelect).toHaveBeenCalledWith('p3')
  })

  it('cycles with chevron buttons', () => {
    const onSelect = vi.fn()
    render(
      <OpponentSwitcherBar
        opponents={mockOpponents}
        selectedOppId="p2"
        onSelectOpponent={onSelect}
      />
    )

    const nextBtn = screen.getByTitle('Ver oponente siguiente')
    fireEvent.click(nextBtn)
    expect(onSelect).toHaveBeenCalledWith('p3')

    const prevBtn = screen.getByTitle('Ver oponente anterior')
    fireEvent.click(prevBtn)
    expect(onSelect).toHaveBeenCalledWith('p4')
  })
})
