import { useState, useMemo } from 'react'
import type { UsersView } from '../net/types'
import { getRankInfo, RANK_TIERS_CONFIG } from './ranking'
import RankBadge from './RankBadge'
import CountryFlag from './CountryFlag'
import AvatarImage from './AvatarImage'
import './LeaderboardModal.css'

interface LeaderboardModalProps {
  users: UsersView[]
  currentUsername: string
  onClose: () => void
}

type LeaderboardTab = 'room' | 'profile' | 'tiers'

export default function LeaderboardModal({ users, currentUsername, onClose }: LeaderboardModalProps) {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('room')
  const [searchQuery, setSearchQuery] = useState('')

  // Current user's stats
  const currentUser = useMemo(() => {
    return users.find((u) => u.userName.toLowerCase() === currentUsername.toLowerCase())
  }, [users, currentUsername])

  const myElo = currentUser?.constructedRating ?? 1500
  const myRank = getRankInfo(myElo)

  // Compute wins / losses and winrate for user
  const parseStats = (historyStr?: string | null) => {
    if (!historyStr) return { wins: 0, losses: 0, total: 0, winrate: 0 }
    const match = historyStr.match(/(\d+)\s*-\s*(\d+)/)
    if (!match) return { wins: 0, losses: 0, total: 0, winrate: 0 }
    const wins = parseInt(match[1], 10)
    const losses = parseInt(match[2], 10)
    const total = wins + losses
    const winrate = total > 0 ? Math.round((wins / total) * 100) : 0
    return { wins, losses, total, winrate }
  }

  const myStats = parseStats(currentUser?.matchHistory)

  // Sorted room leaderboard
  const sortedUsers = useMemo(() => {
    const list = [...users].map((u) => {
      const stats = parseStats(u.matchHistory)
      return {
        ...u,
        effectiveRating: u.constructedRating > 0 ? u.constructedRating : 1500,
        stats,
      }
    })

    // Sort by ELO descending, then by winrate descending
    list.sort((a, b) => {
      if (b.effectiveRating !== a.effectiveRating) {
        return b.effectiveRating - a.effectiveRating
      }
      return b.stats.winrate - a.stats.winrate
    })

    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter((u) => u.userName.toLowerCase().includes(q))
  }, [users, searchQuery])

  return (
    <div className="overlay">
      <div className="dialog panel leaderboard-dialog">
        <div className="leaderboard-header">
          <div className="leaderboard-header-title">
            <h2>🏆 Clasificación & Rangos de Liga</h2>
            <span className="leaderboard-subtitle">Sistema de Liga Oficial estilo MTG Arena</span>
          </div>
          <button type="button" className="leaderboard-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Modal Tabs */}
        <nav className="leaderboard-tabs">
          <button
            type="button"
            className={`leaderboard-tab-btn ${activeTab === 'room' ? 'active' : ''}`}
            onClick={() => setActiveTab('room')}
          >
            <span>🏆 Top Sala ({users.length})</span>
          </button>
          <button
            type="button"
            className={`leaderboard-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <span>👤 Mi Rango & Estadísticas</span>
          </button>
          <button
            type="button"
            className={`leaderboard-tab-btn ${activeTab === 'tiers' ? 'active' : ''}`}
            onClick={() => setActiveTab('tiers')}
          >
            <span>📖 Guía de Rangos</span>
          </button>
        </nav>

        {/* Tab Content */}
        <div className="leaderboard-body">
          {activeTab === 'room' && (
            <div className="leaderboard-tab-content">
              <div className="leaderboard-search-bar">
                <input
                  type="text"
                  placeholder="🔍 Buscar jugador en la sala…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="leaderboard-table-wrap">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th style={{ width: 50, textAlign: 'center' }}>Pos.</th>
                      <th>Jugador</th>
                      <th>Rango de Liga</th>
                      <th style={{ textAlign: 'center' }}>ELO</th>
                      <th style={{ textAlign: 'center' }}>Historial</th>
                      <th style={{ textAlign: 'center' }}>Win Rate</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUsers.map((u, index) => {
                      const isMe = u.userName.toLowerCase() === currentUsername.toLowerCase()
                      const pos = index + 1
                      const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : null

                      return (
                        <tr key={u.userName} className={`leaderboard-row ${isMe ? 'is-me' : ''}`}>
                          <td className="pos-cell">
                            {medal ? <span className="pos-medal">{medal}</span> : `#${pos}`}
                          </td>
                          <td className="user-cell">
                            <div className="user-cell-wrap">
                              <AvatarImage avatarId={u.avatarId} username={u.userName} size="small" />
                              <CountryFlag flagName={u.flagName} />
                              <span className="leaderboard-user-name">
                                {u.userName}
                                {isMe && <span className="me-badge">Tú</span>}
                              </span>
                            </div>
                          </td>
                          <td>
                            <RankBadge elo={u.effectiveRating} />
                          </td>
                          <td className="elo-cell">⭐ {u.effectiveRating}</td>
                          <td className="history-cell">{u.matchHistory || '0-0'}</td>
                          <td className="winrate-cell">
                            <div className="winrate-bar-container">
                              <span className="winrate-text">{u.stats.winrate}%</span>
                              <div className="winrate-mini-track">
                                <div
                                  className="winrate-mini-fill"
                                  style={{ width: `${u.stats.winrate}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            {u.infoGames ? (
                              <span className="status-playing">⚔️ En partida</span>
                            ) : (
                              <span className="status-idle">En lobby</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}

                    {sortedUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="leaderboard-empty-cell">
                          No se encontraron jugadores que coincidan con la búsqueda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="leaderboard-tab-content profile-tab-content">
              <div className="profile-rank-card" style={{ borderColor: myRank.border }}>
                <div className="profile-rank-header">
                  <AvatarImage avatarId={currentUser?.avatarId ?? 10} username={currentUsername} size="huge" />
                  <div className="profile-rank-title-col">
                    <span className="profile-rank-tier" style={{ color: myRank.color }}>
                      {myRank.label}
                    </span>
                    <span className="profile-rank-elo">⭐ {myElo} ELO Glicko Oficial</span>
                    <span className="profile-rank-desc">
                      Rango competitivo en partidas puntuadas (Ranked Matches)
                    </span>
                  </div>
                </div>

                {/* Progress to Next Tier */}
                {myRank.nextTierName && (
                  <div className="profile-progress-box">
                    <div className="progress-labels">
                      <span>Progreso hacia {myRank.nextTierName}</span>
                      <span className="progress-value">
                        {myElo} / {myRank.nextTierMinElo} ELO ({myRank.progressPercent}%)
                      </span>
                    </div>
                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${myRank.progressPercent}%`,
                          backgroundColor: myRank.color,
                        }}
                      />
                    </div>
                  </div>
                )}
                {!myRank.nextTierName && (
                  <div className="profile-mythic-badge">
                    <span>👑 ¡Has alcanzado el rango máximo Mítico! Enhorabuena maestro.</span>
                  </div>
                )}
              </div>

              {/* Player Stats Grid */}
              <div className="profile-stats-grid">
                <div className="stat-card">
                  <span className="stat-value">{myStats.total}</span>
                  <span className="stat-label">Partidas Totales</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value text-green">{myStats.wins}</span>
                  <span className="stat-label">Victorias</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value text-red">{myStats.losses}</span>
                  <span className="stat-label">Derrotas</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value text-gold">{myStats.winrate}%</span>
                  <span className="stat-label">Tasa de Victoria</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tiers' && (
            <div className="leaderboard-tab-content">
              <div className="tiers-ladder-grid">
                {RANK_TIERS_CONFIG.map((tier) => (
                  <div
                    key={tier.tier}
                    className="tier-ladder-card"
                    style={{ borderColor: tier.border }}
                  >
                    <div className="tier-card-header">
                      <span className="tier-icon">{tier.icon}</span>
                      <span className="tier-name" style={{ color: tier.color }}>
                        {tier.name}
                      </span>
                    </div>
                    <div className="tier-elo-range">
                      {tier.tier === 'MYTHIC'
                        ? '≥ 2000 ELO'
                        : `${tier.minElo} – ${tier.maxElo} ELO`}
                    </div>
                    <p className="tier-desc">
                      {tier.tier === 'BRONZE' && 'Iniciados y primeros pasos en el juego competitivo.'}
                      {tier.tier === 'SILVER' && 'Nivel medio y estándar de entrada para nuevos duelistas.'}
                      {tier.tier === 'GOLD' && 'Jugadores veteranos con consistencia en victorias.'}
                      {tier.tier === 'PLATINUM' && 'Duelistas avanzados con barajas y estrategias pulidas.'}
                      {tier.tier === 'DIAMOND' && 'Nivel de élite previo a la cumbre competitiva.'}
                      {tier.tier === 'MYTHIC' && 'Top 1% mundial. Maestros y leyendas de XMage.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="leaderboard-footer">
          <button type="button" className="primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
