import { useEffect, useState } from 'react'
import * as cmds from '../net/commands'
import type { GameTypeInfo } from '../net/commands'
import { useStore } from '../state/store'
import './CreateTableDialog.css'

export default function CreateTableDialog({ onClose }: { onClose: () => void }) {
  const username = useStore((s) => s.conn?.username ?? 'player')
  const [gameTypes, setGameTypes] = useState<GameTypeInfo[]>([])
  const [deckTypes, setDeckTypes] = useState<string[]>([])
  const [playerTypes, setPlayerTypes] = useState<string[]>([])
  const [gameType, setGameType] = useState('Two Player Duel')
  const [deckType, setDeckType] = useState('Constructed - Modern')
  const [playerTypesSel, setPlayerTypesSel] = useState<string[]>([])
  const [name, setName] = useState(`${username}'s table`)
  const [wins, setWins] = useState(1)
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

  const toggleAi = (pt: string) => {
    setPlayerTypesSel((cur) => (cur.includes(pt) ? cur.filter((x) => x !== pt) : [...cur, pt]))
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    const playerTypesFinal = playerTypesSel.length ? playerTypesSel : ['COMPUTER_MAD', 'COMPUTER_MAD']
    const res = await cmds.createTable({
      name: name || `${username}'s table`,
      gameType,
      deckType,
      winsNeeded: wins,
      playerTypes: playerTypesFinal,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'no se pudo crear la mesa')
      return
    }
    onClose()
  }

  return (
    <div className="overlay">
      <div className="dialog panel">
        <h2>Nueva mesa</h2>
        <label>
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
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
          Formato (deck type)
          <select value={deckType} onChange={(e) => setDeckType(e.target.value)}>
            {deckTypes.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Victorias necesarias
          <select value={wins} onChange={(e) => setWins(parseInt(e.target.value, 10))}>
            {[1, 2, 3].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Jugadores IA</span>
          <div className="chip-row">
            {playerTypes.map((pt) => (
              <button
                key={pt}
                className={playerTypesSel.includes(pt) ? 'chip on' : 'chip'}
                onClick={() => toggleAi(pt)}
              >
                {pt}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="dialog-actions">
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" disabled={busy} onClick={create}>
            {busy ? 'Creando…' : 'Crear mesa'}
          </button>
        </div>
      </div>
    </div>
  )
}
