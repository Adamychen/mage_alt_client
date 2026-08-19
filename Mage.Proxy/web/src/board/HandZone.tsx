import { useCallback, useEffect, useRef, useState } from 'react'
import type { CardView } from '../net/types'
import { awaitImageUrl } from '../cards/cardImages'
import CardSlot from './CardSlot'
import './HandZone.css'

const MIN_CARD_W = 40
const MAX_CARD_W = 160

interface HandZoneProps {
  cards: Record<string, CardView>
  onCardClick?: (id: string) => void
  playableIds?: Set<string>
  targetIds?: Set<string>
  faceDown?: boolean
  compact?: boolean
}

export default function HandZone({
  cards,
  onCardClick,
  playableIds = new Set(),
  targetIds = new Set(),
  faceDown = false,
  compact = false,
}: HandZoneProps) {
  const entries = Object.entries(cards)
  const [hoveredCard, setHoveredCard] = useState<{ id: string; url: string } | null>(null)
  const [hoverX, setHoverX] = useState(0)
  const zoneRef = useRef<HTMLDivElement>(null)
  const [cardW, setCardW] = useState(MAX_CARD_W)

  useEffect(() => {
    const el = zoneRef.current
    if (!el || !compact) return

    const measure = () => {
      const availW = el.getBoundingClientRect().width
      const count = entries.length
      if (count === 0 || availW <= 0) return

      const overlap = 0.4
      const w = Math.min(MAX_CARD_W, Math.max(MIN_CARD_W,
        availW / (count * (1 - overlap) + overlap)
      ))
      setCardW(w)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [entries.length, compact])

  const handleCardEnter = useCallback((id: string, card: CardView) => {
    if (faceDown) return
    awaitImageUrl(card).then((url) => {
      if (url) setHoveredCard({ id, url })
    })
  }, [faceDown])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!zoneRef.current || !compact) return
    const rect = zoneRef.current.getBoundingClientRect()
    setHoverX(e.clientX - rect.left)
  }, [compact])

  const handleCardLeave = useCallback(() => {
    setHoveredCard(null)
  }, [])

  return (
    <div
      ref={zoneRef}
      className={`hand-zone ${faceDown ? 'face-down' : ''} ${compact ? 'compact' : ''}`}
      onMouseMove={compact ? handleMouseMove : undefined}
      style={compact ? { '--card-w': `${cardW}px` } as React.CSSProperties : undefined}
    >
      {entries.map(([id, card], i) => {
        const n = entries.length
        const mid = (n - 1) / 2
        const offset = i - mid
        const rotate = compact ? offset * 4 : offset * 3.2
        const lift = compact ? 0 : -Math.pow(Math.abs(offset), 1.15) * 6
        return (
          <CardSlot
            key={id}
            card={card}
            onClick={onCardClick ? () => onCardClick(id) : undefined}
            isPlayable={playableIds.has(id)}
            isTarget={targetIds.has(id)}
            faceDown={faceDown}
            className="hand-card"
            style={{ '--fan-rot': `${rotate}deg`, '--fan-lift': `${lift}px`, zIndex: i } as React.CSSProperties}
            onHover={
              compact && !faceDown
                ? (c) => {
                    if (c) handleCardEnter(id, card)
                    else handleCardLeave()
                  }
                : undefined
            }
          />
        )
      })}
      {compact && hoveredCard && (
        <div
          className="hand-preview"
          style={{ '--preview-x': `${hoverX}px` } as React.CSSProperties}
        >
          <img src={hoveredCard.url} alt="" className="hand-preview-img" draggable={false} />
        </div>
      )}
    </div>
  )
}
