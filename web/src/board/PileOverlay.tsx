import { useEffect, useCallback, useMemo } from 'react'
import type { CardView } from '../net/types'
import CardSlot from './CardSlot'
import './PileOverlay.css'

interface PileOverlayProps {
  title: string
  cards: Record<string, CardView>
  onClose: () => void
  playableIds?: Set<string>
  onPlayCard?: (id: string) => void
}

export default function PileOverlay({ title, cards, onClose, playableIds, onPlayCard }: PileOverlayProps) {
  const entries = Object.entries(cards)
  const playableSet = useMemo(() => playableIds ?? new Set<string>(), [playableIds])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="pile-overlay-backdrop" onClick={onClose}>
      <div className="pile-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="pile-overlay-header">
          <h3>{title} ({entries.length})</h3>
          <button type="button" className="pile-overlay-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="pile-overlay-scroll">
          {entries.map(([id, card]) => (
            <CardSlot
              key={id}
              cardId={id}
              card={card}
              className="pile-card"
              isPlayable={playableSet.has(id)}
              onClick={playableSet.has(id) && onPlayCard ? () => onPlayCard(id) : undefined}
            />
          ))}
          {entries.length === 0 && (
            <div className="pile-overlay-empty">Vacío</div>
          )}
        </div>
      </div>
    </div>
  )
}
