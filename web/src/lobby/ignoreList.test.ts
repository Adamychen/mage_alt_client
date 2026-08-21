import { describe, it, expect, beforeEach } from 'vitest'
import {
  getIgnoredUsers,
  isUserIgnored,
  addIgnoredUser,
  removeIgnoredUser,
  handleIgnoreCommand,
  resetIgnoredUsersForTest,
} from './ignoreList'

describe('ignoreList manager', () => {
  beforeEach(() => {
    resetIgnoredUsersForTest()
  })

  it('starts with an empty ignore list', () => {
    expect(getIgnoredUsers()).toEqual([])
    expect(isUserIgnored('troll')).toBe(false)
  })

  it('adds and removes users correctly', () => {
    const addRes = addIgnoredUser('SpamBot')
    expect(addRes.ok).toBe(true)
    expect(isUserIgnored('SpamBot')).toBe(true)
    expect(isUserIgnored('spambot')).toBe(true) // case-insensitive

    const removeRes = removeIgnoredUser('SpamBot')
    expect(removeRes.ok).toBe(true)
    expect(isUserIgnored('SpamBot')).toBe(false)
  })

  it('handles /ignore and /unignore chat commands', () => {
    // List empty
    const listRes = handleIgnoreCommand('/ignore')
    expect(listRes?.handled).toBe(true)
    expect(listRes?.message).toContain('vacía')

    // Add user
    const addRes = handleIgnoreCommand('/ignore BadPlayer')
    expect(addRes?.handled).toBe(true)
    expect(isUserIgnored('BadPlayer')).toBe(true)

    // List with user
    const listRes2 = handleIgnoreCommand('/ignore')
    expect(listRes2?.message).toContain('BadPlayer')

    // Unignore
    const unignoreRes = handleIgnoreCommand('/unignore BadPlayer')
    expect(unignoreRes?.handled).toBe(true)
    expect(isUserIgnored('BadPlayer')).toBe(false)

    // Non-ignore command
    expect(handleIgnoreCommand('/whisper hello')).toBeNull()
  })
})
