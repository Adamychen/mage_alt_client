import { useState, useMemo } from 'react'
import { reset, useLobby, useStore } from '../state/store'
import * as cmds from '../net/commands'
import type { TableView } from '../net/types'
import CreateTableDialog from './CreateTableDialog'
import ChatBox from './ChatBox'
import DeckManager from './DeckManager'
import TableFilterBar, { INITIAL_TABLE_FILTERS, filterTables, type TableFilters } from './TableFilterBar'
import { AI_OPPONENT_DECK, DEFAULT_DECK, STABLE_DECK } from './decks'
import './LobbyScreen.css'

/** Asiento de oponente simulado: lo une el proxy con su propia sesión (determinista). */
const SIM_PLAYER = 'SIM'

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

export type LobbyTab = 'tables' | 'decks' | 'community'

export default function LobbyScreen() {
  const lobby = useLobby()
  const conn = useStore((s) => s.conn)
  const myDeck = useStore((s) => s.myDeck)
  const error = useStore((s) => s.error)
  const events = useStore((s) => s.events)
  const [activeTab, setActiveTab] = useState<LobbyTab>('tables')
  const [showCreate, setShowCreate] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [filters, setFilters] = useState<TableFilters>(INITIAL_TABLE_FILTERS)
  const [busyTable, setBusyTable] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const tables = lobby?.tables ?? []
  const users = lobby?.users.usersView ?? []

  const filteredTables = useMemo(() => {
    return filterTables(tables, filters)
  }, [tables, filters])

  const runDemo = async () => {
    setBusyTable('demo')
    setNotice('Creando mesa IA vs IA…')
    try {
      const table = await withTimeout(
        cmds.createTable({
          name: 'Demo IA vs IA',
          gameType: 'Two Player Duel',
          deckType: 'Constructed - Modern',
          winsNeeded: 1,
          playerTypes: [SIM_PLAYER, SIM_PLAYER],
          simDecks: [STABLE_DECK, STABLE_DECK],
        }),
        15000,
        'createTable',
      )
      if (!table.ok) {
        setNotice(`no se pudo crear la mesa: ${table.error}`)
        return
      }
      const tableId = (table.data as { tableId?: string })?.tableId
      if (!tableId) {
        setNotice('la creación de mesa no devolvió tableId')
        return
      }
      const started = await withTimeout(cmds.startMatch(tableId), 20000, 'startMatch')
      if (!started.ok) {
        setNotice(`startMatch falló: ${started.error}`)
        return
      }
      await new Promise((r) => setTimeout(r, 1500))
      const watched = await withTimeout(cmds.watchTable(tableId), 15000, 'watchTable')
      setNotice(watched.ok ? 'Conectado como espectador' : `watchTable falló: ${watched.error}`)
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusyTable(null)
    }
  }

  const joinHuman = async (t: TableView) => {
    setBusyTable(t.tableId)
    setNotice(null)
    const seat = t.seats.find((s) => !s.playerName)
    if (!seat) {
      setNotice('la mesa no tiene plazas libres')
      return
    }
    try {
      const res = await withTimeout(
        cmds.joinTable({
          tableId: t.tableId,
          playerName: conn?.username ?? 'player',
          playerType: 'HUMAN',
          skill: 1,
          deck: myDeck ?? DEFAULT_DECK,
        }),
        15000,
        'joinTable',
      )
      setNotice(res.ok ? 'Unido a la mesa (auto-pase activo). Esperando startMatch…' : `joinTable: ${res.error}`)
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
      const res = await withTimeout(cmds.watchTable(t.tableId), 15000, 'watchTable')
      setNotice(res.ok ? 'Conectado como espectador' : `watchTable: ${res.error}`)
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusyTable(null)
    }
  }

  const userInitial = conn?.username?.charAt(0).toUpperCase() || 'P'

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
        </nav>

        {/* User Identity & Disconnect */}
        <div className="lobby-user-actions">
          <div className="lobby-user-badge">
            <div className="lobby-avatar-pill">{userInitial}</div>
            <span className="lobby-username">{conn?.username}</span>
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
                <button
                  className="hero-demo-btn"
                  disabled={busyTable === 'demo'}
                  onClick={runDemo}
                  title="Inicia una partida de prueba IA vs IA y conéctate como espectador"
                >
                  <span className="btn-icon">▶</span>
                  <span>{busyTable === 'demo' ? 'Iniciando demo…' : 'Demo IA vs IA (espectador)'}</span>
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
                          <span className="table-deck-tag">📜 {t.deckType}</span>
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
                        </div>

                        {t.additionalInfoShort && (
                          <div className="table-info-strip" title={t.additionalInfoFull || t.additionalInfoShort}>
                            <span className="info-strip-icon">ℹ️</span>
                            <span className="info-strip-text">{t.additionalInfoShort}</span>
                          </div>
                        )}

                        {/* Player Seats Badges */}
                        <div className="table-seats-roster">
                          {t.seats.map((s, idx) => {
                            const isOwner = t.controllerName && s.playerName === t.controllerName
                            const isHuman = !s.playerType || s.playerType === 'HUMAN'
                            return (
                              <div
                                key={idx}
                                className={`seat-badge ${s.playerName ? 'occupied' : 'empty'} ${isOwner ? 'is-owner' : ''}`}
                              >
                                <span className="seat-icon">
                                  {s.playerName ? (isHuman ? '👤' : '🤖') : '⭕'}
                                </span>
                                <span className="seat-name">
                                  {s.playerName || 'Plaza vacía'}
                                  {isOwner && <span className="seat-crown" title="Creador de la mesa">👑</span>}
                                </span>
                                {s.history && (
                                  <span className="seat-history" title={`Historial: ${s.history}`}>
                                    ({s.history})
                                  </span>
                                )}
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
              <ChatBox />
            </section>

            <section className="panel users-panel">
              <h2>👥 Jugadores Conectados ({users.length})</h2>
              <ul className="users-list">
                {users.map((u) => (
                  <li key={u.userName} className="user-list-item">
                    <span className={`dot ${u.infoGames ? 'playing' : 'online'}`} />
                    <span className="user-name-text">{u.userName}</span>
                    {u.infoGames ? (
                      <span className="game-info-badge">⚔️ {u.infoGames}</span>
                    ) : (
                      <span className="lobby-idle-badge">En lobby</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
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
    </div>
  )
}

