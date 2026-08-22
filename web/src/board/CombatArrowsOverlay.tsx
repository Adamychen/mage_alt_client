import { useEffect, useState, useMemo, useCallback } from 'react'
import type { GameView } from '../net/types'
import './CombatArrowsOverlay.css'

interface ArrowItem {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  type: 'attack' | 'block' | 'target'
}

interface CombatArrowsOverlayProps {
  game: GameView | null
  boardRef: React.RefObject<HTMLDivElement | null>
  targetSourceId?: string
  chosenTargetIds?: string[]
  combatChosen?: string[]
  combatMode?: 'attack' | 'block' | null
}

const EMPTY_ARRAY: string[] = []

export default function CombatArrowsOverlay({
  game,
  boardRef,
  targetSourceId,
  chosenTargetIds = EMPTY_ARRAY,
  combatChosen = EMPTY_ARRAY,
  combatMode,
}: CombatArrowsOverlayProps) {
  const [arrows, setArrows] = useState<ArrowItem[]>([])

  const me = useMemo(() => game?.players?.find((p) => p.controlled), [game?.players])
  const opp = useMemo(() => game?.players?.find((p) => !p.controlled), [game?.players])

  const computeArrows = useCallback((): ArrowItem[] => {
    const boardEl = boardRef.current
    if (!boardEl || !game) {
      return []
    }

    const boardRect = boardEl.getBoundingClientRect()
    const newArrows: ArrowItem[] = []

    const getCenter = (id: string): { x: number; y: number } | null => {
      const cardEl = boardEl.querySelector(`[data-card-id="${id}"]`) || document.querySelector(`[data-card-id="${id}"]`)
      if (cardEl) {
        const rect = cardEl.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.left + rect.width / 2 - boardRect.left,
            y: rect.top + rect.height / 2 - boardRect.top,
          }
        }
      }
      const playerEl = boardEl.querySelector(`[data-player-id="${id}"]`) || document.querySelector(`[data-player-id="${id}"]`)
      if (playerEl) {
        const rect = playerEl.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.left + rect.width / 2 - boardRect.left,
            y: rect.top + rect.height / 2 - boardRect.top,
          }
        }
      }
      return null
    }

    // 1. Attack arrows from game.combat groups
    if (Array.isArray(game.combat) && game.combat.length > 0) {
      game.combat.forEach((group, gi) => {
        const record = group as Record<string, unknown>
        const attackersObj = record.attackers
        const attackerIds = Array.isArray(attackersObj)
          ? attackersObj
          : attackersObj && typeof attackersObj === 'object'
          ? Object.keys(attackersObj)
          : []

        attackerIds.forEach((attId) => {
          let defenderId = (record.defenderId as string) || null

          if (!defenderId) {
            // If attacker is controlled by me or it's my turn, target opponent; otherwise target me (defending player)
            const isMyAttacker = me && String(attId) in (me.battlefield ?? {})
            const isMyTurn = game.activePlayerId === me?.playerId
            if (isMyAttacker || isMyTurn) {
              defenderId = opp ? opp.playerId : null
            } else {
              defenderId = me ? me.playerId : null
            }
          }

          if (defenderId) {
            const defCenter = getCenter(defenderId)
            const attCenter = getCenter(String(attId))
            if (defCenter && attCenter) {
              newArrows.push({
                id: `att-${gi}-${attId}`,
                x1: attCenter.x,
                y1: attCenter.y,
                x2: defCenter.x,
                y2: defCenter.y,
                type: 'attack',
              })
            }
          }
        })

        // 2. Block arrows from group.blockers -> attackers
        const blockersObj = record.blockers
        const blockerIds = Array.isArray(blockersObj)
          ? blockersObj
          : blockersObj && typeof blockersObj === 'object'
          ? Object.keys(blockersObj)
          : []

        if (attackerIds.length > 0) {
          const firstAttCenter = getCenter(String(attackerIds[0]))
          if (firstAttCenter) {
            blockerIds.forEach((blkId) => {
              const blkCenter = getCenter(String(blkId))
              if (blkCenter) {
                newArrows.push({
                  id: `blk-${gi}-${blkId}`,
                  x1: blkCenter.x,
                  y1: blkCenter.y,
                  x2: firstAttCenter.x,
                  y2: firstAttCenter.y,
                  type: 'block',
                })
              }
            })
          }
        }
      })
    }

    // 3. Attack arrows from combatChosen during DECLARE_ATTACKERS
    if (combatMode === 'attack' && combatChosen.length > 0 && opp) {
      const oppCenter = getCenter(opp.playerId)
      if (oppCenter) {
        combatChosen.forEach((attId) => {
          if (!newArrows.some((a) => a.id.includes(attId) && a.type === 'attack')) {
            const attCenter = getCenter(attId)
            if (attCenter) {
              newArrows.push({
                id: `chosen-att-${attId}`,
                x1: attCenter.x,
                y1: attCenter.y,
                x2: oppCenter.x,
                y2: oppCenter.y,
                type: 'attack',
              })
            }
          }
        })
      }
    }

    // 4. Targeting arrows from targetSourceId -> chosenTargetIds
    if (targetSourceId && chosenTargetIds.length > 0) {
      const sourceCenter = getCenter(targetSourceId)
      if (sourceCenter) {
        chosenTargetIds.forEach((tgtId, ti) => {
          const tgtCenter = getCenter(tgtId)
          if (tgtCenter) {
            newArrows.push({
              id: `target-${ti}-${tgtId}`,
              x1: sourceCenter.x,
              y1: sourceCenter.y,
              x2: tgtCenter.x,
              y2: tgtCenter.y,
              type: 'target',
            })
          }
        })
      }
    }

    // 5. Stack spell/ability targeting arrows from stack items -> their targets
    if (game.stack && typeof game.stack === 'object') {
      Object.entries(game.stack).forEach(([stackId, stackCard]) => {
        const sourceCenter = getCenter(stackId)
        if (!sourceCenter) return

        const cardObj = stackCard as unknown as Record<string, unknown>
        const targets = cardObj.targets ?? cardObj.targetIds ?? cardObj.chosenTargets ?? []
        const targetList: string[] = Array.isArray(targets)
          ? targets.map((t: any) => typeof t === 'string' ? t : t?.id).filter(Boolean)
          : typeof targets === 'object' && targets !== null
          ? Object.keys(targets)
          : []

        targetList.forEach((tgtId, ti) => {
          const tgtCenter = getCenter(tgtId)
          if (tgtCenter) {
            newArrows.push({
              id: `stack-target-${stackId}-${ti}-${tgtId}`,
              x1: sourceCenter.x,
              y1: sourceCenter.y,
              x2: tgtCenter.x,
              y2: tgtCenter.y,
              type: 'target',
            })
          }
        })
      })
    }

    return newArrows
  }, [game, boardRef, targetSourceId, chosenTargetIds, combatChosen, combatMode, opp])

  useEffect(() => {
    const update = () => {
      setArrows(computeArrows())
    }
    update()
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
    }
  }, [computeArrows])

  if (arrows.length === 0) return null

  return (
    <svg className="combat-arrows-overlay" aria-hidden="true">
      <defs>
        {/* Attack Arrow Marker (Red / Crimson) */}
        <marker
          id="marker-attack"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#ff4757" />
        </marker>

        {/* Block Arrow Marker (Cyan / Blue) */}
        <marker
          id="marker-block"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#38bdf8" />
        </marker>

        {/* Target Arrow Marker (Gold / Amber) */}
        <marker
          id="marker-target"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#ffd070" />
        </marker>

        {/* Glow Filters */}
        <filter id="glow-attack" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="glow-block" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="glow-target" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {arrows.map((a) => {
        // Curve control point
        const dx = a.x2 - a.x1
        const dy = a.y2 - a.y1
        const mx = (a.x1 + a.x2) / 2
        const my = (a.y1 + a.y2) / 2
        // Slight curvature perpendicular to direction
        const curveFactor = 0.15
        const cx = mx - dy * curveFactor
        const cy = my + dx * curveFactor

        const pathData = `M ${a.x1} ${a.y1} Q ${cx} ${cy} ${a.x2} ${a.y2}`

        return (
          <g key={a.id} className={`arrow-group arrow-${a.type}`}>
            {/* Background shadow stroke */}
            <path
              d={pathData}
              className="arrow-shadow"
            />
            {/* Glowing animated path */}
            <path
              d={pathData}
              className={`arrow-path arrow-${a.type}`}
              markerEnd={`url(#marker-${a.type})`}
              filter={`url(#glow-${a.type})`}
            />
          </g>
        )
      })}
    </svg>
  )
}
