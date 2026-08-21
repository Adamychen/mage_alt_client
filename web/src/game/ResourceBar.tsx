import { useState, useMemo } from 'react'
import type { PlayerView } from '../net/types'
import PileOverlay from '../board/PileOverlay'
import CrossZoneOverlay from '../board/CrossZoneOverlay'
import { crossZoneCounts } from '../board/crossZone'
import type { CrossZonePlayable } from '../board/crossZone'
import CardSlot from '../board/CardSlot'
import './ResourceBar.css'

const MANA_COLORS: Array<{ key: keyof PlayerView['manaPool']; symbol: string; className: string }> = [
    { key: 'white', symbol: 'W', className: 'mana-w' },
    { key: 'blue', symbol: 'U', className: 'mana-u' },
    { key: 'black', symbol: 'B', className: 'mana-b' },
    { key: 'red', symbol: 'R', className: 'mana-r' },
    { key: 'green', symbol: 'G', className: 'mana-g' },
    { key: 'colorless', symbol: 'C', className: 'mana-c' },
]

const CARD_BACK_URL = 'https://cards.scryfall.io/back.png'

interface ResourceBarProps {
  player: PlayerView
  side: 'opp' | 'my'
  compact?: boolean
  crossZonePlayables?: CrossZonePlayable[]
  onPlayCrossZone?: (id: string) => void
}

export default function ResourceBar({ player, side, compact = false, crossZonePlayables, onPlayCrossZone }: ResourceBarProps) {
  const [manaOpen, setManaOpen] = useState(false)
  const [openPile, setOpenPile] = useState<'graveyard' | 'exile' | 'crosszone' | 'library' | null>(null)
  const pool = player.manaPool ?? {}
  const manaTotal = MANA_COLORS.reduce((sum, c) => sum + (pool[c.key] ?? 0), 0)
  const graveyardCount = Object.keys(player.graveyard ?? {}).length
  const exileCount = Object.keys(player.exile ?? {}).length
  const crossZone = crossZonePlayables ?? []
  const counts = useMemo(() => crossZoneCounts(crossZone), [crossZone])
  const playableByZone = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const p of crossZone) {
      const key = p.zone === 'graveyard' ? 'graveyard' : p.zone === 'library' ? 'library' : 'exile'
      if (!map[key]) map[key] = new Set()
      map[key].add(p.id)
    }
    return map
  }, [crossZone])

  const libraryCards = useMemo(() => {
    const res: Record<string, any> = {}
    const count = player.libraryCount ?? 0
    if (count <= 0) return res

    // 1. If player has topCard revealed, position #1 is visible with full art
    if (player.topCard) {
      const topId = player.topCard.id || `lib-top-${player.playerId}`
      res[topId] = {
        ...player.topCard,
        id: topId,
        faceDown: false,
      }
    }

    // 2. Generate remaining cards as face-down cards with official Magic card back
    const startIndex = player.topCard ? 2 : 1
    for (let i = startIndex; i <= count; i++) {
      const id = `lib-${player.playerId}-${i}`
      res[id] = {
        id,
        name: `Carta #${i}`,
        manaValue: 0,
        expansionSetCode: '',
        cardNumber: '0',
        faceDown: true,
      }
    }
    return res
  }, [player.libraryCount, player.topCard, player.playerId])

  return (
     <div className={`resource-bar ${side} ${compact ? 'compact' : ''}`}>
      <div className="resource-mana-wrap">
        <button
          type="button"
          className="resource-mana"
          onClick={() => setManaOpen((v) => !v)}
          title="Pool de maná"
        >
          <span className="mana-total">{manaTotal}</span>
          <svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor"><path d="M7 10l5 5 5-5z" /></svg>
        </button>
        {manaOpen && (
          <div className="mana-breakdown">
            {MANA_COLORS.map((c) => (
              <div key={c.key} className={`mana-pip ${c.className}`}>
                <span className="mana-symbol">{c.symbol}</span>
                <span className="mana-count">{pool[c.key] ?? 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="resource-piles">
        <button
          type="button"
          className={`resource-stack library-stack clickable-pile ${player.topCard ? 'has-top-revealed' : ''}`}
          title={player.topCard ? `Biblioteca: ${player.libraryCount} cartas (Superior: ${player.topCard.name}) · Clic para ver` : `Biblioteca: ${player.libraryCount} cartas · Clic para ver`}
          onClick={() => setOpenPile('library')}
        >
          {player.topCard ? (
            <CardSlot card={player.topCard} className="library-top-card" />
          ) : (
            <img className="stack-back-img" src={CARD_BACK_URL} alt="" draggable={false} />
          )}
          <span className="stack-count">{player.libraryCount}</span>
          {player.topCard && <span className="top-card-badge" title="Carta superior revelada">👁️</span>}
        </button>
        <button
          type="button"
          className={`resource-stack graveyard-stack clickable-pile ${counts.graveyard > 0 ? 'has-playable' : ''}`}
          title={`Cementerio: ${graveyardCount}${counts.graveyard > 0 ? ` (${counts.graveyard} jugable${counts.graveyard > 1 ? 's' : ''})` : ''}`}
          onClick={() => setOpenPile('graveyard')}
        >
          <div className="stack-card-back graveyard-back">
            <span className="stack-mark">&#9760;</span>
          </div>
          <span className="stack-count">{graveyardCount}</span>
          {counts.graveyard > 0 && <span className="playable-badge">{counts.graveyard}</span>}
        </button>
          <button
           type="button"
           className={`resource-stack exile-stack clickable-pile ${counts.exile > 0 ? 'has-playable' : ''}`}
           title={`Exilio: ${exileCount}${counts.exile > 0 ? ` (${counts.exile} jugable${counts.exile > 1 ? 's' : ''})` : ''}`}
           onClick={() => setOpenPile('exile')}
          >
            <div className="stack-card-back exile-back">
              <span className="stack-mark">&#9784;</span>
            </div>
            <span className="stack-count">{exileCount}</span>
            {counts.exile > 0 && <span className="playable-badge">{counts.exile}</span>}
          </button>
          {side === 'my' && (
            <button
              type="button"
              className={`resource-stack ray-stack clickable-pile ${crossZone.length > 0 ? 'has-playable' : ''}`}
              title={`Lanzar desde otra zona: ${crossZone.length}`}
              onClick={() => setOpenPile('crosszone')}
            >
              <div className="stack-card-back ray-back">
                <svg className="ray-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
                </svg>
              </div>
              <span className="stack-count">{crossZone.length}</span>
              {crossZone.length > 0 && <span className="playable-badge">{crossZone.length}</span>}
            </button>
          )}
      </div>

        {openPile === 'library' && (
          <PileOverlay
           title={`Biblioteca de ${player.name || 'Jugador'}`}
           cards={libraryCards}
           onClose={() => setOpenPile(null)}
           playableIds={playableByZone.library}
           onPlayCard={onPlayCrossZone}
           isLibrary={true}
          />
        )}
        {openPile === 'graveyard' && (
          <PileOverlay
           title="Cementerio"
           cards={player.graveyard ?? {}}
           onClose={() => setOpenPile(null)}
           playableIds={playableByZone.graveyard}
           onPlayCard={onPlayCrossZone}
          />
        )}
        {openPile === 'exile' && (
          <PileOverlay
           title="Exilio"
           cards={player.exile ?? {}}
           onClose={() => setOpenPile(null)}
           playableIds={playableByZone.exile}
           onPlayCard={onPlayCrossZone}
          />
        )}
        {openPile === 'crosszone' && (
          <CrossZoneOverlay
           playables={crossZone}
           onClose={() => setOpenPile(null)}
           onPlay={(id) => {
            setOpenPile(null)
            onPlayCrossZone?.(id)
           }}
          />
        )}
      </div>
     )
}
