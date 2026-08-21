const AVATAR_CACHE_KEY = 'xmage_nexus_avatar_cache'

let memoryAvatarCache: Record<string, number> = {}

function loadAvatarCache(): Record<string, number> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(AVATAR_CACHE_KEY)
      if (raw) {
        return JSON.parse(raw)
      }
    }
  } catch {
    // Ignore storage errors in test / private browsing
  }
  return memoryAvatarCache
}

function saveAvatarCache(cache: Record<string, number>) {
  memoryAvatarCache = cache
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(cache))
    }
  } catch {
    // Ignore storage errors
  }
}

/** Obtiene el ID del avatar cacheado para un usuario. */
export function getCachedAvatar(username?: string): number | undefined {
  if (!username || !username.trim()) return undefined
  const cache = loadAvatarCache()
  return cache[username.trim().toLowerCase()]
}

/** Guarda o actualiza el ID de avatar real de un usuario si difiere del actual. */
export function cacheAvatar(username?: string, avatarId?: number | null): boolean {
  if (!username || !username.trim() || !avatarId || avatarId <= 0) {
    return false
  }

  const key = username.trim().toLowerCase()
  const cache = loadAvatarCache()

  if (cache[key] !== avatarId) {
    cache[key] = avatarId
    saveAvatarCache(cache)
    return true
  }

  return false
}

/** Limpia la caché (útil para pruebas). */
export function clearAvatarCache() {
  memoryAvatarCache = {}
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(AVATAR_CACHE_KEY)
    }
  } catch {
    // Ignore
  }
}
