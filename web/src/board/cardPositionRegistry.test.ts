import { describe, expect, it } from 'vitest'
import {
  getFallbackSourceRect,
  getPreviousCardPosition,
  recordCardPosition,
} from './cardPositionRegistry'

describe('cardPositionRegistry', () => {
  it('records and retrieves card positions correctly', () => {
    const dummyRect = {
      left: 100,
      top: 200,
      width: 80,
      height: 112,
      right: 180,
      bottom: 312,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect

    recordCardPosition('c123', dummyRect)
    const result = getPreviousCardPosition('c123')
    expect(result).not.toBeNull()
    expect(result?.left).toBe(100)
    expect(result?.top).toBe(200)
  })

  it('returns null for unknown card ids', () => {
    expect(getPreviousCardPosition('unknown-999')).toBeNull()
  })

  it('handles getFallbackSourceRect gracefully without DOM root', () => {
    const div = document.createElement('div')
    expect(getFallbackSourceRect(div)).toBeNull()
  })
})
