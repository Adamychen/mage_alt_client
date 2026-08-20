import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StackZone from './StackZone'
import type { CardView } from '../net/types'

vi.mock('../cards/cardImages', () => ({
  awaitImageUrl: vi.fn().mockResolvedValue('https://img.test/card.jpg'),
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
  cardName: vi.fn().mockImplementation((card: CardView) => {
    if (card.rules?.[0]?.includes('Cloud, Midgar Mercenary')) return 'Cloud, Midgar Mercenary'
    if (card.displayName && card.displayName !== 'Ability') return card.displayName
    if (card.name && card.name !== 'Ability') return card.name
    return 'Habilidad'
  }),
}))

describe('StackZone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty when stack is null or empty', () => {
    const { container } = render(<StackZone stack={null} />)
    expect(container.querySelector('.stack-zone.empty')).toBeTruthy()
  })

  it('renders single spell on the stack as top item', () => {
    const stack: Record<string, CardView> = {
      'spell-1': {
        name: 'Lightning Bolt',
        cardTypes: ['INSTANT'],
        manaValue: 1,
        rules: ['Lightning Bolt deals 3 damage to any target.'],
      },
    }

    const { container } = render(
      <StackZone stack={stack} canResolve={true} onResolveClick={vi.fn()} />,
    )

    expect(container.textContent).toContain('Pila (1)')
    expect(container.textContent).toContain('Lightning Bolt')
    expect(container.textContent).toContain('Instantáneo')
    expect(container.querySelector('.stack-resolve-btn')).toBeTruthy()
  })

  it('renders multiple spells in cascade with newest on top', () => {
    const stack: Record<string, CardView> = {
      'spell-1': {
        name: 'Lightning Bolt',
        cardTypes: ['INSTANT'],
        manaValue: 1,
      },
      'spell-2': {
        name: 'Counterspell',
        cardTypes: ['INSTANT'],
        manaValue: 2,
        rules: ['Counter target spell.'],
      },
    }

    const { container } = render(<StackZone stack={stack} canResolve={true} />)

    expect(container.textContent).toContain('Pila (2)')
    // Counterspell was added second, so it resolves first (top)
    const topItem = container.querySelector('.stack-item--top')
    expect(topItem?.textContent).toContain('Counterspell')

    // Lightning Bolt is the underlying item
    const underlying = container.querySelector('.stack-item--underlying')
    expect(underlying?.textContent).toContain('Lightning Bolt')
  })

  it('triggers onCardClick and onHover when interacting with stack items', () => {
    const onCardClick = vi.fn()
    const onHover = vi.fn()

    const stack: Record<string, CardView> = {
      'spell-1': {
        name: 'Lightning Bolt',
        cardTypes: ['INSTANT'],
        manaValue: 1,
      },
      'spell-2': {
        name: 'Counterspell',
        cardTypes: ['INSTANT'],
        manaValue: 2,
      },
    }

    const { container } = render(
      <StackZone stack={stack} onCardClick={onCardClick} onHover={onHover} />,
    )

    const underlying = container.querySelector('.stack-item--underlying')!
    fireEvent.click(underlying)
    expect(onCardClick).toHaveBeenCalledWith('spell-1')

    fireEvent.mouseEnter(underlying)
    expect(onHover).toHaveBeenCalledWith(stack['spell-1'], expect.anything())
  })

  it('renders ability capsules with resolved source name', () => {
    const stack: Record<string, CardView> = {
      'ab-1': {
        name: 'Ability',
        mageObjectType: 'TRIGGERED_ABILITY',
        abilityType: 'Triggered',
        manaValue: 0,
        rules: ['When Cloud, Midgar Mercenary enters, search your library for an Equipment card...'],
      },
    }

    const { container } = render(<StackZone stack={stack} />)
    expect(container.textContent).toContain('Cloud, Midgar Mercenary')
    expect(container.textContent).toContain('Habilidad disparada')
    expect(container.textContent).not.toContain('Ability')
  })
})
