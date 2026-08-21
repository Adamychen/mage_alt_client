import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CombatArrowsOverlay from './CombatArrowsOverlay'

describe('CombatArrowsOverlay', () => {
  it('renders nothing when there are no arrows', () => {
    const dummyRef = { current: null }
    const { container } = render(
      <CombatArrowsOverlay
        game={null}
        boardRef={dummyRef}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders attack arrows when combat groups contain attackers and defender', () => {
    const boardDiv = document.createElement('div')
    document.body.appendChild(boardDiv)

    const attCard = document.createElement('div')
    attCard.setAttribute('data-card-id', 'card-goblin-1')
    attCard.getBoundingClientRect = () => ({ left: 100, top: 400, width: 100, height: 140, right: 200, bottom: 540, x: 100, y: 400, toJSON: () => {} } as DOMRect)

    const oppAvatar = document.createElement('div')
    oppAvatar.setAttribute('data-player-id', 'p-opp')
    oppAvatar.getBoundingClientRect = () => ({ left: 100, top: 50, width: 60, height: 60, right: 160, bottom: 110, x: 100, y: 50, toJSON: () => {} } as DOMRect)

    boardDiv.appendChild(attCard)
    boardDiv.appendChild(oppAvatar)
    boardDiv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => {} } as DOMRect)

    const boardRef = { current: boardDiv }

    const fakeGame = {
      step: 'DECLARE_BLOCKERS',
      turn: 3,
      activePlayer: 'player1',
      priorityPlayer: 'player1',
      myPlayerId: 'p-me',
      combat: [
        {
          attackers: { 'card-goblin-1': {} as any },
          defenderId: 'p-opp',
        } as any,
      ],
      players: [
        { playerId: 'p-me', name: 'player1', life: 20, controlled: true, hasPriority: true, isActive: true, libraryCount: 40, handCount: 5 } as any,
        { playerId: 'p-opp', name: 'Computer', life: 19, controlled: false, hasPriority: false, isActive: false, libraryCount: 40, handCount: 5 } as any,
      ],
    }

    const { container, unmount } = render(
      <CombatArrowsOverlay
        game={fakeGame as any}
        boardRef={boardRef}
      />
    )

    const overlay = container.querySelector('.combat-arrows-overlay')
    expect(overlay).not.toBeNull()
    const attackPath = container.querySelector('.arrow-path.arrow-attack')
    expect(attackPath).not.toBeNull()

    unmount()
    boardDiv.remove()
  })
})
