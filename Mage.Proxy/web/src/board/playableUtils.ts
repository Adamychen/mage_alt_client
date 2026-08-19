import type { GameView } from '../net/types'

/**
 * Devuelve los IDs de objetos jugables (mano o fuentes de maná del battlefield)
 * según el GameView actual. Usado por el store para consolidar playables.
 */
export function playableObjectIds(game: GameView, feedback?: { method?: string }): string[] {
  const myHand = game.myHand ?? {}
  const objects = game.canPlayObjects?.objects ?? {}
  if (feedback?.method === 'GAME_PLAY_MANA') {
    const me = game.players?.find((p) => p.controlled)
    const battlefield = me ? (me.battlefield ?? {}) : {}
    return Object.keys(objects).filter((id) => id in myHand || id in battlefield)
  }
  return Object.keys(objects).filter((id) => id in myHand)
}
