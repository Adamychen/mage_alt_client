import { useEffect, useMemo, useState } from 'react'
import type { CardView, PermanentView } from '../net/types'
import { awaitImageUrl, cardName, getSourceCardName, isAbilityCard } from '../cards/cardImages'
import './FloatingCardPreview.css'

interface FloatingCardPreviewProps {
  card: CardView | PermanentView | null
  anchorRect: DOMRect | null
  boardRect?: DOMRect | null
  fixedSide?: 'left' | 'right' | 'auto'
}

const PREVIEW_WIDTH = 270
const PREVIEW_HEIGHT = 378

export default function FloatingCardPreview({
  card,
  anchorRect,
  boardRect,
  fixedSide = 'auto',
}: FloatingCardPreviewProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [showBackFace, setShowBackFace] = useState(false)

  // Reset face toggle whenever the card changes
  useEffect(() => {
    setShowBackFace(false)
  }, [card?.id, card?.name])

  const hasSecondFace = !card?.faceDown && (!!card?.secondCardFace || !!card?.transformable || !!card?.alternateName)

  // Keyboard shortcut: Press Shift or F while hovering to flip
  useEffect(() => {
    if (!hasSecondFace) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.key.toLowerCase() === 'f') {
        setShowBackFace((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasSecondFace])

  // Determine which face to display
  const activeCard: CardView | PermanentView | null = useMemo(() => {
    if (!card) return null
    const isTransformedOnField = (card as PermanentView).transformed === true
    const shouldShowBack = isTransformedOnField ? !showBackFace : showBackFace

    if (!shouldShowBack) {
      return { ...card, isFrontFace: true, isSecondCardFace: false } as CardView | PermanentView
    }
    if (card.secondCardFace) {
      return {
        ...card.secondCardFace,
        isSecondCardFace: true,
        expansionSetCode: card.secondCardFace.expansionSetCode || card.expansionSetCode,
        cardNumber: card.secondCardFace.cardNumber || card.cardNumber,
      } as CardView | PermanentView
    }
    if (card.alternateName) {
      return {
        ...card,
        name: card.alternateName,
        displayName: card.alternateName,
        isSecondCardFace: true,
      } as CardView | PermanentView
    }
    return { ...card, isSecondCardFace: true } as CardView | PermanentView
  }, [card, showBackFace])

  useEffect(() => {
    if (!activeCard || activeCard.faceDown) {
      setImgUrl(null)
      return
    }
    let cancelled = false
    awaitImageUrl(activeCard).then((url) => {
      if (!cancelled) setImgUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [
    activeCard?.name,
    activeCard?.expansionSetCode,
    activeCard?.cardNumber,
    activeCard?.faceDown,
    (activeCard as any)?.isSecondCardFace,
    (activeCard as any)?.isFrontFace,
    showBackFace,
  ])

  if (!card || !anchorRect || card.faceDown || !activeCard) {
    return null
  }

  let style: React.CSSProperties = {}

  if (boardRect) {
    const relLeft = anchorRect.left - boardRect.left
    const relTop = anchorRect.top - boardRect.top
    const relRight = anchorRect.right - boardRect.left
    const relBottom = anchorRect.bottom - boardRect.top

    // Check if card is in the bottom hand area
    const isHandCard = relBottom > boardRect.height - 140

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
  } else {
    // Fixed viewport positioning (e.g. from ActionFeed sidebar)
    const fitsLeft = anchorRect.left - PREVIEW_WIDTH - 16 >= 12
    const left = fixedSide === 'left' || fitsLeft
      ? Math.max(12, anchorRect.left - PREVIEW_WIDTH - 16)
      : Math.min(window.innerWidth - PREVIEW_WIDTH - 12, anchorRect.right + 16)

    const top = Math.max(
      12,
      Math.min(
        window.innerHeight - PREVIEW_HEIGHT - 12,
        anchorRect.top + anchorRect.height / 2 - PREVIEW_HEIGHT / 2
      )
    )

    style = {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${PREVIEW_WIDTH}px`,
      height: `${PREVIEW_HEIGHT}px`,
      zIndex: 10000,
    }
  }

  const isAbility = isAbilityCard(activeCard)
  const perm = activeCard as PermanentView
  const name = isAbility ? getSourceCardName(activeCard) : cardName(activeCard)
  const manaCost = (activeCard.manaCostLeftStr ?? []).join('')
  const rules = activeCard.rules ?? []

  return (
    <div className="floating-card-preview" style={style}>
      <div className="floating-card-inner">
        {/* Flip Hint Badge (Double-faced / Transform / MDFC) */}
        {hasSecondFace && (
          <div className="floating-card-flip-badge" title="Pulsa Shift o F para voltear">
            <span className="flip-icon">🔄</span>
            <span className="flip-label">{showBackFace ? 'Reverso' : 'Anverso'} (Shift / F)</span>
          </div>
        )}

        {imgUrl ? (
          <img src={imgUrl} alt={name} className="floating-card-img" draggable={false} />
        ) : (
          <div className="floating-card-fallback">
            <div className="floating-card-header">
              <span className="floating-card-name">{name}</span>
              {manaCost && <span className="floating-card-mana">{manaCost}</span>}
            </div>
            {activeCard.cardTypes && activeCard.cardTypes.length > 0 && (
              <div className="floating-card-type">{activeCard.cardTypes.join(' — ')}</div>
            )}
            {rules.length > 0 && (
              <div className="floating-card-rules">{rules.join('\n')}</div>
            )}
          </div>
        )}

        {/* P/T Badge (Creatures only) */}
        {activeCard.cardTypes?.some((t) => String(t).toLowerCase() === 'creature') && perm.power && perm.toughness && (
          <div className="floating-card-pt">
            {perm.power}/{perm.toughness}
          </div>
        )}

        {/* Counters Badge */}
        {activeCard.counters && activeCard.counters.length > 0 && (
          <div className="floating-card-counters">
            +{activeCard.counters.reduce((sum, c) => sum + c.count, 0)} contadores
          </div>
        )}

        {/* Token Badge */}
        {(perm.isToken || activeCard.mageObjectType === 'TOKEN') && !perm.copy && (
          <div className="floating-card-token-badge">TOKEN</div>
        )}
      </div>
    </div>
  )
}
