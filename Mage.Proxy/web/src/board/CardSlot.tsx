import { useEffect, useState } from 'react'
import type { CardView, PermanentView } from '../net/types'
import { awaitImageUrl, cardName } from '../cards/cardImages'
import './CardSlot.css'

interface CardSlotProps {
  cardId?: string
  card: CardView | PermanentView
  onClick?: () => void
  onHover?: (card: CardView | PermanentView | null) => void
  isTarget?: boolean
  isPlayable?: boolean
  isChosen?: boolean
  tapped?: boolean
  faceDown?: boolean
  className?: string
  style?: React.CSSProperties
  showPt?: boolean
  showCounters?: boolean
  showDamage?: boolean
}

export default function CardSlot({
  cardId,
  card,
  onClick,
  onHover,
  isTarget = false,
  isPlayable = false,
  isChosen = false,
  tapped = false,
  faceDown = false,
  className = '',
  style,
  showPt = false,
  showCounters = false,
  showDamage = false,
}: CardSlotProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null)

  useEffect(() => {
    if (faceDown) return
    let cancelled = false
    awaitImageUrl(card).then((url) => {
      if (!cancelled) setImgUrl(url)
    })
    return () => { cancelled = true }
  }, [card.expansionSetCode, card.cardNumber, faceDown])

  const perm = card as PermanentView
  const counters = card.counters ?? []
  const totalCounters = counters.reduce((a, c) => a + c.count, 0)

  return (
    <div
      data-card-id={cardId}
      className={[
        'card-slot',
        tapped ? 'tapped' : '',
        isTarget ? 'targetable' : '',
        isPlayable ? 'playable' : '',
        isChosen ? 'chosen' : '',
        faceDown ? 'face-down' : '',
        onClick ? 'clickable' : '',
        className,
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      onMouseEnter={onHover ? () => onHover(card) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      style={style}
    >
      {faceDown ? (
        <div className="card-back">
          <div className="card-back-inner">
            <div className="card-back-diamond" />
          </div>
        </div>
      ) : imgUrl ? (
        <img
          src={imgUrl}
          alt={cardName(card)}
          className="card-image"
          draggable={false}
        />
      ) : (
        <div className="card-placeholder">
          <span className="card-placeholder-name">{cardName(card)}</span>
        </div>
      )}

      {showPt && perm.power && perm.toughness && (
        <div className="pt-badge">{perm.power}/{perm.toughness}</div>
      )}

      {showCounters && totalCounters > 0 && (
        <div className="counter-badge">+{totalCounters}</div>
      )}

      {showDamage && perm.damage && perm.damage > 0 && (
        <div className="damage-badge">{perm.damage}</div>
      )}
    </div>
  )
}
