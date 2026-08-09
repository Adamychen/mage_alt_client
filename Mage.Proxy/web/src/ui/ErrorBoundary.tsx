import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Pantalla de recuperación ante errores de render: si cualquier componente
 * revienta, el usuario ve un mensaje y un botón de recarga en vez de una
 * pestaña muerta (los errores de GPU/WebGL suelen aparecer como tab congelada;
 * con esto al menos se da feedback y salida).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[error-boundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash-screen">
        <h1>Algo salió mal</h1>
        <p>
          La interfaz falló y se detuvo para no congelar la pestaña. Recarga la página para
          reintentar (si vuelve a pasar, revisa que la aceleración por hardware del navegador
          esté activada).
        </p>
        <pre>{String(this.state.error?.message ?? this.state.error)}</pre>
        <button className="primary" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </div>
    )
  }
}
