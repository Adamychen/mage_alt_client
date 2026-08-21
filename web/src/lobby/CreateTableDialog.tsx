import { useEffect, useState, useMemo } from 'react'
import * as cmds from '../net/commands'
import type { GameTypeInfo } from '../net/commands'
import { setMyDeck, useStore } from '../state/store'
import { getAllAvailableDecks, DEFAULT_DECK, LANDS_DECK, type Deck } from './decks'
import './CreateTableDialog.css'

export type CreateTab = 'general' | 'timing' | 'security' | 'seats' | 'dev'

export const TIME_LIMIT_OPTIONS = [
  { label: 'Sin límite (None)', value: 'NONE' },
  { label: '15 Minutos', value: 'MIN__15' },
  { label: '20 Minutos', value: 'MIN__20' },
  { label: '25 Minutos (Estándar)', value: 'MIN__25' },
  { label: '30 Minutos', value: 'MIN__30' },
  { label: '45 Minutos', value: 'MIN__45' },
  { label: '60 Minutos (Largo)', value: 'MIN__60' },
  { label: '90 Minutos', value: 'MIN__90' },
]

export const BUFFER_TIME_OPTIONS = [
  { label: 'Sin buffer adicional', value: 'NONE' },
  { label: '5 Segundos', value: 'SEC__05' },
  { label: '10 Segundos', value: 'SEC__10' },
  { label: '15 Segundos', value: 'SEC__15' },
  { label: '20 Segundos', value: 'SEC__20' },
  { label: '30 Segundos', value: 'SEC__30' },
]

export const SKILL_LEVEL_OPTIONS = [
  { label: 'Novato', value: 'BEGINNER', icon: '⭐' },
  { label: 'Casual', value: 'CASUAL', icon: '⭐⭐' },
  { label: 'Competitivo', value: 'SERIOUS', icon: '⭐⭐⭐' },
]

export default function CreateTableDialog({ onClose }: { onClose: () => void }) {
  const username = useStore((s) => s.conn?.username ?? 'player')
  const storeDeck = useStore((s) => s.myDeck)

  const [activeTab, setActiveTab] = useState<CreateTab>('general')
  const [gameTypes, setGameTypes] = useState<GameTypeInfo[]>([])
  const [deckTypes, setDeckTypes] = useState<string[]>([])
  const [playerTypes, setPlayerTypes] = useState<string[]>([])

  // General tab
  const [name, setName] = useState(`${username}'s table`)
  const [gameType, setGameType] = useState('Two Player Duel')
  const [deckType, setDeckType] = useState('Constructed - Modern')
  const [wins, setWins] = useState(1)
  const [skillLevel, setSkillLevel] = useState<'BEGINNER' | 'CASUAL' | 'SERIOUS'>('CASUAL')
  const [rated, setRated] = useState(false)

  // Timing tab
  const [timeLimit, setTimeLimit] = useState('MIN__25')
  const [bufferTime, setBufferTime] = useState('NONE')
  const [freeMulligans, setFreeMulligans] = useState(0)
  const [attackOption, setAttackOption] = useState('LEFT')
  const [range, setRange] = useState('ALL')

  // Security & Permissions tab
  const [password, setPassword] = useState('')
  const [spectatorsAllowed, setSpectatorsAllowed] = useState(true)
  const [rollbackTurnsAllowed, setRollbackTurnsAllowed] = useState(true)

  // Seats & Decks tab
  const [humanSeat, setHumanSeat] = useState(true)
  const availableDecks = useMemo(() => getAllAvailableDecks(), [])
  const [myDeck, setMyDeckState] = useState<Deck>(storeDeck ?? DEFAULT_DECK)
  const [simDeck, setSimDeck] = useState<Deck>(LANDS_DECK)
  const [playerTypesSel, setPlayerTypesSel] = useState<string[]>(['SIM'])

  // Dev / Test tab
  const [skipInitShuffling, setSkipInitShuffling] = useState(false)
  const [skipStartingPlayerChoice, setSkipStartingPlayerChoice] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [g, d, p] = await Promise.all([cmds.getGameTypes(), cmds.getDeckTypes(), cmds.getPlayerTypes()])
      setGameTypes(g)
      setDeckTypes(d)
      setPlayerTypes(p)
      if (g.length && !g.some((x) => x.name === gameType)) setGameType(g[0].name)
      if (d.length && !d.includes(deckType)) setDeckType(d[0])
    })()
  }, [])

  // Auto-adjust free mulligans when switching to Commander/Multiplayer
  useEffect(() => {
    const isMulti = gameType.toLowerCase().includes('commander') || gameType.toLowerCase().includes('free for all')
    if (isMulti && freeMulligans === 0) {
      setFreeMulligans(1)
    }
  }, [gameType])

  const toggleAi = (pt: string) => {
    setPlayerTypesSel((cur) => (cur.includes(pt) ? cur.filter((x) => x !== pt) : [...cur, pt]))
  }

  const selectedGameTypeInfo = useMemo(() => {
    return gameTypes.find((g) => g.name === gameType)
  }, [gameTypes, gameType])

  const isMultiplayerGame = useMemo(() => {
    return (selectedGameTypeInfo?.maxPlayers ?? 2) > 2 || gameType.toLowerCase().includes('commander')
  }, [selectedGameTypeInfo, gameType])

  const create = async () => {
    setBusy(true)
    setError(null)
    const maxPlayers = selectedGameTypeInfo?.maxPlayers ?? 2
    const maxAi = Math.max(0, maxPlayers - (humanSeat ? 1 : 0))
    const aiTypes = (playerTypesSel.length ? playerTypesSel : ['SIM']).slice(0, maxAi)
    const playerTypesFinal = humanSeat ? ['HUMAN', ...aiTypes] : aiTypes
    const simSeats = aiTypes.filter((pt) => pt === 'SIM').length

    const res = await cmds.createTable({
      name: name || `${username}'s table`,
      gameType,
      deckType,
      winsNeeded: wins,
      playerTypes: playerTypesFinal,
      password: password.trim() || undefined,
      skillLevel,
      rated,
      spectatorsAllowed,
      rollbackTurnsAllowed,
      timeLimit: timeLimit === 'NONE' ? undefined : timeLimit,
      bufferTime: bufferTime === 'NONE' ? undefined : bufferTime,
      freeMulligans,
      attackOption: isMultiplayerGame ? attackOption : undefined,
      range: isMultiplayerGame ? range : undefined,
      skipInitShuffling,
      skipStartingPlayerChoice,
      simDecks: simSeats > 0 ? Array.from({ length: simSeats }, () => simDeck) : undefined,
    })

    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo crear la mesa')
      return
    }

    const tableId = (res.data as { tableId?: string } | null)?.tableId
    if (humanSeat && tableId) {
      const join = await cmds.joinTable({
        tableId,
        playerName: username,
        playerType: 'HUMAN',
        skill: 1,
        deck: myDeck,
        password: password.trim() || undefined,
      })
      setMyDeck(myDeck)
      if (!join.ok) {
        setError(join.error ?? 'No se pudo unir tu plaza a la mesa creada')
        return
      }
    }
    onClose()
  }

  return (
    <div className="overlay">
      <div className="dialog panel create-table-dialog">
        <div className="create-table-header">
          <div className="create-table-header-title">
            <h2>⚔️ Crear Nueva Mesa</h2>
            <span className="create-table-subtitle">Configura reglas, tiempos, permisos y oponentes</span>
          </div>
          <button type="button" className="create-dialog-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <nav className="create-table-tabs">
          <button
            type="button"
            className={`create-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <span>⚙️ General</span>
          </button>
          <button
            type="button"
            className={`create-tab-btn ${activeTab === 'timing' ? 'active' : ''}`}
            onClick={() => setActiveTab('timing')}
          >
            <span>⏱️ Tiempos & Reglas</span>
          </button>
          <button
            type="button"
            className={`create-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <span>🛡️ Seguridad</span>
          </button>
          <button
            type="button"
            className={`create-tab-btn ${activeTab === 'seats' ? 'active' : ''}`}
            onClick={() => setActiveTab('seats')}
          >
            <span>🤖 Asientos ({humanSeat ? '1 Humano + ' : ''}{playerTypesSel.length} IA)</span>
          </button>
          <button
            type="button"
            className={`create-tab-btn ${activeTab === 'dev' ? 'active' : ''}`}
            onClick={() => setActiveTab('dev')}
          >
            <span>🛠️ Test</span>
          </button>
        </nav>

        {/* Tab Content */}
        <div className="create-table-body">
          {activeTab === 'general' && (
            <div className="create-tab-content">
              <label>
                Nombre de la mesa
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Modern Casual Bo3"
                />
              </label>

              <div className="create-grid-2col">
                <label>
                  Tipo de juego
                  <select value={gameType} onChange={(e) => setGameType(e.target.value)}>
                    {gameTypes.map((g) => (
                      <option key={g.name} value={g.name}>
                        {g.name} ({g.minPlayers}-{g.maxPlayers} jug.)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Formato (Deck Type)
                  <select value={deckType} onChange={(e) => setDeckType(e.target.value)}>
                    {deckTypes.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="field">
                <span>Victorias necesarias (Match)</span>
                <div className="chip-row">
                  {[
                    { label: 'Bo1 (1 victoria)', val: 1 },
                    { label: 'Bo3 (2 victorias - Estándar)', val: 2 },
                    { label: 'Bo5 (3 victorias)', val: 3 },
                  ].map((w) => (
                    <button
                      key={w.val}
                      type="button"
                      className={`chip ${wins === w.val ? 'on' : ''}`}
                      onClick={() => setWins(w.val)}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>Nivel de habilidad esperado</span>
                <div className="chip-row">
                  {SKILL_LEVEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`chip ${skillLevel === opt.value ? 'on' : ''}`}
                      onClick={() => setSkillLevel(opt.value as any)}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="toggle-label-row">
                <input
                  type="checkbox"
                  checked={rated}
                  onChange={(e) => setRated(e.target.checked)}
                />
                <div className="toggle-text-block">
                  <span className="toggle-title">⭐ Partida puntuada (Rated match)</span>
                  <span className="toggle-desc">Afectará al ELO / Ranking de los jugadores en este formato</span>
                </div>
              </label>
            </div>
          )}

          {activeTab === 'timing' && (
            <div className="create-tab-content">
              <div className="create-grid-2col">
                <label>
                  Reloj de prioridad por jugador
                  <select value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)}>
                    {TIME_LIMIT_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Tiempo de reserva (Buffer)
                  <select value={bufferTime} onChange={(e) => setBufferTime(e.target.value)}>
                    {BUFFER_TIME_OPTIONS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="field">
                <span>Mulligans gratuitos</span>
                <div className="chip-row">
                  {[0, 1, 2, 3].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`chip ${freeMulligans === m ? 'on' : ''}`}
                      onClick={() => setFreeMulligans(m)}
                    >
                      {m === 0 ? '0 (1v1 Estándar)' : `${m} gratis`}
                    </button>
                  ))}
                </div>
              </div>

              {isMultiplayerGame && (
                <div className="create-multiplayer-box">
                  <span className="multiplayer-box-title">👑 Reglas Multijugador</span>
                  <div className="create-grid-2col">
                    <label>
                      Modo de ataque
                      <select value={attackOption} onChange={(e) => setAttackOption(e.target.value)}>
                        <option value="LEFT">Atacar a la izquierda</option>
                        <option value="RIGHT">Atacar a la derecha</option>
                        <option value="MULTIPLE">Todos contra todos (FFA)</option>
                      </select>
                    </label>
                    <label>
                      Rango de influencia
                      <select value={range} onChange={(e) => setRange(e.target.value)}>
                        <option value="ALL">Toda la mesa (All)</option>
                        <option value="ONE">1 jugador de distancia</option>
                        <option value="TWO">2 jugadores de distancia</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'security' && (
            <div className="create-tab-content">
              <label>
                Contraseña de la mesa (opcional)
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Dejar en blanco para mesa pública"
                />
              </label>

              <label className="toggle-label-row">
                <input
                  type="checkbox"
                  checked={spectatorsAllowed}
                  onChange={(e) => setSpectatorsAllowed(e.target.checked)}
                />
                <div className="toggle-text-block">
                  <span className="toggle-title">👁️ Permitir espectadores</span>
                  <span className="toggle-desc">Otros usuarios podrán conectarse a ver la partida en vivo</span>
                </div>
              </label>

              <label className="toggle-label-row">
                <input
                  type="checkbox"
                  checked={rollbackTurnsAllowed}
                  onChange={(e) => setRollbackTurnsAllowed(e.target.checked)}
                />
                <div className="toggle-text-block">
                  <span className="toggle-title">⏪ Permitir rebobinar turnos (Rollback)</span>
                  <span className="toggle-desc">Permite a los jugadores solicitar deshacer acciones por mutuo acuerdo</span>
                </div>
              </label>
            </div>
          )}

          {activeTab === 'seats' && (
            <div className="create-tab-content">
              <div className="create-seats-section">
                <div className="create-seat-box human-seat-box">
                  <div className="seat-box-header">
                    <span className="seat-title">👤 Tu Asiento</span>
                    <button
                      type="button"
                      className={`chip ${humanSeat ? 'on' : ''}`}
                      onClick={() => setHumanSeat(!humanSeat)}
                    >
                      {humanSeat ? '✓ Jugador Activo' : '👁️ Solo Espectador'}
                    </button>
                  </div>
                  {humanSeat && (
                    <label>
                      Mazo para jugar
                      <select
                        value={myDeck.name}
                        onChange={(e) =>
                          setMyDeckState(availableDecks.find((d) => d.name === e.target.value) ?? DEFAULT_DECK)
                        }
                      >
                        {availableDecks.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name} ({d.cards.reduce((sum, c) => sum + c.amount, 0)} cartas)
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div className="create-seat-box ai-seat-box">
                  <div className="seat-box-header">
                    <span className="seat-title">🤖 Oponentes (IA / Sim)</span>
                  </div>
                  <div className="field">
                    <span>Selecciona tipos de oponentes simulados:</span>
                    <div className="chip-row">
                      <button
                        type="button"
                        className={playerTypesSel.includes('SIM') ? 'chip on' : 'chip'}
                        onClick={() => toggleAi('SIM')}
                      >
                        🤖 SIM (Bot Determinista)
                      </button>
                      {playerTypes.map((pt) => (
                        <button
                          key={pt}
                          type="button"
                          className={playerTypesSel.includes(pt) ? 'chip on' : 'chip'}
                          onClick={() => toggleAi(pt)}
                        >
                          {pt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {playerTypesSel.includes('SIM') && (
                    <label>
                      Mazo del Bot SIM
                      <select
                        value={simDeck.name}
                        onChange={(e) =>
                          setSimDeck(availableDecks.find((d) => d.name === e.target.value) ?? LANDS_DECK)
                        }
                      >
                        {availableDecks.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name} ({d.cards.reduce((sum, c) => sum + c.amount, 0)} cartas)
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'dev' && (
            <div className="create-tab-content">
              <div className="dev-options-notice">
                <span>⚠️ Las opciones de prueba alteran el comportamiento normal del servidor XMage para pruebas deterministas.</span>
              </div>
              <label className="toggle-label-row">
                <input
                  type="checkbox"
                  checked={skipInitShuffling}
                  onChange={(e) => setSkipInitShuffling(e.target.checked)}
                />
                <div className="toggle-text-block">
                  <span className="toggle-title">🃏 No barajar el mazo inicial</span>
                  <span className="toggle-desc">La biblioteca mantendrá el orden exacto de las cartas enviadas</span>
                </div>
              </label>

              <label className="toggle-label-row">
                <input
                  type="checkbox"
                  checked={skipStartingPlayerChoice}
                  onChange={(e) => setSkipStartingPlayerChoice(e.target.checked)}
                />
                <div className="toggle-text-block">
                  <span className="toggle-title">🎲 Sin sorteo de jugador inicial</span>
                  <span className="toggle-desc">El primer asiento de la mesa empezará siempre el turno 1</span>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Summary Strip */}
        <div className="create-table-summary-strip">
          <span className="summary-pill">{gameType}</span>
          <span className="summary-pill">{deckType}</span>
          <span className="summary-pill">Bo{wins === 1 ? '1' : wins === 2 ? '3' : '5'}</span>
          <span className="summary-pill">{timeLimit === 'NONE' ? 'Sin reloj' : timeLimit.replace('MIN__', '') + 'm'}</span>
          <span className="summary-pill">{SKILL_LEVEL_OPTIONS.find((s) => s.value === skillLevel)?.label}</span>
          {password.trim() && <span className="summary-pill security">🔒 Clave</span>}
          {rated && <span className="summary-pill rated">⭐ Ranked</span>}
        </div>

        {error && <div className="error-box">⚠️ {error}</div>}

        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="primary create-submit-btn" disabled={busy} onClick={create}>
            {busy ? 'Creando mesa…' : 'Crear Mesa 🚀'}
          </button>
        </div>
      </div>
    </div>
  )
}
