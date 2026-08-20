import { useEffect, useState } from 'react'
import { awaitImageUrl } from '../cards/cardImages'
import type { CardView } from '../net/types'
import './CardPreview.css'

interface Props {
  card: CardView | null
  onClose?: () => void
}

export default function CardPreview({ card, onClose }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!card) { setImageUrl(null); return }
    let cancelled = false
    awaitImageUrl(card).then((url) => {
      if (!cancelled) setImageUrl(url)
    })
    return () => { cancelled = true }
  }, [card?.name, card?.expansionSetCode, card?.cardNumber])

  if (!card) return <div className="card-preview card-preview--empty"><span className="card-preview-hint">Pasa el cursor sobre una carta</span></div>

  return (
    <div className="card-preview">
      <div className="card-preview-card">
        {imageUrl ? (
          <img src={imageUrl} alt={card.name} className="card-preview-img" />
        ) : (
          <div className="card-preview-placeholder">
            <span>{card.name}</span>
          </div>
        )}
      </div>
      <div className="card-preview-info">
        <div className="card-preview-name">{card.name}</div>
        {card.cardTypes && card.cardTypes.length > 0 && (
          <div className="card-preview-type">{card.cardTypes.join(' — ')}</div>
        )}
        {card.rules && card.rules.length > 0 && (
          <div className="card-preview-text">{card.rules.join('\n')}</div>
        )}
        {card.power !== undefined && card.toughness !== undefined && (
          <div className="card-preview-pt">{card.power}/{card.toughness}</div>
        )}
      </div>
      {onClose && (
        <button className="card-preview-close" onClick={onClose} title="Cerrar">×</button>
      )}
    </div>
  )
}
