import { useEffect, useState } from 'react'
import GameBoard from '../board/GameBoard'
import * as cmds from '../net/commands'
import { maybeAutoPass, setSetting, setStoreError, useGame, useSettings, useStore } from '../state/store'
import FeedbackDialog from './FeedbackDialog'
import Sidebar from './Sidebar'
import CardPreview from './CardPreview'
import GameChat from './GameChat'
import PhaseBar from './PhaseBar'
import { resolveTargetSourceId } from './resolveTargetSourceId'
import { crossZonePlayables } from '../board/crossZone'
import type { CardView } from '../net/types'
import './GameScreen.css'

export default function GameScreen() {
  const game = useGame()
  const settings = useSettings()
  const gameId = useStore((s) => s.gameId)
  const feedback = useStore((s) => s.feedback)
  const playableIds = useStore((s) => s.playableIds)
  const combat = useStore((s) => s.combat)
  const log = useStore((s) => s.log)
  const [previewCard, setPreviewCard] = useState<CardView | null>(null)

  useEffect(() => {
    if (game) maybeAutoPass(game)
  }, [game])

  const me = game?.players?.find((p) => p.controlled)
  const targetIds = feedback?.method === 'GAME_TARGET' ? feedback.options.map((option) => option.id) : []
  const chosenTargetIds = feedback?.method === 'GAME_TARGET' ? (feedback.chosenTargets ?? []) : []
  const targetSourceId = game && feedback?.method === 'GAME_TARGET' ? resolveTargetSourceId(game, feedback.sourceName) : undefined

  const onTargetClick = async (id: string) => {
    if (!gameId) return
    const result = await cmds.sendPlayerUUID(id, gameId)
    if (!result.ok) setStoreError(result.error ?? 'No se pudo enviar el objetivo')
  }

  const onPlayableClick = async (id: string) => {
    if (!gameId) return
    const result = await cmds.sendPlayerUUID(id, gameId)
    if (!result.ok) setStoreError(result.error ?? 'No se pudo jugar la carta')
   }

  const crossZone = crossZonePlayables(game, feedback ?? undefined)

  const onCombatClick = async (id: string) => {
    if (!gameId) return
    const result = await cmds.sendPlayerUUID(id, gameId)
    if (!result.ok) setStoreError(result.error ?? 'No se pudo declarar la criatura en combate')
  }

  const onResolveClick = async () => {
    if (!gameId) return
    const result = await cmds.sendPlayerBoolean(false, gameId)
    if (!result.ok) setStoreError(result.error ?? 'No se pudo pasar prioridad')
  }

  return (
    <div className="game">
      <header className="game-top">
        <div className="game-top-left">
          {game && (
            <div className="game-state" data-testid="game-status">
              <span className="game-turn">Turn {game.turn}</span>
              <PhaseBar step={game.step} />
            </div>
          )}
        </div>
        <div className="game-controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.autoKeepMulligan}
              onChange={(e) => setSetting('autoKeepMulligan', e.target.checked)}
            />
            Auto-mulligan
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.autoPass}
              onChange={(e) => setSetting('autoPass', e.target.checked)}
            />
            Auto-pass
          </label>
          <button disabled={!me?.hasPriority || !gameId} onClick={() => gameId && void cmds.sendPlayerBoolean(false, gameId)}>
            Pass
          </button>
          <button disabled={!gameId} onClick={() => gameId && void cmds.quitMatch(gameId)}>Quit</button>
        </div>
      </header>
      <div className="game-body">
        <Sidebar />
        <div className="board-wrap">
            <GameBoard
             game={game}
             targetIds={targetIds}
             chosenTargetIds={chosenTargetIds}
             onTargetClick={onTargetClick}
             targetSourceId={targetSourceId}
             playableIds={playableIds}
             onPlayableClick={onPlayableClick}
             onCardHover={setPreviewCard}
             combatSelectable={combat?.selectable ?? []}
             combatMode={combat?.mode ?? null}
             combatChosen={combat?.chosen ?? []}
             onCombatClick={onCombatClick}
             onResolveClick={onResolveClick}
             crossZonePlayables={crossZone}
             onPlayCrossZone={onPlayableClick}
            />
        </div>
        <div className="game-right-panel">
          <CardPreview card={previewCard} />
          <div className="game-log-section">
            <div className="game-log-header">Game Log</div>
            <div className="game-log-entries">
              {log?.slice(-50).map((entry, i) => (
                <div key={entry.id ?? i} className="game-log-entry">
                  {entry.from && <span className="game-log-player">{entry.from}</span>}
                  <span className="game-log-text">{entry.text}</span>
                </div>
              ))}
            </div>
          </div>
          <GameChat />
        </div>
      </div>
      <FeedbackDialog />
    </div>
  )
}
