import type { CardView, PlayerView, PermanentView } from '../net/types'
import PlayerInfoBar from '../game/PlayerInfoBar'
import ResourceBar from '../game/ResourceBar'
import CardSlot from './CardSlot'
import HandZone from './HandZone'
import './OpponentZone.css'

interface OpponentZoneProps {
  player: PlayerView | undefined
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
  onCardClick,
  onCardHover,
  targetIds = new Set(),
}: OpponentZoneProps) {
  if (!player) return <div className="opponent-zone empty" />

  const handCount = player.handCount ?? 0
  const handCards: Record<string, CardView> = Object.fromEntries(
    Array.from({ length: handCount }, (_, i) => [
      `opp-hand-${i}`,
      { name: '?', manaValue: 0, expansionSetCode: '', cardNumber: '0', id: `opp-hand-${i}` },
    ])
  )

  const permanents = Object.entries(player.battlefield ?? {})
  const creatures = permanents.filter(([, p]) => permanentKind(p) === 'creatures')
  const others = permanents.filter(([, p]) => permanentKind(p) === 'other')
  const lands = permanents.filter(([, p]) => permanentKind(p) === 'lands')

  return (
    <div className="opponent-zone">
      {/* Row 1: Unified row [life | hand | mana | deck | G | X] (at top) */}
      <div className="oz-row oz-top-row">
        <PlayerInfoBar
          player={player}
          side="opp"
          onClick={onCardClick ? () => onCardClick(player.playerId) : undefined}
          isTarget={targetIds.has(player.playerId)}
        />
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
