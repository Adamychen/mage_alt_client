import { useEffect } from 'react'
import { usePhase, useStore } from './state/store'
import LoginScreen from './lobby/LoginScreen'
import LobbyScreen from './lobby/LobbyScreen'
import GameScreen from './game/GameScreen'

export default function App() {
  const phase = usePhase()
  const conn = useStore((s) => s.conn)
  const wsAlive = useStore((s) => s.wsAlive)

  useEffect(() => {
    const onBeforeUnload = () => undefined
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const reconnecting = !!conn && !wsAlive

  return (
    <>
      {reconnecting && <div className="reconnect-banner">Conexión con el proxy perdida — reconectando…</div>}
      {phase === 'lobby' ? <LobbyScreen /> : phase === 'game' ? <GameScreen /> : <LoginScreen />}
    </>
  )
}
