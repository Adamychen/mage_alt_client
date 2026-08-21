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
  if (n.includes('acorn')) return '🌰'
  if (n.includes('commander')) return '👑'
  return '💎'
}

export default function PlayerInfoBar({ player, side, compact = false, onClick, isTarget = false }: PlayerInfoBarProps) {
  const hasPriority = !!player.hasPriority
  const hasTimer = (player.priorityTimeLeftSecs != null && player.priorityTimeLeftSecs > 0) || !!player.timerActive
  const isTimeLow = hasTimer && (player.priorityTimeLeftSecs ?? 0) > 0 && (player.priorityTimeLeftSecs ?? 0) <= 30

  // Match wins dots (Bo1 / Bo3 / Bo5)
  const winsNeeded = player.winsNeeded ?? (player.wins ? player.wins : 0)
  const wins = player.wins ?? 0
  const showMatchWins = winsNeeded > 1 || wins > 0

  // Active Player Counters (> 0 only)
  const activeCounters = player.counters?.filter((c) => c.count > 0) ?? []
  const isDefeated = player.hasLeft === true || player.life <= 0

  return (
    <div
      data-player-id={player.playerId}
      className={`player-info-bar ${side} ${compact ? 'compact' : ''} ${isTarget ? 'targetable' : ''} ${hasPriority ? 'has-priority' : ''} ${isDefeated ? 'player-defeated' : ''}`}
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
          {player.hasLeft ? (
            <span className="player-status-badge status-left">🚪 Fuera</span>
          ) : player.life <= 0 ? (
            <span className="player-status-badge status-defeated">💀 Derrotado</span>
          ) : null}
          {showMatchWins && (
            <span className="match-wins-dots" title={`Victorias en el match: ${wins}/${winsNeeded}`}>
              {Array.from({ length: Math.max(1, winsNeeded) }).map((_, i) => (
                <span key={i} className={`win-dot ${i < wins ? 'won' : 'pending'}`}>
                  {i < wins ? '●' : '○'}
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="player-counters">
          {/* Life Counter */}
          <span className={`counter life-counter ${player.life <= 5 ? 'life-danger' : ''}`} title="Vida">
            <span className="counter-icon">&#9829;</span>
            <span className="life-value">{player.life}</span>
          </span>

          {/* Active Player counters (rendered dynamically when > 0) */}
          {activeCounters.map((c) => (
            <span
              key={c.name}
              className={`counter player-counter-badge counter-${c.name.toLowerCase()}`}
              title={`${c.name}: ${c.count}${c.name.toLowerCase() === 'poison' ? '/10' : ''}`}
            >
              <span className="counter-emoji">{counterIcon(c.name)}</span>
              <span className="counter-val">{c.count}</span>
            </span>
          ))}

          {/* Priority Clock Timer (when timed) */}
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
