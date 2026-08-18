import { useState } from 'react'
import type { PlayerView } from '../net/types'
import './PlayerResourcePanel.css'

const MANA_COLORS: Array<{ key: keyof PlayerView['manaPool']; symbol: string; className: string }> = [
  { key: 'white', symbol: 'W', className: 'mana-w' },
  { key: 'blue', symbol: 'U', className: 'mana-u' },
  { key: 'black', symbol: 'B', className: 'mana-b' },
  { key: 'red', symbol: 'R', className: 'mana-r' },
  { key: 'green', symbol: 'G', className: 'mana-g' },
  { key: 'colorless', symbol: 'C', className: 'mana-c' },
]

export default function PlayerResourcePanel({ player, side }: { player: PlayerView; side: 'opp' | 'my' }) {
  const [manaOpen, setManaOpen] = useState(false)
  const pool = player.manaPool
  const manaTotal = MANA_COLORS.reduce((sum, c) => sum + (pool[c.key] ?? 0), 0)
  const graveyardCount = Object.keys(player.graveyard ?? {}).length
  const exileCount = Object.keys(player.exile ?? {}).length

  return (
    <div className={`player-resource-panel ${side}-resources`}>
      <div className="resource-mana-wrap">
        <button
          type="button"
          className="resource-mana"
          onClick={() => setManaOpen((v) => !v)}
          title="Pool de maná"
        >
          <span>{manaTotal}</span>
          <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M7 10l5 5 5-5z" /></svg>
        </button>
        {manaOpen && (
          <div className="resource-mana-breakdown">
            {MANA_COLORS.map((c) => (
              <div key={c.key} className={`mana-pip ${c.className}`}>
                <span>{c.symbol}</span>
                <b>{pool[c.key] ?? 0}</b>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="resource-library" title="Biblioteca">
        <div className="resource-card-back">
          <span className="resource-card-back-mark">✦</span>
        </div>
        <span className="resource-library-count">{player.libraryCount}</span>
      </div>

      <div className="resource-side-piles">
        <div className="resource-pip" title={`Cementerio: ${graveyardCount}`}>{graveyardCount}</div>
        <div className="resource-pip" title={`Exilio: ${exileCount}`}>{exileCount}</div>
      </div>
    </div>
  )
}
