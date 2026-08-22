import { useState, useEffect } from 'react'
import { useGame, returnToLobby } from '../state/store'
import HelpWikiModal from './HelpWikiModal'
import './Sidebar.css'

const ICON_PATHS = {
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  help: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
  exit: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
}

type IconId = keyof typeof ICON_PATHS

interface SidebarIcon {
  id: IconId
  label: string
  path: string
  danger?: boolean
}

const NAV_ITEMS: SidebarIcon[] = [
  { id: 'settings', label: 'Ajustes', path: ICON_PATHS.settings },
  { id: 'help', label: 'Wiki, Glosario y Ayuda', path: ICON_PATHS.help },
  { id: 'exit', label: 'Conceder / Volver al Lobby', path: ICON_PATHS.exit, danger: true },
]

function TurnTimer({ secs }: { secs: number }) {
  const m = Math.floor(Math.max(0, secs) / 60).toString().padStart(2, '0')
  const s = (Math.max(0, secs) % 60).toString().padStart(2, '0')
  return <span className="sidebar-timer-value">{m}:{s}</span>
}

export default function Sidebar() {
  const game = useGame()
  const [showHelp, setShowHelp] = useState(false)

  const me = game?.players?.find((p) => p.controlled)

  // Keyboard shortcut F1 or K for Wiki
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault()
        setShowHelp((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handle = (id: string) => {
    switch (id) {
      case 'exit': {
        const msg = me
          ? '¿Seguro que quieres conceder la partida y volver al lobby?'
          : '¿Dejar de espectar y volver al lobby?'
        if (confirm(msg)) {
          returnToLobby()
        }
        break
      }
      case 'help':
        setShowHelp(!showHelp)
        break
    }
  }

  const timerSecs = game?.players?.find((p) => p.isActive)?.priorityTimeLeftSecs ?? 0
  const bufferSecs = game?.bufferTime ?? 0

  return (
    <>
      <nav className="sidebar">
        <div className="sidebar-turn-info">
          <span className="sidebar-turn-label">Turn</span>
          <span className="sidebar-turn-value">{game?.turn ?? '—'}</span>
          <TurnTimer secs={timerSecs} />
          <TurnTimer secs={bufferSecs} />
        </div>

        <div className="sidebar-icons-col">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar-icon-btn ${item.danger ? 'danger' : ''} ${item.id === 'help' && showHelp ? 'active' : ''}`}
              title={item.label}
              onClick={() => handle(item.id)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.path} />
              </svg>
            </button>
          ))}
        </div>
      </nav>

      {showHelp && <HelpWikiModal onClose={() => setShowHelp(false)} />}
    </>
  )
}