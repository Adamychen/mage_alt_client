import { useEffect } from 'react'
import BoardView from '../board/BoardView'
import * as cmds from '../net/commands'
import { clearFeedback, maybeAutoPass, reset, setSetting, setStoreError, useGame, useSettings, useStore } from '../state/store'
import GameLog from './GameLog'
import FeedbackDialog from './FeedbackDialog'
import { playableObjectIds, resolveTargetSourceId } from '../board/gameToScene'
import './GameScreen.css'

export default function GameScreen() {
  const game = useGame()
  const settings = useSettings()
  const gameId = useStore((s) => s.gameId)
  const feedback = useStore((s) => s.feedback)

  useEffect(() => {
    if (game) maybeAutoPass(game)
  }, [game])

  const me = game?.players?.find((p) => p.controlled)
  const targetIds = feedback?.method === 'GAME_TARGET' ? feedback.options.map((option) => option.id) : []
  const targetSourceId = game && feedback?.method === 'GAME_TARGET' ? resolveTargetSourceId(game, feedback.sourceName) : undefined
  const playableIds = game ? playableObjectIds(game) : []
  const onTargetClick = async (id: string) => {
    if (!gameId) return
    const result = await cmds.sendPlayerUUID(id, gameId)
    if (result.ok) clearFeedback()
    else setStoreError(result.error ?? 'No se pudo enviar el objetivo')
  }

  const onPlayableClick = async (id: string) => {
    if (!gameId) return
    const result = await cmds.sendPlayerUUID(id, gameId)
    if (!result.ok) setStoreError(result.error ?? 'No se pudo jugar la carta')
  }

  return (
    <div className="game">
      <header className="game-top">
        <div>
          <span className="game-title">Partida {gameId ? `#${gameId.slice(0, 8)}` : ''}</span>
          {game && <div className="game-state" data-testid="game-status">Turno {game.turn} · {game.phase} · {game.step}</div>}
        </div>
        <div className="game-controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.autoKeepMulligan}
              onChange={(e) => setSetting('autoKeepMulligan', e.target.checked)}
            />
            Auto-mulligan (keep)
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.autoPass}
              onChange={(e) => setSetting('autoPass', e.target.checked)}
            />
            Auto-pase de prioridad
          </label>
          <button disabled={!me?.hasPriority || !gameId} onClick={() => gameId && void cmds.sendPlayerBoolean(false, gameId)}>
            Pasar prioridad
          </button>
          <button disabled={!gameId} onClick={() => gameId && void cmds.quitMatch(gameId)}>Abandonar</button>
          <button onClick={reset}>Salir</button>
        </div>
      </header>
      <div className="game-main">
        <div className="board-wrap">
            {game ? (
              <BoardView
                game={game}
                targetIds={targetIds}
                onTargetClick={onTargetClick}
                targetSourceId={targetSourceId}
                playableIds={playableIds}
                onPlayableClick={onPlayableClick}
              />
            ) : <div className="board-empty">Esperando al tablero…</div>}
        </div>
        <GameLog />
      </div>
      <FeedbackDialog />
    </div>
  )
}
