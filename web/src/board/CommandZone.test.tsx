import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CommandZone from './CommandZone'
import type { PlayerView } from '../net/types'

describe('CommandZone', () => {
  it('renders nothing when there are no commanders or emblems', () => {
    const fakePlayer: Partial<PlayerView> = {
      name: 'Player1',
      commandList: [],
      helperCards: {},
    }

    const { container } = render(
      <CommandZone player={fakePlayer as PlayerView} side="my" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders 1 commander with crown and tax badge, and handles click to cast', () => {
    const onCardClick = vi.fn()
    const fakePlayer: Partial<PlayerView> = {
      name: 'Player1',
      commandList: [
        {
          id: 'cmd-atrata',
          name: 'Etrata, Deadly Fugitive',
          manaValue: 3,
          castCount: 2,
          mageObjectType: 'COMMANDER',
        } as any,
      ],
    }

    const { container, getByText } = render(
      <CommandZone
        player={fakePlayer as PlayerView}
        side="my"
        playableIds={new Set(['cmd-atrata'])}
        onCardClick={onCardClick}
      />
    )

    expect(container.querySelector('.command-zone')).not.toBeNull()
    expect(container.querySelector('.commander-badge')).not.toBeNull()
    expect(getByText('+4')).not.toBeNull() // 2 casts * 2 tax = +4

    const slot = container.querySelector('[data-card-id="cmd-atrata"]')
    expect(slot).not.toBeNull()
    if (slot) {
      fireEvent.click(slot)
      expect(onCardClick).toHaveBeenCalledWith('cmd-atrata')
    }
  })

  it('renders 2 partner commanders with independent tax badges and click triggers', () => {
    const onCardClick = vi.fn()
    const fakePlayer: Partial<PlayerView> = {
      name: 'PartnerPlayer',
      commandList: [
        {
          id: 'cmd-kraum',
          name: "Kraum, Ludevic's Opus",
          manaValue: 5,
          castCount: 1, // Tax +2
          mageObjectType: 'COMMANDER',
        } as any,
        {
          id: 'cmd-tymna',
          name: 'Tymna the Weaver',
          manaValue: 3,
          castCount: 3, // Tax +6
          mageObjectType: 'COMMANDER',
        } as any,
      ],
    }

    const { container, getByText } = render(
      <CommandZone
        player={fakePlayer as PlayerView}
        side="my"
        playableIds={new Set(['cmd-kraum', 'cmd-tymna'])}
        onCardClick={onCardClick}
      />
    )

    const commanderBadges = container.querySelectorAll('.commander-badge')
    expect(commanderBadges.length).toBe(2) // 2 crowns

    expect(getByText('+2')).not.toBeNull() // Kraum tax
    expect(getByText('+6')).not.toBeNull() // Tymna tax

    const kraumSlot = container.querySelector('[data-card-id="cmd-kraum"]')
    const tymnaSlot = container.querySelector('[data-card-id="cmd-tymna"]')
    expect(kraumSlot).not.toBeNull()
    expect(tymnaSlot).not.toBeNull()

    if (kraumSlot) {
      fireEvent.click(kraumSlot)
      expect(onCardClick).toHaveBeenCalledWith('cmd-kraum')
    }
    if (tymnaSlot) {
      fireEvent.click(tymnaSlot)
      expect(onCardClick).toHaveBeenCalledWith('cmd-tymna')
    }
  })

  it('renders 2 partner commanders and 1 companion simultaneously', () => {
    const fakePlayer: Partial<PlayerView> = {
      name: 'PartnerCompanionPlayer',
      commandList: [
        {
          id: 'cmd-thrasios',
          name: 'Thrasios, Triton Hero',
          manaValue: 2,
          castCount: 0,
          mageObjectType: 'COMMANDER',
        } as any,
        {
          id: 'cmd-vialsmasher',
          name: 'Vial Smasher the Fierce',
          manaValue: 3,
          castCount: 0,
          mageObjectType: 'COMMANDER',
        } as any,
        {
          id: 'companion-lurrus',
          name: 'Lurrus of the Dream-Den',
          manaValue: 3,
          castCount: 0,
          mageObjectType: 'COMPANION',
          rules: ['Companion — Each permanent card in your starting deck has mana value 2 or less.'],
        } as any,
      ],
    }

    const { container } = render(
      <CommandZone player={fakePlayer as PlayerView} side="my" />
    )

    const crowns = container.querySelectorAll('.commander-badge')
    const companions = container.querySelectorAll('.companion-badge')

    expect(crowns.length).toBe(2) // 2 Partner commanders
    expect(companions.length).toBe(1) // 1 Companion
  })

  it('renders emblems stack when helperCards has emblems', () => {
    const fakePlayer: Partial<PlayerView> = {
      name: 'Player1',
      helperCards: {
        'emblem-1': {
          id: 'emblem-1',
          name: 'Emblem - Teferi, Hero of Dominaria',
          manaValue: 0,
          mageObjectType: 'EMBLEM',
        },
        'emblem-2': {
          id: 'emblem-2',
          name: 'Emblem - Chandra, Torch of Defiance',
          manaValue: 0,
          mageObjectType: 'EMBLEM',
        },
      },
    }

    const { container, getByText } = render(
      <CommandZone player={fakePlayer as PlayerView} side="my" />
    )

    expect(container.querySelector('.emblems-wrap')).not.toBeNull()
    expect(getByText('2')).not.toBeNull() // 2 emblems count badge
  })
})
