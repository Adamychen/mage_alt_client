import { useState } from 'react'
import { reset, useLobby, useStore } from '../state/store'
import * as cmds from '../net/commands'
import type { TableView } from '../net/types'
import CreateTableDialog from './CreateTableDialog'
import ChatBox from './ChatBox'
import { DEFAULT_DECK, STABLE_DECK } from './decks'
import './LobbyScreen.css'

const AI_PLAYER = 'COMPUTER_MAD'

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

export default function LobbyScreen() {
  const lobby = useLobby()
  const conn = useStore((s) => s.conn)
  const error = useStore((s) => s.error)
  const events = useStore((s) => s.events)
  const [showCreate, setShowCreate] = useState(false)
  const [busyTable, setBusyTable] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const tables = lobby?.tables ?? []
  const users = lobby?.users.usersView ?? []

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
          playerTypes: [AI_PLAYER, AI_PLAYER],
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
      // unir a cada IA (igual que el cliente oficial: la mesa se crea vacía)
      for (let i = 0; i < 2; i++) {
        const join = await withTimeout(
          cmds.joinTable({
            tableId,
            playerName: i === 0 ? 'Computer' : `Computer ${i + 1}`,
            playerType: AI_PLAYER,
            skill: 1,
            deck: STABLE_DECK,
          }),
          15000,
          `joinTable #${i + 1}`,
        )
        if (!join.ok) {
          setNotice(`la IA ${i + 1} no se unió: ${join.error}`)
          return
        }
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
          deck: DEFAULT_DECK,
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
          deck: DEFAULT_DECK,
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

  return (
    <div className="lobby">
      <header className="lobby-top">
        <div>
          <h1>Lobby</h1>
          <span className="conn-info">
            {conn?.username} @ {conn?.host}:{conn?.port} — {users.length} usuarios
          </span>
        </div>
        <div className="lobby-actions">
          <button onClick={() => setShowCreate(true)}>Nueva mesa</button>
          <button className="primary" disabled={busyTable === 'demo'} onClick={runDemo}>
            {busyTable === 'demo' ? '…' : '▶ Demo IA vs IA (espectador)'}
          </button>
          <button onClick={reset}>Desconectar</button>
        </div>
      </header>

      {error && <div className="error-box panel">{error}</div>}
      {notice && <div className="notice panel">{notice}</div>}

      <div className="lobby-main">
        <section className="panel tables-panel">
          <h2>Mesas ({tables.length})</h2>
          <div className="tables-list">
            {tables.map((t) => (
              <div key={t.tableId} className="table-row">
                <div className="table-info">
                  <strong>{t.tableName}</strong>
                  <span>
                    {t.gameType} · {t.deckType}
                  </span>
                  <span className="table-seats">{t.seatsInfo}</span>
                </div>
                <div className="table-state">{t.tableStateText}</div>
                <div className="table-actions">
                  {t.tableState === 'READY_TO_START' && (
                    <button disabled={busyTable === t.tableId} onClick={() => startTable(t)}>
                      Empezar
                    </button>
                  )}
                  {(t.tableState === 'WAITING' || t.tableState === 'READY_TO_START') && t.seats.some((s) => !s.playerName && (!s.playerType || s.playerType === 'HUMAN')) && (
                    <button disabled={busyTable === t.tableId} onClick={() => joinHuman(t)}>
                      Unirse (humano)
                    </button>
                  )}
                  {(t.tableState === 'WAITING' || t.tableState === 'READY_TO_START') && t.seats.some((s) => !s.playerName && s.playerType && /COMPUTER|AI/i.test(s.playerType)) && (
                    <button disabled={busyTable === t.tableId} onClick={() => joinAi(t)}>
                      Unirse IA
                    </button>
                  )}
                  <button disabled={busyTable === t.tableId} onClick={() => watchTable(t)}>
                    Ver
                  </button>
                </div>
              </div>
            ))}
            {tables.length === 0 && <p className="empty">No hay mesas todavía</p>}
          </div>
        </section>

        <section className="panel users-panel">
          <h2>Usuarios ({users.length})</h2>
          <ul className="users-list">
            {users.map((u) => (
              <li key={u.userName}>
                <span className={`dot ${u.infoGames ? 'playing' : ''}`} />
                {u.userName}
                {u.infoGames ? <span className="game-info">{u.infoGames}</span> : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel chat-panel">
          <h2>Chat</h2>
          <ChatBox />
        </section>

        <section className="panel events-panel">
          <h2>Eventos (depuración)</h2>
          <ul className="events-list">
            {events.map((e, i) => (
              <li key={i}>
                {new Date(e.time).toLocaleTimeString()} — {e.method}
              </li>
            ))}
            {events.length === 0 && <p className="empty">Esperando eventos…</p>}
          </ul>
        </section>
      </div>

      {showCreate && <CreateTableDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}
