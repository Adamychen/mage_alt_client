import type { GameView } from '../net/types'
import { useCallback, useEffect, useRef } from 'react'

export interface MageSceneState {
  cards: Record<string, { x: number; y: number }>
  playable: string[]
  click: (id: string) => boolean
  hoveredCardId: string | null
  targeting: {
    active: boolean
    source: string | null
    ids: string[]
    chosen: string[]
  }
  combat: {
    active: boolean
    mode: 'attack' | 'block' | null
    selectable: string[]
    chosen: string[]
  }
  game: { turn: number; phase: string; step: string; priority: boolean } | null
}

declare global {
  interface Window {
    __mageScene?: MageSceneState
  }
}

interface SceneBridgeOptions {
  game: GameView | null
  playableIds: string[]
  targetIds: string[]
  chosenTargetIds: string[]
  combatSelectable: string[]
  combatMode: 'attack' | 'block' | null
  combatChosen: string[]
}

export function useSceneBridge({
  game,
  playableIds,
  targetIds,
  chosenTargetIds,
  combatSelectable,
  combatMode,
  combatChosen,
}: SceneBridgeOptions) {
  const stateRef = useRef<Partial<SceneBridgeOptions>>({})
  stateRef.current = { game, playableIds, targetIds, chosenTargetIds, combatSelectable, combatMode, combatChosen }

  const computeCards = useCallback(() => {
    const cards: Record<string, { x: number; y: number }> = {}
    const el = document.querySelector('.board-wrap')
    if (!el) return cards
    const wrapRect = el.getBoundingClientRect()
    document.querySelectorAll('[data-card-id]').forEach((node) => {
      const cardId = node.getAttribute('data-card-id')
      if (!cardId) return
      const r = node.getBoundingClientRect()
      cards[cardId] = {
        x: r.x + r.width / 2 - wrapRect.x,
        y: r.y + r.height / 2 - wrapRect.y,
      }
    })
    return cards
  }, [])

  const click = useCallback((id: string): boolean => {
    const el = document.querySelector(`[data-card-id="${id}"]`) as HTMLElement | null
    if (!el) return false
    el.click()
    return true
  }, [])

  useEffect(() => {
    const publish = () => {
      const s = stateRef.current
      const me = s.game?.players?.find((p) => p.controlled)
      ;(window as unknown as Record<string, unknown>).__mageScene = {
        cards: computeCards(),
        playable: s.playableIds ?? [],
        click,
        hoveredCardId: null,
        targeting: {
          active: (s.targetIds?.length ?? 0) > 0,
          source: null,
          ids: s.targetIds ?? [],
          chosen: s.chosenTargetIds ?? [],
        },
        combat: {
          active: (s.combatSelectable?.length ?? 0) > 0,
          mode: s.combatMode ?? null,
          selectable: s.combatSelectable ?? [],
          chosen: s.combatChosen ?? [],
        },
        game: s.game
          ? { turn: s.game.turn, phase: s.game.phase, step: s.game.step, priority: me?.hasPriority === true }
          : null,
      } satisfies MageSceneState
    }

    publish()
    const interval = setInterval(publish, 300)
    return () => clearInterval(interval)
  }, [computeCards, click])
}
