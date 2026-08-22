import { useEffect, useMemo, useState } from 'react'
import type { CardView, PermanentView, PlayerView } from '../net/types'
import { useStore } from '../state/store'
import { awaitImageUrl } from '../cards/cardImages'
import './MechanicsTray.css'

interface MechanicsTrayProps {
  onHoverCard?: (card: CardView | null, rect?: DOMRect) => void
}

interface RingState {
  level: number
  bearerName?: string
  player: PlayerView
}

interface DungeonState {
  name: string
  currentRoom?: string
  player: PlayerView
}

interface DayNightState {
  isNight: boolean
}

const RING_LEVELS = [
  {
    level: 1,
    title: 'Portador Legendario & Evasión',
    rule: 'Tu portador del Anillo es legendario y no puede ser bloqueado por criaturas con mayor fuerza.',
  },
  {
    level: 2,
    title: 'Saqueo al Atacar',
    rule: 'Siempre que tu portador del Anillo ataque, roba una carta, luego descarta una carta.',
  },
  {
    level: 3,
    title: 'Toque Mortal a Bloqueadores',
    rule: 'Siempre que tu portador del Anillo sea bloqueado por una criatura, el controlador de esa criatura la sacrifica al final del combate.',
  },
  {
    level: 4,
    title: 'Drenar 3 Vidas',
    rule: 'Siempre que tu portador del Anillo haga daño de combate a un jugador, cada oponente pierde 3 vidas.',
  },
]

const DUNGEON_ROOMS: Record<string, string[]> = {
  undercity: [
    'Secret Entrance (Busca tierra básica a la mano)',
    'Forge (+2 contadores +1/+1) / Lost Well (Scry 2)',
    'Trap! (Oponente pierde 5 vidas) / Arena (Goad criatura)',
    'Stash (Roba 1 carta) / Archives (Exilia 2 cartas jugables)',
    'Throne of the Dead Three (Criatura gratis + 3 contadores + hexproof)',
  ],
  'dungeon of the mad mage': [
    'Yawning Portal (Gana 1 vida)',
    'Dungeon Level (Scry 1)',
    'Goblin Bazaar (Crea ficha de Tesoro)',
    'Twisted Caverns (Criatura no puede atacar)',
    'Lost Level (Scry 2)',
    'Runestone Caverns (Exilia 2 cartas para jugarlas)',
    'Mad Wizard’s Lair (Roba 3 cartas y lanza 1 gratis)',
  ],
  'lost mine of phandelver': [
    'Cave Entrance (Scry 1)',
    'Goblin Lair (Ficha 1/1 Goblin) / Mine Tunnels (Tesoro)',
    'Storeroom (+1/+1) / Dark Pool (Drena 1 vida)',
    'Temple of Dumathoin (Roba 1 carta)',
  ],
  'tomb of annihilation': [
    'Trapped Entry (Cada jugador pierde 1 vida)',
    'Veils of Fear (Pierde 2 vidas o descarta)',
    'Sandfall Cell (Pierde 2 vidas o sacrifica permanente)',
    'Cradle of the Death God (Crea a The Atropal 4/4 toque mortal)',
  ],
}

function findRingBearer(player: PlayerView): string | undefined {
  const battlefield = player.battlefield ?? {}
  for (const perm of Object.values(battlefield)) {
    const p = perm as PermanentView & { isRingBearer?: boolean; ringBearer?: boolean }
    if (p.isRingBearer || p.ringBearer) {
      return p.displayName || p.name || 'Criatura'
    }
  }
  return undefined
}

export default function MechanicsTray({ onHoverCard }: MechanicsTrayProps) {
  const game = useStore((s) => s.game)
  const [activeTab, setActiveTab] = useState<string>('auto')
  const [tokenImages, setTokenImages] = useState<Record<string, string>>({})

  // 1. Detect Ring state
  const ringStates = useMemo((): RingState[] => {
    if (!game?.players) return []
    const list: RingState[] = []
    for (const p of game.players) {
      const items = Array.isArray(p.commandList)
        ? p.commandList
        : typeof p.commandList === 'object'
          ? Object.values(p.commandList ?? {})
          : []
      const ringItem = items.find((c: any) => {
        const n = String(c?.name ?? '').toLowerCase()
        return n === 'the ring' || n.startsWith('the ring')
      }) as { rules?: string[] } | undefined

      if (ringItem) {
        const rules = ringItem.rules ?? []
        const level = Math.min(4, Math.max(1, rules.length))
        list.push({
          level,
          bearerName: findRingBearer(p),
          player: p,
        })
      }
    }
    return list
  }, [game?.players])

  // 2. Detect Dungeon state
  const dungeonStates = useMemo((): DungeonState[] => {
    if (!game?.players) return []
    const list: DungeonState[] = []
    for (const p of game.players) {
      const items = Array.isArray(p.commandList)
        ? p.commandList
        : typeof p.commandList === 'object'
          ? Object.values(p.commandList ?? {})
          : []
      const dungeonItem = items.find((c: any) => {
        const n = String(c?.name ?? '').toLowerCase()
        const types = Array.isArray(c?.cardTypes) ? c.cardTypes.map((t: string) => String(t).toLowerCase()) : []
        return types.includes('dungeon') || Object.keys(DUNGEON_ROOMS).some((k) => n.includes(k))
      }) as { name?: string; currentRoom?: string } | undefined

      if (dungeonItem?.name) {
        list.push({
          name: dungeonItem.name,
          currentRoom: dungeonItem.currentRoom,
          player: p,
        })
      }
    }
    return list
  }, [game?.players])

  // 3. Detect Day/Night state
  const dayNightState = useMemo((): DayNightState | null => {
    if (!game?.players) return null
    for (const p of game.players) {
      for (const d of p.designationNames ?? []) {
        const dl = d.toLowerCase()
        if (dl.includes('day') || dl.includes('night')) {
          return { isNight: dl.includes('night') && !dl.includes('neither') }
        }
      }
    }
    return null
  }, [game?.players])

  // 4. Monarch & Initiative
  const monarchPlayer = game?.players?.find((p) => p.monarch)
  const initiativePlayer = game?.players?.find((p) => p.initiative)

  // 5. Specialized Designations (City's Blessing, Speed)
  const cityBlessingPlayers = game?.players?.filter((p) =>
    p.designationNames?.some((d) => d.toLowerCase().includes('blessing'))
  ) ?? []

  const speedPlayers = game?.players?.filter((p) =>
    p.designationNames?.some((d) => d.toLowerCase().includes('speed'))
  ) ?? []

  // Pre-load Scryfall token images
  useEffect(() => {
    const tokens = [
      { key: 'ring', name: 'The Ring' },
      { key: 'monarch', name: 'The Monarch' },
      { key: 'initiative', name: 'The Initiative' },
      { key: 'daynight', name: 'Day // Night' },
      { key: 'blessing', name: "City's Blessing" },
      { key: 'speed', name: 'Speed' },
    ]
    tokens.forEach((t) => {
      awaitImageUrl({ name: t.name, displayName: t.name, manaValue: 0 } as CardView).then((url) => {
        if (url) {
          setTokenImages((prev) => ({ ...prev, [t.key]: url }))
        }
      })
    })
  }, [])

  // Available tabs
  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: string; label: string; icon: string }> = []
    if (ringStates.length > 0) tabs.push({ id: 'ring', label: 'El Anillo', icon: '💍' })
    if (dungeonStates.length > 0) tabs.push({ id: 'dungeon', label: 'Mazmorra', icon: '🗺️' })
    if (dayNightState) tabs.push({ id: 'daynight', label: dayNightState.isNight ? 'Noche' : 'Día', icon: dayNightState.isNight ? '🌙' : '☀️' })
    if (monarchPlayer) tabs.push({ id: 'monarch', label: 'Monarca', icon: '👑' })
    if (initiativePlayer) tabs.push({ id: 'initiative', label: 'Iniciativa', icon: '⚔️' })
    if (cityBlessingPlayers.length > 0) tabs.push({ id: 'blessing', label: 'Bendición', icon: '🏛️' })
    if (speedPlayers.length > 0) tabs.push({ id: 'speed', label: 'Velocidad', icon: '🏎️' })
    return tabs
  }, [ringStates, dungeonStates, dayNightState, monarchPlayer, initiativePlayer, cityBlessingPlayers, speedPlayers])

  const effectiveTab =
    activeTab === 'auto' || !availableTabs.some((t) => t.id === activeTab)
      ? availableTabs[0]?.id ?? 'none'
      : activeTab

  const myRing = ringStates.find((r) => r.player.controlled) || ringStates[0]
  const myDungeon = dungeonStates.find((d) => d.player.controlled) || dungeonStates[0]

  if (availableTabs.length === 0) {
    return (
      <div className="mechanics-tray empty">
        <div className="mechanics-empty-box">
          <span className="empty-icon">📜</span>
          <h4>Estados y Mecánicas</h4>
          <p>No hay mecánicas globales activas en esta partida.</p>
          <div className="mechanics-glossary-hint">
            <span>Mecánicas que aparecerán aquí:</span>
            <ul>
              <li>💍 <strong>El Anillo:</strong> Niveles y habilidades de tentación</li>
              <li>🗺️ <strong>Mazmorras:</strong> Salas de Undercity y Mad Mage</li>
              <li>☀️/🌙 <strong>Día y Noche:</strong> Triggers de cambio de ciclo</li>
              <li>👑 <strong>Monarca e Iniciativa:</strong> Títulos y transferencias</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mechanics-tray">
      {/* Category Pills Header */}
      <div className="mechanics-nav-bar">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`mechanic-tab-btn ${effectiveTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="mechanics-content-scroll">
        {/* TAB 1: THE RING */}
        {effectiveTab === 'ring' && myRing && (
          <div className="mechanic-panel panel-ring">
            <div className="mechanic-header-card">
              <div className="mechanic-title-row">
                <h3>💍 El Anillo te tienta</h3>
                <span className="ring-level-badge">Nivel {myRing.level} / 4</span>
              </div>
              <div className="ring-bearer-row">
                <span className="bearer-label">Portador:</span>
                <span className="bearer-value">
                  {myRing.bearerName ? `⚔️ ${myRing.bearerName}` : 'Ninguna criatura'}
                </span>
                <span className="player-tag">({myRing.player.name})</span>
              </div>
            </div>

            <div className="ring-levels-list">
              {RING_LEVELS.map((item) => {
                const isActive = item.level <= myRing.level
                const isCurrent = item.level === myRing.level
                return (
                  <div
                    key={item.level}
                    className={`ring-level-card ${isActive ? 'unlocked' : 'locked'} ${isCurrent ? 'current' : ''}`}
                  >
                    <div className="level-header-row">
                      <div className="level-num-title">
                        <span className="level-num">{item.level}.</span>
                        <h4 className="level-title">{item.title}</h4>
                      </div>
                      <span className="level-status">{isActive ? '✓ ACTIVO' : '🔒 BLOQUEADO'}</span>
                    </div>
                    <p className="level-rule">{item.rule}</p>
                  </div>
                )
              })}
            </div>

            {tokenImages.ring && (
              <div className="mechanic-token-preview">
                <img
                  src={tokenImages.ring}
                  alt="The Ring"
                  className="token-art-img"
                  onMouseEnter={(e) =>
                    onHoverCard?.(
                      { name: 'The Ring', displayName: 'The Ring // The Ring Tempts You', manaValue: 0 } as CardView,
                      e.currentTarget.getBoundingClientRect()
                    )
                  }
                  onMouseLeave={() => onHoverCard?.(null)}
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ACTIVE DUNGEONS */}
        {effectiveTab === 'dungeon' && myDungeon && (
          <div className="mechanic-panel panel-dungeon">
            <div className="mechanic-header-card">
              <div className="mechanic-title-row">
                <h3>🗺️ {myDungeon.name}</h3>
                <span className="player-tag">({myDungeon.player.name})</span>
              </div>
              <p className="dungeon-sub">Adéntrate en la mazmorra para avanzar de sala en sala.</p>
            </div>

            <div className="dungeon-rooms-flow">
              {(DUNGEON_ROOMS[myDungeon.name.toLowerCase()] ?? [
                'Sala de entrada',
                'Galería intermedia',
                'Cámara final del tesoro',
              ]).map((room, idx) => {
                const isCurrentRoom = myDungeon.currentRoom
                  ? room.toLowerCase().includes(myDungeon.currentRoom.toLowerCase())
                  : idx === 0
                return (
                  <div
                    key={idx}
                    className={`dungeon-room-node ${isCurrentRoom ? 'active-room' : ''}`}
                  >
                    <span className="room-step">#{idx + 1}</span>
                    <span className="room-name">{room}</span>
                    {isCurrentRoom && <span className="current-marker">📍 Posición actual</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TAB 3: DAY / NIGHT */}
        {effectiveTab === 'daynight' && dayNightState && (
          <div className="mechanic-panel panel-daynight">
            <div className={`daynight-banner ${dayNightState.isNight ? 'night-active' : 'day-active'}`}>
              <span className="daynight-giant-icon">{dayNightState.isNight ? '🌙' : '☀️'}</span>
              <div className="daynight-giant-text">
                <h3>Es de {dayNightState.isNight ? 'NOCHE' : 'DÍA'}</h3>
                <span className="daynight-hint">
                  {dayNightState.isNight
                    ? 'Las criaturas diurnas se transforman en sus caras nocturnas.'
                    : 'Las criaturas nocturnas regresan a su forma diurna.'}
                </span>
              </div>
            </div>

            <div className="daynight-rules-box">
              <h4>🔄 Transición de Ciclo:</h4>
              <div className="rule-card">
                <span className="rule-badge">☀️ → 🌙 Noche</span>
                <p>Si el jugador activo <strong>no lanza hechizos</strong> en su turno.</p>
              </div>
              <div className="rule-card">
                <span className="rule-badge">🌙 → ☀️ Día</span>
                <p>Si el jugador activo <strong>lanza 2 o más hechizos</strong> en su turno.</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: THE MONARCH */}
        {effectiveTab === 'monarch' && monarchPlayer && (
          <div className="mechanic-panel panel-monarch">
            <div className="mechanic-header-card monarch-header">
              <span className="crown-large">👑</span>
              <h3>El Monarca</h3>
              <p className="holder-row">
                Poseedor: <strong>{monarchPlayer.name}</strong> {monarchPlayer.controlled ? '(Tú)' : ''}
              </p>
            </div>

            <div className="mechanic-rules-box">
              <div className="rule-item">
                <span className="rule-icon">🃏</span>
                <div>
                  <strong>Robo al final del turno:</strong>
                  <p>Al comienzo de tu paso final, roba una carta.</p>
                </div>
              </div>
              <div className="rule-item">
                <span className="rule-icon">⚔️</span>
                <div>
                  <strong>Transferencia por combate:</strong>
                  <p>Si una criatura te hace daño de combate, su controlador toma el Monarca.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: THE INITIATIVE */}
        {effectiveTab === 'initiative' && initiativePlayer && (
          <div className="mechanic-panel panel-initiative">
            <div className="mechanic-header-card initiative-header">
              <span className="crown-large">⚔️</span>
              <h3>La Iniciativa</h3>
              <p className="holder-row">
                Poseedor: <strong>{initiativePlayer.name}</strong> {initiativePlayer.controlled ? '(Tú)' : ''}
              </p>
            </div>

            <div className="mechanic-rules-box">
              <div className="rule-item">
                <span className="rule-icon">🏰</span>
                <div>
                  <strong>Adentrarse en Undercity:</strong>
                  <p>En tu mantenimiento y al tomar la iniciativa, avanzas en la Mazmorra.</p>
                </div>
              </div>
              <div className="rule-item">
                <span className="rule-icon">⚔️</span>
                <div>
                  <strong>Transferencia por combate:</strong>
                  <p>Daño de combate a quien tiene la iniciativa transfiere el título.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: CITY'S BLESSING & SPEED */}
        {effectiveTab === 'blessing' && (
          <div className="mechanic-panel panel-blessing">
            <div className="mechanic-header-card">
              <h3>🏛️ Bendición de la Ciudad</h3>
              <p>Otorgada permanentemente al alcanzar 10 o más permanentes (*Ascend*).</p>
            </div>
            <div className="blessing-players-list">
              {cityBlessingPlayers.map((p) => (
                <div key={p.playerId} className="blessing-player-row">
                  <span>★ {p.name} {p.controlled ? '(Tú)' : ''}</span>
                  <span className="badge-ascended">Ascend OK</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {effectiveTab === 'speed' && (
          <div className="mechanic-panel panel-speed">
            <div className="mechanic-header-card">
              <h3>🏎️ Velocidad (*Aetherdrift*)</h3>
              <p>Mecánica de carrera con efectos aumentados según la velocidad.</p>
            </div>
            <div className="speed-players-list">
              {speedPlayers.map((p) => (
                <div key={p.playerId} className="speed-player-row">
                  <span>🏎️ {p.name} {p.controlled ? '(Tú)' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
