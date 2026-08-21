import { useEffect, useCallback, useMemo, useState } from 'react'
import type { CardView } from '../net/types'
import CardSlot from './CardSlot'
import FloatingCardPreview from './FloatingCardPreview'
import './PileOverlay.css'

interface PileOverlayProps {
  title: string
  cards: Record<string, CardView>
  onClose: () => void
  playableIds?: Set<string>
  onPlayCard?: (id: string) => void
  isLibrary?: boolean
}

export default function PileOverlay({
  title,
  cards,
  onClose,
  playableIds,
  onPlayCard,
  isLibrary = false,
}: PileOverlayProps) {
  const entries = Object.entries(cards)
  const playableSet = useMemo(() => playableIds ?? new Set<string>(), [playableIds])
  const [hoverCard, setHoverCard] = useState<CardView | null>(null)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleCardHover = (card: any, rect?: DOMRect) => {
    if (card?.faceDown) {
      setHoverCard(null)
      setHoverRect(null)
      return
    }
    setHoverCard(card ?? null)
    setHoverRect(rect ?? null)
  }

  const knownCount = entries.filter(([, c]) => !c.faceDown).length

  return (
    <div className="pile-overlay-backdrop" onClick={onClose}>
      <div className={`pile-overlay ${isLibrary ? 'library-overlay' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="pile-overlay-header">
          <div className="pile-header-titles">
            <h3>{title} ({entries.length} cartas)</h3>
            {isLibrary && (
              <span className="pile-header-subtitle">
                {knownCount > 0
                  ? `👁️ ${knownCount} carta${knownCount > 1 ? 's' : ''} revelada${knownCount > 1 ? 's' : ''} · #1 es la carta superior (Top)`
                  : 'Orden de biblioteca: #1 es la carta superior (Top)'}
              </span>
            )}
          </div>
          <button type="button" className="pile-overlay-close" onClick={onClose} title="Cerrar (Esc)">
            &times;
          </button>
        </div>
        <div className="pile-overlay-scroll">
          {entries.map(([id, card], index) => {
            const isTop = isLibrary && index === 0
            const isRevealed = !card.faceDown

            return (
              <div key={id} className={`pile-card-wrapper ${isTop ? 'is-top-card' : ''} ${isRevealed ? 'is-revealed' : ''}`}>
                {isLibrary && (
                  <div className={`pile-position-badge ${isTop ? 'top-badge' : ''} ${isRevealed ? 'revealed-badge' : ''}`}>
                    {isTop ? '★ #1 TOP' : `#${index + 1}`}
                    {isRevealed && <span className="revealed-icon"> 👁️</span>}
                  </div>
                )}
                <CardSlot
                  cardId={id}
                  card={card}
                  faceDown={card.faceDown === true}
                  className="pile-card"
                  isPlayable={playableSet.has(id)}
                  onClick={playableSet.has(id) && onPlayCard ? () => onPlayCard(id) : undefined}
                  onHover={handleCardHover}
                />
              </div>
            )
          })}
          {entries.length === 0 && (
            <div className="pile-overlay-empty">{isLibrary ? 'Biblioteca vacía' : 'Vacío'}</div>
          )}
        </div>
      </div>

      <FloatingCardPreview
        card={hoverCard}
        anchorRect={hoverRect}
        fixedSide="left"
      />
    </div>
  )
}
