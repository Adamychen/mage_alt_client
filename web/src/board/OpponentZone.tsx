import type { CardView, PermanentView, PlayerView } from '../net/types'
import CardSlot from './CardSlot'
import HandZone from './HandZone'
import ResourceBar from '../game/ResourceBar'
import PlayerInfoBar from '../game/PlayerInfoBar'
import CommandZone from './CommandZone'
import { useZoneScale } from './useZoneScale'
import './OpponentZone.css'

interface OpponentZoneProps {
  player: PlayerView | undefined
  onCardClick?: (id: string) => void
  onCardHover?: (card: any, rect?: DOMRect) => void
  targetIds?: Set<string>
  revealedCards?: Record<string, CardView>
  compactPod?: boolean
}

function permanentKind(perm: PermanentView): 'creatures' | 'lands' | 'other' {
  const types = perm.cardTypes ?? []
  if (types.some((t) => t === 'Land' || t.toLowerCase() === 'land')) return 'lands'
  if (types.some((t) => t === 'Creature' || t.toLowerCase() === 'creature')) return 'creatures'
  return 'other'
}

export default function OpponentZone({
  player,
  onCardClick,
  onCardHover,
  targetIds = new Set(),
  revealedCards,
  compactPod = false,
}: OpponentZoneProps) {
  if (!player) return <div className={`opponent-zone empty ${compactPod ? 'compact-pod' : ''}`} />

  const handCount = player.handCount ?? 0
  const knownCards = Object.entries(revealedCards ?? {})
  const knownCount = Math.min(handCount, knownCards.length)
  const unknownCount = Math.max(0, handCount - knownCount)

  const handCards: Record<string, CardView> = {}

  // 1. Add known revealed cards (rendered face up with full art)
  knownCards.slice(0, knownCount).forEach(([id, card]) => {
    handCards[id] = {
      ...card,
      id,
      faceDown: false,
    }
  })

  // 2. Add remaining unknown face-down cards
  for (let i = 0; i < unknownCount; i++) {
    const id = `opp-${player.playerId}-unknown-${i}`
    handCards[id] = {
      id,
      name: '?',
      manaValue: 0,
      expansionSetCode: '',
      cardNumber: '0',
      faceDown: true,
    }
  }

  const battlefield = player.battlefield ?? {}
  const permanents = Object.entries(battlefield)

  // Track attachments to nest them under host permanents
  const attachedIds = new Set<string>()
  permanents.forEach(([, p]) => {
    if (p.attachments && Array.isArray(p.attachments)) {
      p.attachments.forEach((attId) => attachedIds.add(attId))
    }
  })

  const creatures = permanents.filter(([id, p]) => permanentKind(p) === 'creatures' && !attachedIds.has(id))
  const others = permanents.filter(([id, p]) => permanentKind(p) === 'other' && !attachedIds.has(id))
  const lands = permanents.filter(([id, p]) => permanentKind(p) === 'lands' && !attachedIds.has(id))

  const { cardW, ref: zoneRef } = useZoneScale()
  const isDefeated = player.hasLeft === true || player.life <= 0

  return (
    <div
      className={`opponent-zone ${compactPod ? 'compact-pod' : ''} ${isDefeated ? 'is-defeated' : ''}`}
      ref={zoneRef}
      style={{ '--card-w': `${cardW}px` } as React.CSSProperties}
    >
      {/* Defeated / Left status overlay */}
      {isDefeated && (
        <div className="zone-defeated-overlay">
          <div className="zone-defeated-card">
            <span className="zone-defeated-icon">{player.hasLeft ? '🚪' : '💀'}</span>
            <span className="zone-defeated-title">
              {player.name} {player.hasLeft ? 'ha abandonado la partida' : 'ha sido derrotado'}
            </span>
            <span className="zone-defeated-sub">
              {player.hasLeft ? 'El jugador se ha desconectado o concedido' : 'Vida reducida a 0'}
            </span>
          </div>
        </div>
      )}

      {/* Row 1: Unified row [life | hand | mana | deck | G | X] (at top) */}
      <div className="oz-row oz-top-row">
        <PlayerInfoBar
          player={player}
          side="opp"
          onClick={onCardClick ? () => onCardClick(player.playerId) : undefined}
          isTarget={targetIds.has(player.playerId)}
        />
        <HandZone
          cards={handCards}
          onCardClick={onCardClick}
          onHover={onCardHover}
          targetIds={targetIds}
          compact
        />
        <ResourceBar player={player} side="opp" compact />
      </div>

      {/* Row 2: Lands + Others */}
      <div className="oz-row oz-permanents-row">
        <div className="oz-band permanents-band">
          {lands.map(([id, perm]) => (
            <CardSlot
              key={id}
              cardId={id}
              card={perm}
              onClick={onCardClick ? () => onCardClick(id) : undefined}
              onHover={onCardHover}
              isTarget={targetIds.has(id)}
              tapped={perm.tapped === true}
              showCounters
            />
          ))}
          {others.map(([id, perm]) => (
            <CardSlot
              key={id}
              cardId={id}
              card={perm}
              onClick={onCardClick ? () => onCardClick(id) : undefined}
              onHover={onCardHover}
              isTarget={targetIds.has(id)}
              tapped={perm.tapped === true}
              showCounters
            />
          ))}
        </div>
      </div>

      {/* Row 3: Commander + Creatures (at bottom) */}
      <div className="oz-row oz-creatures-row">
        <div className="oz-commander">
          <CommandZone
            player={player}
            side="opp"
            onCardClick={onCardClick}
            onHover={onCardHover}
            targetIds={targetIds}
          />
        </div>
        <div className="oz-band creatures-band">
          {creatures.map(([id, perm]) => {
            const attachments = perm.attachments ?? []

            if (attachments.length > 0) {
              const hasClass = attachments.length >= 4 ? 'has-4'
                : attachments.length === 3 ? 'has-3'
                : attachments.length === 2 ? 'has-2'
                : ''
              return (
                <div key={id} className={`card-attachment-group${hasClass ? ` ${hasClass}` : ''}`}>
                  <div className="attachments-list">
                    {attachments.map((attId, ai) => {
                      const attCard = battlefield[attId]
                      if (!attCard) return null
                      return (
                        <CardSlot
                          key={attId}
                          cardId={attId}
                          card={attCard}
                          onClick={onCardClick ? () => onCardClick(attId) : undefined}
                          onHover={onCardHover}
                          isTarget={targetIds.has(attId)}
                          className="attachment-subcard"
                          style={{ left: `calc(var(--card-w, 100px) * ${(ai + 1) * 0.58})` }}
                        />
                      )
                    })}
                  </div>
                  <CardSlot
                    cardId={id}
                    card={perm}
                    onClick={onCardClick ? () => onCardClick(id) : undefined}
                    onHover={onCardHover}
                    isTarget={targetIds.has(id)}
                    tapped={perm.tapped === true}
                    showPt
                    showCounters
                    showDamage
                  />
                </div>
              )
            }

            return (
              <CardSlot
                key={id}
                cardId={id}
                card={perm}
                onClick={onCardClick ? () => onCardClick(id) : undefined}
                onHover={onCardHover}
                isTarget={targetIds.has(id)}
                tapped={perm.tapped === true}
                showPt
                showCounters
                showDamage
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
