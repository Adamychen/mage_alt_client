import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatBox from './ChatBox'
import * as cmds from '../net/commands'
import { setState } from '../state/state'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  setState({
    roomChatId: 'chat-123',
    chatMessages: [
      { chatId: 'chat-123', username: 'Alice', message: 'Hello everyone!' },
      { chatId: 'chat-123', username: '', message: 'di2aco has joined' },
      { chatId: 'chat-123', username: 'server', message: 'cardzigger has lost connection' },
      { chatId: 'chat-123', username: 'Bob', message: 'Good luck!' },
    ],
  })
})

describe('ChatBox component', () => {
  it('renders user chat and formatted system notices without orphan colons', () => {
    const { getByText, queryByText } = render(<ChatBox />)

    // User messages
    expect(getByText('Alice:')).not.toBeNull()
    expect(getByText('Hello everyone!')).not.toBeNull()
    expect(getByText('Bob:')).not.toBeNull()
    expect(getByText('Good luck!')).not.toBeNull()

    // System notifications cleanly translated
    expect(getByText('di2aco se ha conectado')).not.toBeNull()
    expect(getByText('cardzigger ha perdido la conexión')).not.toBeNull()

    // Ensure no lonely colon
    expect(queryByText(':')).toBeNull()
  })

  it('toggles visibility of connection/disconnection notices', () => {
    const { getByText, queryByText } = render(<ChatBox />)

    expect(getByText('di2aco se ha conectado')).not.toBeNull()

    const toggleBtn = getByText('👁️ Avisos visibles')
    fireEvent.click(toggleBtn)

    expect(getByText('🔇 Avisos ocultos')).not.toBeNull()
    expect(queryByText('di2aco se ha conectado')).toBeNull()
    expect(queryByText('cardzigger ha perdido la conexión')).toBeNull()
    expect(getByText('Hello everyone!')).not.toBeNull()
  })

  it('sends message via sendChatMessage', () => {
    const sendSpy = vi.spyOn(cmds, 'sendChatMessage').mockResolvedValue({ type: 'result', ok: true, action: 'sendChatMessage' })
    const { getByPlaceholderText, getByText } = render(<ChatBox />)

    const input = getByPlaceholderText('Mensaje al chat global…')
    fireEvent.change(input, { target: { value: 'Testing message' } })

    const sendBtn = getByText('Enviar')
    fireEvent.click(sendBtn)

    expect(sendSpy).toHaveBeenCalledWith('chat-123', 'Testing message')
  })
})
