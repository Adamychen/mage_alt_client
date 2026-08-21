import { useEffect, useState } from 'react'
import type { CardView, PermanentView } from '../net/types'
import { awaitImageUrl, cardName } from '../cards/cardImages'
import './CardSlot.css'

const CARD_BACK_URL = 'https://cards.scryfall.io/back.png'

interface CardSlotProps {
  cardId?: string
  card: CardView | PermanentView
  onClick?: () => void
  onHover?: (card: CardView | PermanentView | null, rect?: DOMRect) => void
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
  const isCreature = (perm.cardTypes ?? []).some((t) => t === 'Creature' || t.toLowerCase() === 'creature') || (perm.power != null && perm.toughness != null)
  const hasSummoningSickness = isCreature && !tapped && perm.summoningSickness === true

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
      onMouseEnter={onHover ? (e) => onHover(card, e.currentTarget.getBoundingClientRect()) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      style={style}
    >
      {faceDown ? (
        <img src={CARD_BACK_URL} alt="" className="card-image" draggable={false} />
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

      {/* Creature Power / Toughness Badge */}
      {showPt && perm.power && perm.toughness && (
        <div className="pt-badge">{perm.power}/{perm.toughness}</div>
      )}

      {/* Planeswalker Loyalty Badge */}
      {perm.loyalty && (
        <div className="loyalty-badge" title={`Lealtad: ${perm.loyalty}`}>
          <span className="loyalty-icon">🛡️</span>
          <span className="loyalty-val">{perm.loyalty}</span>
        </div>
      )}

      {/* Battle Defense Badge */}
      {perm.defense && (
        <div className="defense-badge" title={`Defensa: ${perm.defense}`}>
          <span className="defense-icon">⚔️</span>
          <span className="defense-val">{perm.defense}</span>
        </div>
      )}

      {/* +1/+1 and generic Counters */}
      {showCounters && totalCounters > 0 && (
        <div className="counter-badge">+{totalCounters}</div>
      )}

      {/* Accumulated Combat Damage */}
      {showDamage && perm.damage && perm.damage > 0 && (
        <div className="damage-badge">{perm.damage}</div>
      )}

      {/* Summoning Sickness indicator */}
      {hasSummoningSickness && (
        <div className="sickness-badge" title="Mareo de invocación (No puede atacar ni girarse este turno)">
          🌀
        </div>
      )}

      {/* Face-down Special Type Badges (Morph / Manifest / Disguise / Cloak) */}
      {faceDown && (
        <div className="facedown-badges">
          {perm.morphed && <span className="facedown-type-badge morph" title="Metamorfosis">Morph</span>}
          {perm.manifested && <span className="facedown-type-badge manifest" title="Manifestado">Manifest</span>}
          {perm.disguised && <span className="facedown-type-badge disguise" title="Disfraz">Disguise</span>}
          {perm.cloaked && <span className="facedown-type-badge cloak" title="Encubierto">Cloak</span>}
        </div>
      )}
    </div>
  )
}
