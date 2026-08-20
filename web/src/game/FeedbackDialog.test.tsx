// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import FeedbackDialog from './FeedbackDialog'
import { clearFeedback, handleMessage } from '../state/store'
import { setGateway, getGateway } from '../net/commands'
import type { Gateway } from '../net/Gateway'

function fakeGateway() {
  const send = vi.fn(async (action: string, args?: unknown) => ({ ok: true, action, requestId: 1, args }))
  return { send } as unknown as Gateway
}

function openPrompt(partial: Record<string, unknown> = {}) {
  handleMessage({
    type: 'event',
    method: 'GAME_GET_AMOUNT',
    messageId: 1,
    objectId: 'game-1',
    data: { message: 'Announce the value for {X}', min: 0, max: 10, ...partial },
  } as never)
}

describe('FeedbackDialog (componente)', () => {
  beforeEach(() => {
    setGateway(fakeGateway())
  })

  afterEach(() => {
    clearFeedback()
    setGateway(null)
    cleanup()
  })

  it('no renderiza nada sin feedback', () => {
    render(<FeedbackDialog />)
    expect(document.querySelector('.feedback-dialog')).toBeNull()
  })

  it('renderiza el diálogo integer (X cost) con input y Enviar', () => {
    openPrompt()
    render(<FeedbackDialog />)
    expect(screen.getByRole('heading', { name: 'Elige cantidad' })).toBeTruthy()
    expect(screen.getByLabelText('Cantidad')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeTruthy()
  })

  it('enviar la cantidad manda sendPlayerInteger por el gateway', async () => {
    openPrompt({ min: 0, max: 10 })
    render(<FeedbackDialog />)
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => {
      const send = getGateway().send as ReturnType<typeof vi.fn>
      expect(send).toHaveBeenCalledWith('sendPlayerInteger', expect.objectContaining({ value: 4, gameId: 'game-1' }))
    })
  })

  it('el diálogo de maná muestra el hint y los botones de reserva/pago', () => {
    handleMessage({
      type: 'event',
      method: 'GAME_PLAY_MANA',
      messageId: 2,
      objectId: 'game-1',
      data: {
        message: 'Pay {R}',
        gameView: {
          priorityTime: 2,
          turn: 1,
          phase: 'PRECOMBAT_MAIN',
          step: 'PRECOMBAT_MAIN',
          activePlayerId: 'p1',
          activePlayerName: 'Alice',
          priorityPlayerName: 'Alice',
          players: [
            {
              playerId: 'p1',
              name: 'Alice',
              controlled: true,
              isHuman: true,
              life: 20,
              manaPool: { red: 1, green: 0, blue: 0, white: 0, black: 0, colorless: 0 },
            },
          ],
        },
      },
    } as never)
    render(<FeedbackDialog />)
    expect(screen.getByText(/Haz clic en tus fuentes de maná/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Pagar reserva: R1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Acción especial' })).toBeTruthy()
  })
})
