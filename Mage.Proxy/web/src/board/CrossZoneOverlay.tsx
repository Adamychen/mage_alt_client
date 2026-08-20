import { useEffect, useCallback } from 'react'
import CardSlot from './CardSlot'
import type { CrossZonePlayable } from './crossZone'
import './PileOverlay.css'

interface CrossZoneOverlayProps {
  playables: CrossZonePlayable[]
  onClose: () => void
  onPlay: (id: string) => void
}

export default function CrossZoneOverlay({ playables, onClose, onPlay }: CrossZoneOverlayProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
   }, [onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
   }, [handleKeyDown])

  return (
    <div className="pile-overlay-backdrop" onClick={onClose}>
      <div className="pile-overlay cross-zone-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="pile-overlay-header">
          <h3>Lanzar desde otra zona ({playables.length})</h3>
          <button type="button" className="pile-overlay-close" onClick={onClose}>
          &times;
          </button>
        </div>
        <div className="pile-overlay-scroll">
          {playables.map(({ id, card, zone }) => (
             <div key={id} className="cross-zone-entry">
               <CardSlot cardId={id} card={card} className="pile-card" onClick={() => onPlay(id)} onHover={undefined} />
               <span className="cross-zone-source">{zone}</span>
             </div>
           ))}
          {playables.length === 0 && (
            <div className="pile-overlay-empty">Nada que lanzar desde otras zonas</div>
          )}
        </div>
      </div>
    </div>
  )
}
