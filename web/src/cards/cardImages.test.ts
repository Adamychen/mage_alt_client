import { beforeEach, describe, expect, it, vi } from 'vitest'
import { awaitImageUrl, resetCardImageCache, cardKey } from './cardImages'
import type { CardView } from '../net/types'

const card = {
  name: 'Forest',
  expansionSetCode: 'LEA',
  cardNumber: '299',
} as CardView

describe('card image cache', () => {
  beforeEach(() => {
    resetCardImageCache()
    vi.restoreAllMocks()
  })

  it('deduplicates concurrent requests and caches the result', async () => {
    let resolveFetch: ((value: unknown) => void) | undefined
    const response = new Promise((resolve) => {
      resolveFetch = resolve
    })
    const fetchMock = vi.fn(() => response)
    vi.stubGlobal('fetch', fetchMock)

    const first = awaitImageUrl(card)
    const second = awaitImageUrl(card)
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFetch?.({ ok: true, status: 200, json: async () => ({ image_uris: { normal: 'https://img.test/forest.jpg' } }) })

    await expect(first).resolves.toBe('https://img.test/forest.jpg')
    await expect(second).resolves.toBe('https://img.test/forest.jpg')
    await expect(awaitImageUrl(card)).resolves.toBe('https://img.test/forest.jpg')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries an HTTP failure and clears the in-flight entry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ image_uris: { normal: 'https://img.test/retry.jpg' } }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(awaitImageUrl(card)).resolves.toBe('https://img.test/retry.jpg')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not leave a rejected request cached forever', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(awaitImageUrl(card)).resolves.toBeNull()
    const callsAfterFirst = fetchMock.mock.calls.length
    await expect(awaitImageUrl(card)).resolves.toBeNull()
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })
})

describe('token image resolution', () => {
  beforeEach(() => {
    resetCardImageCache()
    vi.restoreAllMocks()
  })

  it('builds token Scryfall key from setCode + name, stripping "Token" suffix', () => {
    const token = { name: 'Goblin Token', expansionSetCode: 'GRN', cardNumber: '0', isToken: true } as CardView
    expect(cardKey(token)).toBe('tgrn/goblin')
  })

  it('handles Treasure token', () => {
    const token = { name: 'Treasure Token', expansionSetCode: 'XLN', cardNumber: '0', isToken: true } as CardView
    expect(cardKey(token)).toBe('txln/treasure')
  })

  it('uses mageObjectType for token detection', () => {
    const token = { name: 'Soldier Token', expansionSetCode: 'M21', cardNumber: '0', mageObjectType: 'TOKEN' } as CardView
    expect(cardKey(token)).toBe('tm21/soldier')
  })

  it('returns null for XMAGE set tokens (special/helper)', () => {
    const token = { name: 'Face Down', expansionSetCode: 'XMAGE', cardNumber: '0', isToken: true } as CardView
    expect(cardKey(token)).toBeNull()
  })

  it('copy token uses original card number for standard lookup', () => {
    // Copy token inherits the original's set + number (not "0")
    const copy = { name: 'Lightning Bolt', expansionSetCode: 'M10', cardNumber: '147', isToken: true } as unknown as CardView
    expect(cardKey(copy)).toBe('M10/147')
  })

  it('returns null for token without setCode', () => {
    const token = { name: 'Goblin Token', cardNumber: '0', isToken: true } as CardView
    expect(cardKey(token)).toBeNull()
  })

  it('returns null for token without name', () => {
    const token = { expansionSetCode: 'GRN', cardNumber: '0', isToken: true } as CardView
    expect(cardKey(token)).toBeNull()
  })

  it('returns null for face-down token with no identifiable name', () => {
    const token = { expansionSetCode: 'XMAGE', cardNumber: '0', isToken: true } as CardView
    expect(cardKey(token)).toBeNull()
  })

  it('fetches token image from Scryfall', async () => {
    const token = { name: 'Goblin Token', expansionSetCode: 'GRN', cardNumber: '0', isToken: true } as CardView
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ image_uris: { normal: 'https://img.test/goblin.jpg' }, name: 'Goblin' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(awaitImageUrl(token)).resolves.toBe('https://img.test/goblin.jpg')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.scryfall.com/cards/tgrn/goblin?format=json',
      expect.anything(),
    )
  })

  it('falls back to name without "Token" suffix on 404', async () => {
    const token = { name: 'Goblin Token', expansionSetCode: 'GRN', cardNumber: '0', isToken: true } as CardView
    // cardKey already strips "Token", so the key is tgrn/goblin — no fallback needed
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ image_uris: { normal: 'https://img.test/goblin.jpg' }, name: 'Goblin' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(awaitImageUrl(token)).resolves.toBe('https://img.test/goblin.jpg')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.scryfall.com/cards/tgrn/goblin?format=json',
      expect.anything(),
    )
  })
})

describe('ability image and metadata resolution', () => {
  beforeEach(() => {
    resetCardImageCache()
    vi.restoreAllMocks()
  })

  it('builds named Scryfall key for triggered ability card', () => {
    const ability = {
      name: 'Goblin Guide',
      mageObjectType: 'TRIGGERED_ABILITY',
      rules: ['Whenever Goblin Guide attacks, defending player reveals the top card of library.'],
    } as CardView
    expect(cardKey(ability)).toBe('named:Goblin Guide')
  })

  it('extracts source card name from rules when card name is "Ability"', () => {
    const ability = {
      name: 'Ability',
      mageObjectType: 'TRIGGERED_ABILITY',
      rules: ['When Cloud, Midgar Mercenary enters, search your library for an Equipment card, reveal it, put it into your hand, then shuffle.'],
    } as CardView
    expect(cardKey(ability)).toBe('named:Cloud, Midgar Mercenary')
  })

  it('uses sourceCard object when present on StackAbilityView', () => {
    const ability = {
      name: 'Ability',
      mageObjectType: 'TRIGGERED_ABILITY',
      sourceCard: {
        name: 'Dark Confidant',
        expansionSetCode: 'RAV',
        cardNumber: '81',
      },
      rules: ['At the beginning of your upkeep, reveal the top card of your library...'],
    } as unknown as CardView
    expect(cardKey(ability)).toBe('RAV/81')
  })

  it('builds named Scryfall key for cards with only a name (e.g. from action feed)', () => {
    const feedCard = { name: 'Lightning Bolt' } as CardView
    expect(cardKey(feedCard)).toBe('named:Lightning Bolt')
  })
})


