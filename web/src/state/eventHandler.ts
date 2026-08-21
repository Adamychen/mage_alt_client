import * as cmds from '../net/commands'
import type { ChatMessageEvent, GameEndInfo, ProxyMessage } from '../net/types'
import { parseFeedback } from '../game/feedback'
import { getState, setState, addLog } from './state'
import type { SideboardCard, SideboardScreenState } from './state'
import { awaitCardMeta } from '../cards/cardImages'
import { saveActiveGame, clearActiveGame } from './persistence'
import {
  gameViewFrom, isOlderThanCurrentGame, consolidatePlayables, combatFromSelect,
  isCombatStep, combatChosenFrom, emptyCombat, targetFirstId,
} from './gameUtils'

export function handleMessage(msg: ProxyMessage) {
  switch (msg.type) {
    case 'connected':
      setState({ phase: 'lobby', connecting: false, error: null })
      break
    case 'disconnected':
      setState({ phase: 'idle', connecting: false, game: null, gameId: null, gameChatId: null, playableIds: [], playableWindow: null, combat: null, feedback: null, lobby: null, roomChatId: null, sideboardScreen: null })
      break
    case 'info':
      addLog('servidor', msg.message)
      break
    case 'error':
      setState({ error: msg.message })
      addLog('error', msg.message)
      break
    case 'lobby': {
      const s = getState()
      let updatedWatching = s.watchingTable
      if (s.phase === 'spectating_pending' && s.watchingTable) {
        const found = msg.tables.find((t) => t.tableId === s.watchingTable?.tableId)
        if (found) {
          updatedWatching = found
        }
      }
      setState({ lobby: msg, watchingTable: updatedWatching })
      break
    }
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
  const s = getState()

  // Guard: If we are in an active game, ignore game-specific events belonging to another gameId
  const isGameEvent = method.startsWith('GAME_')
  if (s.gameId && objectId && objectId !== s.gameId && isGameEvent && method !== 'START_GAME') {
    return
  }

  const embeddedGame = gameViewFrom(data)
  if (embeddedGame && !isOlderThanCurrentGame(embeddedGame, objectId, s.game, s.gameId)) {
    setState({ game: embeddedGame, phase: 'game', watchingTable: null, gameId: objectId ?? s.gameId })
  }
  if (method !== 'GAME_UPDATE' && method !== 'GAME_UPDATE_AND_INFORM') {
    setState({ events: [...s.events, { method, time: Date.now() }].slice(-12) })
  }
  if (method !== 'GAME_ASK') {
    const feedback = parseFeedback(method, objectId ?? s.gameId, data)
    if (feedback) setState({ feedback })
  }
  switch (method) {
    case 'CHATMESSAGE': {
      const m = data as ChatMessageEvent
      // If we are in the lobby/staging and message is from a game chat, ignore it
      if (s.phase !== 'game' && m.chatId && s.roomChatId && m.chatId !== s.roomChatId) {
        break
      }
      // If we are in a game and message is from another game, ignore it
      if (s.phase === 'game' && m.chatId && s.gameChatId && s.roomChatId && m.chatId !== s.gameChatId && m.chatId !== s.roomChatId) {
        break
      }
      setState({ chatMessages: [...s.chatMessages, m].slice(-300) })
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
      const isNewGame = !!d?.gameId && d.gameId !== s.gameId
      if (d?.gameId) saveActiveGame(d.gameId)
      setState({ phase: 'game', watchingTable: null, gameId: d?.gameId ?? null, gameChatId: null, gameEnd: null, sideboardScreen: null })
      addLog('partida', `¡Partida arrancada!${d?.tableName ? ` (${d.tableName})` : ''}`)
      if (isNewGame) {
        void cmds.joinGame(d!.gameId!)
        void cmds.getGameChatId(d!.gameId!).then((cid) => {
          setState({ gameChatId: cid ?? null })
          if (cid) void cmds.joinChat(cid)
        })
      }
      break
    }
    case 'GAME_INIT':
    case 'GAME_UPDATE':
    case 'GAME_UPDATE_AND_INFORM':
    case 'GAME_SELECT':
    case 'GAME_PLAY_MANA':
      if (objectId) saveActiveGame(objectId)
      if (method === 'GAME_UPDATE_AND_INFORM' && (data as any)?.message) {
        addLog('partida', (data as any).message, objectId ?? undefined)
      }
      if (embeddedGame) {
        const fresh = getState()
        const { ids, window: playableWindow } = consolidatePlayables(
          embeddedGame, method, fresh.feedback, fresh.playableIds, fresh.playableWindow,
        )
        const patch: Partial<typeof s> = { playableIds: ids, playableWindow }
        if (method === 'GAME_INIT') {
          patch.gameEnd = null
          patch.feedback = null
          if (objectId && !fresh.gameChatId) {
            void cmds.getGameChatId(objectId).then((cid) => {
              setState({ gameChatId: cid ?? null })
              if (cid) void cmds.joinChat(cid)
            })
          }
        }
        if (method === 'GAME_SELECT') {
          const selectFeedback = parseFeedback(method, objectId ?? s.gameId, data)
          patch.feedback = selectFeedback ?? null
        } else if ((method === 'GAME_UPDATE' || method === 'GAME_UPDATE_AND_INFORM') && fresh.feedback?.method === 'GAME_PLAY_MANA') {
          if (Object.keys(embeddedGame.stack ?? {}).length > 0) {
            patch.feedback = null
          }
        }
        const combat = method === 'GAME_SELECT' ? combatFromSelect(data, embeddedGame) : null
        patch.combat = combat
        if (!combat && embeddedGame && isCombatStep(embeddedGame)) {
          patch.combat = { ...(s.combat ?? emptyCombat()), chosen: combatChosenFrom(embeddedGame) }
        }
        setState(patch)
      }
      break
    case 'WATCHGAME': {
      if (objectId) {
        saveActiveGame(objectId, undefined, 'watcher')
        void cmds.watchGame(objectId)
      }
      addLog('partida', `Espectador: mirando la partida ${objectId?.slice(0, 8) ?? ''}…`)
      break
    }
    case 'GAME_INFORM':
    case 'GAME_INFORM_PERSONAL': {
      const d = data as { message?: string } | string | null
      const msg = typeof d === 'string' ? d : d?.message
      if (msg) addLog('partida', msg, objectId ?? undefined)
      break
    }
    case 'GAME_OVER': {
      const d = data as { gameId?: string; winnerName?: string; message?: string } | null
      clearActiveGame()
      addLog('partida', d?.message ?? 'Fin de partida', d?.gameId ?? undefined)
      break
    }
    case 'END_GAME_INFO': {
      const end = (data ?? {}) as GameEndInfo
      const matchOver = end.matchView?.endTime != null || /won the match/i.test(end.matchInfo ?? '')
      addLog('partida', matchOver ? (end.matchInfo ?? 'Fin del match') : (end.matchInfo ?? 'Fin de la partida'))
      if (matchOver) {
        clearActiveGame()
        setState({
          game: null,
          gameId: null,
          gameChatId: null,
          playableIds: [],
          playableWindow: null,
          combat: null,
          feedback: null,
          phase: 'lobby',
          gameEnd: end,
        })
      } else {
        setState({ gameEnd: end })
      }
      break
    }
    case 'SIDEBOARD': {
      const d = (data ?? {}) as {
        deck?: { name?: string; cards?: Record<string, Record<string, unknown>>; sideboard?: Record<string, Record<string, unknown>> }
        currentTableId?: string
        parentTableId?: string
        time?: number
        flag?: boolean
      } | null
      const tableId = d?.currentTableId
      if (!tableId) break
      const deckName = d?.deck?.name ?? 'Mazo'
      const time = d?.time ?? 180
      const limited = d?.flag === true
      const rawCards = d?.deck?.cards ?? {}
      const rawSide = d?.deck?.sideboard ?? {}
      const resolve = (cards: Record<string, Record<string, unknown>>): Promise<SideboardCard[]> => {
        const entries = Object.entries(cards)
        return Promise.all(entries.map(async ([id, sc]) => {
          const setCode = String(sc.expansionSetCode ?? '')
          const cardNumber = String(sc.cardNumber ?? '')
          const meta = await awaitCardMeta(setCode, cardNumber)
          return {
            instanceId: id,
            setCode,
            cardNumber,
            name: meta?.name ?? `${setCode || '?'}/${cardNumber || '?'}`,
          }
        }))
      }
      void Promise.all([resolve(rawCards), resolve(rawSide)]).then(([maindeck, sideboard]) => {
        const screen: SideboardScreenState = {
          deckName,
          maindeck,
          sideboard,
          tableId,
          parentTableId: d?.parentTableId ?? null,
          timeLeft: time,
          limited,
        }
        setState({ sideboardScreen: screen })
        addLog('partida', `Sideboard: ${maindeck.length} main / ${sideboard.length} side — tienes ${time}s para ajustar`)
      })
      break
    }
    case 'GAME_TARGET': {
      const d = data as { message?: string; options?: { targets?: unknown }; gameId?: string } | null
      const question = d?.message ?? ''
      const currentGameId = objectId ?? d?.gameId ?? s.gameId
      if (s.settings.autoKeepMulligan && /starting player/i.test(question) && currentGameId) {
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
      const currentGameId = objectId ?? d?.gameId ?? s.gameId
      if (s.settings.autoKeepMulligan && /mulligan|keep your hand|keep hand/i.test(question)) {
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
