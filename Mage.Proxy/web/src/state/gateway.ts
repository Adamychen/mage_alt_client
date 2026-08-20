import { Gateway } from '../net/Gateway'
import * as cmds from '../net/commands'
import { getState, setState, addLog, initialState } from './state'
import { handleMessage } from './eventHandler'
import { saveConn } from './persistence'

let gateway: Gateway | null = null

export function attachGateway(g: Gateway) {
  gateway = g
  g.events.onMessage = handleMessage
  g.events.onOpen = () => {
    const s = getState()
    setState({ connecting: false, wsAlive: true, error: null })
    if (s.conn && s.phase !== 'connecting') {
      addLog('conexión', 'reconectado: re-logueando…')
      void cmds.connect(s.conn.serverHost, s.conn.port, s.conn.username, s.conn.password)
    }
  }
  g.events.onClose = (reason) => {
    setState({ connecting: false, wsAlive: false })
    addLog('conexión', `desconectado: ${reason}`)
  }
}

export function detachGateway() {
  if (gateway) {
    gateway.close()
    gateway = null
  }
}

export function getGateway(): Gateway | null {
  return gateway
}

export async function doConnect(wsHost: string, proxyPort: number, serverHost: string, port: number, username: string, password: string) {
  const conn = { wsHost, proxyPort, serverHost, port, username, password }
  setState({ phase: 'connecting', conn, connecting: true, error: null })
  detachGateway()
  const g = new Gateway()
  attachGateway(g)
  cmds.setGateway(g)
  const url = `ws://${wsHost}:${proxyPort}`
  setState({ wsUrl: url })
  try {
    await g.connect(url)
  } catch (e) {
    setState({ phase: 'idle', connecting: false, error: `no se pudo conectar al proxy en ${url}: ${(e as Error).message}` })
    return
  }
  const res = await cmds.connect(serverHost, port, username, password)
  if (!res.ok && /already connected/i.test(res.error ?? '')) {
    await cmds.disconnect()
    await new Promise((r) => setTimeout(r, 500))
    return doConnect(wsHost, proxyPort, serverHost, port, username, password)
  }
  if (res.ok) {
    setState({ phase: 'lobby', connecting: false, error: null, conn })
    saveConn(conn)
    const chatId = await cmds.getRoomChatId()
    setState({ roomChatId: chatId ?? null })
    if (chatId) void cmds.sendChatMessage(chatId, '¡Hola desde el cliente web!')
  } else {
    setState({ phase: 'idle', connecting: false, error: res.error ?? 'login fallido' })
  }
}

export function reset() {
  gateway?.close()
  saveConn(null)
  setState(initialState)
}
