import type { CardView, PlayerView, SimpleCardsView, PermanentView } from '../net/types'
import PlayerInfoBar from '../game/PlayerInfoBar'
import ResourceBar from '../game/ResourceBar'
import CardSlot from './CardSlot'
import HandZone from './HandZone'
import './OpponentZone.css'

interface OpponentZoneProps {
  player: PlayerView | undefined
  opponentHands: Record<string, SimpleCardsView>
  onCardClick?: (id: string) => void
  onCardHover?: (card: CardView | null) => void
  targetIds?: Set<string>
}

function permanentKind(perm: PermanentView): 'creatures' | 'other' | 'lands' {
  const types = perm.cardTypes ?? []
  if (types.some((t) => t === 'Land' || t.toLowerCase() === 'land')) return 'lands'
  if (types.some((t) => t === 'Creature' || t.toLowerCase() === 'creature')) return 'creatures'
  return 'other'
}

export default function OpponentZone({
  player,
  opponentHands,
  onCardClick,
  onCardHover,
  targetIds = new Set(),
}: OpponentZoneProps) {
  if (!player) return <div className="opponent-zone empty" />

  const handEntries = Object.values(opponentHands).flatMap((h) => Object.entries(h))
  const handCards = Object.fromEntries(handEntries.map(([id, c]) => [id, { ...c, name: c.name ?? '?', expansionSetCode: '', cardNumber: '0' }]))

  const permanents = Object.entries(player.battlefield ?? {})
  const creatures = permanents.filter(([, p]) => permanentKind(p) === 'creatures')
  const others = permanents.filter(([, p]) => permanentKind(p) === 'other')
  const lands = permanents.filter(([, p]) => permanentKind(p) === 'lands')

  return (
    <div className="opponent-zone">
      {/* Row 1: Unified row [life | hand | mana | deck | G | X] (at top) */}
      <div className="oz-row oz-top-row">
        <PlayerInfoBar player={player} side="opp" />
        <HandZone
          cards={handCards as any}
          faceDown
          compact
        />
        <ResourceBar player={player} side="opp" compact />
      </div>

      {/* Row 2: Lands + Others */}
      <div className="oz-row oz-permanents-row">
        <div className="oz-band lands-band">
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
        </div>
        <div className="oz-band other-band">
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
        <div className="oz-commander" />
        <div className="oz-band creatures-band">
          {creatures.map(([id, perm]) => (
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
          ))}
        </div>
      </div>
    </div>
  )
}
