import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JoinTableDialog from './JoinTableDialog'
import type { TableView } from '../net/types'

afterEach(() => {
  cleanup()
})

const MOCK_TABLE: TableView = {
  tableId: 'tab-123',
  tableName: "Diana's Modern Arena",
  controllerName: 'Diana',
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
    { playerName: 'Diana', seatIndex: 0, playerType: 'HUMAN' },
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

const MOCK_PASSWORD_TABLE: TableView = {
  ...MOCK_TABLE,
  tableName: 'Secret Commander Pod',
  deckType: 'Constructed - Commander',
  passworded: true,
}

describe('JoinTableDialog', () => {
  it('renders table meta and deck options', () => {
    const onJoin = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()

    const { getByText, getAllByText } = render(
      <JoinTableDialog table={MOCK_TABLE} onClose={onClose} onJoin={onJoin} />
    )

    expect(getByText("Diana's Modern Arena")).not.toBeNull()
    expect(getByText('Constructed - Modern')).not.toBeNull()
    expect(getByText('Diana')).not.toBeNull()
    expect(getAllByText(/Mage Web bolt/).length).toBeGreaterThanOrEqual(1)
  })

  it('requires password when table is passworded and calls onJoin with password', async () => {
    const onJoin = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()

    const { getByPlaceholderText, getByRole, getByText } = render(
      <JoinTableDialog table={MOCK_PASSWORD_TABLE} onClose={onClose} onJoin={onJoin} />
    )

    expect(getByText('🔒 Requiere contraseña')).not.toBeNull()
    const passwordInput = getByPlaceholderText('Introduce la contraseña para entrar…')
    fireEvent.change(passwordInput, { target: { value: 'secret123' } })

    const submitBtn = getByRole('button', { name: /Unirse con/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(onJoin).toHaveBeenCalledWith(
        MOCK_PASSWORD_TABLE,
        expect.objectContaining({ name: expect.any(String) }),
        'secret123'
      )
    })
  })

  it('allows quick inline import of a new deck list', async () => {
    const onJoin = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()

    const { getByText, getByPlaceholderText, getByRole } = render(
      <JoinTableDialog table={MOCK_TABLE} onClose={onClose} onJoin={onJoin} />
    )

    const importToggle = getByText('📋 Pegar mazo nuevo…')
    fireEvent.click(importToggle)

    const nameInput = getByPlaceholderText('Nombre del mazo (ej. Mi Mazo Commander)')
    fireEvent.change(nameInput, { target: { value: 'My Red Burn' } })

    const textarea = getByPlaceholderText(/Pega aquí la lista de cartas/i)
    fireEvent.change(textarea, {
      target: { value: '4 Lightning Bolt (M10) 146\n20 Mountain (LEA) 292' },
    })

    const saveBtn = getByText('Guardar y Seleccionar')
    fireEvent.click(saveBtn)

    // Now Red Burn should be selected and reflected in submit button
    expect(getByText(/Unirse con "My Red Burn"/i)).not.toBeNull()

    const submitBtn = getByRole('button', { name: /Unirse con "My Red Burn"/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(onJoin).toHaveBeenCalledWith(
        MOCK_TABLE,
        expect.objectContaining({ name: 'My Red Burn' }),
        undefined
      )
    })
  })
})
