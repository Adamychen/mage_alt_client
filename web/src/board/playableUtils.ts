import type { GameView } from '../net/types'

/**
 * Devuelve los IDs de objetos jugables (mano o fuentes de maná del battlefield)
 * según el GameView actual. Usado por el store para consolidar playables.
 */
export function playableObjectIds(game: GameView, _feedback?: { method?: string }): string[] {
  const objects = game.canPlayObjects?.objects ?? {}
  return Object.keys(objects)
}
