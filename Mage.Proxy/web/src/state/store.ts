import { useSyncExternalStore } from 'react'
import { Gateway } from '../net/Gateway'
import * as cmds from '../net/commands'
import type { ChatMessageEvent, GameView, LobbyEnvelope, ProxyMessage } from '../net/types'
import { parseFeedback, type FeedbackPrompt } from '../game/feedback'
export interface ConnectionInfo {
  host: string
  port: number
  username: string
  password: string
}

export interface LogEntry {
  id: number
  time: number
  from: string
  text: string
  gameId?: string
}

interface AppState {
  phase: 'idle' | 'connecting' | 'lobby' | 'game'
  conn: ConnectionInfo | null
  wsUrl: string | null
  /** false cuando el WebSocket al proxy está caído (reconexión en curso) */
  wsAlive: boolean
  lobby: LobbyEnvelope | null
  roomChatId: string | null
  chatMessages: ChatMessageEvent[]
  game: GameView | null
  gameId: string | null
  feedback: FeedbackPrompt | null
  log: LogEntry[]
  events: { method: string; time: number }[]
  settings: {
    autoKeepMulligan: boolean
    autoPass: boolean
  }
  error: string | null
}

const initialState: AppState = {
  phase: 'idle',
  conn: null,
  wsUrl: null,
  wsAlive: false,
  lobby: null,
  roomChatId: null,
  chatMessages: [],
  game: null,
  gameId: null,
  feedback: null,
  log: [],
  events: [],
  settings: { autoKeepMulligan: true, autoPass: false },
  error: null,
}

let state: AppState = initialState
const listeners = new Set<() => void>()

function setState(partial: Partial<AppState>) {
  state = { ...state, ...partial }
  listeners.forEach((l) => l())
}

let gateway: Gateway | null = null
let logSeq = 0

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => selector(state),
  )
}

export function getState() {
  return state
}

export function usePhase() {
  return useStore((s) => s.phase)
}

export function useLobby() {
  return useStore((s) => s.lobby)
}

export function useGame() {
  return useStore((s) => s.game)
}

export function useSettings() {
  return useStore((s) => s.settings)
}

function addLog(from: string, text: string, gameId?: string) {
  setState({ log: [...state.log, { id: ++logSeq, time: Date.now(), from, text, gameId }].slice(-300) })
}

function handleMessage(msg: ProxyMessage) {
  switch (msg.type) {
    case 'connected':
      setState({ phase: 'lobby', error: null })
      break
    case 'disconnected':
      setState({ phase: 'idle', game: null, gameId: null, feedback: null, lobby: null, roomChatId: null })
      break
    case 'info':
      addLog('servidor', msg.message)
      break
    case 'error':
      setState({ error: msg.message })
      addLog('error', msg.message)
      break
    case 'lobby':
      setState({ lobby: msg })
      break
    case 'result':
      if (!msg.ok && msg.action !== 'disconnect') {
        const detail = msg.error ?? (typeof msg.data === 'string' ? msg.data : undefined)
        setState({ error: detail ?? `${msg.action} falló` })
      }
      break
    case 'event':
      handleEvent(msg.method, msg.objectId ?? null, msg.data)
      break
  }
}

function handleEvent(method: string, objectId: string | null, data: unknown) {
  const embeddedGame = gameViewFrom(data)
  if (embeddedGame) {
    setState({ game: embeddedGame, phase: 'game', gameId: objectId ?? state.gameId })
  }
  if (method !== 'GAME_UPDATE' && method !== 'GAME_UPDATE_AND_INFORM') {
    setState({ events: [...state.events, { method, time: Date.now() }].slice(-12) })
  }
  if (method !== 'GAME_ASK') {
    const feedback = parseFeedback(method, objectId ?? state.gameId, data)
    if (feedback) setState({ feedback })
  }
  switch (method) {
    case 'CHATMESSAGE': {
      const m = data as ChatMessageEvent
      setState({ chatMessages: [...state.chatMessages, m].slice(-300) })
      addLog(m.username, m.message, objectId ?? undefined)
      break
    }
    case 'SERVER_MESSAGE': {
      const text = typeof data === 'string' ? data : JSON.stringify(data)
      addLog('servidor', text)
      break
    }
    case 'JOINED_TABLE': {
      const d = data as { tableId?: string; tableName?: string } | null
      addLog('mesa', `Te has unido a "${d?.tableName ?? d?.tableId ?? ''}"`)
      break
    }
    case 'START_GAME': {
      const d = data as { gameId?: string; tableName?: string } | null
      setState({ phase: 'game', gameId: d?.gameId ?? null })
      addLog('partida', `¡Partida arrancada!${d?.tableName ? ` (${d.tableName})` : ''}`)
      break
    }
    case 'GAME_INIT':
    case 'GAME_UPDATE':
    case 'GAME_UPDATE_AND_INFORM':
      if (embeddedGame) {
        setState({ game: embeddedGame, phase: 'game', gameId: objectId ?? state.gameId })
      }
      break
    case 'WATCHGAME': {
      if (objectId) void cmds.watchGame(objectId)
      addLog('partida', `Espectador: mirando la partida ${objectId?.slice(0, 8) ?? ''}…`)
      break
    }
    case 'GAME_OVER': {
      const d = data as { gameId?: string; winnerName?: string; message?: string } | null
      addLog('partida', d?.message ?? 'Fin de partida', d?.gameId ?? undefined)
      break
    }
    case 'END_GAME_INFO':
      setState({ game: null, gameId: null, feedback: null, phase: 'lobby' })
      break
    case 'GAME_ASK': {
      const d = data as { question?: string; message?: string; options?: unknown[]; gameId?: string } | null
      const question = d?.question ?? d?.message ?? ''
      const currentGameId = objectId ?? d?.gameId ?? state.gameId
      if (state.settings.autoKeepMulligan && /mulligan|keep your hand|keep hand/i.test(question)) {
        // XMage: sendPlayerBoolean(false) = mantener la mano, true = tomar mulligan.
        if (currentGameId) void cmds.sendPlayerBoolean(false, currentGameId)
        setState({ feedback: null })
        addLog('tú', 'mulligan: mantener (auto)')
      } else {
        const feedback = parseFeedback(method, currentGameId, data)
        if (feedback) setState({ feedback })
        addLog('partida', `¿${question || 'pregunta'}?`)
      }
      break
    }
    default:
      if (method.startsWith('GAME_')) {
        addLog('partida', `evento ${method}`)
      }
  }
}

/** Pasa prioridad si estamos en la partida y el modo auto-pass está activo. */
export function maybeAutoPass(game: GameView) {
  const me = game.players?.find((p) => p.controlled)
  if (!state.settings.autoPass || state.feedback || !me?.hasPriority || !state.gameId) return
  void cmds.sendPlayerBoolean(false, state.gameId)
}

function gameViewFrom(value: unknown): GameView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const embedded = record.gameView
  if (embedded && typeof embedded === 'object' && !Array.isArray(embedded)) {
    return embedded as GameView
  }
  if ('myHand' in record && 'phase' in record) return value as GameView
  return null
}

/** Registra el gateway y su listener (llamar una vez, en App). */
export function attachGateway(g: Gateway) {
  gateway = g
  g.events.onMessage = handleMessage
  g.events.onOpen = () => {
    setState({ wsAlive: true, error: null })
    if (state.conn && state.phase !== 'connecting') {
      addLog('conexión', 'reconectado: re-logueando…')
      void cmds.connect(state.conn.host, state.conn.port, state.conn.username, state.conn.password)
    }
  }
  g.events.onClose = (reason) => {
    setState({ wsAlive: false })
    addLog('conexión', `desconectado: ${reason}`)
  }
}

export function detachGateway() {
  if (gateway) {
    gateway.close()
    gateway = null
  }
}

export function clearError() {
  setState({ error: null })
}

export function setStoreError(error: string) {
  setState({ error })
}

export function clearFeedback() {
  setState({ feedback: null })
}

export function setSetting<K extends keyof AppState['settings']>(key: K, value: AppState['settings'][K]) {
  setState({ settings: { ...state.settings, [key]: value } })
}

export async function doConnect(host: string, port: number, username: string, password: string) {
  setState({ phase: 'connecting', conn: { host, port, username, password }, error: null })
  detachGateway()
  const g = new Gateway()
  attachGateway(g)
  cmds.setGateway(g)
  const url = `ws://${host}:8787`
  setState({ wsUrl: url })
  try {
    await g.connect(url)
  } catch (e) {
    setState({ phase: 'idle', error: `no se pudo conectar al proxy en ${url}: ${(e as Error).message}` })
    return
  }
  const res = await cmds.connect(host, port, username, password)
  if (!res.ok && /already connected/i.test(res.error ?? '')) {
    await cmds.disconnect()
    await new Promise((r) => setTimeout(r, 500))
    return doConnect(host, port, username, password)
  }
  if (res.ok) {
    setState({ phase: 'lobby', error: null })
    const chatId = await cmds.getRoomChatId()
    setState({ roomChatId: chatId ?? null })
    if (chatId) void cmds.sendChatMessage(chatId, '¡Hola desde el cliente web!')
  } else {
    setState({ phase: 'idle', error: res.error ?? 'login fallido' })
  }
}

export function reset() {
  gateway?.close()
  setState(initialState)
}

export { handleMessage }
