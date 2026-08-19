import { useState } from 'react'
import type { PlayerView } from '../net/types'
import PileOverlay from '../board/PileOverlay'
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
}

export default function ResourceBar({ player, side, compact = false }: ResourceBarProps) {
  const [manaOpen, setManaOpen] = useState(false)
  const [openPile, setOpenPile] = useState<'graveyard' | 'exile' | null>(null)
  const pool = player.manaPool
  const manaTotal = MANA_COLORS.reduce((sum, c) => sum + (pool[c.key] ?? 0), 0)
  const graveyardCount = Object.keys(player.graveyard ?? {}).length
  const exileCount = Object.keys(player.exile ?? {}).length

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
        <div className="resource-stack library-stack" title={`Biblioteca: ${player.libraryCount}`}>
          <img className="stack-back-img" src={CARD_BACK_URL} alt="" draggable={false} />
          <span className="stack-count">{player.libraryCount}</span>
        </div>
        <button
          type="button"
          className="resource-stack graveyard-stack clickable-pile"
          title={`Cementerio: ${graveyardCount}`}
          onClick={() => setOpenPile('graveyard')}
        >
          <div className="stack-card-back graveyard-back">
            <span className="stack-mark">&#9760;</span>
          </div>
          <span className="stack-count">{graveyardCount}</span>
        </button>
        <button
          type="button"
          className="resource-stack exile-stack clickable-pile"
          title={`Exilio: ${exileCount}`}
          onClick={() => setOpenPile('exile')}
        >
          <div className="stack-card-back exile-back">
            <span className="stack-mark">&#9784;</span>
          </div>
          <span className="stack-count">{exileCount}</span>
        </button>
      </div>

      {openPile === 'graveyard' && (
        <PileOverlay
          title="Cementerio"
          cards={player.graveyard ?? {}}
          onClose={() => setOpenPile(null)}
        />
      )}
      {openPile === 'exile' && (
        <PileOverlay
          title="Exilio"
          cards={player.exile ?? {}}
          onClose={() => setOpenPile(null)}
        />
      )}
    </div>
  )
}
