import { useSyncExternalStore } from 'react'
import { Gateway } from '../net/Gateway'
import * as cmds from '../net/commands'
import type { ChatMessageEvent, GameView, LobbyEnvelope, ProxyMessage } from '../net/types'
import { parseFeedback, type FeedbackPrompt } from '../game/feedback'
import { playableObjectIds } from '../board/gameToScene'
export interface ConnectionInfo {
  host: string
  port: number
  username: string
  password: string
}

const STORAGE_KEY = 'mage-web-conn'
export function loadConn(): ConnectionInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ConnectionInfo
  } catch {}
  return null
}
function saveConn(conn: ConnectionInfo | null) {
  try {
    if (conn) localStorage.setItem(STORAGE_KEY, JSON.stringify(conn))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {}
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
  /** Ids jugables (mano o fuentes de maná del battlefield) según el ÚLTIMO estado
   *  autoritativo del servidor. Consolidado: un GAME_UPDATE sin canPlayObjects no
   *  borra los playables del último GAME_SELECT (mientras siga en la misma ventana
   *  turno+fase; el flag hasPriority de los updates no es fiable). */
  playableIds: string[]
  /** turno+fase del view que originó los playables actuales (ventana de validez). */
  playableWindow: { turn: number; phase: string } | null
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
  conn: loadConn(),
  wsUrl: null,
  wsAlive: false,
  lobby: null,
  roomChatId: null,
  chatMessages: [],
  game: null,
  gameId: null,
  playableIds: [],
  playableWindow: null,
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

// gancho de depuración para E2E (estado del store en vivo)
;(globalThis as unknown as { __mageStore?: unknown }).__mageStore = { getState: () => state }

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
      setState({ phase: 'idle', game: null, gameId: null, playableIds: [], playableWindow: null, feedback: null, lobby: null, roomChatId: null })
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
  if (embeddedGame && !isOlderThanCurrentGame(embeddedGame, objectId)) {
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
      const isNewGame = !!d?.gameId && d.gameId !== state.gameId
      setState({ phase: 'game', gameId: d?.gameId ?? null })
      addLog('partida', `¡Partida arrancada!${d?.tableName ? ` (${d.tableName})` : ''}`)
      // unirse a la partida ya (como el cliente oficial): evita los 10s de forced-join
      if (isNewGame) void cmds.joinGame(d!.gameId!)
      break
    }
    case 'GAME_INIT':
    case 'GAME_UPDATE':
    case 'GAME_UPDATE_AND_INFORM':
    case 'GAME_SELECT':
    case 'GAME_PLAY_MANA':
      if (embeddedGame) {
        const { ids, window: playableWindow } = consolidatePlayables(embeddedGame, method)
        const patch: Partial<AppState> = { playableIds: ids, playableWindow }
        // el diálogo de targeting queda resuelto cuando llega un select de prioridad
        if (method === 'GAME_SELECT' && state.feedback?.method === 'GAME_TARGET') {
          patch.feedback = null
        }
        setState(patch)
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
      setState({ game: null, gameId: null, playableIds: [], playableWindow: null, feedback: null, phase: 'lobby' })
      break
    case 'GAME_TARGET': {
      const d = data as { message?: string; options?: { targets?: unknown }; gameId?: string } | null
      const question = d?.message ?? ''
      const currentGameId = objectId ?? d?.gameId ?? state.gameId
      // "Select a starting player" es un sorteo boilerplate: se resuelve solo con el
      // primer jugador (cualquiera sirve). Sin esto el prompt puede quedar huérfano
      // (p. ej. el auto-mulligan limpia el feedback) y la partida se bloquea.
      // OJO: NO limpiar el feedback aquí — el prompt se mantiene como barrera para
      // que el auto-pase (maybeAutoPass) no mande sendPlayerBoolean en la ventana
      // del sorteo: un booleano como respuesta a un ask de target es inválido, el
      // servidor re-dispara el sorteo en bucle y acaba la partida (~7 re-fires).
      // El feedback se cierra con el ask del mulligan (auto-keep) o el GAME_SELECT.
      if (state.settings.autoKeepMulligan && /starting player/i.test(question) && currentGameId) {
        const first = targetFirstId(data)
        if (first) {
          void cmds.sendPlayerUUID(first, currentGameId)
          addLog('tú', 'sorteo: elegir jugador inicial (auto)')
          break
        }
      }
      const feedback = parseFeedback(method, currentGameId, data)
      if (feedback) setState({ feedback })
      break
    }
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

/**
 * Ids jugables consolidados. El servidor solo manda canPlayObjects completo en
 * GAME_SELECT (y en los views de pago de maná); los GAME_UPDATE intermedios
 * llegan sin él y además con hasPriority poco fiable (a menudo false en mi
 * propio turno). Reglas:
 * - select/maná: fuente autoritativa → reemplaza SIEMPRE (vacío incluido: tras
 *   actuar, el siguiente select manda los playables nuevos o ninguno).
 * - update con canPlayObjects: también autoritativo → reemplaza.
 * - update sin canPlayObjects: se conservan los previos mientras el view siga
 *   en la MISMA ventana (turno+fase) que los originó; al cambiar de fase o
 *   turno se limpian (la ventana ya no existe).
 */
function consolidatePlayables(game: GameView, method: string): { ids: string[]; window: { turn: number; phase: string } | null } {
  const turn = game.turn
  const phase = game.phase
  const objects = game.canPlayObjects?.objects
  const hasObjects = !!objects && Object.keys(objects).length > 0
  if (method === 'GAME_SELECT' || method === 'GAME_PLAY_MANA' || hasObjects) {
    const ids = playableObjectIds(game, state.feedback ?? undefined)
    // tierras básicas en mano: el servidor NO las lista en canPlayObjects salvo en
    // la ventana exacta (PlayLandAbility.canActivate: turno + sin tierra jugada +
    // main phase con prioridad), pero son jugables SIEMPRE en MI main phase con
    // prioridad — marcarlas como jugables para que la UI las deje clicar (si la
    // tierra del turno ya se jugó, el servidor rechaza el clic en silencio).
    // Solo en MI turno: en el turno del rival la fase es la misma y el humano
    // tiene prioridad (para instants) pero no puede jugar tierras.
    const me = game.players?.find((p) => p.controlled)
    if (game.phase === 'PRECOMBAT_MAIN' && me?.isActive === true && me?.hasPriority) {
      for (const [id, card] of Object.entries(game.myHand ?? {})) {
        if (BASIC_LANDS.includes(card.name ?? '') || BASIC_LANDS.includes(card.displayName ?? '')) {
          if (!ids.includes(id)) ids.push(id)
        }
      }
    }
    return { ids, window: ids.length > 0 ? { turn, phase } : null }
  }
  if (state.playableIds.length === 0) return { ids: [], window: state.playableWindow }
  if (state.playableWindow && (state.playableWindow.turn !== turn || state.playableWindow.phase !== phase)) {
    return { ids: [], window: null }
  }
  return { ids: state.playableIds, window: state.playableWindow }
}

const BASIC_LANDS = ['Mountain', 'Plains', 'Island', 'Swamp', 'Forest']

/** Pasa prioridad si estamos en la partida y el modo auto-pass está activo.
 *  No pasa si en MI main phase hay algo jugable (el jugador quiere actuar ahí);
 *  el resto de fases se cruzan solas incluso con instantáneos jugables. */
export function maybeAutoPass(game: GameView) {
  const me = game.players?.find((p) => p.controlled)
  if (!state.settings.autoPass || state.feedback || !me?.hasPriority || !state.gameId) return
  // pre-juego (sorteo/keep): sin mano repartida no hay prioridad real que pasar;
  // responder ahí un booleano puede contaminar el ask de starting player
  const myHand = game.myHand ?? {}
  if (Object.keys(myHand).length === 0) return
  if (game.phase === 'PRECOMBAT_MAIN') {
    const playable = state.playableIds.length > 0
    const fallback = game.canPlayObjects?.objects ? Object.keys(game.canPlayObjects.objects).length > 0 : false
    // las tierras básicas NO vienen de forma fiable en canPlayObjects: el servidor
    // solo las lista en la ventana exacta (PlayLandAbility.canActivate: turno + sin
    // tierra jugada + main phase con prioridad). Si hay una tierra en mano, el
    // auto-pase se detiene igualmente o se saltaría el drop de tierra del turno.
    // Solo en MI turno: en el turno del rival la fase también es PRECOMBAT_MAIN y
    // el humano tiene prioridad (para instants) pero no puede jugar tierras.
    const myTurn = me.isActive === true
    const landInHand = Object.values(myHand).some(
      (c) => BASIC_LANDS.includes(c.name ?? '') || BASIC_LANDS.includes(c.displayName ?? ''),
    )
    if (playable || fallback || (myTurn && landInHand)) return
  }
  void cmds.sendPlayerBoolean(false, state.gameId)
}

/** Primer id objetivo de un GAME_TARGET (para el auto-sorteo de jugador inicial). */
function targetFirstId(data: unknown): string | null {
  const record = (data ?? {}) as Record<string, unknown>
  const list = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === 'string' ? item : ((item as Record<string, unknown> | null)?.id as string | undefined) ?? ''))
        .filter(Boolean) as string[]
    }
    if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>)
    return []
  }
  const options = (record.options ?? {}) as Record<string, unknown>
  return [...list(record.targets), ...list(options.possibleTargets)][0] ?? null
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

/** Orden de pasos dentro de un turno para comparar vistas (turno+paso monótonos). */
const STEP_RANK: Record<string, number> = {
  UPKEEP: 1,
  DRAW: 2,
  PRECOMBAT_MAIN: 3,
  BEGIN_COMBAT: 4,
  DECLARE_ATTACKERS: 5,
  DECLARE_BLOCKERS: 6,
  END_COMBAT: 7,
  POSTCOMBAT_MAIN: 8,
  END_TURN: 9,
  CLEANUP: 10,
}

/** true si la vista entrante es estrictamente ANTERIOR a la del store (mismo
 *  juego). El servidor puede re-enviar vistas viejas (p. ej. el flood de
 *  GAME_UPDATE_AND_INFORM con un GameView de un turno anterior mientras la
 *  partida avanza): pisar el estado con ellas congelaría la UI. Vistas del
 *  mismo turno+paso SIEMPRE reemplazan (una carta pudo moverse). */
function isOlderThanCurrentGame(next: GameView, objectId: string | null): boolean {
  const current = state.game
  if (!current) return false
  const sameGame = objectId != null && objectId === state.gameId
  if (!sameGame || current.myPlayerId !== next.myPlayerId) return false
  if (next.turn < current.turn) return true
  if (next.turn > current.turn) return false
  return (STEP_RANK[next.step] ?? 0) < (STEP_RANK[current.step] ?? 0)
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
    const connInfo = { host, port, username, password }
    setState({ phase: 'lobby', error: null, conn: connInfo })
    saveConn(connInfo)
    const chatId = await cmds.getRoomChatId()
    setState({ roomChatId: chatId ?? null })
    if (chatId) void cmds.sendChatMessage(chatId, '¡Hola desde el cliente web!')
  } else {
    setState({ phase: 'idle', error: res.error ?? 'login fallido' })
  }
}

export function reset() {
  gateway?.close()
  saveConn(null)
  setState(initialState)
}

export { handleMessage }
