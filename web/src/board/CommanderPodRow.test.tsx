import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CommanderPodRow from './CommanderPodRow'
import type { PlayerView } from '../net/types'

describe('CommanderPodRow', () => {
  const mockOpponents = [
    {
      playerId: 'p2',
      name: 'Alice',
      life: 40,
      controlled: false,
      battlefield: {},
      graveyard: {},
    },
    {
      playerId: 'p3',
      name: 'Bob',
      life: 38,
      controlled: false,
      battlefield: {},
      graveyard: {},
    },
    {
      playerId: 'p4',
      name: 'Charlie',
      life: 32,
      controlled: false,
      battlefield: {},
      graveyard: {},
    },
  ] as unknown as PlayerView[]

  it('renders quick-nav pills for all opponents', () => {
    render(
      <CommanderPodRow
        opponents={mockOpponents}
        targetIds={new Set()}
        getRevealedCards={() => ({})}
        activePlayerId="p2"
      />
    )

    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Charlie').length).toBeGreaterThan(0)
    expect(screen.getByText('TURNO')).toBeDefined()
  })

  it('renders slides and navigation buttons', () => {
    const { container } = render(
      <CommanderPodRow
        opponents={mockOpponents}
        targetIds={new Set()}
        getRevealedCards={() => ({})}
      />
    )

    const slides = container.querySelectorAll('.pod-opponent-slide')
    expect(slides.length).toBe(3)
  })
})
