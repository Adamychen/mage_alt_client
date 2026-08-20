import { beforeEach, describe, expect, it, vi } from 'vitest'
import { awaitImageUrl, resetCardImageCache } from './cardImages'
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
