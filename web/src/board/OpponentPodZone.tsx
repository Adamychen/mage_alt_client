import type { CardView, PermanentView, PlayerView } from '../net/types'
import CardSlot from './CardSlot'
import HandZone from './HandZone'
import ResourceBar from '../game/ResourceBar'
import PlayerInfoBar from '../game/PlayerInfoBar'
import CommandZone from './CommandZone'
import './OpponentPodZone.css'

interface OpponentPodZoneProps {
  player: PlayerView | undefined
  onCardClick?: (id: string) => void
  onCardHover?: (card: any, rect?: DOMRect) => void
  targetIds?: Set<string>
  revealedCards?: Record<string, CardView>
}

function permanentKind(perm: PermanentView): 'creatures' | 'lands' | 'other' {
  const types = perm.cardTypes ?? []
  if (types.some((t) => t === 'Land' || t.toLowerCase() === 'land')) return 'lands'
  if (types.some((t) => t === 'Creature' || t.toLowerCase() === 'creature')) return 'creatures'
  return 'other'
}

export default function OpponentPodZone({
  player,
  onCardClick,
  onCardHover,
  targetIds = new Set(),
  revealedCards,
}: OpponentPodZoneProps) {
  if (!player) return <div className="opponent-pod-zone empty" />

  const handCount = player.handCount ?? 0
  const knownCards = Object.entries(revealedCards ?? {})
  const knownCount = Math.min(handCount, knownCards.length)
  const unknownCount = Math.max(0, handCount - knownCount)

  const handCards: Record<string, CardView> = {}

  // 1. Known revealed cards
  knownCards.slice(0, knownCount).forEach(([id, card]) => {
    handCards[id] = {
      ...card,
      id,
      faceDown: false,
    }
  })

  // 2. Unknown face-down cards
  for (let i = 0; i < unknownCount; i++) {
    const id = `opp-unknown-${i}`
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

  const attachedIds = new Set<string>()
  permanents.forEach(([, p]) => {
    if (p.attachments && Array.isArray(p.attachments)) {
      p.attachments.forEach((attId) => attachedIds.add(attId))
    }
  })

  const creatures = permanents.filter(([id, p]) => permanentKind(p) === 'creatures' && !attachedIds.has(id))
  const others = permanents.filter(([id, p]) => permanentKind(p) === 'other' && !attachedIds.has(id))
  const lands = permanents.filter(([id, p]) => permanentKind(p) === 'lands' && !attachedIds.has(id))

  return (
    <div className="opponent-pod-zone">
      {/* 1. Header: Info + Resources */}
      <div className="pod-opp-header">
        <PlayerInfoBar
          player={player}
          side="opp"
          compact
          onClick={onCardClick ? () => onCardClick(player.playerId) : undefined}
          isTarget={targetIds.has(player.playerId)}
        />
        <ResourceBar player={player} side="opp" compact />
      </div>

      {/* 2. Subbar: Command Zone + Hand */}
      <div className="pod-opp-subbar">
        <CommandZone
          player={player}
          side="opp"
          onCardClick={onCardClick}
          onHover={onCardHover}
          targetIds={targetIds}
        />
        <HandZone
          cards={handCards}
          onCardClick={onCardClick}
          onHover={onCardHover}
          targetIds={targetIds}
          compact
        />
      </div>

      {/* 3. Battlefield Area with Clear Zone Headers */}
      <div className="pod-opp-field">
        {/* Creatures Band */}
        <div className="pod-opp-band creatures-band">
          <span className="pod-zone-label">
            ⚔️ Criaturas ({creatures.length})
          </span>
          <div className="pod-cards-row">
            {creatures.length === 0 ? (
              <span className="pod-empty-hint">Sin criaturas en juego</span>
            ) : (
              creatures.map(([id, perm]) => (
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
              ))
            )}
          </div>
        </div>

        {/* Lands & Permanents Band */}
        <div className="pod-opp-band lands-band">
          <span className="pod-zone-label">
            🌲 Tierras & Permanentes ({lands.length + others.length})
          </span>
          <div className="pod-cards-row">
            {lands.length + others.length === 0 ? (
              <span className="pod-empty-hint">Sin tierras ni otros permanentes</span>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
