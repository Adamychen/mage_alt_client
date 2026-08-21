import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PingBadge, { parsePing } from './PingBadge'

describe('PingBadge component & parsePing', () => {
  it('parses various ping formats correctly', () => {
    expect(parsePing('45ms')).toEqual({
      ms: 45,
      status: 'good',
      label: '45ms',
      duration: undefined,
    })

    expect(parsePing('120ms (15m)')).toEqual({
      ms: 120,
      status: 'medium',
      label: '120ms',
      duration: '15m',
    })

    expect(parsePing('250ms')).toEqual({
      ms: 250,
      status: 'slow',
      label: '250ms',
      duration: undefined,
    })

    expect(parsePing('(discon. 2m)')).toEqual({
      ms: null,
      status: 'disconnected',
      label: 'Desconectado',
      duration: undefined,
    })
  })

  it('renders ping badge with good latency styling', () => {
    render(<PingBadge infoPing="35ms" />)
    expect(screen.getByText('35ms')).toBeDefined()
  })

  it('renders compact ping badge', () => {
    const { container } = render(<PingBadge infoPing="90ms" compact />)
    expect(container.querySelector('.ping-compact')).toBeDefined()
  })
})
