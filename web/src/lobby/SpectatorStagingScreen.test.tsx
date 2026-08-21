import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SpectatorStagingScreen from './SpectatorStagingScreen'
import type { TableView } from '../net/types'

afterEach(() => {
  cleanup()
})

vi.mock('./ChatBox', () => ({
  default: () => <div data-testid="chat-box-stub">Chat Stub</div>,
}))

const MOCK_DUEL_TABLE: TableView = {
  tableId: 'table-duel-1',
  tableName: "Alice's Showdown",
  controllerName: 'Alice',
  gameType: 'Two Player Duel',
  deckType: 'Constructed - Modern',
  additionalInfoShort: '',
  additionalInfoFull: '',
  createTime: Date.now(),
  tableState: 'WAITING',
  skillLevel: 'CASUAL',
  tableStateText: 'Waiting for players',
  seatsInfo: '1/2',
  isTournament: false,
  seats: [
    { playerName: 'Alice', seatIndex: 0, playerType: 'HUMAN' },
    { playerName: '', seatIndex: 1, playerType: 'HUMAN' },
  ],
  games: [],
  quitRatio: '0%',
  minimumRating: '0',
  limited: false,
  rated: true,
  passworded: false,
  spectatorsAllowed: true,
}

const MOCK_COMMANDER_TABLE: TableView = {
  tableId: 'table-comm-1',
  tableName: 'Epic Commander Pod',
  controllerName: 'Bob',
  gameType: 'Commander Free For All',
  deckType: 'Constructed - Commander',
  additionalInfoShort: '',
  additionalInfoFull: '',
  createTime: Date.now(),
  tableState: 'READY_TO_START',
  skillLevel: 'SERIOUS',
  tableStateText: 'Ready to start',
  seatsInfo: '4/4',
  isTournament: false,
  seats: [
    { playerName: 'Bob', seatIndex: 0, playerType: 'HUMAN' },
    { playerName: 'Charlie', seatIndex: 1, playerType: 'HUMAN' },
    { playerName: 'Diana', seatIndex: 2, playerType: 'HUMAN' },
    { playerName: 'Evan', seatIndex: 3, playerType: 'HUMAN' },
  ],
  games: [],
  quitRatio: '0%',
  minimumRating: '0',
  limited: false,
  rated: false,
  passworded: true,
  spectatorsAllowed: true,
}

describe('SpectatorStagingScreen', () => {
  it('renders 1v1 duel staging with player and VS indicator', () => {
    const { getByText } = render(<SpectatorStagingScreen table={MOCK_DUEL_TABLE} />)

    expect(getByText("Alice's Showdown")).not.toBeNull()
    expect(getByText('👁️ MODO ESPECTADOR')).not.toBeNull()
    expect(getByText('Alice')).not.toBeNull()
    expect(getByText('VS')).not.toBeNull()
    expect(getByText('Esperando oponente…')).not.toBeNull()
    expect(getByText('⏳ Esperando a que se completen las plazas de la mesa…')).not.toBeNull()
  })

  it('renders multiplayer Commander pod with all 4 players and ready banner', () => {
    const { getByText } = render(<SpectatorStagingScreen table={MOCK_COMMANDER_TABLE} />)

    expect(getByText('Epic Commander Pod')).not.toBeNull()
    expect(getByText('Bob')).not.toBeNull()
    expect(getByText('Charlie')).not.toBeNull()
    expect(getByText('Diana')).not.toBeNull()
    expect(getByText('Evan')).not.toBeNull()
    expect(getByText('🔒 Privada')).not.toBeNull()
    expect(getByText('✨ Todos los jugadores están listos. Esperando a que el anfitrión inicie la partida…')).not.toBeNull()
  })

  it('triggers onLeave when clicking Leave button', () => {
    const onLeaveSpy = vi.fn()
    const { getByText } = render(<SpectatorStagingScreen table={MOCK_DUEL_TABLE} onLeave={onLeaveSpy} />)

    const leaveBtn = getByText('🚪 Volver al Lobby')
    fireEvent.click(leaveBtn)
    expect(onLeaveSpy).toHaveBeenCalled()
  })
})
