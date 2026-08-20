import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SideboardScreen from './SideboardScreen'
import { reset } from '../state/store'
import { setState } from '../state/state'
import type { SideboardScreenState } from '../state/state'

vi.mock('../net/commands', () => ({
  submitDeck: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('../cards/cardImages', () => ({
  awaitCardMeta: vi.fn().mockResolvedValue({ name: 'Test Card', typeLine: 'Creature', manaCost: '{1}{G}', imageUrl: 'https://img.test/card.jpg' }),
}))

function makeScreen(overrides: Partial<SideboardScreenState> = {}): SideboardScreenState {
  return {
    deckName: 'Test Deck',
    maindeck: [
      { instanceId: 'i-1', setCode: 'IMA', cardNumber: '165', name: 'Grizzly Bears' },
      { instanceId: 'i-2', setCode: 'M10', cardNumber: '147', name: 'Lightning Bolt' },
      { instanceId: 'i-3', setCode: 'M21', cardNumber: '237', name: 'Island' },
    ],
    sideboard: [
      { instanceId: 'i-4', setCode: 'M21', cardNumber: '59', name: 'Negate' },
    ],
    tableId: 'table-1',
    parentTableId: null,
    timeLeft: 180,
    limited: false,
    ...overrides,
  }
}

describe('SideboardScreen', () => {
  beforeEach(() => {
    reset()
    vi.clearAllMocks()
  })

  it('does not render when sideboardScreen is null', () => {
    const { container } = render(<SideboardScreen />)
    expect(container.querySelector('.sideboard-backdrop')).toBeNull()
  })

  it('renders when sideboardScreen is set', () => {
    setState({ sideboardScreen: makeScreen() })
    const { container } = render(<SideboardScreen />)
    expect(container.querySelector('.sideboard-backdrop')).toBeTruthy()
    expect(container.textContent).toContain('Test Deck')
  })

  it('shows card names in maindeck and sideboard columns', () => {
    setState({ sideboardScreen: makeScreen() })
    const { container } = render(<SideboardScreen />)
    expect(container.textContent).toContain('Grizzly Bears')
    expect(container.textContent).toContain('Lightning Bolt')
    expect(container.textContent).toContain('Island')
    expect(container.textContent).toContain('Negate')
  })

  it('shows timer', () => {
    setState({ sideboardScreen: makeScreen({ timeLeft: 120 }) })
    const { container } = render(<SideboardScreen />)
    expect(container.textContent).toContain('2:00')
  })

  it('submit button is present', () => {
    setState({ sideboardScreen: makeScreen() })
    const { container } = render(<SideboardScreen />)
    expect(container.textContent).toContain('Enviar mazo')
  })

  it('shows filter when more than 10 cards in maindeck', () => {
    const maindeck = Array.from({ length: 12 }, (_, i) => ({
      instanceId: `i-${i}`, setCode: 'TEST', cardNumber: String(i), name: `Card ${i}`,
    }))
    setState({ sideboardScreen: makeScreen({ maindeck }) })
    const { container } = render(<SideboardScreen />)
    expect(container.querySelector('.sideboard-filter')).toBeTruthy()
  })
})
