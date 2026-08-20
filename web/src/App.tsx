import { useEffect } from 'react'
import { usePhase, useStore, loadConn, doConnect } from './state/store'
import LoginScreen from './lobby/LoginScreen'
import LobbyScreen from './lobby/LobbyScreen'
import GameScreen from './game/GameScreen'
import GameEndDialog from './game/GameEndDialog'

export default function App() {
  const phase = usePhase()
  const connecting = useStore((s) => s.connecting)
  const wsAlive = useStore((s) => s.wsAlive)

  useEffect(() => {
    const saved = loadConn()
    if (saved && saved.username && phase === 'idle') {
      void doConnect(
        saved.wsHost,
        saved.proxyPort,
        saved.serverHost,
        saved.port,
        saved.username,
        saved.password,
      )
    }
  }, [])

  useEffect(() => {
    const onBeforeUnload = () => undefined
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const reconnecting = connecting && !wsAlive

  return (
    <>
      {reconnecting && <div className="reconnect-banner">Conexión con el proxy perdida — reconectando…</div>}
      {phase === 'lobby' ? <LobbyScreen /> : phase === 'game' ? <GameScreen /> : <LoginScreen />}
      <GameEndDialog />
    </>
  )
}
