import { getState, setState } from './state'
import * as cmds from '../net/commands'
import type { DeckJson } from '../net/types'
import type { GameView } from '../net/types'
import { BASIC_LANDS } from './gameUtils'
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
