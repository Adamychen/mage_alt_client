import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isFullscreen, toggleFullscreen } from './fullscreen'

describe('fullscreen utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('detects fullscreen correctly', () => {
    expect(isFullscreen()).toBe(false)

    Object.defineProperty(document, 'fullscreenElement', {
      value: document.documentElement,
      configurable: true,
    })
    expect(isFullscreen()).toBe(true)

    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
    })
    expect(isFullscreen()).toBe(false)
  })

  it('requests fullscreen when currently not fullscreen', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    document.documentElement.requestFullscreen = requestFullscreen

    await toggleFullscreen()
    expect(requestFullscreen).toHaveBeenCalled()
  })

  it('exits fullscreen when currently fullscreen', async () => {
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.documentElement,
      configurable: true,
    })
    const exitFullscreen = vi.fn().mockResolvedValue(undefined)
    document.exitFullscreen = exitFullscreen

    await toggleFullscreen()
    expect(exitFullscreen).toHaveBeenCalled()

    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
    })
  })
})
