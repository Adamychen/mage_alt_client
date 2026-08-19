import type { PlayerView, CardView, PermanentView } from '../net/types'
import PlayerInfoBar from '../game/PlayerInfoBar'
import ResourceBar from '../game/ResourceBar'
import CardSlot from './CardSlot'
import HandZone from './HandZone'
import './PlayerZone.css'

interface PlayerZoneProps {
  player: PlayerView | undefined
  hand: Record<string, CardView>
  onCardClick?: (id: string) => void
  onHandCardClick?: (id: string) => void
  onCardHover?: (card: CardView | null) => void
  targetIds?: Set<string>
  playableIds?: Set<string>
}

function permanentKind(perm: PermanentView): 'creatures' | 'other' | 'lands' {
  const types = perm.cardTypes ?? []
  if (types.some((t) => t === 'Land' || t.toLowerCase() === 'land')) return 'lands'
  if (types.some((t) => t === 'Creature' || t.toLowerCase() === 'creature')) return 'creatures'
  return 'other'
}

export default function PlayerZone({
  player,
  hand,
  onCardClick,
  onHandCardClick,
  onCardHover,
  targetIds = new Set(),
  playableIds = new Set(),
}: PlayerZoneProps) {
  if (!player) return <div className="player-zone empty" />

  const permanents = Object.entries(player.battlefield ?? {})
  const creatures = permanents.filter(([, p]) => permanentKind(p) === 'creatures')
  const others = permanents.filter(([, p]) => permanentKind(p) === 'other')
  const lands = permanents.filter(([, p]) => permanentKind(p) === 'lands')

  return (
    <div className="player-zone">
      {/* Row 1: Commander + Creatures */}
      <div className="pz-row pz-creatures-row">
        <div className="pz-commander" />
        <div className="pz-band creatures-band">
          {creatures.map(([id, perm]) => (
            <CardSlot
              key={id}
              cardId={id}
              card={perm}
              onClick={onCardClick ? () => onCardClick(id) : undefined}
              onHover={onCardHover}
              isTarget={targetIds.has(id)}
              isPlayable={playableIds.has(id)}
              tapped={perm.tapped === true}
              showPt
              showCounters
              showDamage
            />
          ))}
        </div>
      </div>

      {/* Row 2: Lands + Others */}
      <div className="pz-row pz-permanents-row">
        <div className="pz-band lands-band">
          {lands.map(([id, perm]) => (
            <CardSlot
              key={id}
              cardId={id}
              card={perm}
              onClick={onCardClick ? () => onCardClick(id) : undefined}
              onHover={onCardHover}
              isTarget={targetIds.has(id)}
              isPlayable={playableIds.has(id)}
              tapped={perm.tapped === true}
              showCounters
            />
          ))}
        </div>
        <div className="pz-band other-band">
          {others.map(([id, perm]) => (
            <CardSlot
              key={id}
              cardId={id}
              card={perm}
              onClick={onCardClick ? () => onCardClick(id) : undefined}
              onHover={onCardHover}
              isTarget={targetIds.has(id)}
              isPlayable={playableIds.has(id)}
              tapped={perm.tapped === true}
              showCounters
            />
          ))}
        </div>
      </div>

      {/* Row 3: Unified row [life | hand | mana | deck | G | X] */}
      <div className="pz-row pz-bottom-row">
        <PlayerInfoBar
          player={player}
          side="my"
          onClick={onCardClick ? () => onCardClick(player.playerId) : undefined}
          isTarget={targetIds.has(player.playerId)}
        />
        <HandZone
          cards={hand}
          onCardClick={onHandCardClick}
          playableIds={playableIds}
          targetIds={targetIds}
          compact
        />
        <ResourceBar player={player} side="my" compact />
      </div>
    </div>
  )
}
