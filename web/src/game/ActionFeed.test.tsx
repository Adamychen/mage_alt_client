import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ActionFeed from './ActionFeed'
import ActionFeedCard from './ActionFeedCard'
import { handleMessage, clearFeedback } from '../state/store'
import type { ActionFeedItem } from './gameEventParser'

describe('ActionFeed & ActionFeedCard', () => {
  afterEach(() => {
    cleanup()
    clearFeedback()
  })

  it('renders ActionFeedCard with correct badges for damage, cast, and lands', () => {
    const onHover = vi.fn()

    const damageItem: ActionFeedItem = {
      id: 'item-1',
      timestamp: Date.now(),
      type: 'damage',
      cardName: 'Lightning Bolt',
      targetName: 'Bob',
      amount: 3,
      isMe: false,
      description: 'Lightning Bolt deals 3 damage to Bob',
      rawText: 'Lightning Bolt deals 3 damage to Bob',
    }

    const { getByText, container } = render(
      <ActionFeedCard item={damageItem} onHover={onHover} />
    )

    expect(getByText('Lightning Bolt')).not.toBeNull()
    expect(getByText('➔ Bob')).not.toBeNull()
    expect(getByText('-3 ❤️')).not.toBeNull()

    // Hover triggers preview
    const cardEl = container.querySelector('.action-feed-card')
    if (cardEl) {
      fireEvent.mouseEnter(cardEl)
      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Lightning Bolt' }),
        expect.any(Object)
      )
      fireEvent.mouseLeave(cardEl)
      expect(onHover).toHaveBeenCalledWith(null)
    }
  })

  it('renders turn divider when type is turn', () => {
    const turnItem: ActionFeedItem = {
      id: 'turn-1',
      timestamp: Date.now(),
      type: 'turn',
      amount: 2,
      playerName: 'Alice',
      description: 'Turno 2 · Alice',
      rawText: 'Turn 2 (Alice)',
    }

    const { getByText } = render(<ActionFeedCard item={turnItem} />)
    expect(getByText('⏱️ Turno 2 · Alice')).not.toBeNull()
  })

  it('toggles between Visual Feed and Raw Text Log in ActionFeed', () => {
    handleMessage({
      type: 'event',
      method: 'CHATMESSAGE',
      messageId: 10,
      data: {
        username: 'servidor',
        message: 'Alice casts Lightning Bolt [target: Bob]',
      },
    } as never)

    const { getByText } = render(<ActionFeed />)

    // Visual mode shows card pill
    expect(getByText('Lightning Bolt')).not.toBeNull()

    // Switch to Raw Log mode
    const textBtn = getByText('📜 Texto')
    fireEvent.click(textBtn)

    expect(getByText('Alice casts Lightning Bolt [target: Bob]')).not.toBeNull()

    // Switch back to Visual
    const visualBtn = getByText('🎨 Visual')
    fireEvent.click(visualBtn)

    expect(getByText('Lightning Bolt')).not.toBeNull()
  })

  it('parses and renders token creation events without raw HTML tags or object hashes', () => {
    handleMessage({
      type: 'event',
      method: 'CHATMESSAGE',
      messageId: 11,
      data: {
        username: 'partida',
        message: "<font color='#20B2AA'>ketaklak</font> creates a <font color='#696969' object_id='08c72361-bf20-48a9-b9bf-cc03fa175a40'>Wizard Token</font> [08c] token",
      },
    } as never)

    const { container } = render(<ActionFeed />)

    expect(container.textContent).toContain('ketaklak crea una ficha Wizard Token')
    expect(container.textContent).not.toContain('<font')
    expect(container.textContent).not.toContain('object_id')
    expect(container.textContent).not.toContain('[08c]')
  })
})
