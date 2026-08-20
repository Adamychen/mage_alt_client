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
    vi.unstubAllGlobals()
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
    vi.unstubAllGlobals()
  })

  it('builds token Scryfall key from setCode + name', () => {
    const token = { name: 'Goblin Token', expansionSetCode: 'GRN', cardNumber: '0', isToken: true } as CardView
    expect(cardKey(token)).toBe('tgrn/goblin-token')
  })

  it('handles Treasure token', () => {
    const token = { name: 'Treasure Token', expansionSetCode: 'XLN', cardNumber: '0', isToken: true } as CardView
    expect(cardKey(token)).toBe('txln/treasure-token')
  })

  it('uses mageObjectType for token detection', () => {
    const token = { name: 'Soldier Token', expansionSetCode: 'M21', cardNumber: '0', mageObjectType: 'TOKEN' } as CardView
    expect(cardKey(token)).toBe('tm21/soldier-token')
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
      'https://api.scryfall.com/cards/tgrn/goblin-token?format=json',
      expect.anything(),
    )
  })

  it('falls back to name without "Token" suffix on 404', async () => {
    const token = { name: 'Goblin Token', expansionSetCode: 'GRN', cardNumber: '0', isToken: true } as CardView
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })  // tgrn/goblin-token → 404
      .mockResolvedValueOnce({                            // tgrn/goblin → 200
        ok: true, status: 200,
        json: async () => ({ image_uris: { normal: 'https://img.test/goblin2.jpg' }, name: 'Goblin' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(awaitImageUrl(token)).resolves.toBe('https://img.test/goblin2.jpg')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.scryfall.com/cards/tgrn/goblin?format=json',
      expect.anything(),
    )
  })
})
