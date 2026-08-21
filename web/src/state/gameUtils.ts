import type { GameView } from '../net/types'
import type { FeedbackPrompt } from '../game/feedback'
import { playableObjectIds } from '../board/playableUtils'
import type { CombatState } from './state'

export const BASIC_LANDS = ['Mountain', 'Plains', 'Island', 'Swamp', 'Forest']

export const STEP_RANK: Record<string, number> = {
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

export function emptyCombat(): CombatState {
  return { mode: 'attack', selectable: [], special: false, chosen: [] }
}

export function isCombatStep(game: GameView): boolean {
  return game.step === 'DECLARE_ATTACKERS' || game.step === 'DECLARE_BLOCKERS'
}

export function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (value && typeof value === 'object') return Object.keys(value)
  return []
}

export function targetFirstId(data: unknown): string | null {
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

export function gameViewFrom(value: unknown): GameView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const embedded = record.gameView
  if (embedded && typeof embedded === 'object' && !Array.isArray(embedded)) {
    return embedded as GameView
  }
  if ('myHand' in record && 'phase' in record) return value as GameView
  return null
}

export function combatChosenFrom(game: GameView | null): string[] {
  if (!game) return []
  const chosen = new Set<string>()

  // 1. From game.combat groups
  if (Array.isArray(game.combat)) {
    for (const group of game.combat) {
      const record = group as Record<string, unknown>
      for (const key of ['attackers', 'blockers']) {
        const view = record[key]
        if (Array.isArray(view)) {
          for (const id of view) chosen.add(String(id))
        } else if (view && typeof view === 'object') {
          for (const id of Object.keys(view)) chosen.add(id)
        }
      }
    }
  }

  // 2. From battlefield permanents marked as attacking or blocking
  for (const player of game.players ?? []) {
    for (const [id, perm] of Object.entries(player.battlefield ?? {})) {
      if ((perm as any).attacking === true || (perm as any).blocking === true) {
        chosen.add(id)
      }
    }
  }

  return Array.from(chosen)
}

/** Ventana de combate del GAME_SELECT: options.possibleAttackers (declarar
 *  atacantes) o options.possibleBlockers (declarar bloqueadores). null si el
 *  select es de prioridad (cierra la ventana de combate). */
export function combatFromSelect(data: unknown, currentGame: GameView | null): CombatState | null {
  const record = (data ?? {}) as Record<string, unknown>
  const options = (record.options ?? {}) as Record<string, unknown>
  const attackers = stringList(options.possibleAttackers)
  const blockers = stringList(options.possibleBlockers)
  if (attackers.length === 0 && blockers.length === 0) return null
  const selectable = attackers.length > 0 ? attackers : blockers
  const chosenFromGame = combatChosenFrom(currentGame)
  const chosenFromOptions = stringList(options.chosen ?? options.chosenTargets ?? options.attackers)
  const chosen = Array.from(new Set([...chosenFromGame, ...chosenFromOptions]))
  return {
    mode: attackers.length > 0 ? 'attack' : 'block',
    selectable,
    special: attackers.length > 0 && typeof options.specialButton === 'string',
    chosen,
  }
}

/** Ids jugables consolidados. */
export function consolidatePlayables(
  game: GameView,
  method: string,
  currentFeedback: FeedbackPrompt | null | undefined,
  currentPlayableIds: string[],
  currentPlayableWindow: { turn: number; phase: string } | null,
): { ids: string[]; window: { turn: number; phase: string } | null } {
  const turn = game.turn
  const phase = game.phase
  const objects = game.canPlayObjects?.objects
  const hasObjects = !!objects && Object.keys(objects).length > 0
  if (method === 'GAME_SELECT' || method === 'GAME_PLAY_MANA' || hasObjects) {
    const ids = playableObjectIds(game, currentFeedback ?? undefined)
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
  if (currentPlayableIds.length === 0) return { ids: [], window: currentPlayableWindow }
  if (currentPlayableWindow && (currentPlayableWindow.turn !== turn || currentPlayableWindow.phase !== phase)) {
    return { ids: [], window: null }
  }
  return { ids: currentPlayableIds, window: currentPlayableWindow }
}

export function isOlderThanCurrentGame(
  next: GameView,
  objectId: string | null,
  currentGame: GameView | null,
  currentGameId: string | null,
): boolean {
  if (!currentGame) return false
  const sameGame = objectId != null && objectId === currentGameId
  if (!sameGame || currentGame.myPlayerId !== next.myPlayerId) return false
  if (next.turn < currentGame.turn) return true
  if (next.turn > currentGame.turn) return false
  return (STEP_RANK[next.step] ?? 0) < (STEP_RANK[currentGame.step] ?? 0)
}
