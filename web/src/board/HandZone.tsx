import { useEffect, useRef, useState } from 'react'
import type { CardView } from '../net/types'
import CardSlot from './CardSlot'
import './HandZone.css'

const MIN_CARD_W = 40
const MAX_CARD_W = 160

interface HandZoneProps {
  cards: Record<string, CardView>
  onCardClick?: (id: string) => void
  onHover?: (card: CardView | null, rect?: DOMRect) => void
  playableIds?: Set<string>
  targetIds?: Set<string>
  faceDown?: boolean
  compact?: boolean
}

export default function HandZone({
  cards,
  onCardClick,
  onHover,
  playableIds = new Set(),
  targetIds = new Set(),
  faceDown = false,
  compact = false,
}: HandZoneProps) {
  const entries = Object.entries(cards)
  const zoneRef = useRef<HTMLDivElement>(null)
  const [cardW, setCardW] = useState(MAX_CARD_W)

  useEffect(() => {
    const el = zoneRef.current
    if (!el || !compact) return

    const measure = () => {
      const availW = el.getBoundingClientRect().width
      const availH = el.getBoundingClientRect().height
      const count = entries.length
      if (count === 0 || availW <= 0) return

      const overlap = 0.35
      const wByWidth = availW / (count * (1 - overlap) + overlap)
      const maxH = availH > 20 ? availH - 4 : MAX_CARD_W * 1.4
      const wByHeight = maxH / 1.4
      const w = Math.min(MAX_CARD_W, Math.max(MIN_CARD_W, Math.min(wByWidth, wByHeight)))
      setCardW(w)
    }

    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [entries.length, compact])

  return (
    <div
      ref={zoneRef}
      className={`hand-zone ${faceDown ? 'face-down' : ''} ${compact ? 'compact' : ''}`}
      style={compact ? { '--card-w': `${cardW}px` } as React.CSSProperties : undefined}
    >
      {entries.map(([id, card], i) => {
        const isCardFaceDown = faceDown || card.faceDown === true
        return (
          <div
            key={id}
            className="hand-card-slot"
            style={{ zIndex: i } as React.CSSProperties}
            onMouseEnter={!isCardFaceDown && onHover ? (e) => onHover(card, e.currentTarget.getBoundingClientRect()) : undefined}
            onMouseLeave={!isCardFaceDown && onHover ? () => onHover(null) : undefined}
          >
            <CardSlot
              cardId={id}
              card={card}
              onClick={onCardClick ? () => onCardClick(id) : undefined}
              isPlayable={playableIds.has(id)}
              isTarget={targetIds.has(id)}
              faceDown={isCardFaceDown}
              className="hand-card"
            />
          </div>
        )
      })}
    </div>
  )
}
