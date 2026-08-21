import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CardFlightOverlay from './CardFlightOverlay'
import type { GameView } from '../net/types'
import { createRef } from 'react'

describe('CardFlightOverlay', () => {
  it('renders without crashing with null game', () => {
    const ref = createRef<HTMLDivElement>()
    const { container } = render(<CardFlightOverlay game={null} boardRef={ref} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders cleanly with initial game view', () => {
    const ref = createRef<HTMLDivElement>()
    const initialGame = {
      gameId: 'g1',
      turn: 1,
      step: 'PRECOMBAT_MAIN',
      players: [
        {
          playerId: 'p1',
          name: 'Player 1',
          controlled: true,
          life: 20,
          hand: {
            c1: { id: 'c1', name: 'Mountain', manaValue: 0, expansionSetCode: 'LEA', cardNumber: '299' },
          },
          battlefield: {},
          graveyard: {},
        },
      ],
    } as unknown as GameView

    const { container } = render(<CardFlightOverlay game={initialGame} boardRef={ref} />)
    expect(container.firstChild).toBeNull()
  })
})
