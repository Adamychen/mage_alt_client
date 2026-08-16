import { useEffect, useState } from 'react'
import { clearError, doConnect, useStore, loadConn } from '../state/store'
import './LoginScreen.css'

export default function LoginScreen() {
  const phase = useStore((s) => s.phase)
  const error = useStore((s) => s.error)
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('17171')
  const [username, setUsername] = useState('player1')
  const [password, setPassword] = useState('password')

  useEffect(() => {
    const saved = loadConn()
    if (saved) {
      setHost(saved.host)
      setPort(String(saved.port))
      setUsername(saved.username)
      setPassword(saved.password)
    }
  }, [])

  const busy = phase === 'connecting'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    void doConnect(host.trim(), parseInt(port, 10) || 17171, username.trim(), password)
  }

  return (
    <div className="login-wrap">
      <form className="login-card panel" onSubmit={submit}>
        <h1>Mage Web</h1>
        <p className="subtitle">Cliente moderno para XMage</p>
        <label>
          Servidor del proxy (host)
          <input value={host} onChange={(e) => setHost(e.target.value)} />
        </label>
        <label>
          Puerto del servidor XMage
          <input value={port} onChange={(e) => setPort(e.target.value)} type="number" />
        </label>
        <label>
          Usuario
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={14} />
        </label>
        <label>
          Contraseña
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
        </label>
        {error && (
          <div className="error-box">
            {error}
            <button type="button" onClick={clearError}>
              ✕
            </button>
          </div>
        )}
        <button className="primary" disabled={busy} type="submit">
          {busy ? 'Conectando…' : 'Conectar'}
        </button>
        <p className="hint">Requiere el proxy corriendo en ws://{host}:8787 y el servidor XMage en {host}:{port}</p>
      </form>
    </div>
  )
}
