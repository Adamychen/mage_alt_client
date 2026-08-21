import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TableFilterBar, {
  INITIAL_TABLE_FILTERS,
  filterTables,
} from './TableFilterBar'
import { formatDeckTypeName } from './LobbyScreen'
import type { TableView } from '../net/types'

afterEach(() => {
  cleanup()
})

const MOCK_TABLES: TableView[] = [
  {
    tableId: 't-1',
    tableName: "Alice's Modern Duel",
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
    rated: false,
    passworded: false,
    spectatorsAllowed: true,
  },
  {
    tableId: 't-2',
    tableName: 'Epic Commander Pod',
    controllerName: 'Bob',
    gameType: 'Commander Free For All',
    deckType: 'Constructed - Commander',
    additionalInfoShort: 'Casual EDH fun',
    additionalInfoFull: '',
    createTime: Date.now(),
    tableState: 'DUELING',
    skillLevel: 'BEGINNER',
    tableStateText: 'Dueling',
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
    rated: true,
    passworded: true,
    spectatorsAllowed: true,
  },
  {
    tableId: 't-3',
    tableName: 'Competitive Standard',
    controllerName: 'Charlie',
    gameType: 'Two Player Duel',
    deckType: 'Constructed - Standard',
    additionalInfoShort: '',
    additionalInfoFull: '',
    createTime: Date.now(),
    tableState: 'WAITING',
    skillLevel: 'SERIOUS',
    tableStateText: 'Waiting for players',
    seatsInfo: '1/2',
    isTournament: false,
    seats: [
      { playerName: 'Charlie', seatIndex: 0, playerType: 'HUMAN' },
      { playerName: '', seatIndex: 1, playerType: 'COMPUTER_MAD' },
    ],
    games: [],
    quitRatio: '0%',
    minimumRating: '0',
    limited: false,
    rated: true,
    passworded: false,
    spectatorsAllowed: false,
  },
]

describe('filterTables logic', () => {
  it('returns all tables when initial filters are active', () => {
    const res = filterTables(MOCK_TABLES, INITIAL_TABLE_FILTERS)
    expect(res.length).toBe(3)
  })

  it('filters by search query matching table name or host', () => {
    const resName = filterTables(MOCK_TABLES, {
      ...INITIAL_TABLE_FILTERS,
      searchQuery: 'Commander',
    })
    expect(resName.length).toBe(1)
    expect(resName[0].tableId).toBe('t-2')

    const resHost = filterTables(MOCK_TABLES, {
      ...INITIAL_TABLE_FILTERS,
      searchQuery: 'alice',
    })
    expect(resHost.length).toBe(1)
    expect(resHost[0].tableId).toBe('t-1')
  })

  it('filters by format chips (Modern, Commander, Standard)', () => {
    const modern = filterTables(MOCK_TABLES, {
      ...INITIAL_TABLE_FILTERS,
      format: 'Modern',
    })
    expect(modern.length).toBe(1)
    expect(modern[0].tableId).toBe('t-1')

    const comm = filterTables(MOCK_TABLES, {
      ...INITIAL_TABLE_FILTERS,
      format: 'Commander',
    })
    expect(comm.length).toBe(1)
    expect(comm[0].tableId).toBe('t-2')
  })

  it('filters by availability (open seats vs dueling)', () => {
    const open = filterTables(MOCK_TABLES, {
      ...INITIAL_TABLE_FILTERS,
      availability: 'open',
    })
    expect(open.length).toBe(2)
    expect(open.map((t) => t.tableId)).toEqual(['t-1', 't-3'])

    const dueling = filterTables(MOCK_TABLES, {
      ...INITIAL_TABLE_FILTERS,
      availability: 'dueling',
    })
    expect(dueling.length).toBe(1)
    expect(dueling[0].tableId).toBe('t-2')
  })

  it('filters by mode and skill level', () => {
    const multi = filterTables(MOCK_TABLES, {
      ...INITIAL_TABLE_FILTERS,
      mode: 'multi',
    })
    expect(multi.length).toBe(1)
    expect(multi[0].tableId).toBe('t-2')

    const serious = filterTables(MOCK_TABLES, {
      ...INITIAL_TABLE_FILTERS,
      skill: 'SERIOUS',
    })
    expect(serious.length).toBe(1)
    expect(serious[0].tableId).toBe('t-3')
  })

  it('filters by passworded and rated modifiers', () => {
    const noPassword = filterTables(MOCK_TABLES, {
      ...INITIAL_TABLE_FILTERS,
      hidePassworded: true,
    })
    expect(noPassword.length).toBe(2)
    expect(noPassword.some((t) => t.tableId === 't-2')).toBe(false)

    const ratedOnly = filterTables(MOCK_TABLES, {
      ...INITIAL_TABLE_FILTERS,
      ratedOnly: true,
    })
    expect(ratedOnly.length).toBe(2)
    expect(ratedOnly.map((t) => t.tableId)).toEqual(['t-2', 't-3'])
  })
})

describe('TableFilterBar component', () => {
  it('renders search input, format chips and triggers callbacks', () => {
    const onChange = vi.fn()
    const onReset = vi.fn()

    const { getByPlaceholderText, getByText } = render(
      <TableFilterBar
        tables={MOCK_TABLES}
        filters={INITIAL_TABLE_FILTERS}
        onChange={onChange}
        onReset={onReset}
      />
    )

    const input = getByPlaceholderText('Buscar por mesa, anfitrión o formato… (Esc)')
    fireEvent.change(input, { target: { value: 'Modern' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ searchQuery: 'Modern' })
    )

    const commanderChip = getByText('Commander')
    fireEvent.click(commanderChip)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'Commander' })
    )
  })

  it('opens advanced drawer and displays mode, skill and switch filters', () => {
    const onChange = vi.fn()
    const onReset = vi.fn()

    const { getByText } = render(
      <TableFilterBar
        tables={MOCK_TABLES}
        filters={INITIAL_TABLE_FILTERS}
        onChange={onChange}
        onReset={onReset}
      />
    )

    const trigger = getByText('⚙️ Filtros')
    fireEvent.click(trigger)

    expect(getByText('Modo de juego:')).not.toBeNull()
    expect(getByText('Nivel de habilidad:')).not.toBeNull()
    expect(getByText('🔓 Ocultar privadas con contraseña')).not.toBeNull()
  })

  it('formats massive Chaos Draft booster strings cleanly', () => {
    const hugeDraft =
      'Limited 1xMB1 1x7ED 1xBRO 1xRNA 1xTPR 1xDMU 1xCMM 1xSNC 1xRVR 1xSHM 1xRAV 1xINV 1xEMN 1xMOR 1xTHB 1xDRK 1xM13 1xRTR 1xONS 1xFEM 1xLGN 1xLCI 1xEMA 1xBNG 1xDIS 1xMBS 1xMKM 1xME3 1xMM3 1xHOB 1xME1 1xNEM 1xAFR 1xWHO 1xPCY 1xMH1'
    const res = formatDeckTypeName(hugeDraft)
    expect(res.short).toContain('Limited (Chaos Draft • 36 sobres)')
    expect(res.full).toBe(hugeDraft)

    // Standard deck type unchanged
    const standardRes = formatDeckTypeName('Constructed - Standard')
    expect(standardRes.short).toBe('Constructed - Standard')
    expect(standardRes.full).toBe('Constructed - Standard')
  })
})
