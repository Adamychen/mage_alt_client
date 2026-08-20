import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearActiveGame,
  loadActiveGame,
  loadConn,
  saveActiveGame,
  saveConn,
  type ConnectionInfo,
} from './persistence'

describe('persistence', () => {
  const mockStorage: Record<string, string> = {}

  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k]
    }
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        for (const k of Object.keys(mockStorage)) {
          delete mockStorage[k]
        }
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('connection info', () => {
    it('returns null when nothing is stored', () => {
      expect(loadConn()).toBeNull()
    })

    it('saves and loads connection info correctly', () => {
      const conn: ConnectionInfo = {
        wsHost: '127.0.0.1',
        proxyPort: 8787,
        serverHost: 'beta.xmage.today',
        port: 17171,
        username: 'alice',
        password: 'secret',
      }
      saveConn(conn)
      expect(loadConn()).toEqual(conn)
    })

    it('removes connection info when saving null', () => {
      saveConn({
        wsHost: 'localhost',
        proxyPort: 8787,
        serverHost: 'localhost',
        port: 17171,
        username: 'bob',
        password: '',
      })
      expect(loadConn()).not.toBeNull()
      saveConn(null)
      expect(loadConn()).toBeNull()
    })

    it('migrates legacy format with single host property', () => {
      mockStorage['mage-web-conn'] = JSON.stringify({
        host: 'beta.xmage.today',
        port: 17171,
        username: 'legacy_user',
        password: '',
      })
      const loaded = loadConn()
      expect(loaded).toEqual({
        wsHost: 'beta.xmage.today',
        proxyPort: 8787,
        serverHost: 'beta.xmage.today',
        port: 17171,
        username: 'legacy_user',
        password: '',
      })
    })
  })

  describe('active game persistence', () => {
    it('returns null when no active game is saved', () => {
      expect(loadActiveGame()).toBeNull()
    })

    it('saves and loads active game data', () => {
      saveActiveGame('game-uuid-123', 'table-uuid-456')
      const active = loadActiveGame()
      expect(active).not.toBeNull()
      expect(active?.gameId).toBe('game-uuid-123')
      expect(active?.tableId).toBe('table-uuid-456')
      expect(active?.role).toBe('player')
      expect(typeof active?.savedAt).toBe('number')
    })

    it('saves and loads active game with watcher role', () => {
      saveActiveGame('watch-123', undefined, 'watcher')
      const active = loadActiveGame()
      expect(active?.gameId).toBe('watch-123')
      expect(active?.role).toBe('watcher')
    })

    it('clears active game when clearActiveGame() is called', () => {
      saveActiveGame('game-uuid-123')
      expect(loadActiveGame()).not.toBeNull()
      clearActiveGame()
      expect(loadActiveGame()).toBeNull()
    })

    it('clears active game when passing null to saveActiveGame()', () => {
      saveActiveGame('game-uuid-123')
      expect(loadActiveGame()).not.toBeNull()
      saveActiveGame(null)
      expect(loadActiveGame()).toBeNull()
    })

    it('expires and clears games older than 3 hours', () => {
      const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000
      mockStorage['mage-web-active-game'] = JSON.stringify({
        gameId: 'old-game-123',
        tableId: null,
        savedAt: fourHoursAgo,
      })

      expect(loadActiveGame()).toBeNull()
      expect(mockStorage['mage-web-active-game']).toBeUndefined()
    })
  })
})
