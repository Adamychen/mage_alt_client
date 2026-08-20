import { useEffect, useState } from 'react'
import { clearError, doConnect, useStore, loadConn } from '../state/store'
import './LoginScreen.css'

function urlProxyPort(): number | null {
  const n = Number(new URLSearchParams(window.location.search).get('proxyPort'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function LoginScreen() {
  const phase = useStore((s) => s.phase)
  const error = useStore((s) => s.error)
  const [proxyHost, setProxyHost] = useState('localhost')
  const [proxyPort, setProxyPort] = useState(8787)
  const [serverHost, setServerHost] = useState('localhost')
  const [port, setPort] = useState('17171')
  const [username, setUsername] = useState('player1')
  const [password, setPassword] = useState('password')

  useEffect(() => {
    const urlPort = urlProxyPort()
    const saved = loadConn()
    if (saved) {
      setProxyHost(saved.wsHost)
      setProxyPort(urlPort ?? saved.proxyPort)
      setServerHost(saved.serverHost)
      setPort(String(saved.port))
      setUsername(saved.username)
      setPassword(saved.password)
    } else if (urlPort !== null) {
      setProxyPort(urlPort)
    }
  }, [])

  const busy = phase === 'connecting'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    void doConnect(proxyHost.trim(), proxyPort, serverHost.trim() || proxyHost.trim(), parseInt(port, 10) || 17171, username.trim(), password)
  }

  return (
    <div className="login-wrap">
      <form className="login-card panel" onSubmit={submit}>
        <h1>Mage Web</h1>
        <p className="subtitle">Cliente moderno para XMage</p>
        <label>
          Servidor del proxy (host)
          <input value={proxyHost} onChange={(e) => setProxyHost(e.target.value)} />
        </label>
        <label>
          Host del servidor XMage
          <input value={serverHost} onChange={(e) => setServerHost(e.target.value)} />
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
        <p className="hint">Requiere el proxy corriendo en ws://{proxyHost}:{proxyPort} y el servidor XMage en {serverHost}:{port}</p>
      </form>
    </div>
  )
}
