import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import LeaderboardModal from './LeaderboardModal'
import { addIgnoredUser, resetIgnoredUsersForTest } from './ignoreList'
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
  beforeEach(() => {
    resetIgnoredUsersForTest()
  })

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
    expect(screen.getAllByText('Oro II').length).toBeGreaterThan(0)

    // Switch to tiers guide tab
    fireEvent.click(screen.getByText(/Guía de Rangos/i))
    expect(screen.getByText('Bronce')).toBeDefined()
    expect(screen.getAllByText('Mítico').length).toBeGreaterThan(0)
  })

  it('filters leaderboard by search query', () => {
    const onClose = vi.fn()
    render(<LeaderboardModal users={mockUsers} currentUsername="player1" onClose={onClose} />)

    const searchInput = screen.getByPlaceholderText(/Buscar jugador/i)
    fireEvent.change(searchInput, { target: { value: 'mythic' } })

    expect(screen.getByText('mythic_player')).toBeDefined()
    expect(screen.queryByText('novice')).toBeNull()
  })

  it('opens target user profile when initialTargetUsername and initialTab="profile" are passed', () => {
    const onClose = vi.fn()
    render(
      <LeaderboardModal
        users={mockUsers}
        currentUsername="player1"
        initialTargetUsername="mythic_player"
        initialTab="profile"
        onClose={onClose}
      />,
    )

    expect(screen.getByText(/Estás inspeccionando el perfil de/i)).toBeDefined()
    expect(screen.getAllByText('mythic_player').length).toBeGreaterThan(0)
    expect(screen.getByText(/⭐ 2050 ELO/i)).toBeDefined()
    expect(screen.getAllByText('Mítico').length).toBeGreaterThan(0)
  })

  it('renders ignored users in my profile and allows unignoring', () => {
    addIgnoredUser('annoying_guy')
    const onClose = vi.fn()
    render(
      <LeaderboardModal
        users={mockUsers}
        currentUsername="player1"
        initialTab="profile"
        onClose={onClose}
      />,
    )

    expect(screen.getByText(/Jugadores Ignorados & Silenciados \(1\)/i)).toBeDefined()
    expect(screen.getByText(/annoying_guy/i)).toBeDefined()

    // Click unlock / unignore
    fireEvent.click(screen.getByText('🔓 Desbloquear'))
    expect(screen.getByText(/No tienes a ningún jugador en tu lista/i)).toBeDefined()
  })
})
