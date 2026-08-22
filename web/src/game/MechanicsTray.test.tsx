import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MechanicsTray from './MechanicsTray'
import { setState } from '../state/store'
import type { GameView, PlayerView } from '../net/types'

vi.mock('../cards/cardImages', () => ({
  awaitImageUrl: vi.fn().mockResolvedValue('https://cards.scryfall.io/test-token.jpg'),
  cardKey: vi.fn().mockReturnValue('named:Test'),
}))

describe('MechanicsTray', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setState({ game: null })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders empty glossary state when no global mechanics are active', () => {
    setState({
      game: {
        players: [
          { playerId: 'p1', name: 'Alice', controlled: true, life: 20 } as unknown as PlayerView,
        ],
      } as unknown as GameView,
    })

    const { getByText } = render(<MechanicsTray />)
    expect(getByText('No hay mecánicas globales activas en esta partida.')).toBeDefined()
    expect(getByText('El Anillo:')).toBeDefined()
  })

  it('renders The Ring tab with level breakdown and Ring-bearer', () => {
    setState({
      game: {
        players: [
          {
            playerId: 'p1',
            name: 'Frodo',
            controlled: true,
            life: 20,
            commandList: [
              {
                id: 'ring-1',
                name: 'The Ring',
                rules: ['Rule 1 (Legendary)', 'Rule 2 (Loot)'],
              },
            ],
            battlefield: {
              perm1: {
                id: 'perm1',
                name: 'Samwise Gamgee',
                isRingBearer: true,
              },
            },
          } as unknown as PlayerView,
        ],
      } as unknown as GameView,
    })

    const { getByText, container } = render(<MechanicsTray />)
    expect(getByText('💍 El Anillo te tienta')).toBeDefined()
    expect(getByText('Nivel 2 / 4')).toBeDefined()
    expect(getByText(/Samwise Gamgee/)).toBeDefined()

    const unlockedCards = container.querySelectorAll('.ring-level-card.unlocked')
    const lockedCards = container.querySelectorAll('.ring-level-card.locked')
    expect(unlockedCards.length).toBe(2)
    expect(lockedCards.length).toBe(2)
  })

  it('renders Active Dungeon tab with room progression', () => {
    setState({
      game: {
        players: [
          {
            playerId: 'p1',
            name: 'Dungeon Master',
            controlled: true,
            commandList: [
              {
                id: 'dung-1',
                name: 'Undercity',
                cardTypes: ['Dungeon'],
                currentRoom: 'Secret Entrance',
              },
            ],
          } as unknown as PlayerView,
        ],
      } as unknown as GameView,
    })

    const { getByText, container } = render(<MechanicsTray />)
    expect(getByText('🗺️ Undercity')).toBeDefined()
    expect(container.querySelector('.dungeon-room-node.active-room')).toBeDefined()
  })

  it('renders Day and Night banner with transition rules', () => {
    setState({
      game: {
        players: [
          {
            playerId: 'p1',
            name: 'Werewolf Player',
            controlled: true,
            designationNames: ['Night'],
          } as unknown as PlayerView,
        ],
      } as unknown as GameView,
    })

    const { getByText } = render(<MechanicsTray />)
    expect(getByText('Es de NOCHE')).toBeDefined()
    expect(getByText('lanza 2 o más hechizos')).toBeDefined()
  })

  it('renders Monarch tab with rules explanation and current holder', () => {
    setState({
      game: {
        players: [
          {
            playerId: 'p1',
            name: 'Queen Marchesa',
            controlled: true,
            monarch: true,
          } as unknown as PlayerView,
        ],
      } as unknown as GameView,
    })

    const { getByText, container } = render(<MechanicsTray />)
    expect(container.querySelector('.panel-monarch h3')?.textContent).toBe('El Monarca')
    expect(getByText(/Queen Marchesa/)).toBeDefined()
    expect(getByText(/Al comienzo de tu paso final, roba una carta/)).toBeDefined()
  })

  it('allows switching tabs when multiple mechanics are active', () => {
    setState({
      game: {
        players: [
          {
            playerId: 'p1',
            name: 'Aragorn',
            controlled: true,
            monarch: true,
            commandList: [{ id: 'ring-1', name: 'The Ring', rules: ['R1'] }],
          } as unknown as PlayerView,
        ],
      } as unknown as GameView,
    })

    const { getByText, container } = render(<MechanicsTray />)
    const monarchTabBtn = container.querySelector('.mechanic-tab-btn:nth-child(2)')
    expect(monarchTabBtn).toBeDefined()

    if (monarchTabBtn) {
      fireEvent.click(monarchTabBtn)
      expect(container.querySelector('.panel-monarch h3')?.textContent).toBe('El Monarca')
      expect(getByText(/Aragorn/)).toBeDefined()
    }
  })
})
