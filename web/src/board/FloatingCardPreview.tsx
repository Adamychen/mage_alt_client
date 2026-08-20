import { useEffect, useState } from 'react'
import type { CardView, PermanentView } from '../net/types'
import { awaitImageUrl, cardName, getSourceCardName, isAbilityCard } from '../cards/cardImages'
import './FloatingCardPreview.css'

interface FloatingCardPreviewProps {
  card: CardView | PermanentView | null
  anchorRect: DOMRect | null
  boardRect: DOMRect | null
}

const PREVIEW_WIDTH = 270
const PREVIEW_HEIGHT = 378

export default function FloatingCardPreview({
  card,
  anchorRect,
  boardRect,
}: FloatingCardPreviewProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!card || card.faceDown) {
      setImgUrl(null)
      return
    }
    let cancelled = false
    awaitImageUrl(card).then((url) => {
      if (!cancelled) setImgUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [card?.name, card?.expansionSetCode, card?.cardNumber, card?.faceDown])

  if (!card || !anchorRect || !boardRect || card.faceDown) {
    return null
  }

  const relLeft = anchorRect.left - boardRect.left
  const relTop = anchorRect.top - boardRect.top
  const relRight = anchorRect.right - boardRect.left
  const relBottom = anchorRect.bottom - boardRect.top

  // Check if card is in the bottom hand area
  const isHandCard = relBottom > boardRect.height - 140

  let style: React.CSSProperties = {}

  if (isHandCard) {
    // Rise upwards directly above the hand
    const left = Math.max(
      12,
      Math.min(boardRect.width - PREVIEW_WIDTH - 12, relLeft + anchorRect.width / 2 - PREVIEW_WIDTH / 2)
    )
    const bottom = Math.max(12, boardRect.height - relTop + 12)
    style = {
      position: 'absolute',
      left: `${left}px`,
      bottom: `${bottom}px`,
      width: `${PREVIEW_WIDTH}px`,
      height: `${PREVIEW_HEIGHT}px`,
    }
  } else {
    // Battlefield/Opponent/Stack: place to the right if fits, otherwise to the left
    const fitsRight = relRight + 16 + PREVIEW_WIDTH <= boardRect.width - 12
    const left = fitsRight
      ? relRight + 16
      : Math.max(12, relLeft - PREVIEW_WIDTH - 16)

    const top = Math.max(
      12,
      Math.min(
        boardRect.height - PREVIEW_HEIGHT - 12,
        relTop + anchorRect.height / 2 - PREVIEW_HEIGHT / 2
      )
    )

    style = {
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${PREVIEW_WIDTH}px`,
      height: `${PREVIEW_HEIGHT}px`,
    }
  }

  const isAbility = isAbilityCard(card)
  const perm = card as PermanentView
  const name = isAbility ? getSourceCardName(card) : cardName(card)
  const manaCost = (card.manaCostLeftStr ?? []).join('')
  const rules = card.rules ?? []

  return (
    <div className="floating-card-preview" style={style}>
      <div className="floating-card-inner">
        {imgUrl ? (
          <img src={imgUrl} alt={name} className="floating-card-img" draggable={false} />
        ) : (
          <div className="floating-card-fallback">
            <div className="floating-card-header">
              <span className="floating-card-name">{name}</span>
              {manaCost && <span className="floating-card-mana">{manaCost}</span>}
            </div>
            {card.cardTypes && card.cardTypes.length > 0 && (
              <div className="floating-card-type">{card.cardTypes.join(' — ')}</div>
            )}
            {rules.length > 0 && (
              <div className="floating-card-rules">{rules.join('\n')}</div>
            )}
          </div>
        )}

        {/* P/T Badge */}
        {perm.power !== undefined && perm.toughness !== undefined && (
          <div className="floating-card-pt">
            {perm.power}/{perm.toughness}
          </div>
        )}

        {/* Counters Badge */}
        {card.counters && card.counters.length > 0 && (
          <div className="floating-card-counters">
            +{card.counters.reduce((sum, c) => sum + c.count, 0)} contadores
          </div>
        )}

        {/* Token Badge */}
        {(perm.isToken || card.mageObjectType === 'TOKEN') && !perm.copy && (
          <div className="floating-card-token-badge">TOKEN</div>
        )}
      </div>
    </div>
  )
}
