import { useEffect, useState } from 'react'
import BoardView from '../board/BoardView'
import * as cmds from '../net/commands'
import { maybeAutoPass, setSetting, setStoreError, useGame, useSettings, useStore } from '../state/store'
import FeedbackDialog from './FeedbackDialog'
import Sidebar from './Sidebar'
import CardPreview from './CardPreview'
import GameChat from './GameChat'
import PlayerStatusCard from './PlayerStatusCard'
import PlayerResourcePanel from './PlayerResourcePanel'
import { resolveTargetSourceId } from '../board/gameToScene'
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

  useEffect(() => {
    const check = setInterval(() => {
      const scene = (globalThis as any).__mageScene
      if (scene?.hoveredCardId && game) {
        const id = scene.hoveredCardId
        const handCard = game.myHand?.[id]
        if (handCard) { setPreviewCard(handCard); return }
        for (const p of game.players ?? []) {
          const perm = p.battlefield?.[id]
          if (perm) { setPreviewCard(perm); return }
        }
        const stackCard = game.stack?.[id]
        if (stackCard) { setPreviewCard(stackCard); return }
      } else if (!scene?.hoveredCardId) {
        setPreviewCard(null)
      }
    }, 100)
    return () => clearInterval(check)
  }, [game])

  const me = game?.players?.find((p) => p.controlled)
  const opps = game?.players?.filter((p) => !p.controlled) ?? []
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

  const onCombatClick = async (id: string) => {
    if (!gameId) return
    const result = await cmds.sendPlayerUUID(id, gameId)
    if (!result.ok) setStoreError(result.error ?? 'No se pudo declarar la criatura en combate')
  }

  const isSpectator = !me
  const opp0 = opps[0]
  const opp1 = opps[1]

  return (
    <div className="game">
      <header className="game-top">
        <div className="game-top-left">
          {game && (
            <div className="game-state" data-testid="game-status">
              <span className="game-turn">Turn {game.turn}</span>
              <span className="game-phase">{game.phase} · {game.step}</span>
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
          {game && (
            <>
              <div className="zone-box opp-zone">
                {opp0 && (
                  <>
                    <PlayerStatusCard player={opp0} side="opp" />
                    <PlayerResourcePanel player={opp0} side="opp" />
                  </>
                )}
              </div>
              <div className="zone-divider" />
              <div className="zone-box my-zone">
                {isSpectator && opp1 && (
                  <>
                    <PlayerStatusCard player={opp1} side="my" />
                    <PlayerResourcePanel player={opp1} side="my" />
                  </>
                )}
                {me && (
                  <>
                    <PlayerStatusCard player={me} side="my" />
                    <PlayerResourcePanel player={me} side="my" />
                  </>
                )}
              </div>
            </>
          )}
          <BoardView
            game={game!}
            targetIds={targetIds}
            chosenTargetIds={chosenTargetIds}
            onTargetClick={onTargetClick}
            targetSourceId={targetSourceId}
            playableIds={playableIds}
            onPlayableClick={onPlayableClick}
            combatSelectable={combat?.selectable ?? []}
            combatChosen={combat?.chosen ?? []}
            combatMode={combat?.mode ?? null}
            onCombatClick={onCombatClick}
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
