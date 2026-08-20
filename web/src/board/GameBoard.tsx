import { useMemo } from 'react'
import type { CardView, GameView } from '../net/types'
import OpponentZone from './OpponentZone'
import PlayerZone from './PlayerZone'
import StackZone from './StackZone'
import TargetingOverlay from './TargetingOverlay'
import { useSceneBridge } from './sceneBridge'
import type { CrossZonePlayable } from './crossZone'
import './GameBoard.css'

interface GameBoardProps {
  game: GameView | null
  targetIds?: string[]
  chosenTargetIds?: string[]
  onTargetClick?: (id: string) => void
  targetSourceId?: string
  playableIds?: string[]
  onPlayableClick?: (id: string) => void
  onCardHover?: (card: CardView | null) => void
  combatSelectable?: string[]
  combatMode?: 'attack' | 'block' | null
  combatChosen?: string[]
  onCombatClick?: (id: string) => void
  onResolveClick?: () => void
  crossZonePlayables?: CrossZonePlayable[]
  onPlayCrossZone?: (id: string) => void
}

/** Convierte una SimpleCardsView (mano de espectador) a CardsView para PlayerZone. */
function toCardsView(simple: Record<string, { id: string; name?: string }> | undefined): Record<string, CardView> {
  if (!simple) return {}
  const out: Record<string, CardView> = {}
  for (const [id, c] of Object.entries(simple)) {
    out[id] = { name: c.name ?? '?', manaValue: 0, expansionSetCode: '', cardNumber: '0', parentId: id, id }
  }
  return out
}

export default function GameBoard({
  game,
  targetIds = [],
  chosenTargetIds = [],
  onTargetClick,
  targetSourceId,
  playableIds = [],
  onPlayableClick,
  onCardHover,
  combatSelectable = [],
  combatMode = null,
  combatChosen = [],
  onCombatClick,
  onResolveClick,
  crossZonePlayables = [],
  onPlayCrossZone,
}: GameBoardProps) {
  const me = game?.players?.find((p) => p.controlled)
  const opps = game?.players?.filter((p) => !p.controlled) ?? []
  const opp0 = opps[0]
  const isSpectator = !me && opps.length >= 2
  const oppBottom = isSpectator ? opps[1] : undefined

  const targetIdSet = useMemo(() => new Set(targetIds), [targetIds])
  const playableIdSet = useMemo(() => new Set(playableIds), [playableIds])

  useSceneBridge({
    game,
    playableIds,
    targetIds,
    chosenTargetIds,
    combatSelectable,
    combatMode,
    combatChosen,
    crossZonePlayables,
   })

  const onHandCardClick = onPlayableClick

  /** Mano boca arriba del jugador de abajo en modo espectador. */
  const spectatorBottomHand = useMemo(() => {
    if (!isSpectator || !oppBottom) return {}
    const watched = game?.watchedHands?.[oppBottom.name]
    return toCardsView(watched)
  }, [isSpectator, oppBottom, game?.watchedHands])

  const allTargetCards = useMemo(() => {
    const map: Record<string, { id: string; x: number; y: number }> = {}
    if (!game) return map
    for (const p of game.players ?? []) {
      for (const [id] of Object.entries(p.battlefield ?? {})) {
        map[id] = { id, x: 0, y: 0 }
      }
    }
    for (const [id] of Object.entries(game.myHand ?? {})) {
      map[id] = { id, x: 0, y: 0 }
    }
    return map
  }, [game])

  return (
    <div className="game-board">
      <OpponentZone
        player={opp0}
        onCardClick={onTargetClick}
        onCardHover={onCardHover}
        targetIds={targetIdSet}
      />
      <div className="board-divider" />
        <PlayerZone
         player={isSpectator ? oppBottom : me}
         hand={isSpectator ? spectatorBottomHand : (game?.myHand ?? {})}
         onCardClick={(id) => {
           if (combatSelectable.includes(id)) onCombatClick?.(id)
           else if (targetIds.includes(id)) onTargetClick?.(id)
           else if (playableIds.includes(id)) onPlayableClick?.(id)
          }}
         onHandCardClick={onHandCardClick}
         onCardHover={onCardHover}
         targetIds={targetIdSet}
         playableIds={playableIdSet}
         crossZonePlayables={isSpectator ? [] : crossZonePlayables}
         onPlayCrossZone={onPlayCrossZone}
        />
      <StackZone
        stack={game?.stack ?? null}
        onCardClick={onTargetClick}
        onHover={onCardHover}
        targetIds={targetIdSet}
        onResolveClick={onResolveClick}
        canResolve={!!me?.hasPriority}
      />
      <TargetingOverlay
        sourceId={targetSourceId}
        targetIds={targetIds}
        chosenIds={chosenTargetIds}
        cards={allTargetCards}
      />
    </div>
  )
}
