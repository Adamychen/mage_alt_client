import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import OpponentZone from './OpponentZone'
import type { CardView, PlayerView } from '../net/types'

describe('OpponentZone', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders face-down cards when no revealed cards are known', () => {
    const oppPlayer: Partial<PlayerView> = {
      playerId: 'p-opp',
      name: 'Computer',
      life: 20,
      handCount: 3,
      controlled: false,
      hasPriority: false,
      isActive: false,
      libraryCount: 40,
      battlefield: {},
    }

    const { container } = render(
      <OpponentZone player={oppPlayer as PlayerView} />
    )

    const faceDownCards = container.querySelectorAll('.card-slot.face-down')
    expect(faceDownCards.length).toBe(3)
  })

  it('renders known cards face-up and remaining cards face-down', () => {
    const oppPlayer: Partial<PlayerView> = {
      playerId: 'p-opp',
      name: 'Computer',
      life: 18,
      handCount: 4,
      controlled: false,
      hasPriority: false,
      isActive: false,
      libraryCount: 38,
      battlefield: {},
    }

    const revealedCards: Record<string, CardView> = {
      'card-bolt': {
        id: 'card-bolt',
        name: 'Lightning Bolt',
        manaCostLeftStr: ['{R}'],
        manaValue: 1,
        cardTypes: ['INSTANT'],
      },
      'card-counter': {
        id: 'card-counter',
        name: 'Counterspell',
        manaCostLeftStr: ['{U}{U}'],
        manaValue: 2,
        cardTypes: ['INSTANT'],
      },
    }

    const { container, getByText } = render(
      <OpponentZone player={oppPlayer as PlayerView} revealedCards={revealedCards} />
    )

    // 2 known cards face-up + 2 unknown cards face-down = 4 total cards in hand
    expect(getByText('Lightning Bolt')).not.toBeNull()
    expect(getByText('Counterspell')).not.toBeNull()

    const faceDownCards = container.querySelectorAll('.card-slot.face-down')
    expect(faceDownCards.length).toBe(2) // 4 - 2 = 2 face-down
  })

  it('nests attached auras/equipment under host creatures', () => {
    const oppPlayer: Partial<PlayerView> = {
      playerId: 'p-opp',
      name: 'Computer',
      life: 20,
      handCount: 2,
      controlled: false,
      battlefield: {
        'creature-1': {
          id: 'creature-1',
          name: 'Grizzly Bears',
          cardTypes: ['CREATURE'],
          power: '2',
          toughness: '2',
          attachments: ['aura-1'],
        } as any,
        'aura-1': {
          id: 'aura-1',
          name: 'Pacifism',
          cardTypes: ['ENCHANTMENT'],
          attachedTo: 'creature-1',
        } as any,
      },
    }

    const { container, getByText } = render(
      <OpponentZone player={oppPlayer as PlayerView} />
    )

    // Creature with attachment group
    expect(container.querySelector('.card-attachment-group')).not.toBeNull()
    expect(getByText('Grizzly Bears')).not.toBeNull()
    expect(getByText('Pacifism')).not.toBeNull()

    // Aura should be nested in attachments-list and not in permanents-band
    const permBand = container.querySelector('.permanents-band')
    expect(permBand?.querySelectorAll('.card-slot').length).toBe(0)
  })

  it('renders opponent commander in command zone', () => {
    const oppPlayer: Partial<PlayerView> = {
      playerId: 'p-opp',
      name: 'OpponentCommander',
      life: 40,
      handCount: 7,
      controlled: false,
      commandList: [
        {
          id: 'cmd-urza',
          name: 'Urza, Lord High Artificer',
          manaValue: 4,
          castCount: 0,
          mageObjectType: 'COMMANDER',
        } as any,
      ],
      battlefield: {},
    }

    const { container, getByText } = render(
      <OpponentZone player={oppPlayer as PlayerView} />
    )

    expect(container.querySelector('.command-zone.opp')).not.toBeNull()
    expect(container.querySelector('.commander-badge')).not.toBeNull()
    expect(getByText('Urza, Lord High Artificer')).not.toBeNull()
  })
})
