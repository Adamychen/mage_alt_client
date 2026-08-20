import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CardPreview from './CardPreview'
import type { CardView } from '../net/types'

vi.mock('../cards/cardImages', () => ({
  awaitImageUrl: vi.fn().mockImplementation(async (card: CardView) => `https://img.test/${card.name}.jpg`),
  isAbilityCard: vi.fn().mockImplementation((card: CardView) => {
    const t = card.mageObjectType ?? ''
    return t.includes('Ability') || t.includes('ABILITY')
  }),
  getSourceCardName: vi.fn().mockImplementation((card: CardView) => {
    if (card.rules?.[0]?.includes('Cloud, Midgar Mercenary')) return 'Cloud, Midgar Mercenary'
    if (card.displayName && card.displayName !== 'Ability') return card.displayName
    if (card.name && card.name !== 'Ability') return card.name
    return 'Habilidad'
  }),
}))

describe('CardPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty hint when card is null', () => {
    const { container } = render(<CardPreview card={null} />)
    expect(container.textContent).toContain('Pasa el cursor')
  })

  it('renders standard card details', () => {
    const card: CardView = {
      name: 'Lightning Bolt',
      manaCostLeftStr: ['{R}'],
      manaValue: 1,
      cardTypes: ['INSTANT'],
      rules: ['Lightning Bolt deals 3 damage to any target.'],
    }
    const { container } = render(<CardPreview card={card} />)
    expect(container.textContent).toContain('Lightning Bolt')
    expect(container.textContent).toContain('{R}')
    expect(container.textContent).toContain('INSTANT')
    expect(container.textContent).toContain('Lightning Bolt deals 3 damage to any target.')
  })

  it('renders multi-face card tabs and toggles between faces', () => {
    const secondFace: CardView = {
      name: 'Petty Theft',
      manaCostLeftStr: ['{1}{U}'],
      manaValue: 2,
      cardTypes: ['INSTANT', 'ADVENTURE'],
      rules: ['Return target nonland permanent an opponent controls to its owner’s hand.'],
    }
    const card: CardView = {
      name: 'Brazen Borrower',
      manaCostLeftStr: ['{1}{U}{U}'],
      manaValue: 3,
      cardTypes: ['CREATURE', 'FAERIE', 'ROGUE'],
      power: '3',
      toughness: '1',
      rules: ['Flash', 'Flying'],
      secondCardFace: secondFace,
    }

    const { container } = render(<CardPreview card={card} />)
    expect(container.textContent).toContain('Brazen Borrower')
    expect(container.textContent).toContain('Cara 1: Brazen Borrower')
    expect(container.textContent).toContain('Petty Theft')
    expect(container.textContent).toContain('Flash')

    // Click on face 2 tab
    const face2Btn = container.querySelectorAll('.face-tab-btn')[1]
    fireEvent.click(face2Btn)

    expect(container.textContent).toContain('Petty Theft')
    expect(container.textContent).toContain('{1}{U}')
    expect(container.textContent).toContain('Return target nonland permanent')
  })

  it('renders ability cards with ability banner and highlighted rules box', () => {
    const ability: CardView = {
      name: 'Goblin Guide',
      displayName: 'Goblin Guide',
      mageObjectType: 'TRIGGERED_ABILITY',
      abilityType: 'Triggered',
      manaValue: 0,
      rules: ['Whenever Goblin Guide attacks, defending player reveals the top card of their library.'],
    }

    const { container } = render(<CardPreview card={ability} />)
    expect(container.textContent).toContain('Habilidad disparada')
    expect(container.textContent).toContain('Fuente: Goblin Guide')
    expect(container.textContent).toContain('Texto de la habilidad:')
    expect(container.textContent).toContain('Whenever Goblin Guide attacks')
  })

  it('extracts source card name for Cloud, Midgar Mercenary when name is "Ability"', () => {
    const ability: CardView = {
      name: 'Ability',
      mageObjectType: 'TRIGGERED_ABILITY',
      abilityType: 'Triggered',
      manaValue: 0,
      rules: ['When Cloud, Midgar Mercenary enters, search your library for an Equipment card, reveal it, put it into your hand, then shuffle.'],
    }

    const { container } = render(<CardPreview card={ability} />)
    expect(container.textContent).toContain('Fuente: Cloud, Midgar Mercenary')
    expect(container.textContent).toContain('Cloud, Midgar Mercenary')
    expect(container.textContent).not.toContain('Fuente: Ability')
  })
})
