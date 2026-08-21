import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import FinishedMatchesPanel, {
  parseMatchResult,
  formatMatchDuration,
  formatRelativeTime,
} from './FinishedMatchesPanel'
import type { MatchView, UsersView } from '../net/types'
import * as commands from '../net/commands'

vi.mock('../net/commands', () => ({
  getFinishedMatches: vi.fn(),
  replayGame: vi.fn(),
}))

const mockMatches: MatchView[] = [
  {
    tableId: 't1',
    matchId: 'm1',
    matchName: 'Standard Bo3 Match',
    gameType: 'Two Player Duel',
    deckType: 'Constructed - Standard',
    games: ['g1', 'g2'],
    result: 'Alice [2-1], Bob [1-2]',
    players: 'Alice, Bob',
    startTime: Date.now() - 1000 * 60 * 20,
    endTime: Date.now() - 1000 * 60 * 5,
    rated: true,
    replayAvailable: true,
  },
  {
    tableId: 't2',
    matchId: 'm2',
    matchName: 'Draft Finals',
    gameType: 'Two Player Duel',
    deckType: 'Limited - Booster Draft',
    games: ['g3'],
    result: 'Chandra [2-0], Jace [quit]',
    players: 'Chandra, Jace [quit]',
    startTime: Date.now() - 1000 * 60 * 45,
    endTime: Date.now() - 1000 * 60 * 30,
    rated: false,
    isTournament: true,
    replayAvailable: true,
  },
]

const mockUsers: UsersView[] = [
  {
    userName: 'Alice',
    avatarId: 10,
    flagName: 'es',
    constructedRating: 1650,
    limitedRating: 1500,
    generalRating: 1600,
    matchHistory: '10',
    matchQuitRatio: 0,
    tourneyHistory: '0',
    tourneyQuitRatio: 0,
    infoGames: '',
    infoPing: '30ms',
  },
  {
    userName: 'Bob',
    avatarId: 20,
    flagName: 'us',
    constructedRating: 1550,
    limitedRating: 1500,
    generalRating: 1550,
    matchHistory: '5',
    matchQuitRatio: 0,
    tourneyHistory: '0',
    tourneyQuitRatio: 0,
    infoGames: '',
    infoPing: '45ms',
  },
]

describe('FinishedMatchesPanel helpers', () => {
  it('parses standard match result and determines winner', () => {
    const scores = parseMatchResult('Alice [2-1], Bob [1-2]', 'Alice, Bob')
    expect(scores).toHaveLength(2)
    expect(scores[0]).toEqual({
      name: 'Alice',
      wins: 2,
      losses: 1,
      draws: 0,
      isWinner: true,
    })
    expect(scores[1]).toEqual({
      name: 'Bob',
      wins: 1,
      losses: 2,
      draws: 0,
    })
  })

  it('parses quit status from players string', () => {
    const scores = parseMatchResult('', 'Alice, Bob [quit]')
    expect(scores).toHaveLength(2)
    expect(scores[1].quit).toBe(true)
  })

  it('formats match duration properly', () => {
    const start = 1000000
    const end = 1000000 + 1000 * 60 * 14 + 1000 * 25 // 14m 25s
    expect(formatMatchDuration(start, end)).toBe('14m 25s')
  })

  it('formats relative time properly', () => {
    const now = Date.now()
    expect(formatRelativeTime(now - 1000 * 30)).toBe('Hace un momento')
    expect(formatRelativeTime(now - 1000 * 60 * 10)).toBe('Hace 10 min')
  })
})

describe('FinishedMatchesPanel component', () => {
  beforeEach(() => {
    vi.mocked(commands.getFinishedMatches).mockResolvedValue(mockMatches)
    vi.mocked(commands.replayGame).mockResolvedValue({ ok: true } as never)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders finished matches cards with player names and scores', async () => {
    render(<FinishedMatchesPanel roomId="room-1" users={mockUsers} />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Bob').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Chandra').length).toBeGreaterThan(0)
    })

    expect(screen.getAllByText(/Constructed - Standard/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/⭐ Ranked/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/🏆 Torneo/i).length).toBeGreaterThan(0)
  })

  it('filters matches by search query', async () => {
    render(<FinishedMatchesPanel roomId="room-1" users={mockUsers} />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    })

    const searchInput = screen.getAllByPlaceholderText(/Buscar por jugador/i)[0]
    fireEvent.change(searchInput, { target: { value: 'Chandra' } })

    expect(screen.getAllByText('Chandra').length).toBeGreaterThan(0)
    expect(screen.queryByText('Alice')).toBeNull()
  })

  it('filters matches by filter chips (Ranked and Torneos)', async () => {
    render(<FinishedMatchesPanel roomId="room-1" users={mockUsers} />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    })

    // Click Ranked filter chip (the button element)
    const rankedChip = screen.getAllByRole('button', { name: /⭐ Ranked/i })[0]
    fireEvent.click(rankedChip)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.queryByText('Chandra')).toBeNull()

    // Click Torneos filter chip (the button element)
    const torneosChip = screen.getAllByRole('button', { name: /🏆 Torneos/i })[0]
    fireEvent.click(torneosChip)
    expect(screen.getAllByText('Chandra').length).toBeGreaterThan(0)
    expect(screen.queryByText('Alice')).toBeNull()
  })

  it('triggers replay on button click', async () => {
    render(<FinishedMatchesPanel roomId="room-1" users={mockUsers} />)

    await waitFor(() => {
      expect(screen.getAllByText(/Repetición J1/i).length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText(/Repetición J1/i)[0])
    expect(commands.replayGame).toHaveBeenCalledWith('g1')
  })
})
