import { useState, useMemo, useEffect } from 'react'
import { reset, useLobby, useStore, setWatchingTable } from '../state/store'
import * as cmds from '../net/commands'
import type { TableView, UsersView } from '../net/types'
import { cacheAvatar } from './avatarCache'
import CreateTableDialog from './CreateTableDialog'
import JoinTableDialog from './JoinTableDialog'
import ChatBox from './ChatBox'
import DeckManager from './DeckManager'
import CountryFlag from './CountryFlag'
import RankBadge from './RankBadge'
import AvatarImage from './AvatarImage'
import PingBadge from './PingBadge'
import LeaderboardModal from './LeaderboardModal'
import UserActionModal from './UserActionModal'
import TableFilterBar, { INITIAL_TABLE_FILTERS, filterTables, type TableFilters } from './TableFilterBar'
import FinishedMatchesPanel from './FinishedMatchesPanel'
import { AI_OPPONENT_DECK, type Deck } from './decks'
import './LobbyScreen.css'

/** Las promesas del proxy no deben colgar la UI: todo con timeout explícito. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout en ${label} (${ms / 1000}s)`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

function formatTimeAgo(epochMs?: number): string {
  if (!epochMs) return ''
  const diffSec = Math.floor((Date.now() - epochMs) / 1000)
  if (diffSec < 45) return 'ahora'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `hace ${diffHours}h`
  return `hace ${Math.floor(diffHours / 24)}d`
}

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

export function formatDeckTypeName(deckType?: string): { short: string; full: string } {
  if (!deckType) return { short: 'Desconocido', full: '' }
  // Check if it's a huge Chaos Draft booster list (e.g. "Limited 1xMB1 1x7ED 1xBRO...")
  const boosterMatches = deckType.match(/(\d+x[A-Z0-9]+)/g)
  if (boosterMatches && boosterMatches.length > 3) {
    const totalBoosters = boosterMatches.reduce((acc, str) => {
      const num = parseInt(str.split('x')[0], 10) || 1
      return acc + num
    }, 0)
    return {
      short: `Limited (Chaos Draft • ${totalBoosters} sobres)`,
      full: deckType,
    }
  }
  return { short: deckType, full: deckType }
}

export function formatSeatHistory(sHistory?: string, userHistory?: string): { short: string | null; full: string } {
  const full = (userHistory || sHistory || '').trim()
  if (!full) return { short: null, full: '' }

  // Prefer seat's own concise history if present (e.g. "52 (Q:25)")
  if (sHistory && sHistory.trim().length <= 16 && !sHistory.includes('Constructed Rating')) {
    return { short: sHistory.trim(), full }
  }

  // Parse from raw user history "Matches: 265 (I:3 T:1 Q:13) (6%), Tourneys..."
  const matchMatch = full.match(/Matches:\s*(\d+)/i)
  const quitMatch = full.match(/\((\d+%\))\s*,/i) || full.match(/\((\d+%)\)/i)
  if (matchMatch) {
    const count = matchMatch[1]
    const quit = quitMatch ? quitMatch[1] : ''
    return { short: `${count}M${quit ? ` (${quit})` : ''}`, full }
  }

  if (full.length > 14) {
    return { short: full.slice(0, 12) + '…', full }
  }
  return { short: full, full }
}

export function extractLobbyUsers(rawUsers: unknown): import('../net/types').UsersView[] {
  if (!rawUsers) return []
  if (Array.isArray(rawUsers)) {
    const list: import('../net/types').UsersView[] = []
    for (const item of rawUsers) {
      if (item && typeof item === 'object') {
        if (Array.isArray((item as any).usersView)) {
          list.push(...(item as any).usersView)
        } else if (typeof (item as any).userName === 'string') {
          list.push(item as import('../net/types').UsersView)
        }
      }
    }
    return list
  }
  if (typeof rawUsers === 'object') {
    if (Array.isArray((rawUsers as any).usersView)) {
      return (rawUsers as any).usersView
    }
  }
  return []
}

export type LobbyTab = 'tables' | 'decks' | 'community' | 'matches'

export default function LobbyScreen() {
  const lobby = useLobby()
  const conn = useStore((s) => s.conn)
  const myDeck = useStore((s) => s.myDeck)
  const error = useStore((s) => s.error)
  const events = useStore((s) => s.events)
  const [activeTab, setActiveTab] = useState<LobbyTab>('tables')
  const [showCreate, setShowCreate] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [leaderboardTarget, setLeaderboardTarget] = useState<string | undefined>(undefined)
  const [leaderboardTab, setLeaderboardTab] = useState<'room' | 'profile' | 'tiers'>('room')
  const [selectedUser, setSelectedUser] = useState<UsersView | null>(null)
  const [chatPrefill, setChatPrefill] = useState<string>('')
  const [joiningTable, setJoiningTable] = useState<TableView | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [filters, setFilters] = useState<TableFilters>(INITIAL_TABLE_FILTERS)
  const [busyTable, setBusyTable] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const openLeaderboard = (target?: string, tab: 'room' | 'profile' | 'tiers' = 'room') => {
    setLeaderboardTarget(target)
    setLeaderboardTab(tab)
    setShowLeaderboard(true)
  }

  const tables = lobby?.tables ?? []
  const users = useMemo(() => extractLobbyUsers(lobby?.users), [lobby?.users])
  const myUser = useMemo(
    () => users.find((u) => u.userName.toLowerCase() === (conn?.username ?? '').toLowerCase()),
    [users, conn?.username],
  )

  const filteredTables = useMemo(() => {
    return filterTables(tables, filters)
  }, [tables, filters])

  // Cachear automáticamente el avatar real del usuario conectado
  useEffect(() => {
    if (conn?.username && conn?.avatarId && conn.avatarId > 0) {
      cacheAvatar(conn.username, conn.avatarId)
    }
  }, [conn?.username, conn?.avatarId])

  const joinHuman = (t: TableView) => {
    setNotice(null)
    const seat = t.seats.find((s) => !s.playerName)
    if (!seat) {
      setNotice('la mesa no tiene plazas libres')
      return
    }
    setJoiningTable(t)
  }

  const handleJoinWithDeck = async (t: TableView, deck: Deck, password?: string) => {
    setBusyTable(t.tableId)
    setNotice(null)
    try {
      const res = await withTimeout(
        cmds.joinTable({
          tableId: t.tableId,
          playerName: conn?.username ?? 'player',
          playerType: 'HUMAN',
          skill: 1,
          deck,
          password,
        }),
        15000,
        'joinTable',
      )
      if (res.ok) {
        setNotice('Unido a la mesa (auto-pase activo). Esperando startMatch…')
        setJoiningTable(null)
      } else {
        throw new Error(res.error || 'El servidor rechazó la unión a la mesa.')
      }
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusyTable(null)
    }
  }

  const joinAi = async (t: TableView) => {
    setBusyTable(t.tableId)
    setNotice(null)
    const seat = t.seats.find((s) => !s.playerName && s.playerType && /COMPUTER|AI/i.test(s.playerType))
    if (!seat?.playerType) {
      setNotice('no hay plazas IA libres')
      return
    }
    const aiSeats = t.seats.filter((s) => s.playerType && /COMPUTER|AI/i.test(s.playerType))
    const aiIndex = aiSeats.indexOf(seat)
    try {
      const res = await withTimeout(
        cmds.joinTable({
          tableId: t.tableId,
          playerName: aiIndex <= 0 ? 'Computer' : `Computer ${aiIndex + 1}`,
          playerType: seat.playerType,
          skill: 1,
          deck: AI_OPPONENT_DECK,
        }),
        15000,
        'joinTable IA',
      )
      setNotice(res.ok ? 'IA unida a la mesa' : `joinTable IA: ${res.error}`)
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusyTable(null)
    }
  }

  const startTable = async (t: TableView) => {
    setBusyTable(t.tableId)
    try {
      const res = await withTimeout(cmds.startMatch(t.tableId), 20000, 'startMatch')
      setNotice(res.ok ? 'Partida arrancada' : `startMatch: ${res.error}`)
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusyTable(null)
    }
  }

  const watchTable = async (t: TableView) => {
    setBusyTable(t.tableId)
    try {
      const isPlaying = t.tableState === 'DUELING' || t.tableState === 'SIDEBOARDING'
      const res = await withTimeout(cmds.watchTable(t.tableId), 15000, 'watchTable')
      if (res.ok) {
        if (!isPlaying) {
          setWatchingTable(t)
        }
        setNotice('Conectado como espectador')
      } else {
        setNotice(`watchTable: ${res.error}`)
      }
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusyTable(null)
    }
  }

  return (
    <div className="lobby">
      {/* Top Arena Navigation Bar */}
      <header className="lobby-top">
        <div className="lobby-brand-col">
          <img src="/logo.jpeg" alt="XMage Nexus" className="lobby-brand-logo" />
          <div className="lobby-brand-titles">
            <h1 className="lobby-main-heading">XMage Nexus</h1>
            <span className="conn-info">
              <span className="conn-status-dot" />
              {conn?.serverHost}:{conn?.port} • {users.length} jugadores en línea
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="lobby-nav-tabs">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'tables' ? 'active' : ''}`}
            onClick={() => setActiveTab('tables')}
          >
            <span className="tab-icon">⚔️</span>
            <span>Mesas ({tables.length})</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'decks' ? 'active' : ''}`}
            onClick={() => setActiveTab('decks')}
          >
            <span className="tab-icon">🃏</span>
            <span>Mis Mazos</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'community' ? 'active' : ''}`}
            onClick={() => setActiveTab('community')}
          >
            <span className="tab-icon">👥</span>
            <span>Comunidad & Chat</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'matches' ? 'active' : ''}`}
            onClick={() => setActiveTab('matches')}
            title="Ver resultados y repeticiones de partidas finalizadas"
          >
            <span className="tab-icon">📜</span>
            <span>Partidas Finalizadas</span>
          </button>
          <button
            type="button"
            className="nav-tab-btn leaderboard-nav-tab"
            onClick={() => openLeaderboard(conn?.username, 'room')}
            title="Ver clasificación de la sala y rangos de liga"
          >
            <span className="tab-icon">🏆</span>
            <span>Leaderboard</span>
          </button>
        </nav>

        {/* User Identity & Disconnect */}
        <div className="lobby-user-actions">
          <div
            className="lobby-user-badge"
            onClick={() => openLeaderboard(conn?.username, 'profile')}
            title="Haz clic para ver tu perfil competitivo y estadísticas"
          >
            <AvatarImage avatarId={conn?.avatarId ?? 10} username={conn?.username} size="medium" />
            <div className="lobby-user-col">
              <div className="lobby-user-name-line" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="lobby-username">{conn?.username}</span>
                {myUser?.infoPing && <PingBadge infoPing={myUser.infoPing} compact />}
              </div>
              <RankBadge elo={myUser?.constructedRating ?? 1500} compact />
            </div>
          </div>
          <button className="lobby-disconnect-btn" onClick={reset} title="Cerrar sesión">
            Desconectar
          </button>
        </div>
      </header>

      {error && <div className="error-box panel">{error}</div>}
      {notice && <div className="notice panel">{notice}</div>}

      {/* Main Tab Content */}
      <div className="lobby-body-container">
        {activeTab === 'tables' && (
          <div className="lobby-tables-view">
            {/* Hero Quick Action Bar */}
            <div className="tables-hero-bar">
              <div className="hero-left-actions">
                <button className="primary hero-create-btn" onClick={() => setShowCreate(true)}>
                  <span className="btn-icon">➕</span>
                  <span>Nueva mesa</span>
                </button>
              </div>

              <div className="hero-deck-badge" title={`Mazo activo para unirse a partidas: ${myDeck?.name ?? 'Mage Web bolt'}`}>
                <span className="hero-deck-label">Mazo equipado:</span>
                <span className="hero-deck-name">🃏 {myDeck?.name ?? 'Mage Web bolt'}</span>
              </div>
            </div>

            {/* Modern Full Table Filter Bar */}
            <TableFilterBar
              tables={tables}
              filters={filters}
              onChange={setFilters}
              onReset={() => setFilters(INITIAL_TABLE_FILTERS)}
            />

            {/* Tables Grid Section */}
            <section className="panel tables-panel">
              <div className="tables-panel-header">
                <h2>
                  Mesas ({filteredTables.length}
                  {filteredTables.length !== tables.length ? ` de ${tables.length}` : ''})
                </h2>
                <span className="tables-deck-hint">
                  Mostrando partidas activas y en espera
                </span>
              </div>

              <div className="tables-list">
                {filteredTables.map((t) => {
                  const isReady = t.tableState === 'READY_TO_START'
                  const isPlaying = t.tableState === 'DUELING' || t.tableState === 'SIDEBOARDING'
                  const isWaiting = t.tableState === 'WAITING'

                  const hasHumanSeat =
                    (isWaiting || isReady) &&
                    t.seats.some((s) => !s.playerName && (!s.playerType || s.playerType === 'HUMAN'))
                  const hasAiSeat =
                    (isWaiting || isReady) &&
                    t.seats.some((s) => !s.playerName && s.playerType && /COMPUTER|AI/i.test(s.playerType))

                  const statusClass = isReady
                    ? 'status-ready'
                    : isPlaying
                    ? 'status-playing'
                    : 'status-waiting'

                  const timeAgo = formatTimeAgo(t.createTime)
                  const skill = getSkillBadge(t.skillLevel)

                  return (
                    <div key={t.tableId} className={`table-card table-row ${statusClass}`}>
                      <div className="table-card-main">
                        {/* Top Badges & Status */}
                        <div className="table-card-top-bar">
                          <div className="table-badges-left">
                            {t.isTournament ? (
                              <span className="table-type-badge tourney" title="Torneo">🏆 Torneo</span>
                            ) : (
                              <span className="table-type-badge match" title="Duelo">⚔️ Duelo</span>
                            )}
                            {t.passworded && (
                              <span className="table-badge-lock" title="Mesa privada con contraseña">🔒 Privada</span>
                            )}
                            {skill && (
                              <span className={`table-skill-badge ${skill.className}`} title={`Nivel de habilidad: ${skill.label}`}>
                                {skill.icon} {skill.label}
                              </span>
                            )}
                            {t.rated ? (
                              <span className="table-tag-rated" title="Partida clasificatoria (afecta a ELO)">🏅 Rated</span>
                            ) : (
                              <span className="table-tag-unrated" title="Partida casual sin rating">Unrated</span>
                            )}
                          </div>
                          <div className="table-header-right">
                            {timeAgo && (
                              <span className="table-time-ago" title={t.createTime ? new Date(t.createTime).toLocaleTimeString() : undefined}>
                                ⏱️ {timeAgo}
                              </span>
                            )}
                            <span className={`table-state-badge ${statusClass}`}>{t.tableStateText}</span>
                          </div>
                        </div>

                        {/* Prominent Table Title */}
                        <div className="table-title-area">
                          <h3 className="table-name-text" title={t.tableName}>{t.tableName}</h3>
                        </div>

                        <div className="table-meta-row">
                          <span className="table-game-tag">🎮 {t.gameType}</span>
                          <span
                            className="table-deck-tag"
                            title={formatDeckTypeName(t.deckType).full}
                          >
                            📜 {formatDeckTypeName(t.deckType).short}
                          </span>
                          <span className="table-seats-count table-seats">👥 {t.seatsInfo}</span>
                          {skill && (
                            <span className={`table-skill-badge ${skill.className}`} title={`Nivel de habilidad: ${skill.label}`}>
                              {skill.icon} {skill.label}
                            </span>
                          )}
                          {t.rated ? (
                            <span className="table-tag-rated" title="Partida clasificatoria (afecta a ELO)">🏅 Rated</span>
                          ) : (
                            <span className="table-tag-unrated" title="Partida casual sin rating">Unrated</span>
                          )}
                          {t.spectatorsAllowed && (
                            <span className="table-tag-spectate" title="Espectadores permitidos">👁️ Espectadores</span>
                          )}
                          {Number(t.minimumRating) > 0 && (
                            <span className="table-tag-restriction" title={`Rating mínimo requerido: ${t.minimumRating}`}>
                              ⭐ Min {t.minimumRating}
                            </span>
                          )}
                          {Number(String(t.quitRatio ?? '100').replace('%', '')) < 100 && (
                            <span className="table-tag-restriction" title={`Máximo porcentaje de abandono permitido: ${t.quitRatio}`}>
                              🚫 Max Quit {t.quitRatio}
                            </span>
                          )}
                        </div>

                        {t.additionalInfoShort && (
                          <div className="table-info-strip" title={t.additionalInfoFull || t.additionalInfoShort}>
                            <span className="info-strip-icon">ℹ️</span>
                            <span className="info-strip-text">{t.additionalInfoShort}</span>
                          </div>
                        )}

                        {/* Player Seats Section (Full Width, 3-Part Layout: Avatar, Full Name, Info) */}
                        <div className="table-seats-roster">
                          {t.seats.map((s, idx) => {
                            const isOwner = t.controllerName && s.playerName === t.controllerName
                            const isHuman = !s.playerType || s.playerType === 'HUMAN'
                            const foundUser = s.playerName
                              ? users.find((u) => u.userName.toLowerCase() === s.playerName.toLowerCase())
                              : undefined
                            const rating = foundUser?.constructedRating ?? (s as any).constructedRating
                            const historyInfo = formatSeatHistory(s.history, foundUser?.matchHistory)
                            const seatAvatarId = isHuman
                              ? s.playerName === conn?.username
                                ? conn?.avatarId
                                : foundUser?.avatarId
                              : 13

                            return (
                              <div
                                key={idx}
                                className={`seat-badge ${s.playerName ? 'occupied interactive' : 'empty'} ${isOwner ? 'is-owner' : ''}`}
                                onClick={() => {
                                  if (!s.playerName) return
                                  setSelectedUser(
                                    foundUser ?? {
                                      userName: s.playerName,
                                      flagName: s.flagName ?? '',
                                      constructedRating: (s as any).constructedRating || 1500,
                                      matchHistory: s.history || '',
                                      infoGames: '',
                                      matchQuitRatio: 0,
                                      tourneyHistory: '',
                                      tourneyQuitRatio: 0,
                                      infoPing: '',
                                      generalRating: 1500,
                                      limitedRating: 1500,
                                    },
                                  )
                                }}
                                style={s.playerName ? { cursor: 'pointer' } : undefined}
                                title={s.playerName ? `Ver acciones de ${s.playerName}` : 'Plaza disponible'}
                              >
                                {/* Parte 1: Icono / Avatar & Bandera */}
                                <div className="seat-part-avatar">
                                  {s.playerName ? (
                                    <AvatarImage avatarId={seatAvatarId} username={s.playerName} size="small" />
                                  ) : (
                                    <span className="seat-icon empty-circle">⭕</span>
                                  )}
                                  {s.flagName && <CountryFlag flagName={s.flagName} className="seat-flag" />}
                                </div>

                                {/* Parte 2: Nombre Completo (sin cortar, centrado, altura flexible) */}
                                <div className="seat-part-name">
                                  <span className="seat-player-name">
                                    {s.playerName || 'Plaza vacía disponible'}
                                  </span>
                                  {isOwner && <span className="seat-crown" title="Creador / Host de la mesa">👑 Host</span>}
                                  {!isHuman && <span className="seat-bot-tag" title="Oponente Inteligencia Artificial">🤖 {s.playerType || 'IA'}</span>}
                                </div>

                                {/* Parte 3: Resto de info (Historial, Rating, Estado) */}
                                <div className="seat-part-info">
                                  {historyInfo.short && (
                                    <span className="seat-history-pill" title={historyInfo.full || `Historial: ${historyInfo.short}`}>
                                      🏆 {historyInfo.short}
                                    </span>
                                  )}
                                  {rating && <RankBadge elo={rating} compact showElo />}
                                  {s.playerName ? (
                                    <span className="seat-ready-indicator" title="Jugador conectado y listo">
                                      <span className="seat-ready-dot" />
                                      <span className="seat-ready-text">Listo</span>
                                    </span>
                                  ) : (
                                    <span className="seat-open-badge">Disponible</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="table-actions">
                        {isReady && (
                          <button
                            className="primary table-action-btn"
                            disabled={busyTable === t.tableId}
                            onClick={() => startTable(t)}
                          >
                            Empezar
                          </button>
                        )}
                        {hasHumanSeat && (
                          <button
                            className="table-action-btn join-btn"
                            disabled={busyTable === t.tableId}
                            onClick={() => joinHuman(t)}
                          >
                            Unirse (humano)
                          </button>
                        )}
                        {hasAiSeat && (
                          <button
                            className="table-action-btn ai-btn"
                            disabled={busyTable === t.tableId}
                            onClick={() => joinAi(t)}
                          >
                            Unirse IA
                          </button>
                        )}
                        <button
                          className="table-action-btn watch-btn"
                          disabled={busyTable === t.tableId}
                          onClick={() => watchTable(t)}
                        >
                          👁️ Ver
                        </button>
                      </div>
                    </div>
                  )
                })}

                {filteredTables.length === 0 && tables.length === 0 && (
                  <div className="tables-empty-state">
                    <span className="empty-icon">🏰</span>
                    <h3>No hay mesas disponibles en este momento</h3>
                    <p>Crea una nueva partida o lanza una demo rápida contra la IA.</p>
                    <button className="primary" onClick={() => setShowCreate(true)}>
                      ➕ Crear Nueva Mesa
                    </button>
                  </div>
                )}

                {filteredTables.length === 0 && tables.length > 0 && (
                  <div className="tables-empty-match">
                    <span className="empty-match-icon">🔍</span>
                    <span className="empty-match-title">No hay mesas que coincidan con los filtros</span>
                    <p className="empty-match-desc">
                      Hay {tables.length} {tables.length === 1 ? 'mesa activa' : 'mesas activas'} en el servidor, pero ninguna cumple los criterios seleccionados.
                    </p>
                    <button
                      type="button"
                      className="empty-reset-btn"
                      onClick={() => setFilters(INITIAL_TABLE_FILTERS)}
                    >
                      Restablecer filtros
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'decks' && <DeckManager />}

        {activeTab === 'community' && (
          <div className="lobby-community-grid">
            <section className="panel chat-panel">
              <h2>💬 Sala de Chat Global</h2>
              <ChatBox
                prefill={chatPrefill}
                onPrefillUsed={() => setChatPrefill('')}
                onUserClick={(username) => {
                  const found = users.find(
                    (u) => u.userName.toLowerCase() === username.toLowerCase(),
                  )
                  if (found) {
                    setSelectedUser(found)
                  } else {
                    setSelectedUser({
                      userName: username,
                      flagName: '',
                      constructedRating: 1500,
                      matchHistory: '',
                      infoGames: '',
                      matchQuitRatio: 0,
                      tourneyHistory: '',
                      tourneyQuitRatio: 0,
                      infoPing: '',
                      generalRating: 1500,
                      limitedRating: 1500,
                    })
                  }
                }}
              />
            </section>

            <section className="panel users-panel">
              <div className="users-panel-header">
                <h2>👥 Jugadores Conectados ({users.length})</h2>
                <button
                  type="button"
                  className="view-leaderboard-btn"
                  onClick={() => openLeaderboard(conn?.username, 'room')}
                  title="Abrir clasificación de la sala"
                >
                  🏆 Leaderboard
                </button>
              </div>
              <ul className="users-list">
                {users.map((u) => (
                  <li
                    key={u.userName}
                    className="user-list-item interactive"
                    onClick={() => setSelectedUser(u)}
                    style={{ cursor: 'pointer' }}
                    title={`Ver acciones de usuario para ${u.userName}`}
                  >
                    <span className={`dot ${u.infoGames ? 'playing' : 'online'}`} />
                    <AvatarImage avatarId={u.avatarId} username={u.userName} size="medium" />
                    <div className="user-info-col">
                      <div className="user-name-row">
                        {u.flagName && <CountryFlag flagName={u.flagName} className="user-list-flag" showTextFallback />}
                        <span className="user-name-text">{u.userName}</span>
                        <RankBadge elo={u.constructedRating} compact showElo />
                        {u.infoPing && <PingBadge infoPing={u.infoPing} compact />}
                      </div>
                      {u.matchHistory && (
                        <span className="user-history-text">Historial: {u.matchHistory}</span>
                      )}
                    </div>
                    {u.infoGames ? (
                      <span className="game-info-badge">⚔️ {u.infoGames}</span>
                    ) : (
                      <span className="lobby-idle-badge">En lobby</span>
                    )}
                  </li>
                ))}
                {users.length === 0 && (
                  <li className="users-empty-item">
                    <span className="empty">Esperando jugadores en la sala…</span>
                  </li>
                )}
              </ul>
            </section>
          </div>
        )}

        {/* Tab: Finished Matches History & Replays */}
        {activeTab === 'matches' && (
          <FinishedMatchesPanel
            users={users}
            onInspectUser={(username) => openLeaderboard(username, 'profile')}
          />
        )}
      </div>

      {/* Collapsible Debug Drawer Toggle at Bottom */}
      <div className="debug-drawer-container">
        <button
          type="button"
          className="debug-toggle-btn"
          onClick={() => setShowDebug(!showDebug)}
        >
          <span>🛠️ Eventos de red ({events.length})</span>
          <span>{showDebug ? '▼ Ocultar' : '▲ Ver'}</span>
        </button>

        {showDebug && (
          <div className="debug-drawer-panel panel">
            <div className="debug-drawer-header">
              <h3>Registro de Eventos WebSocket</h3>
              <span className="debug-count">{events.length} recibidos</span>
            </div>
            <ul className="events-list">
              {events.slice(-50).map((e, i) => (
                <li key={i}>
                  <span className="debug-time">{new Date(e.time).toLocaleTimeString()}</span>
                  <span className="debug-method">{e.method}</span>
                </li>
              ))}
              {events.length === 0 && <p className="empty">Esperando eventos…</p>}
            </ul>
          </div>
        )}
      </div>

      {showCreate && <CreateTableDialog onClose={() => setShowCreate(false)} />}
      {showLeaderboard && (
        <LeaderboardModal
          users={users}
          currentUsername={conn?.username ?? ''}
          initialTargetUsername={leaderboardTarget}
          initialTab={leaderboardTab}
          onClose={() => {
            setShowLeaderboard(false)
            setLeaderboardTarget(undefined)
            setLeaderboardTab('room')
          }}
        />
      )}
      {selectedUser && (
        <UserActionModal
          user={selectedUser}
          currentUsername={conn?.username ?? ''}
          tables={tables}
          onWhisper={(username) => {
            setActiveTab('community')
            setChatPrefill(`/w ${username} `)
          }}
          onViewLeaderboard={(username) => {
            openLeaderboard(username, 'profile')
          }}
          onWatchTable={async (tableId) => {
            setNotice('Conectando como espectador…')
            const watched = await withTimeout(cmds.watchTable(tableId), 15000, 'watchTable')
            setNotice(watched.ok ? 'Conectado como espectador' : `watchTable falló: ${watched.error}`)
          }}
          onClose={() => setSelectedUser(null)}
        />
      )}
      {joiningTable && (
        <JoinTableDialog
          table={joiningTable}
          busy={busyTable === joiningTable.tableId}
          onClose={() => setJoiningTable(null)}
          onJoin={handleJoinWithDeck}
        />
      )}
    </div>
  )
}

