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

  it('renders commander with crown and tax badge, and handles click', () => {
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
