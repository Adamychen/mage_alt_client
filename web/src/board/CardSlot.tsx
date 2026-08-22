import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CardView, PermanentView } from '../net/types'
import { awaitImageUrl, cardName } from '../cards/cardImages'
import { getPreviousCardPosition, getPreviousCardZone, recordCardPosition } from './cardPositionRegistry'
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
  const slotRef = useRef<HTMLDivElement>(null)
  const isFirstMountRef = useRef(true)

  const effectiveId = cardId || (card as any).id

  useLayoutEffect(() => {
    const el = slotRef.current
    if (!el || !effectiveId) return

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false
      if (el.closest('.feedback-dialog, .library-order-dialog, .card-grid, .mechanics-tray')) {
        return
      }
      const lastRect = el.getBoundingClientRect()
      if (lastRect.width > 0 && lastRect.height > 0) {
        const prevRect = getPreviousCardPosition(effectiveId)
        if (prevRect && prevRect.width > 0) {
          const prevZone = getPreviousCardZone(effectiveId)
          const curZone = el.closest('.opponent-zone, .player-zone, .stack-zone, .hand-zone')
          const curZoneClass = curZone ? curZone.className.split(' ')[0] : ''
          if (prevZone && curZoneClass && prevZone === curZoneClass) {
            return
          }
          const dx = prevRect.left + prevRect.width / 2 - (lastRect.left + lastRect.width / 2)
          const dy = prevRect.top + prevRect.height / 2 - (lastRect.top + lastRect.height / 2)

          if (Math.hypot(dx, dy) > 20) {
            const scale = Math.min(1.15, Math.max(0.7, prevRect.width / lastRect.width))
            el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`
            el.style.transition = 'none'
            el.style.zIndex = '60'
            el.style.boxShadow = '0 16px 36px rgba(0, 0, 0, 0.85), 0 0 16px rgba(255, 208, 112, 0.35)'

            const raf = requestAnimationFrame(() => {
              el.style.transition = 'transform 460ms cubic-bezier(0.19, 1, 0.22, 1), box-shadow 460ms ease'
              el.style.transform = ''
              el.style.boxShadow = ''

              const timer = setTimeout(() => {
                if (el) {
                  el.style.transition = ''
                  el.style.transform = ''
                  el.style.zIndex = ''
                  el.style.boxShadow = ''
                }
              }, 480)

              return () => clearTimeout(timer)
            })

            return () => cancelAnimationFrame(raf)
          }
        }
      }
    }

    return () => {
      if (el && effectiveId) {
        const zone = el.closest('.opponent-zone, .player-zone, .stack-zone, .hand-zone')
        const zoneClass = zone ? zone.className.split(' ')[0] : ''
        recordCardPosition(effectiveId, el.getBoundingClientRect(), zoneClass)
      }
    }
  }, [effectiveId])

  useEffect(() => {
    if (faceDown) return
    let cancelled = false
    awaitImageUrl(card).then((url) => {
      if (!cancelled) setImgUrl(url)
    })
    return () => { cancelled = true }
  }, [card.expansionSetCode, card.cardNumber, card.name, (card as any).displayName, faceDown])

  const perm = card as PermanentView
  const counters = card.counters ?? []
  const totalCounters = counters.reduce((a, c) => a + c.count, 0)

  // Strict Type Checks
  const types = (card.cardTypes ?? []).map((t) => String(t).toLowerCase())
  const isCreature = types.includes('creature') || String(card.mageObjectType ?? '').toUpperCase().includes('CREATURE')
  const isLand = types.includes('land')
  const isRealCreature = isCreature && (!isLand || types.includes('creature'))
  const isPlaneswalker = types.includes('planeswalker') || String(card.mageObjectType ?? '').toUpperCase().includes('PLANESWALKER')
  const isBattle = types.includes('battle') || String(card.mageObjectType ?? '').toUpperCase().includes('BATTLE')
  const isFlipped = perm.flipped === true

  const loyaltyVal = perm.loyalty ? parseInt(String(perm.loyalty), 10) : 0
  const defenseVal = perm.defense ? parseInt(String(perm.defense), 10) : 0

  const hasSummoningSickness = isRealCreature && !tapped && perm.summoningSickness === true

  return (
    <div
      ref={slotRef}
      data-card-id={cardId}
      className={[
        'card-slot',
        tapped ? 'tapped' : '',
        isTarget ? 'targetable' : '',
        isPlayable ? 'playable' : '',
        isChosen ? 'chosen' : '',
        faceDown ? 'face-down' : '',
        isFlipped ? 'is-flipped-card' : '',
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

      {/* Creature Power / Toughness Badge (Creatures only) */}
      {showPt && isRealCreature && perm.power != null && perm.toughness != null && (
        <div className="pt-badge">{perm.power}/{perm.toughness}</div>
      )}

      {/* Planeswalker Loyalty Badge (Planeswalkers only) */}
      {isPlaneswalker && loyaltyVal > 0 && (
        <div className="loyalty-badge" title={`Lealtad: ${perm.loyalty}`}>
          <span className="loyalty-icon">🛡️</span>
          <span className="loyalty-val">{perm.loyalty}</span>
        </div>
      )}

      {/* Battle Defense Badge (Battles only) */}
      {isBattle && defenseVal > 0 && (
        <div className="defense-badge" title={`Defensa: ${perm.defense}`}>
          <span className="defense-icon">⚔️</span>
          <span className="defense-val">{perm.defense}</span>
        </div>
      )}

      {/* +1/+1 and generic Counters */}
      {showCounters && totalCounters > 0 && (
        <div className="counter-badge">+{totalCounters}</div>
      )}

      {/* Accumulated Combat Damage (Creatures & Planeswalkers only) */}
      {showDamage && isRealCreature && perm.damage && perm.damage > 0 && (
        <div className="damage-badge">{perm.damage}</div>
      )}

      {/* Summoning Sickness indicator (Creatures only) */}
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

      {/* Transform / Double-Faced Indicator Badge */}
      {(card.transformable || card.secondCardFace != null || card.alternateName != null) && !faceDown && (
        <div
          className={`card-transform-badge ${perm.transformed ? 'is-transformed' : ''}`}
          title={perm.transformed ? 'Carta transformada (Reverso)' : 'Carta de doble cara (Anverso)'}
        >
          {perm.transformed ? '🌙' : '☀️'}
        </div>
      )}
    </div>
  )
}
