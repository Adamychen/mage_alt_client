import { useCallback, useMemo, useRef, useState } from 'react'
import type { CardView, GameView, PermanentView, PlayerView } from '../net/types'
import OpponentZone from './OpponentZone'
import PlayerZone from './PlayerZone'
import TargetingOverlay from './TargetingOverlay'
import FloatingCardPreview from './FloatingCardPreview'
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
  crossZonePlayables?: CrossZonePlayable[]
  onPlayCrossZone?: (id: string) => void
  focusedOpponentId?: string
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

function getOpponentRevealedCards(game: GameView | null | undefined, oppPlayerId?: string, oppPlayerName?: string): Record<string, CardView> {
  if (!game) return {}
  const res: Record<string, CardView> = {}

  if (Array.isArray(game.revealed)) {
    game.revealed.forEach((rev) => {
      if (rev.cards && typeof rev.cards === 'object') {
        Object.entries(rev.cards).forEach(([id, c]) => {
          res[id] = c as CardView
        })
      }
    })
  }

  if (oppPlayerId && game.opponentHands?.[oppPlayerId]) {
    const oppHand = game.opponentHands[oppPlayerId]
    Object.entries(oppHand).forEach(([id, c]) => {
      res[id] = c as CardView
    })
  }

  if (oppPlayerName && game.watchedHands?.[oppPlayerName]) {
    const watched = game.watchedHands[oppPlayerName]
    Object.entries(watched).forEach(([id, c]) => {
      res[id] = { name: c.name ?? '?', manaValue: 0, expansionSetCode: '', cardNumber: '0', parentId: id, id }
    })
  }

  return res
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
  crossZonePlayables = [],
  onPlayCrossZone,
  focusedOpponentId,
}: GameBoardProps) {
  const allPlayers = useMemo(() => {
    if (game?.players && game.players.length > 0) return game.players
    if (game?.watchedHands) {
      const names = Object.keys(game.watchedHands)
      if (names.length > 0) {
        return names.map((name, i) => ({
          playerId: `p-spec-${i}`,
          name,
          life: 20,
          controlled: false,
          handCount: Object.keys(game.watchedHands?.[name] ?? {}).length,
        } as unknown as PlayerView))
      }
    }
    return []
  }, [game?.players, game?.watchedHands])

  const me = allPlayers.find((p) => p.controlled)
  const opps = allPlayers.filter((p) => !p.controlled)
  const isSpectator = !me
  const oppBottom = isSpectator ? (opps.length >= 2 ? opps[opps.length - 1] : opps[0]) : undefined
  const topOpps = isSpectator ? (opps.length >= 2 ? opps.slice(0, opps.length - 1) : []) : opps

  const targetIdSet = useMemo(() => new Set(targetIds), [targetIds])
  const playableIdSet = useMemo(() => new Set(playableIds), [playableIds])

  const boardRef = useRef<HTMLDivElement>(null)
  const [floatingCard, setFloatingCard] = useState<CardView | PermanentView | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const hoverTimeoutRef = useRef<number | null>(null)

  const handleCardHover = useCallback(
    (card: CardView | PermanentView | null, rect?: DOMRect) => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }

      if (card && rect) {
        setFloatingCard(card)
        setAnchorRect(rect)
        onCardHover?.(card as CardView | null)
      } else {
        hoverTimeoutRef.current = window.setTimeout(() => {
          setFloatingCard(null)
          setAnchorRect(null)
          onCardHover?.(null)
        }, 50)
      }
    },
    [onCardHover]
  )

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

  /** Mano del jugador de abajo en modo espectador (revelada o vista). */
  const spectatorBottomHand = useMemo(() => {
    if (!isSpectator || !oppBottom) return {}
    const watched =
      game?.watchedHands?.[oppBottom.name] ||
      game?.watchedHands?.[oppBottom.playerId]
    const oppHand =
      game?.opponentHands?.[oppBottom.playerId] ||
      game?.opponentHands?.[oppBottom.name]
    if (watched) return toCardsView(watched)
    if (oppHand) return toCardsView(oppHand)
    return {}
  }, [isSpectator, oppBottom, game?.watchedHands, game?.opponentHands])

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

  const currentOpp = useMemo(() => {
    if (topOpps.length <= 1) return topOpps[0]
    if (focusedOpponentId) {
      const found = topOpps.find((p) => p.playerId === focusedOpponentId)
      if (found) return found
    }
    const activeOpp = topOpps.find((p) => p.playerId === game?.activePlayerId)
    if (activeOpp) return activeOpp
    return topOpps[0]
  }, [topOpps, focusedOpponentId, game?.activePlayerId])

  return (
    <div className={`game-board ${topOpps.length > 1 ? 'commander-pod-mode' : ''}`} ref={boardRef}>
      <OpponentZone
        key={currentOpp?.playerId}
        player={currentOpp}
        onCardClick={onTargetClick}
        onCardHover={handleCardHover}
        targetIds={targetIdSet}
        revealedCards={getOpponentRevealedCards(game, currentOpp?.playerId, currentOpp?.name)}
      />
      <div className="board-divider" />
      <PlayerZone
        player={isSpectator ? oppBottom : me}
        hand={isSpectator ? spectatorBottomHand : (game?.myHand ?? {})}
        onCardClick={(id) => {
          if (combatSelectable.includes(id) || combatChosen.includes(id)) onCombatClick?.(id)
          else if (targetIds.includes(id)) onTargetClick?.(id)
          else if (playableIds.includes(id)) onPlayableClick?.(id)
        }}
        onHandCardClick={onHandCardClick}
        onCardHover={handleCardHover}
        targetIds={targetIdSet}
        playableIds={playableIdSet}
        combatSelectable={combatSelectable}
        combatChosen={combatChosen}
        crossZonePlayables={isSpectator ? [] : crossZonePlayables}
        onPlayCrossZone={onPlayCrossZone}
        helperEmblems={game?.myHelperEmblems}
      />
      <TargetingOverlay
        sourceId={targetSourceId}
        targetIds={targetIds}
        chosenIds={chosenTargetIds}
        cards={allTargetCards}
      />
      <FloatingCardPreview
        card={floatingCard}
        anchorRect={anchorRect}
        boardRect={boardRef.current?.getBoundingClientRect() ?? null}
      />
    </div>
  )
}
