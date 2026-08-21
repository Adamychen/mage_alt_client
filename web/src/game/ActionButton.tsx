import type { GameView } from '../net/types'
import type { FeedbackPrompt } from './feedback'
import './ActionButton.css'

interface ActionButtonProps {
  game: GameView | null
  feedback: FeedbackPrompt | null
  gameId: string | null
  canPass: boolean
  onPass: () => void
  busy?: boolean
}

export default function ActionButton({
  game,
  feedback,
  canPass,
  onPass,
  busy = false,
}: ActionButtonProps) {
  const me = game?.players?.find((p) => p.controlled)
  const opp = game?.players?.find((p) => !p.controlled)
  const stackItems = Object.keys(game?.stack ?? {}).length

  // Determine button role and state
  let label = 'Pasar'
  let sublabel: string | null = null
  let modeClass = 'action-pass'

  if (stackItems > 0) {
    label = 'Resolver'
    sublabel = `Pila (${stackItems})`
    modeClass = 'action-resolve'
  } else if (feedback?.mode === 'combat') {
    label = feedback.title === 'Declara atacantes' ? 'Confirmar atacantes' : 'Confirmar bloqueadores'
    modeClass = 'action-combat'
  } else if (me?.hasPriority) {
    label = 'Pasar'
    sublabel = me.isActive ? 'Siguiente paso' : 'Ceder prioridad'
    modeClass = 'action-priority'
  } else if (!me?.hasPriority && opp?.hasPriority) {
    label = 'Esperando...'
    sublabel = opp.name
    modeClass = 'action-waiting'
  } else if (!canPass) {
    label = 'Esperando...'
    modeClass = 'action-waiting'
  }

  const isInteractive = canPass && !busy && modeClass !== 'action-waiting'

  return (
    <div className="action-button-container">
      <button
        type="button"
        className={`big-action-btn ${modeClass} ${isInteractive ? 'interactive' : 'disabled'}`}
        disabled={!isInteractive}
        onClick={onPass}
        title="Acción principal (Espacio)"
      >
        <span className="action-btn-glow" aria-hidden="true" />
        <div className="action-btn-content">
          <span className="action-btn-label">{busy ? 'Enviando...' : label}</span>
          {sublabel && !busy && <span className="action-btn-sublabel">{sublabel}</span>}
        </div>
        <kbd className="action-btn-shortcut">Espacio</kbd>
      </button>
    </div>
  )
}
