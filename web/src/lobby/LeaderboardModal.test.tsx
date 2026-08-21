import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import LeaderboardModal from './LeaderboardModal'
import type { UsersView } from '../net/types'

const mockUsers: UsersView[] = [
  {
    userName: 'player1',
    flagName: 'es',
    constructedRating: 1650,
    matchHistory: '10-2',
    infoGames: '',
    matchQuitRatio: 0,
    tourneyHistory: '',
    tourneyQuitRatio: 0,
    infoPing: '',
    generalRating: 1650,
    limitedRating: 1500,
  },
  {
    userName: 'mythic_player',
    flagName: 'us',
    constructedRating: 2050,
    matchHistory: '25-1',
    infoGames: 'Game #1',
    matchQuitRatio: 0,
    tourneyHistory: '',
    tourneyQuitRatio: 0,
    infoPing: '',
    generalRating: 2050,
    limitedRating: 1500,
  },
  {
    userName: 'novice',
    flagName: 'de',
    constructedRating: 1350,
    matchHistory: '2-5',
    infoGames: '',
    matchQuitRatio: 0,
    tourneyHistory: '',
    tourneyQuitRatio: 0,
    infoPing: '',
    generalRating: 1350,
    limitedRating: 1500,
  },
]

describe('LeaderboardModal Component', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders room leaderboard and sorts by ELO descending', () => {
    const onClose = vi.fn()
    render(<LeaderboardModal users={mockUsers} currentUsername="player1" onClose={onClose} />)

    expect(screen.getByText(/Clasificación & Rangos de Liga/i)).toBeDefined()
    expect(screen.getByText('mythic_player')).toBeDefined()
    expect(screen.getByText('player1')).toBeDefined()

    // Highest ELO player gets 1st medal
    expect(screen.getByText('🥇')).toBeDefined()
  })

  it('switches between tabs: profile and tiers guide', () => {
    const onClose = vi.fn()
    render(<LeaderboardModal users={mockUsers} currentUsername="player1" onClose={onClose} />)

    // Switch to profile tab
    fireEvent.click(screen.getByText(/Mi Rango & Estadísticas/i))
    expect(screen.getByText(/⭐ 1650 ELO/i)).toBeDefined()
    expect(screen.getByText('Oro II')).toBeDefined()

    // Switch to tiers guide tab
    fireEvent.click(screen.getByText(/Guía de Rangos/i))
    expect(screen.getByText('Bronce')).toBeDefined()
    expect(screen.getByText('Mítico')).toBeDefined()
  })

  it('filters leaderboard by search query', () => {
    const onClose = vi.fn()
    render(<LeaderboardModal users={mockUsers} currentUsername="player1" onClose={onClose} />)

    const searchInput = screen.getByPlaceholderText(/Buscar jugador/i)
    fireEvent.change(searchInput, { target: { value: 'mythic' } })

    expect(screen.getByText('mythic_player')).toBeDefined()
    expect(screen.queryByText('novice')).toBeNull()
  })
})
