import React, { useEffect, useState } from 'react'
import type { ActionFeedItem } from './gameEventParser'
import { awaitImageUrl } from '../cards/cardImages'
import './ActionFeedCard.css'

interface ActionFeedCardProps {
  item: ActionFeedItem
  onHover?: (card: any, rect?: DOMRect) => void
}

const TYPE_ICONS: Record<string, string> = {
  turn: '⏱️',
  phase: '🔄',
  cast: '🔥',
  land: '🌲',
  attack: '⚔️',
  block: '🛡️',
  damage: '💥',
  life: '❤️',
  draw: '🃏',
  discard: '🗑️',
  ability: '✨',
  system: '🏆',
}

export default function ActionFeedCard({ item, onHover }: ActionFeedCardProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const icon = TYPE_ICONS[item.type] ?? 'ℹ️'

  useEffect(() => {
    if (!item.cardName) return
    let cancelled = false
    void awaitImageUrl({ name: item.cardName } as any).then((url) => {
      if (!cancelled && url) setImgUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [item.cardName])

  if (item.type === 'turn') {
    return (
      <div className="action-feed-turn-divider">
        <span className="turn-line" />
        <span className="turn-badge">
          {icon} Turno {item.amount} {item.playerName ? `· ${item.playerName}` : ''}
        </span>
        <span className="turn-line" />
      </div>
    )
  }

  if (item.type === 'system') {
    return (
      <div className="action-feed-system-banner">
        <span className="system-icon">{icon}</span>
        <span className="system-text">{item.description}</span>
      </div>
    )
  }

  const isDamage = item.type === 'damage'
  const isLife = item.type === 'life'

  const cardForHover = item.cardName
    ? {
        name: item.cardName,
        manaValue: 0,
        expansionSetCode: '',
        cardNumber: '0',
      }
    : null

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (cardForHover && onHover) {
      onHover(cardForHover, e.currentTarget.getBoundingClientRect())
    }
  }

  const handleMouseLeave = () => {
    if (onHover) onHover(null)
  }

  return (
    <div
      className={`action-feed-card type-${item.type} ${item.isMe ? 'is-me' : 'is-opp'}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background card art highlight */}
      {imgUrl && (
        <div
          className="action-card-bg"
          style={{ backgroundImage: `url(${imgUrl})` }}
        />
      )}

      <div className="action-card-content">
        <div className="action-card-header">
          <span className="action-icon">{icon}</span>
          <span className={`action-player-tag ${item.isMe ? 'me' : 'opp'}`}>
            {item.isMe ? 'Tú' : item.playerName || 'Partida'}
          </span>
          {/* Life / Damage badge */}
          {isDamage && item.amount !== undefined && (
            <span className="action-damage-badge">-{item.amount} ❤️</span>
          )}
          {isLife && item.amount !== undefined && (
            <span className={`action-life-badge ${item.amount < 0 ? 'loss' : 'gain'}`}>
              {item.amount > 0 ? `+${item.amount} 💚` : `${item.amount} ❤️`}
            </span>
          )}
        </div>

        <div className="action-card-body">
          {item.cardName && <span className="action-card-name">{item.cardName}</span>}
          {item.targetName && (
            <span className="action-target-pill">
              ➔ {item.targetName}
            </span>
          )}
          <span className="action-desc-text">{item.description}</span>
        </div>
      </div>
    </div>
  )
}
