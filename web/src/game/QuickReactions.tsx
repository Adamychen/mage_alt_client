import * as cmds from '../net/commands'
import { useStore } from '../state/store'
import './QuickReactions.css'

// Fila fija de reacciones de un click (spec sección 61.3). Se envían como
// mensaje de chat normal — XMage no tiene un canal de "reacción" dedicado,
// así que reutilizamos sendChatMessage con el emoji como texto.
const REACTIONS = ['👍', '👏', '⏳', '❓', '✔️', '❌', '🎉']

export default function QuickReactions() {
  const gameId = useStore((s) => s.gameId)

  const react = async (emoji: string) => {
    if (!gameId) return
    await cmds.sendChatMessage(gameId, emoji)
  }

  return (
    <div className="quick-reactions">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="quick-reaction-btn"
          disabled={!gameId}
          onClick={() => react(emoji)}
          title="Enviar reacción"
        >
          {emoji}
        </button>
      ))}
      <button type="button" className="quick-reaction-btn quick-reaction-more" title="Más reacciones" disabled>
        +
      </button>
    </div>
  )
}
