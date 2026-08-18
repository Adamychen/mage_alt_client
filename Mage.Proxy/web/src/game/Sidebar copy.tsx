import { useState } from 'react'
import * as cmds from '../net/commands'
import { useStore, reset, useGame } from '../state/store'
import './Sidebar.css'

const ICON_PATHS = {
  back: 'M19 12H5M12 19l-7-7 7-7',
  play: 'M5 3l14 9-14 9V3z',
  players: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  help: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
  undo: 'M3 10h10a5 5 0 0 1 5 5v2M3 10l5 5M3 10l5-5',
  pointer: 'M5 3l14 9-14 9V3z',
  concede: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM15 9l-6 6M9 9l6 6',
  dice: 'M3 3h18v18H3zM7 7l4 4M13 13l4 4M7 17l4-4M13 7l4 4',
  tools: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  collapse: 'M6 9l6 6 6-6',
  mulligan: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14l3-3-3-3M14 17l-3 3 3 3',
  cardZoom: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  exit: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
}

type IconId = keyof typeof ICON_PATHS

interface SidebarIcon {
  id: IconId
  label: string
  path: string
  /** true = pinta una línea separadora ANTES de este icono (agrupa por bloques) */
  separatorBefore?: boolean
  danger?: boolean
  badge?: boolean
}

// Orden y agrupación calcados de la captura de referencia (ver spec, sección 61.1):
// [turno] | back | ‾sep‾ play, players, settings, help | ‾sep‾ undo, pointer, concede
// | ‾sep‾ dice, tools, collapse, mulligan, cardZoom | ‾sep‾ exit
const ICONS: SidebarIcon[] = [
  { id: 'back', label: 'Volver', path: ICON_PATHS.back },
  { id: 'play', label: 'Iniciar', path: ICON_PATHS.play, separatorBefore: true },
  { id: 'players', label: 'Jugadores', path: ICON_PATHS.players },
  { id: 'settings', label: 'Ajustes', path: ICON_PATHS.settings },
  { id: 'help', label: 'Ayuda', path: ICON_PATHS.help },
  { id: 'undo', label: 'Deshacer', path: ICON_PATHS.undo, separatorBefore: true },
  { id: 'pointer', label: 'Puntero', path: ICON_PATHS.pointer },
  { id: 'concede', label: 'Conceder', path: ICON_PATHS.concede, danger: true },
  { id: 'dice', label: 'Dados', path: ICON_PATHS.dice, separatorBefore: true },
  { id: 'tools', label: 'Herramientas', path: ICON_PATHS.tools },
  { id: 'collapse', label: 'Colapsar', path: ICON_PATHS.collapse },
  { id: 'mulligan', label: 'Mulligan', path: ICON_PATHS.mulligan },
  { id: 'cardZoom', label: 'Zoom carta', path: ICON_PATHS.cardZoom },
  { id: 'exit', label: 'Salir', path: ICON_PATHS.exit, danger: true, separatorBefore: true },
]

function TurnTimer({ secs }: { secs: number }) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return <span className="sidebar-timer-value">{m}:{s}</span>
}

export default function Sidebar() {
  const gameId = useStore((s) => s.gameId)
  const game = useGame()
  const [expanded, setExpanded] = useState<string | null>(null)

  const handle = async (id: string) => {
    switch (id) {
      case 'back':
      case 'exit':
        if (gameId) await cmds.quitMatch(gameId)
        reset()
        break
      case 'settings':
        setExpanded(expanded === 'settings' ? null : 'settings')
        break
      case 'concede':
        if (gameId && confirm('¿Conceder la partida?')) {
          await cmds.quitMatch(gameId)
          reset()
        }
        break
    }
  }

  const me = game?.players?.find((p) => p.controlled)
  const timerSecs = me?.priorityTimeLeftSecs ?? 0

  return (
    <nav className="sidebar">
      <div className="sidebar-turn-info">
        <span className="sidebar-turn-label">Turn</span>
        <span className="sidebar-turn-value">{game?.turn ?? '—'}</span>
        <TurnTimer secs={timerSecs} />
        <TurnTimer secs={game?.bufferTime ?? 0} />
      </div>

      {ICONS.map((icon) => (
        <div key={icon.id} className="sidebar-icon-wrap">
          {icon.separatorBefore && <div className="sidebar-sep" />}
          <button
            className={`sidebar-icon-btn ${icon.danger ? 'danger' : ''} ${expanded === icon.id ? 'active' : ''}`}
            title={icon.label}
            onClick={() => handle(icon.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={icon.path} />
            </svg>
            {icon.badge && <span className="icon-badge" />}
          </button>
        </div>
      ))}
    </nav>
  )
}