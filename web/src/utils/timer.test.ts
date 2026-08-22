import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { formatTimer, useTickingTimer } from './timer'

describe('timer utility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('formatTimer', () => {
    it('formats 0 or negative seconds as 00:00', () => {
      expect(formatTimer(0)).toBe('00:00')
      expect(formatTimer(-5)).toBe('00:00')
    })

    it('formats seconds under an hour as MM:SS', () => {
      expect(formatTimer(5)).toBe('00:05')
      expect(formatTimer(65)).toBe('01:05')
      expect(formatTimer(1200)).toBe('20:00')
    })

    it('formats seconds over an hour as H:MM:SS (e.g. 6908s -> 1:55:08)', () => {
      expect(formatTimer(3600)).toBe('1:00:00')
      expect(formatTimer(6908)).toBe('1:55:08')
      expect(formatTimer(7325)).toBe('2:02:05')
    })
  })

  describe('useTickingTimer', () => {
    it('ticks down every second when isTicking is true', () => {
      const { result } = renderHook(() => useTickingTimer(60, true))
      expect(result.current).toBe(60)

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current).toBe(59)

      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(result.current).toBe(56)
    })

    it('does not tick when isTicking is false', () => {
      const { result } = renderHook(() => useTickingTimer(60, false))
      expect(result.current).toBe(60)

      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(result.current).toBe(60)
    })

    it('resynchronizes when server sends new time', () => {
      let serverTime = 60
      const { result, rerender } = renderHook(({ t, ticking }) => useTickingTimer(t, ticking), {
        initialProps: { t: serverTime, ticking: true },
      })

      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(result.current).toBe(58)

      // Server update arrives with 55s
      rerender({ t: 55, ticking: true })
      expect(result.current).toBe(55)
    })
  })
})
