import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlayerInfoBar from './PlayerInfoBar'
import type { PlayerView } from '../net/types'

describe('PlayerInfoBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const basePlayer: PlayerView = {
    playerId: 'p1',
    name: 'Alice',
    life: 20,
    controlled: true,
    isHuman: true,
  } as unknown as PlayerView

  it('renders basic player info (avatar, name, life)', () => {
    const { getByText } = render(<PlayerInfoBar player={basePlayer} side="my" />)
    expect(getByText('Alice')).toBeDefined()
    expect(getByText('20')).toBeDefined()
  })

  it('renders Monarch badge and calls onHover with The Monarch token card', () => {
    const onHover = vi.fn()
    const monarchPlayer: PlayerView = {
      ...basePlayer,
      monarch: true,
    }
    const { container } = render(<PlayerInfoBar player={monarchPlayer} side="my" onHover={onHover} />)
    const badge = container.querySelector('.badge-monarch')
    expect(badge).toBeDefined()
    expect(badge?.textContent).toContain('👑')

    if (badge) {
      fireEvent.mouseEnter(badge)
      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'The Monarch' }),
        expect.any(Object),
      )

      fireEvent.mouseLeave(badge)
      expect(onHover).toHaveBeenCalledWith(null)
    }
  })

  it('renders Initiative badge and triggers hover with The Initiative token card', () => {
    const onHover = vi.fn()
    const initPlayer: PlayerView = {
      ...basePlayer,
      initiative: true,
    }
    const { container } = render(<PlayerInfoBar player={initPlayer} side="my" onHover={onHover} />)
    const badge = container.querySelector('.badge-initiative')
    expect(badge).toBeDefined()
    expect(badge?.textContent).toContain('⚔️')

    if (badge) {
      fireEvent.mouseEnter(badge)
      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'The Initiative' }),
        expect.any(Object),
      )
    }
  })

  it('detects The Ring from commandList, displays level and triggers hover', () => {
    const onHover = vi.fn()
    const ringPlayer: PlayerView = {
      ...basePlayer,
      commandList: [
        {
          id: 'ring-1',
          name: 'The Ring',
          rules: ['Your Ring-bearer is legendary...', 'Whenever your Ring-bearer attacks, draw then discard...'],
        },
      ],
    }
    const { container } = render(<PlayerInfoBar player={ringPlayer} side="my" onHover={onHover} />)
    const badge = container.querySelector('.badge-ring')
    expect(badge).toBeDefined()
    expect(badge?.textContent).toContain('💍')
    expect(badge?.textContent).toContain('2')

    if (badge) {
      fireEvent.mouseEnter(badge)
      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'The Ring', displayName: 'The Ring (Nivel 2)' }),
        expect.any(Object),
      )
    }
  })

  it('detects active Dungeon from commandList and triggers hover', () => {
    const onHover = vi.fn()
    const dungeonPlayer: PlayerView = {
      ...basePlayer,
      commandList: [
        {
          id: 'dungeon-1',
          name: 'Undercity',
          cardTypes: ['Dungeon'],
        },
      ],
    }
    const { container } = render(<PlayerInfoBar player={dungeonPlayer} side="opp" onHover={onHover} />)
    const badge = container.querySelector('.badge-dungeon')
    expect(badge).toBeDefined()
    expect(badge?.textContent).toContain('🗺️')

    if (badge) {
      fireEvent.mouseEnter(badge)
      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Undercity' }),
        expect.any(Object),
      )
    }
  })

  it('renders Citys Blessing and Speed with custom icons and token previews', () => {
    const onHover = vi.fn()
    const designatedPlayer: PlayerView = {
      ...basePlayer,
      designationNames: ["City's Blessing", 'Speed'],
    }
    const { container } = render(<PlayerInfoBar player={designatedPlayer} side="my" onHover={onHover} />)
    const badges = container.querySelectorAll('.badge-designation')
    expect(badges.length).toBe(2)
    expect(badges[0].textContent).toContain('🏛️')
    expect(badges[1].textContent).toContain('🏎️')

    fireEvent.mouseEnter(badges[0])
    expect(onHover).toHaveBeenCalledWith(
      expect.objectContaining({ name: "City's Blessing" }),
      expect.any(Object),
    )

    fireEvent.mouseEnter(badges[1])
    expect(onHover).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Speed' }),
      expect.any(Object),
    )
  })

  it('renders Day/Night designation badge and triggers hover', () => {
    const onHover = vi.fn()
    const dayPlayer: PlayerView = {
      ...basePlayer,
      designationNames: ['Day'],
    }
    const { container } = render(<PlayerInfoBar player={dayPlayer} side="my" onHover={onHover} />)
    const badge = container.querySelector('.badge-daynight')
    expect(badge).toBeDefined()
    expect(badge?.textContent).toContain('☀️')

    if (badge) {
      fireEvent.mouseEnter(badge)
      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Day // Night' }),
        expect.any(Object),
      )
    }
  })

  it('renders player counters and triggers token preview on hover', () => {
    const onHover = vi.fn()
    const counterPlayer: PlayerView = {
      ...basePlayer,
      counters: [
        { name: 'Poison', count: 3 },
        { name: 'Energy', count: 5 },
      ],
    }
    const { container } = render(<PlayerInfoBar player={counterPlayer} side="my" onHover={onHover} />)
    const poisonBadge = container.querySelector('.counter-poison')
    const energyBadge = container.querySelector('.counter-energy')

    expect(poisonBadge).toBeDefined()
    expect(energyBadge).toBeDefined()

    if (poisonBadge) {
      fireEvent.mouseEnter(poisonBadge)
      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Poison Counter' }),
        expect.any(Object),
      )
    }

    if (energyBadge) {
      fireEvent.mouseEnter(energyBadge)
      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Energy Reserve' }),
        expect.any(Object),
      )
    }
  })

  it('renders Curses badge when player has attachments', () => {
    const onHover = vi.fn()
    const cursePlayer: PlayerView = {
      ...basePlayer,
      attachments: ['curse-1', 'curse-2'],
    }
    const { container } = render(<PlayerInfoBar player={cursePlayer} side="my" onHover={onHover} />)
    const badge = container.querySelector('.badge-curse')
    expect(badge).toBeDefined()
    expect(badge?.textContent).toContain('💀')
    expect(badge?.textContent).toContain('2')

    if (badge) {
      fireEvent.mouseEnter(badge)
      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Maldición (2)' }),
        expect.any(Object),
      )
    }
  })
})
