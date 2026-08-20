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

const STORAGE_KEY = 'mage-web-conn'

export function loadConn(): ConnectionInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
    if (conn) localStorage.setItem(STORAGE_KEY, JSON.stringify(conn))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
