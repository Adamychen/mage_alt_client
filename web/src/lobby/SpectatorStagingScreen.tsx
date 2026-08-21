import { useMemo } from 'react'
import { returnToLobby, useStore } from '../state/store'
import type { TableView } from '../net/types'
import ChatBox from './ChatBox'
import './SpectatorStagingScreen.css'

function getSkillBadge(skill?: string): { label: string; icon: string; className: string } | null {
  if (!skill) return null
  switch (skill.toUpperCase()) {
    case 'BEGINNER':
      return { label: 'Novato', icon: '⭐', className: 'skill-beginner' }
    case 'CASUAL':
      return { label: 'Casual', icon: '⭐⭐', className: 'skill-casual' }
    case 'SERIOUS':
      return { label: 'Competitivo', icon: '⭐⭐⭐', className: 'skill-serious' }
    default:
      return null
  }
}

export default function SpectatorStagingScreen({
  table,
  onLeave,
}: {
  table?: TableView | null
  onLeave?: () => void
}) {
  const storeTable = useStore((s) => s.watchingTable)
  const activeTable = table || storeTable

  const seats = useMemo(() => activeTable?.seats ?? [], [activeTable?.seats])
  const is1v1 = (activeTable?.seats.length ?? 0) <= 2 && !activeTable?.gameType?.toLowerCase().includes('commander')
  const isReady = activeTable?.tableState === 'READY_TO_START'
  const hasEmptySeats = seats.some((s) => !s.playerName)

  const skill = getSkillBadge(activeTable?.skillLevel)

  const handleLeave = () => {
    if (onLeave) onLeave()
    else returnToLobby()
  }

  return (
    <div className="spectator-staging-screen">
      {/* Top Header */}
      <header className="staging-top-header">
        <div className="staging-brand">
          <img src="/logo.jpeg" alt="XMage Nexus" className="staging-logo" />
          <div className="staging-titles">
            <h1 className="staging-main-title">XMage Nexus</h1>
            <span className="staging-subtitle">Sala de Espera de Espectador</span>
          </div>
        </div>

        <button
          type="button"
          className="staging-leave-btn"
          onClick={handleLeave}
          title="Salir de la sala y volver al explorador de mesas"
        >
          <span>🚪 Volver al Lobby</span>
        </button>
      </header>

      {/* Center Staging Area */}
      <main className="staging-main-container">
        <div className="staging-arena-card panel">
          {/* Table Header Info */}
          <div className="staging-card-header">
            <div className="staging-title-row">
              <span className="staging-status-pill">👁️ MODO ESPECTADOR</span>
              <h2 className="staging-table-name">{activeTable?.tableName || 'Partida en espera'}</h2>
            </div>

            <div className="staging-tags-row">
              <span className="staging-tag tag-game">🎮 {activeTable?.gameType || 'Duelo'}</span>
              <span className="staging-tag tag-deck">📜 {activeTable?.deckType || 'Constructed'}</span>
              {skill && (
                <span className={`staging-tag tag-skill ${skill.className}`}>
                  {skill.icon} {skill.label}
                </span>
              )}
              {activeTable?.rated ? (
                <span className="staging-tag tag-rated">🏅 Rated</span>
              ) : (
                <span className="staging-tag tag-unrated">Unrated</span>
              )}
              {activeTable?.passworded && (
                <span className="staging-tag tag-private">🔒 Privada</span>
              )}
              <span className="staging-tag tag-seats">👥 {activeTable?.seatsInfo || `${seats.length} plazas`}</span>
            </div>
          </div>

          {/* Arena Roster: 1v1 Face-off or Multiplayer Pod */}
          <div className="staging-roster-area">
            {is1v1 ? (
              <div className="staging-duel-roster">
                {/* Player 1 (Host / Left) */}
                <div className={`staging-player-card ${seats[0]?.playerName ? 'occupied' : 'empty'}`}>
                  <div className="player-avatar-circle">
                    {seats[0]?.playerName ? (
                      seats[0]?.playerType === 'HUMAN' || !seats[0]?.playerType ? '👤' : '🤖'
                    ) : (
                      '⭕'
                    )}
                  </div>
                  <div className="player-meta">
                    <span className="player-card-name">
                      {seats[0]?.playerName || 'Esperando jugador…'}
                      {activeTable?.controllerName && seats[0]?.playerName === activeTable.controllerName && (
                        <span className="player-crown" title="Anfitrión de la mesa">👑</span>
                      )}
                    </span>
                    <span className={`player-status-tag ${seats[0]?.playerName ? 'ready' : 'waiting'}`}>
                      {seats[0]?.playerName ? 'Conectado / Listo' : 'Plaza disponible'}
                    </span>
                  </div>
                </div>

                {/* VS Glowing Emblem */}
                <div className="staging-vs-emblem">
                  <span className="vs-text">VS</span>
                  <div className="vs-line" />
                </div>

                {/* Player 2 (Challenger / Right) */}
                <div className={`staging-player-card ${seats[1]?.playerName ? 'occupied' : 'empty'}`}>
                  <div className="player-avatar-circle">
                    {seats[1]?.playerName ? (
                      seats[1]?.playerType === 'HUMAN' || !seats[1]?.playerType ? '👤' : '🤖'
                    ) : (
                      '⭕'
                    )}
                  </div>
                  <div className="player-meta">
                    <span className="player-card-name">
                      {seats[1]?.playerName || 'Esperando oponente…'}
                      {activeTable?.controllerName && seats[1]?.playerName === activeTable.controllerName && (
                        <span className="player-crown" title="Anfitrión de la mesa">👑</span>
                      )}
                    </span>
                    <span className={`player-status-tag ${seats[1]?.playerName ? 'ready' : 'waiting'}`}>
                      {seats[1]?.playerName ? 'Conectado / Listo' : 'Esperando oponente'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Multiplayer Grid (Commander / FFA) */
              <div className="staging-multi-grid">
                {seats.map((s, idx) => {
                  const isHost = activeTable?.controllerName && s.playerName === activeTable.controllerName
                  const isOccupied = !!s.playerName
                  return (
                    <div key={idx} className={`staging-player-card ${isOccupied ? 'occupied' : 'empty'}`}>
                      <div className="player-avatar-circle">
                        {isOccupied ? (s.playerType === 'HUMAN' || !s.playerType ? '👤' : '🤖') : '⭕'}
                      </div>
                      <div className="player-meta">
                        <span className="player-card-name">
                          {s.playerName || `Plaza #${idx + 1}`}
                          {isHost && <span className="player-crown" title="Anfitrión de la mesa">👑</span>}
                        </span>
                        <span className={`player-status-tag ${isOccupied ? 'ready' : 'waiting'}`}>
                          {isOccupied ? 'Listo' : 'Disponible'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Status Message & Pulse Indicator */}
          <div className="staging-pulse-banner">
            <div className="pulse-spinner" />
            <div className="pulse-text-group">
              <span className="pulse-headline">
                {isReady
                  ? '✨ Todos los jugadores están listos. Esperando a que el anfitrión inicie la partida…'
                  : hasEmptySeats
                  ? '⏳ Esperando a que se completen las plazas de la mesa…'
                  : '⏳ Preparando inicio de la partida…'}
              </span>
              <span className="pulse-subline">
                Te conectarás automáticamente al tablero de juego en cuanto empiece el duelo.
              </span>
            </div>
          </div>
        </div>

        {/* Embedded Table / Room Chat */}
        <div className="staging-chat-card panel">
          <div className="staging-chat-header">
            <h3>💬 Chat de la Sala</h3>
            <span className="chat-hint">Comunícate mientras esperas</span>
          </div>
          <div className="staging-chat-body">
            <ChatBox />
          </div>
        </div>
      </main>
    </div>
  )
}
