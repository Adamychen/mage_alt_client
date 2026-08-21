import type { PlayerView } from '../net/types'
import './PlayerInfoBar.css'

interface PlayerInfoBarProps {
  player: PlayerView
  side: 'opp' | 'my'
  compact?: boolean
  onClick?: () => void
  isTarget?: boolean
}

function formatTimer(seconds: number): string {
  if (seconds <= 0) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function counterIcon(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('poison')) return '☠️'
  if (n.includes('energy')) return '⚡'
  if (n.includes('rad')) return '☢️'
  if (n.includes('experience')) return '🎖️'
  if (n.includes('ticket')) return '🎟️'
  return '💎'
}

export default function PlayerInfoBar({ player, side, compact = false, onClick, isTarget = false }: PlayerInfoBarProps) {
  const hasPriority = !!player.hasPriority
  const hasTimer = player.priorityTimeLeftSecs != null && player.priorityTimeLeftSecs > 0
  const isTimeLow = hasTimer && (player.priorityTimeLeftSecs ?? 0) <= 30

  // Match wins dots (Bo3 / Bo5)
  const winsNeeded = player.winsNeeded ?? 0
  const wins = player.wins ?? 0
  const showMatchWins = winsNeeded > 1

  return (
    <div
      data-player-id={player.playerId}
      className={`player-info-bar ${side} ${compact ? 'compact' : ''} ${isTarget ? 'targetable' : ''} ${hasPriority ? 'has-priority' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className={`player-avatar ${hasPriority ? 'avatar-active' : ''}`}>
        <div className="avatar-frame">
          {player.name.charAt(0).toUpperCase()}
        </div>
        {hasPriority && <span className="avatar-priority-ring" />}
      </div>

      <div className="player-details">
        <div className="player-name-row">
          <span className="player-name" data-priority={player.hasPriority || undefined}>
            {player.name}
          </span>
          {showMatchWins && (
            <span className="match-wins-dots" title={`Victorias: ${wins}/${winsNeeded}`}>
              {Array.from({ length: winsNeeded }).map((_, i) => (
                <span key={i} className={`win-dot ${i < wins ? 'won' : 'pending'}`}>
                  {i < wins ? '●' : '○'}
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="player-counters">
          <span className={`counter life-counter ${player.life <= 5 ? 'life-danger' : ''}`} title="Vida">
            <span className="counter-icon">&#9829;</span>
            <span className="life-value">{player.life}</span>
          </span>

          {/* Player counters: Poison, Energy, Rads, Experience, Tickets */}
          {player.counters?.map((c) => (
            <span
              key={c.name}
              className={`counter player-counter-badge counter-${c.name.toLowerCase()}`}
              title={`${c.name}: ${c.count}`}
            >
              <span className="counter-emoji">{counterIcon(c.name)}</span>
              <span className="counter-val">{c.count}</span>
            </span>
          ))}

          {/* Priority Clock Timer */}
          {hasTimer && (
            <span
              className={`player-timer-badge ${isTimeLow ? 'timer-low' : ''} ${hasPriority ? 'timer-active' : ''}`}
              title="Tiempo restante de prioridad"
            >
              <span className="timer-icon">⏱️</span>
              <span className="timer-value">{formatTimer(player.priorityTimeLeftSecs ?? 0)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Status Badges: Monarch, Initiative, City's Blessing, Designations */}
      {(player.monarch || player.initiative || (player.designationNames && player.designationNames.length > 0)) && (
        <div className="player-badges">
          {player.monarch && <span className="badge badge-monarch" title="Monarca (Roba carta al final del turno)">👑</span>}
          {player.initiative && <span className="badge badge-initiative" title="Iniciativa (Te adentras en la Mazmorra)">⚔️</span>}
          {player.designationNames?.map((d) => (
            <span key={d} className="badge badge-designation" title={d}>★</span>
          ))}
        </div>
      )}
    </div>
  )
}
