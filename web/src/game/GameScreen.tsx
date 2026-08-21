import { useCallback, useEffect, useState } from 'react'
import GameBoard from '../board/GameBoard'
import * as cmds from '../net/commands'
import { maybeAutoPass, setSetting, setStoreError, useGame, useSettings, useStore } from '../state/store'
import FeedbackDialog from './FeedbackDialog'
import SideboardScreen from './SideboardScreen'
import Sidebar from './Sidebar'
import GameChat from './GameChat'
import PhaseBar from './PhaseBar'
import ActionButton from './ActionButton'
import ActionFeed from './ActionFeed'
import { resolveTargetSourceId } from './resolveTargetSourceId'
import { crossZonePlayables } from '../board/crossZone'
import './GameScreen.css'

export default function GameScreen() {
  const game = useGame()
  const settings = useSettings()
  const gameId = useStore((s) => s.gameId)
  const feedback = useStore((s) => s.feedback)
  const playableIds = useStore((s) => s.playableIds)
  const combat = useStore((s) => s.combat)
  const [rightTab, setRightTab] = useState<'log' | 'chat'>('log')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (game) maybeAutoPass(game)
  }, [game])

  const me = game?.players?.find((p) => p.controlled)
  const canPass = !!gameId && (!!me?.hasPriority || (!!me?.isActive && (!feedback || feedback.mode === 'combat')))
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

  const onResolveClick = useCallback(async () => {
    if (!gameId || busy) return
    setBusy(true)
    try {
      const result = await cmds.sendPlayerBoolean(false, gameId)
      if (!result.ok) setStoreError(result.error ?? 'No se pudo pasar prioridad')
    } finally {
      setBusy(false)
    }
  }, [gameId, busy])

  // Espacio activa la acción principal / pasar prioridad
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault()
        // No enviar pass a ciegas si hay un diálogo de maná o target abierto
        if (feedback && feedback.mode !== 'combat') return
        if (canPass) void onResolveClick()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canPass, feedback, onResolveClick])

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
          <button disabled={!canPass} onClick={onResolveClick}>
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
          <div className="right-panel-tabs">
            <button
              type="button"
              className={`right-tab-btn ${rightTab === 'log' ? 'active' : ''}`}
              onClick={() => setRightTab('log')}
            >
              Feed / Log
            </button>
            <button
              type="button"
              className={`right-tab-btn ${rightTab === 'chat' ? 'active' : ''}`}
              onClick={() => setRightTab('chat')}
            >
              Chat
            </button>
          </div>

          <div className="right-panel-content">
            {rightTab === 'log' ? (
              <ActionFeed />
            ) : (
              <GameChat />
            )}
          </div>

          <ActionButton
            game={game}
            feedback={feedback}
            gameId={gameId}
            canPass={canPass}
            onPass={onResolveClick}
            busy={busy}
          />
        </div>
      </div>
      <FeedbackDialog />
      <SideboardScreen />
    </div>
  )
}
