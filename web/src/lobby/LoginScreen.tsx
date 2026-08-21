import { useEffect, useState } from 'react'
import { clearError, doConnect, useStore, loadConn, clearActiveGame } from '../state/store'
import './LoginScreen.css'

function urlProxyPort(): number | null {
  const n = Number(new URLSearchParams(window.location.search).get('proxyPort'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export type ServerPreset = 'local' | 'official' | 'custom'

export default function LoginScreen() {
  const phase = useStore((s) => s.phase)
  const error = useStore((s) => s.error)
  const [proxyHost, setProxyHost] = useState('localhost')
  const [proxyPort, setProxyPort] = useState(8787)
  const [serverHost, setServerHost] = useState('localhost')
  const [port, setPort] = useState('17171')
  const [username, setUsername] = useState('player1')
  const [password, setPassword] = useState('password')
  const [preset, setPreset] = useState<ServerPreset>('local')

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

      if (saved.serverHost === 'beta.xmage.today') {
        setPreset('official')
      } else if (saved.serverHost === 'localhost' || saved.serverHost === '127.0.0.1') {
        setPreset('local')
      } else {
        setPreset('custom')
      }
    } else if (urlPort !== null) {
      setProxyPort(urlPort)
    }
  }, [])

  const handleSelectPreset = (p: ServerPreset) => {
    setPreset(p)
    if (p === 'local') {
      setProxyHost('localhost')
      setServerHost('localhost')
      setPort('17171')
    } else if (p === 'official') {
      setProxyHost('localhost')
      setServerHost('beta.xmage.today')
      setPort('17171')
    }
  }

  const busy = phase === 'connecting'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    clearActiveGame()
    void doConnect(
      proxyHost.trim(),
      proxyPort,
      serverHost.trim() || proxyHost.trim(),
      parseInt(port, 10) || 17171,
      username.trim(),
      password
    )
  }

  const userInitial = username.trim().charAt(0).toUpperCase() || 'M'

  return (
    <div className="login-wrap">
      <div className="login-bg-glow login-bg-glow-1" />
      <div className="login-bg-glow login-bg-glow-2" />

      <form className="login-card panel" onSubmit={submit}>
        <div className="login-header">
          <img src="/logo.jpeg" alt="XMage Nexus" className="login-logo-img" />
          <p className="subtitle">Cliente Web Moderno para XMage</p>
        </div>

        {/* Server Preset Selector */}
        <div className="login-presets-container">
          <span className="login-presets-title">Servidor de Destino:</span>
          <div className="login-presets-row">
            <button
              type="button"
              className={`preset-btn ${preset === 'local' ? 'active' : ''}`}
              onClick={() => handleSelectPreset('local')}
            >
              <span className="preset-icon">🏠</span>
              <span>Localhost</span>
            </button>
            <button
              type="button"
              className={`preset-btn ${preset === 'official' ? 'active' : ''}`}
              onClick={() => handleSelectPreset('official')}
            >
              <span className="preset-icon">🌐</span>
              <span>Oficial (Beta)</span>
            </button>
            <button
              type="button"
              className={`preset-btn ${preset === 'custom' ? 'active' : ''}`}
              onClick={() => handleSelectPreset('custom')}
            >
              <span className="preset-icon">⚙️</span>
              <span>Personalizado</span>
            </button>
          </div>
        </div>

        {/* User Identity Section */}
        <div className="login-user-section">
          <div className="user-avatar-preview">
            <span>{userInitial}</span>
          </div>
          <div className="user-inputs-col">
            <label>
              Usuario
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={14}
                placeholder="Nombre de usuario"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Contraseña
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Contraseña (opcional)"
                autoComplete="current-password"
              />
            </label>
          </div>
        </div>

        {/* Network Connection Configuration Box */}
        <div className="login-network-box">
          <div className="login-network-header">
            <span className="network-box-title">Configuración de Red</span>
            <span className="network-box-hint">{serverHost}:{port}</span>
          </div>
          <div className="login-network-fields">
            <label className="network-field-proxy">
              Proxy
              <input
                value={proxyHost}
                onChange={(e) => {
                  setProxyHost(e.target.value)
                  setPreset('custom')
                }}
              />
            </label>
            <div className="network-field-row">
              <label className="network-field-host">
                XMage Server
                <input
                  value={serverHost}
                  onChange={(e) => {
                    setServerHost(e.target.value)
                    setPreset('custom')
                  }}
                />
              </label>
              <label className="network-field-port">
                Port
                <input
                  value={port}
                  onChange={(e) => {
                    setPort(e.target.value)
                    setPreset('custom')
                  }}
                  type="number"
                />
              </label>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-box">
            <span className="error-icon">⚠️</span>
            <span className="error-msg">{error}</span>
            <button type="button" onClick={clearError} title="Cerrar">
              ✕
            </button>
          </div>
        )}

        <button className="primary login-submit-btn" disabled={busy} type="submit">
          {busy ? (
            <span className="btn-connecting-wrap">
              <span className="btn-spinner" />
              <span>Conectando al servidor…</span>
            </span>
          ) : (
            <span>Conectar</span>
          )}
        </button>
      </form>
    </div>
  )
}
