import type { CardView, GameView, PlayerView } from '../net/types'
import { useStore } from '../state/store'
import AvatarImage from '../lobby/AvatarImage'
import CountryFlag from '../lobby/CountryFlag'
import './PlayerInfoBar.css'

interface PlayerInfoBarProps {
  player: PlayerView
  side: 'opp' | 'my'
  compact?: boolean
  onClick?: () => void
  isTarget?: boolean
  onHover?: (card: CardView | null, rect?: DOMRect) => void
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
  if (n.includes('speed')) return '🏎️'
  if (n.includes('commander')) return '👑'
  return '💎'
}

function getCounterTokenCard(name: string, count: number): CardView {
  const n = name.toLowerCase()
  if (n.includes('poison')) {
    return { name: 'Poison Counter', displayName: `Contador de Veneno (${count}/10)`, manaValue: 0 } as CardView
  }
  if (n.includes('energy')) {
    return { name: 'Energy Reserve', displayName: `Reserva de Energía (${count})`, manaValue: 0 } as CardView
  }
  if (n.includes('rad')) {
    return { name: 'Rad Counter', displayName: `Contador de Radiactividad (${count})`, manaValue: 0 } as CardView
  }
  if (n.includes('experience')) {
    return { name: 'Experience Counter', displayName: `Contador de Experiencia (${count})`, manaValue: 0 } as CardView
  }
  if (n.includes('ticket')) {
    return { name: 'Ticket Counter', displayName: `Tickets (${count})`, manaValue: 0 } as CardView
  }
  if (n.includes('acorn')) {
    return { name: 'Acorn Counter', displayName: `Bellotas (${count})`, manaValue: 0 } as CardView
  }
  if (n.includes('speed')) {
    return { name: 'Speed', displayName: `Velocidad (${count})`, manaValue: 0 } as CardView
  }
  return { name: `${name} Counter`, displayName: `${name} (${count})`, manaValue: 0 } as CardView
}

interface RingInfo {
  level: number
  card: CardView
}

function getRingInfo(player: PlayerView): RingInfo | null {
  const checkCard = (c: any): RingInfo | null => {
    if (!c || typeof c !== 'object') return null
    const name = String(c.name ?? '').trim().toLowerCase()
    const disp = String(c.displayName ?? '').trim().toLowerCase()
    if (name === 'the ring' || disp === 'the ring' || name.startsWith('the ring') || disp.startsWith('the ring')) {
      const rules = Array.isArray(c.rules) ? c.rules : []
      const level = Math.min(4, Math.max(1, rules.length))
      return {
        level,
        card: {
          name: 'The Ring',
          displayName: `The Ring (Nivel ${level})`,
          rules: rules.length > 0 ? rules : undefined,
          manaValue: 0,
        } as CardView,
      }
    }
    return null
  }

  if (Array.isArray(player.commandList)) {
    for (const c of player.commandList) {
      const info = checkCard(c)
      if (info) return info
    }
  } else if (player.commandList && typeof player.commandList === 'object') {
    for (const c of Object.values(player.commandList)) {
      const info = checkCard(c)
      if (info) return info
    }
  }

  if (player.helperCards && typeof player.helperCards === 'object') {
    for (const c of Object.values(player.helperCards)) {
      const info = checkCard(c)
      if (info) return info
    }
  }

  return null
}

interface DungeonInfo {
  name: string
  card: CardView
}

function getDungeonInfo(player: PlayerView): DungeonInfo | null {
  const checkCard = (c: any): DungeonInfo | null => {
    if (!c || typeof c !== 'object') return null
    const name = String(c.name ?? '').trim()
    const types = Array.isArray(c.cardTypes) ? c.cardTypes.map((t: string) => String(t).toLowerCase()) : []
    const isDungeon =
      types.includes('dungeon') ||
      ['dungeon of the mad mage', 'lost mine of phandelver', 'tomb of annihilation', 'undercity'].includes(name.toLowerCase())
    if (isDungeon) {
      return {
        name,
        card: {
          name,
          displayName: name,
          manaValue: 0,
        } as CardView,
      }
    }
    return null
  }

  if (Array.isArray(player.commandList)) {
    for (const c of player.commandList) {
      const info = checkCard(c)
      if (info) return info
    }
  } else if (player.commandList && typeof player.commandList === 'object') {
    for (const c of Object.values(player.commandList)) {
      const info = checkCard(c)
      if (info) return info
    }
  }

  return null
}

function getDayNightInfo(player: PlayerView): { isNight: boolean; card: CardView } | null {
  const designations = player.designationNames ?? []
  for (const d of designations) {
    const dl = d.toLowerCase()
    if (dl.includes('day') || dl.includes('night')) {
      const isNight = dl.includes('night') && !dl.includes('neither')
      return {
        isNight,
        card: {
          name: 'Day // Night',
          displayName: isNight ? 'Night (Noche)' : 'Day (Día)',
          manaValue: 0,
        } as CardView,
      }
    }
  }
  return null
}

function getCurseInfo(player: PlayerView, game: GameView | null): { count: number; firstCard: CardView } | null {
  if (!player.attachments || player.attachments.length === 0) return null
  const count = player.attachments.length

  let firstCard: CardView | null = null
  if (game?.players) {
    for (const p of game.players) {
      for (const [id, perm] of Object.entries(p.battlefield ?? {})) {
        if (player.attachments.includes(id)) {
          firstCard = perm as CardView
          break
        }
      }
      if (firstCard) break
    }
  }

  return {
    count,
    firstCard: firstCard ?? ({
      name: 'Curse',
      displayName: `Maldición (${count})`,
      manaValue: 0,
    } as CardView),
  }
}

function getDesignationDetails(d: string): { icon: string; title: string; card: CardView } {
  const dl = d.toLowerCase()
  if (dl.includes("city's blessing") || dl.includes("citys blessing") || dl.includes('blessing')) {
    return {
      icon: '🏛️',
      title: 'Bendición de la Ciudad (Ascend)',
      card: { name: "City's Blessing", displayName: "City's Blessing", manaValue: 0 } as CardView,
    }
  }
  if (dl.includes('speed')) {
    return {
      icon: '🏎️',
      title: 'Velocidad (Aetherdrift)',
      card: { name: 'Speed', displayName: 'Speed', manaValue: 0 } as CardView,
    }
  }
  if (dl.includes('enduring story') || dl.includes('story')) {
    return {
      icon: '📖',
      title: 'Historia Perdurable',
      card: { name: 'Enduring Story', displayName: 'Enduring Story', manaValue: 0 } as CardView,
    }
  }
  return {
    icon: '★',
    title: `Designación: ${d}`,
    card: { name: d, displayName: d, manaValue: 0 } as CardView,
  }
}

export default function PlayerInfoBar({
  player,
  side,
  compact = false,
  onClick,
  isTarget = false,
  onHover,
}: PlayerInfoBarProps) {
  const myConn = useStore((s) => s.conn)
  const game = useStore((s) => s.game)
  const rawUserData = player.userData as { avatarId?: number; flagName?: string } | undefined
  const avatarId =
    rawUserData?.avatarId ??
    (player.isHuman ? (player.controlled ? (myConn?.avatarId ?? 10) : 10) : 13)
  const flagName = rawUserData?.flagName

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

  // Mechanics & Reminders
  const ringInfo = getRingInfo(player)
  const dungeonInfo = getDungeonInfo(player)
  const dayNightInfo = getDayNightInfo(player)
  const curseInfo = getCurseInfo(player, game)
  const nonDayNightDesignations = (player.designationNames ?? []).filter(
    (d) => !d.toLowerCase().includes('day') && !d.toLowerCase().includes('night')
  )

  const handleMouseEnter = (card: CardView, e: React.MouseEvent) => {
    if (onHover) {
      onHover(card, e.currentTarget.getBoundingClientRect())
    }
  }

  const handleMouseLeave = () => {
    if (onHover) {
      onHover(null)
    }
  }

  const hasAnyBadge =
    player.monarch ||
    player.initiative ||
    ringInfo != null ||
    dungeonInfo != null ||
    dayNightInfo != null ||
    curseInfo != null ||
    nonDayNightDesignations.length > 0

  return (
    <div
      data-player-id={player.playerId}
      className={`player-info-bar ${side} ${compact ? 'compact' : ''} ${isTarget ? 'targetable' : ''} ${hasPriority ? 'has-priority' : ''} ${isDefeated ? 'player-defeated' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className={`player-avatar ${hasPriority ? 'avatar-active' : ''}`}>
        <AvatarImage
          avatarId={avatarId}
          username={player.name}
          size={compact ? 'small' : 'medium'}
        />
        {flagName && <CountryFlag flagName={flagName} className="player-avatar-flag" />}
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

          {/* Active Player counters (interactive with token preview on hover) */}
          {activeCounters.map((c) => {
            const tokenCard = getCounterTokenCard(c.name, c.count)
            return (
              <span
                key={c.name}
                className={`counter player-counter-badge counter-${c.name.toLowerCase()} interactive-badge`}
                title={`${c.name}: ${c.count}${c.name.toLowerCase() === 'poison' ? '/10' : ''}`}
                onMouseEnter={(e) => handleMouseEnter(tokenCard, e)}
                onMouseLeave={handleMouseLeave}
              >
                <span className="counter-emoji">{counterIcon(c.name)}</span>
                <span className="counter-val">{c.count}</span>
              </span>
            )
          })}

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

      {/* Status Badges: Monarch, Initiative, The Ring, Dungeon, Day/Night, Curses, Designations */}
      {hasAnyBadge && (
        <div className="player-badges">
          {/* The Ring Badge */}
          {ringInfo && (
            <span
              className="badge badge-ring interactive-badge"
              title={`El Anillo (Nivel ${ringInfo.level}/4)`}
              onMouseEnter={(e) => handleMouseEnter(ringInfo.card, e)}
              onMouseLeave={handleMouseLeave}
            >
              💍<span className="badge-sub-level">{ringInfo.level}</span>
            </span>
          )}

          {/* Monarch Badge */}
          {player.monarch && (
            <span
              className="badge badge-monarch interactive-badge"
              title="Monarca (Roba carta al final del turno)"
              onMouseEnter={(e) =>
                handleMouseEnter(
                  { name: 'The Monarch', displayName: 'The Monarch', isToken: true, manaValue: 0 } as CardView,
                  e
                )
              }
              onMouseLeave={handleMouseLeave}
            >
              👑
            </span>
          )}

          {/* Initiative Badge */}
          {player.initiative && (
            <span
              className="badge badge-initiative interactive-badge"
              title="Iniciativa (Te adentras en la Mazmorra / Undercity)"
              onMouseEnter={(e) =>
                handleMouseEnter(
                  { name: 'The Initiative', displayName: 'The Initiative', isToken: true, manaValue: 0 } as CardView,
                  e
                )
              }
              onMouseLeave={handleMouseLeave}
            >
              ⚔️
            </span>
          )}

          {/* Dungeon Badge */}
          {dungeonInfo && (
            <span
              className="badge badge-dungeon interactive-badge"
              title={`Mazmorra activa: ${dungeonInfo.name}`}
              onMouseEnter={(e) => handleMouseEnter(dungeonInfo.card, e)}
              onMouseLeave={handleMouseLeave}
            >
              🗺️
            </span>
          )}

          {/* Day / Night Badge */}
          {dayNightInfo && (
            <span
              className={`badge badge-daynight interactive-badge ${dayNightInfo.isNight ? 'is-night' : 'is-day'}`}
              title={dayNightInfo.isNight ? 'Noche (Night)' : 'Día (Day)'}
              onMouseEnter={(e) => handleMouseEnter(dayNightInfo.card, e)}
              onMouseLeave={handleMouseLeave}
            >
              {dayNightInfo.isNight ? '🌙' : '☀️'}
            </span>
          )}

          {/* Curses / Player Attachments Badge */}
          {curseInfo && (
            <span
              className="badge badge-curse interactive-badge"
              title={`${curseInfo.count} Maldición${curseInfo.count > 1 ? 'es' : ''} sobre el jugador`}
              onMouseEnter={(e) => handleMouseEnter(curseInfo.firstCard, e)}
              onMouseLeave={handleMouseLeave}
            >
              💀<span className="badge-sub-level">{curseInfo.count}</span>
            </span>
          )}

          {/* Specialized Designations (City's Blessing, Speed, Enduring Story, etc.) */}
          {nonDayNightDesignations.map((d) => {
            const details = getDesignationDetails(d)
            return (
              <span
                key={d}
                className="badge badge-designation interactive-badge"
                title={details.title}
                onMouseEnter={(e) => handleMouseEnter(details.card, e)}
                onMouseLeave={handleMouseLeave}
              >
                {details.icon}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
