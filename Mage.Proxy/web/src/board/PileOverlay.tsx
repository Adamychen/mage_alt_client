import { useEffect, useCallback } from 'react'
import type { CardView } from '../net/types'
import CardSlot from './CardSlot'
import './PileOverlay.css'

interface PileOverlayProps {
  title: string
  cards: Record<string, CardView>
  onClose: () => void
}

export default function PileOverlay({ title, cards, onClose }: PileOverlayProps) {
  const entries = Object.entries(cards)

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
              card={card}
              className="pile-card"
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
