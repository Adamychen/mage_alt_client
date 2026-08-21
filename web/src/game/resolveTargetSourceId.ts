import type { GameView } from '../net/types'

export function resolveTargetSourceId(game: GameView, sourceName: string | undefined): string | undefined {
  if (!sourceName) return undefined
  for (const [key, card] of Object.entries(game.stack ?? {})) {
    if (
      card.name === sourceName ||
      (card as any).displayName === sourceName ||
      (card.rules && card.rules[0]?.includes(sourceName))
    ) {
      return card.id ?? card.parentId ?? key
    }
  }
  for (const player of game.players ?? []) {
    for (const [permId, perm] of Object.entries(player.battlefield ?? {})) {
      if (perm.name === sourceName || (perm as any).displayName === sourceName) {
        return perm.id ?? perm.parentId ?? permId
      }
    }
  }
  for (const [handId, handCard] of Object.entries(game.myHand ?? {})) {
    if (handCard.name === sourceName || (handCard as any).displayName === sourceName) {
      return handCard.id ?? handCard.parentId ?? handId
    }
  }
  return undefined
}
