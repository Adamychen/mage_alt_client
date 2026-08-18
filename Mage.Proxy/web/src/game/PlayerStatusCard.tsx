import type { PlayerView } from '../net/types'
import './PlayerStatusCard.css'

interface BadgeSlot {
  icon: string
  title: string
}

/**
 * Los 3 diamantes de la referencia no son decoración: mapean a estados de
 * partida reales que XMage ya expone en PlayerView (monarch, initiative,
 * designationNames) y que hasta ahora no se pintaban en ningún sitio.
 * Si hay más de una designación, se cicla la que se muestra en el tercer slot.
 */
function badgeSlots(player: PlayerView): (BadgeSlot | null)[] {
  const slots: (BadgeSlot | null)[] = [null, null, null]
  if (player.monarch) slots[0] = { icon: '♛', title: 'Monarch' }
  if (player.initiative) slots[1] = { icon: '⚔', title: 'Iniciativa' }
  const designation = player.designationNames?.[0]
  if (designation) slots[2] = { icon: '★', title: designation }
  return slots
}

function secondaryCounter(player: PlayerView): { label: string; value: number } {
  const poison = player.counters?.find((c) => c.name.toLowerCase() === 'poison')
  if (poison) return { label: 'Veneno', value: poison.count }
  const other = player.counters?.[0]
  if (other) return { label: other.name, value: other.count }
  return { label: 'Veneno', value: 0 }
}

export default function PlayerStatusCard({ player, side }: { player: PlayerView; side: 'opp' | 'my' }) {
  const secondary = secondaryCounter(player)
  const slots = badgeSlots(player)

  return (
    <div className={`player-status-card ${side}-status`}>
      <div className="player-status-badges">
        {slots.map((slot, i) =>
          slot ? (
            <span key={i} className="player-status-badge filled" title={slot.title}>{slot.icon}</span>
          ) : (
            <span key={i} className="player-status-badge" />
          ),
        )}
      </div>
      <div className="player-status-body">
        <div className="player-status-name" data-priority={player.hasPriority || undefined}>
          {player.name}
        </div>
        <div className="player-status-counters">
          <div className="player-status-counter life">{player.life}</div>
          <div className="player-status-counter" title={secondary.label}>{secondary.value}</div>
        </div>
      </div>
    </div>
  )
}
