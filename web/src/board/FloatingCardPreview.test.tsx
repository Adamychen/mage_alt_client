import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FloatingCardPreview from './FloatingCardPreview'
import type { CardView, PermanentView } from '../net/types'

vi.mock('../cards/cardImages', () => ({
  awaitImageUrl: vi.fn().mockResolvedValue('https://img.test/card.jpg'),
  cardName: vi.fn().mockImplementation((c: CardView) => c.name || '?'),
  getSourceCardName: vi.fn().mockImplementation((c: CardView) => c.name || '?'),
  isAbilityCard: vi.fn().mockReturnValue(false),
}))

describe('FloatingCardPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const dummyBoardRect = {
    left: 0,
    top: 0,
    right: 1200,
    bottom: 800,
    width: 1200,
    height: 800,
  } as DOMRect

  it('renders null when card is null or face down', () => {
    const { container } = render(
      <FloatingCardPreview card={null} anchorRect={null} boardRect={null} />,
    )
    expect(container.firstChild).toBeNull()

    const faceDownCard: CardView = {
      name: 'Secret',
      manaValue: 0,
      faceDown: true,
    }
    const { container: container2 } = render(
      <FloatingCardPreview
        card={faceDownCard}
        anchorRect={{ left: 100, top: 100, right: 200, bottom: 240, width: 100, height: 140 } as DOMRect}
        boardRect={dummyBoardRect}
      />,
    )
    expect(container2.firstChild).toBeNull()
  })

  it('positions battlefield card preview to the right when space allows', () => {
    const card: PermanentView = {
      name: 'Raging Goblin',
      manaValue: 1,
      cardTypes: ['CREATURE'],
      power: '1',
      toughness: '1',
    }

    const anchorRect = {
      left: 300,
      top: 300,
      right: 390,
      bottom: 426,
      width: 90,
      height: 126,
    } as DOMRect

    const { container } = render(
      <FloatingCardPreview
        card={card}
        anchorRect={anchorRect}
        boardRect={dummyBoardRect}
      />,
    )

    const preview = container.querySelector('.floating-card-preview') as HTMLElement
    expect(preview).toBeTruthy()
    // relRight = 390 -> left should be 390 + 16 = 406px
    expect(preview.style.left).toBe('406px')
    expect(preview.textContent).toContain('1/1')
  })

  it('positions hand card preview upwards above the hand', () => {
    const card: CardView = {
      name: 'Mountain',
      manaValue: 0,
      cardTypes: ['LAND'],
    }

    // Card in the bottom hand row (e.g. bottom: 780, near board height 800)
    const anchorRect = {
      left: 500,
      top: 680,
      right: 590,
      bottom: 790,
      width: 90,
      height: 110,
    } as DOMRect

    const { container } = render(
      <FloatingCardPreview
        card={card}
        anchorRect={anchorRect}
        boardRect={dummyBoardRect}
      />,
    )

    const preview = container.querySelector('.floating-card-preview') as HTMLElement
    expect(preview).toBeTruthy()
    expect(preview.style.bottom).toBeTruthy()
  })

  it('renders token and counter badges correctly', () => {
    const tokenCard: PermanentView = {
      name: 'Goblin',
      manaValue: 0,
      isToken: true,
      counters: [{ name: '+1/+1', count: 2 }],
    }

    const anchorRect = {
      left: 200,
      top: 200,
      right: 290,
      bottom: 326,
      width: 90,
      height: 126,
    } as DOMRect

    const { container } = render(
      <FloatingCardPreview
        card={tokenCard}
        anchorRect={anchorRect}
        boardRect={dummyBoardRect}
      />,
    )

    expect(container.textContent).toContain('TOKEN')
    expect(container.textContent).toContain('+2 contadores')
  })

  it('renders flip badge for double-faced cards and toggles face on Shift key', async () => {
    const tdfcCard: CardView = {
      name: 'Delver of Secrets',
      manaValue: 1,
      transformable: true,
      secondCardFace: {
        name: 'Insectile Aberration',
        manaValue: 1,
        power: '3',
        toughness: '2',
      },
    }

    const anchorRect = {
      left: 200,
      top: 200,
      right: 290,
      bottom: 326,
      width: 90,
      height: 126,
    } as DOMRect

    const { container } = render(
      <FloatingCardPreview
        card={tdfcCard}
        anchorRect={anchorRect}
        boardRect={dummyBoardRect}
      />,
    )

    const flipBadge = container.querySelector('.floating-card-flip-badge')
    expect(flipBadge).toBeTruthy()
    expect(flipBadge?.textContent).toContain('Anverso')

    // Simulate pressing Shift key to toggle to back face
    fireEvent.keyDown(window, { key: 'Shift' })

    expect(container.querySelector('.floating-card-flip-badge')?.textContent).toContain('Reverso')
    const { awaitImageUrl } = vi.mocked(await import('../cards/cardImages'))
    expect(awaitImageUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Insectile Aberration',
        isSecondCardFace: true,
      })
    )
  })
})
