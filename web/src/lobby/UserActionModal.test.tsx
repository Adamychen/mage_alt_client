import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import UserActionModal from './UserActionModal'
import type { UsersView, TableView } from '../net/types'

describe('UserActionModal', () => {
  afterEach(cleanup)
  const mockUser: UsersView = {
    flagName: 'es',
    userName: 'Chandra_Fan',
    matchHistory: '15-3',
    matchQuitRatio: 0,
    tourneyHistory: '2-0',
    tourneyQuitRatio: 0,
    infoGames: 'Game #101',
    infoPing: '45ms',
    generalRating: 1850,
    constructedRating: 1850,
    limitedRating: 1600,
    avatarId: 11,
  }

  const mockTables = [
    {
      tableId: 't-101',
      tableName: 'Standard Duel #1',
      gameType: 'Two Player Duel',
      deckType: 'Standard',
      isTournament: false,
      tableState: 'DUELING',
      controllerName: 'Chandra_Fan',
      seats: [
        {
          seatIndex: 0,
          playerName: 'Chandra_Fan',
          playerType: 'HUMAN',
          history: '15-3',
          flagName: 'es',
        },
      ],
      spectatorsAllowed: true,
      createTime: 1787300000,
      rated: true,
    },
  ] as unknown as TableView[]

  it('renders user details, rank badge, and action buttons', () => {
    render(
      <UserActionModal
        user={mockUser}
        currentUsername="JaceHero"
        tables={mockTables}
        onWhisper={vi.fn()}
        onViewLeaderboard={vi.fn()}
        onWatchTable={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Chandra_Fan')).toBeDefined()
    expect(screen.getByText(/1850/)).toBeDefined()
    expect(screen.getByText('Enviar Susurro Privado')).toBeDefined()
    expect(screen.getByText('Espectar Partida')).toBeDefined()
    expect(screen.getByText('Ver Perfil y Rango de Liga')).toBeDefined()
    expect(screen.getByText('Ignorar / Silenciar Usuario')).toBeDefined()
  })

  it('triggers onWhisper when clicking the whisper button', () => {
    const onWhisper = vi.fn()
    const onClose = vi.fn()
    render(
      <UserActionModal
        user={mockUser}
        currentUsername="JaceHero"
        tables={mockTables}
        onWhisper={onWhisper}
        onViewLeaderboard={vi.fn()}
        onWatchTable={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByText('Enviar Susurro Privado'))
    expect(onWhisper).toHaveBeenCalledWith('Chandra_Fan')
    expect(onClose).toHaveBeenCalled()
  })

  it('triggers onWatchTable when clicking spectate button', () => {
    const onWatchTable = vi.fn()
    const onClose = vi.fn()
    render(
      <UserActionModal
        user={mockUser}
        currentUsername="JaceHero"
        tables={mockTables}
        onWhisper={vi.fn()}
        onViewLeaderboard={vi.fn()}
        onWatchTable={onWatchTable}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByText('Espectar Partida'))
    expect(onWatchTable).toHaveBeenCalledWith('t-101')
    expect(onClose).toHaveBeenCalled()
  })

  it('triggers ignore command when clicking ignore button', () => {
    const onClose = vi.fn()
    render(
      <UserActionModal
        user={mockUser}
        currentUsername="JaceHero"
        tables={mockTables}
        onWhisper={vi.fn()}
        onViewLeaderboard={vi.fn()}
        onWatchTable={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByText('Ignorar / Silenciar Usuario'))
    expect(onClose).toHaveBeenCalled()
  })
})
