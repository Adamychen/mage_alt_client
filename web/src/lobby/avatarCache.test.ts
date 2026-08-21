import { describe, it, expect, beforeEach } from 'vitest'
import { cacheAvatar, getCachedAvatar, clearAvatarCache } from './avatarCache'

describe('avatarCache', () => {
  beforeEach(() => {
    clearAvatarCache()
  })

  it('stores and retrieves cached avatars case-insensitively', () => {
    expect(getCachedAvatar('Akamayu')).toBeUndefined()

    const updated = cacheAvatar('Akamayu', 15) // Nicol Bolas
    expect(updated).toBe(true)
    expect(getCachedAvatar('akamayu')).toBe(15)
    expect(getCachedAvatar('AKAMAYU')).toBe(15)
  })

  it('updates cache only when avatar differs', () => {
    expect(cacheAvatar('JaceHero', 10)).toBe(true)
    // Same avatar -> returns false (no diff)
    expect(cacheAvatar('JaceHero', 10)).toBe(false)
    // Different avatar -> returns true (updated)
    expect(cacheAvatar('JaceHero', 24)).toBe(true)
    expect(getCachedAvatar('JaceHero')).toBe(24)
  })

  it('ignores invalid usernames and non-positive avatar IDs', () => {
    expect(cacheAvatar('', 10)).toBe(false)
    expect(cacheAvatar('Alice', 0)).toBe(false)
    expect(cacheAvatar('Bob', -1)).toBe(false)
    expect(cacheAvatar('Charlie', null)).toBe(false)
  })
})
