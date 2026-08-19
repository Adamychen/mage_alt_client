import type { GameView } from '../net/types'

export function resolveTargetSourceId(game: GameView, sourceName: string | undefined): string | undefined {
  if (!sourceName) return undefined
  for (const [key, card] of Object.entries(game.stack ?? {})) {
    if (card.name === sourceName) return card.id ?? card.parentId ?? key
  }
  for (const player of game.players ?? []) {
    for (const [permId, perm] of Object.entries(player.battlefield ?? {})) {
      if (perm.name === sourceName) return perm.id ?? perm.parentId ?? permId
    }
  }
  return undefined
}
