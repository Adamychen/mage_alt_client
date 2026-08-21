import { getState, setState } from './state'
import * as cmds from '../net/commands'
import type { ChatMessageEvent, DeckJson, GameView } from '../net/types'
import { BASIC_LANDS } from './gameUtils'
import { clearActiveGame } from './persistence'
import type { AppState } from './state'

export function clearError() {
  setState({ error: null })
}

export function setStoreError(error: string) {
  setState({ error })
}

export function clearFeedback() {
  setState({ feedback: null })
}

export function setMyDeck(deck: DeckJson | null) {
  setState({ myDeck: deck, sideboard: deck?.sideboard ?? [] })
}

export function clearGameEnd() {
  setState({ gameEnd: null })
}

export function setWatchingTable(table: import('../net/types').TableView | null) {
  if (table) {
    setState({ phase: 'spectating_pending', watchingTable: table, error: null })
  } else {
    setState({ phase: 'lobby', watchingTable: null, error: null })
  }
}

export function returnToLobby() {
  const s = getState()
  const gameId = s.gameId
  clearActiveGame()
  if (gameId) {
    const me = s.game?.players?.find((p) => p.controlled)
    if (!me) {
      void cmds.stopWatching(gameId)
    } else {
      void cmds.quitMatch(gameId)
    }
  }
  if (s.gameChatId) {
    void cmds.leaveChat(s.gameChatId)
  }
  if (s.watchingTable) {
    void cmds.leaveTable(s.watchingTable.tableId)
  }
  // Filter out match-specific chat messages, preserving only lobby room chat
  const preservedChat = s.roomChatId
    ? s.chatMessages.filter((m) => !m.chatId || m.chatId === s.roomChatId)
    : s.chatMessages
  setState({
    phase: 'lobby',
    watchingTable: null,
    game: null,
    gameId: null,
    gameChatId: null,
    chatMessages: preservedChat,
    playableIds: [],
    playableWindow: null,
    combat: null,
    feedback: null,
    gameEnd: null,
    sideboardScreen: null,
    error: null,
  })
}

export function setSetting<K extends keyof AppState['settings']>(key: K, value: AppState['settings'][K]) {
  setState({ settings: { ...getState().settings, [key]: value } })
}

export function maybeAutoPass(game: GameView) {
  const s = getState()
  const me = game.players?.find((p) => p.controlled)
  if (!s.settings.autoPass || s.feedback || !me?.hasPriority || !s.gameId) return
  if (s.combat) return
  const myHand = game.myHand ?? {}
  if (Object.keys(myHand).length === 0) return
  if (game.phase === 'PRECOMBAT_MAIN') {
    const playable = s.playableIds.length > 0
    const fallback = game.canPlayObjects?.objects ? Object.keys(game.canPlayObjects.objects).length > 0 : false
    const myTurn = me.isActive === true
    const landInHand = Object.values(myHand).some(
      (c) => BASIC_LANDS.includes(c.name ?? '') || BASIC_LANDS.includes(c.displayName ?? ''),
    )
    if (playable || fallback || (myTurn && landInHand)) return
  }
  void cmds.sendPlayerBoolean(false, s.gameId)
}

export function appendLocalChatMessage(message: string, chatId?: string | null): void {
  const s = getState()
  const localMsg: ChatMessageEvent = {
    chatId: chatId ?? s.roomChatId ?? '',
    username: '',
    message,
    messageType: 'SYSTEM',
  }
  setState({ chatMessages: [...s.chatMessages, localMsg].slice(-300) })
}
