import type { PlayerView } from '../net/types'
import './PlayerInfoBar.css'

interface PlayerInfoBarProps {
  player: PlayerView
  side: 'opp' | 'my'
  compact?: boolean
}

function secondaryCounter(player: PlayerView): { label: string; value: number } {
  const poison = player.counters?.find((c) => c.name.toLowerCase() === 'poison')
  if (poison) return { label: 'Veneno', value: poison.count }
  const other = player.counters?.[0]
  if (other) return { label: other.name, value: other.count }
  return { label: 'Veneno', value: 0 }
}

export default function PlayerInfoBar({ player, side, compact = false }: PlayerInfoBarProps) {
  const secondary = secondaryCounter(player)

  return (
    <div className={`player-info-bar ${side} ${compact ? 'compact' : ''}`}>
      <div className="player-avatar">
        <div className="avatar-frame">
          {player.name.charAt(0).toUpperCase()}
        </div>
      </div>
      <div className="player-details">
        <div className="player-name" data-priority={player.hasPriority || undefined}>
          {player.name}
        </div>
        <div className="player-counters">
          <span className="counter life-counter" title="Vida">
            <span className="counter-icon">&#9829;</span>
            {player.life}
          </span>
          {secondary.value > 0 && (
            <span className="counter secondary-counter" title={secondary.label}>
              {secondary.value}
            </span>
          )}
        </div>
      </div>
      {(player.monarch || player.initiative || player.designationNames?.length > 0) && (
        <div className="player-badges">
          {player.monarch && <span className="badge" title="Monarch">&#9819;</span>}
          {player.initiative && <span className="badge" title="Initiative">&#9876;</span>}
          {player.designationNames?.[0] && <span className="badge" title={player.designationNames[0]}>&#9733;</span>}
        </div>
      )}
    </div>
  )
}
