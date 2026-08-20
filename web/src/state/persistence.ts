export interface ConnectionInfo {
  /** Host del proxy WebSocket (ws://wsHost:proxyPort). */
  wsHost: string
  /** Puerto WS del proxy (8787=real, 8788=fake E2E). */
  proxyPort: number
  /** Host del servidor XMage destino (distinto del proxy permite jugar contra
   *  servers remotos con el proxy local). */
  serverHost: string
  port: number
  username: string
  password: string
}

export interface ActiveGamePersistence {
  gameId: string
  tableId?: string | null
  role?: 'player' | 'watcher'
  savedAt: number
}

const STORAGE_KEY = 'mage-web-conn'
const ACTIVE_GAME_KEY = 'mage-web-active-game'
const ACTIVE_GAME_MAX_AGE_MS = 3 * 60 * 60 * 1000 // 3 horas

class MemoryStorage implements Storage {
  private data: Record<string, string> = {}
  get length() {
    return Object.keys(this.data).length
  }
  clear() {
    this.data = {}
  }
  getItem(key: string): string | null {
    return this.data[key] ?? null
  }
  key(index: number): string | null {
    return Object.keys(this.data)[index] ?? null
  }
  removeItem(key: string) {
    delete this.data[key]
  }
  setItem(key: string, value: string) {
    this.data[key] = value
  }
}

const memoryStorage = new MemoryStorage()

function getStorage(): Storage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.getItem('__mage_test__')
      return window.localStorage
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem('__mage_test__')
      return localStorage
    }
  } catch {}
  return memoryStorage
}

export function loadConn(): ConnectionInfo | null {
  try {
    const storage = getStorage()
    const raw = storage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ConnectionInfo> & { host?: string }
      if (parsed && !parsed.wsHost) {
        return {
          wsHost: parsed.host ?? 'localhost',
          proxyPort: (parsed as { proxyPort?: number }).proxyPort ?? 8787,
          serverHost: parsed.host ?? parsed.serverHost ?? 'localhost',
          port: parsed.port ?? 17171,
          username: parsed.username ?? '',
          password: parsed.password ?? '',
        }
      }
      return { proxyPort: 8787, ...parsed } as ConnectionInfo
    }
  } catch {}
  return null
}

export function saveConn(conn: ConnectionInfo | null) {
  try {
    const storage = getStorage()
    if (conn) storage.setItem(STORAGE_KEY, JSON.stringify(conn))
    else storage.removeItem(STORAGE_KEY)
  } catch {}
}

export function loadActiveGame(): ActiveGamePersistence | null {
  try {
    const storage = getStorage()
    const raw = storage.getItem(ACTIVE_GAME_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ActiveGamePersistence
      if (parsed && parsed.gameId && typeof parsed.savedAt === 'number') {
        if (Date.now() - parsed.savedAt < ACTIVE_GAME_MAX_AGE_MS) {
          return parsed
        }
        clearActiveGame()
      }
    }
  } catch {}
  return null
}

export function saveActiveGame(gameId: string | null, tableId?: string | null, role: 'player' | 'watcher' = 'player') {
  try {
    const storage = getStorage()
    if (gameId) {
      const data: ActiveGamePersistence = {
        gameId,
        tableId: tableId ?? null,
        role,
        savedAt: Date.now(),
      }
      storage.setItem(ACTIVE_GAME_KEY, JSON.stringify(data))
    } else {
      clearActiveGame()
    }
  } catch {}
}

export function clearActiveGame() {
  try {
    const storage = getStorage()
    storage.removeItem(ACTIVE_GAME_KEY)
  } catch {}
}
