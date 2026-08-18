import { useEffect, useRef, useState } from 'react'
import type { GameView } from '../net/types'
import { createBoardScene, type BoardScene } from './BoardScene'
import './BoardView.css'

export default function BoardView({ game, targetIds = [], chosenTargetIds = [], onTargetClick, targetSourceId, playableIds = [], onPlayableClick, combatSelectable = [], combatChosen = [], combatMode = null, onCombatClick }: {
  game: GameView
  targetIds?: string[]
  chosenTargetIds?: string[]
  onTargetClick?: (id: string) => void
  targetSourceId?: string
  playableIds?: string[]
  onPlayableClick?: (id: string) => void
  combatSelectable?: string[]
  combatChosen?: string[]
  combatMode?: 'attack' | 'block' | null
  onCombatClick?: (id: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<BoardScene | null>(null)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let scene: BoardScene | null = null
    let disposed = false
    let ro: ResizeObserver | null = null
    createBoardScene()
      .then((s) => {
        if (disposed) {
          // el componente se desmontó antes de crear el escenario: sin destroy
          // (Pixi 8 revienta en el teardown) — solo parar el ticker
          try {
            s.app.ticker.stop()
          } catch {
            /* noop */
          }
          return
        }
        scene = s
        sceneRef.current = s
        s.setTargeting(targetIds, onTargetClick, targetSourceId, chosenTargetIds)
        s.setPlayable(playableIds, onPlayableClick)
        s.setCombatSelect(combatSelectable, combatChosen, onCombatClick, combatMode)
        host.appendChild(s.app.canvas)
        s.resize(host.clientWidth, host.clientHeight)
        ro = new ResizeObserver(() => s.resize(host.clientWidth, host.clientHeight))
        ro.observe(host)
        if (gameRef.current) s.setGame(gameRef.current)
      })
      .catch((e: unknown) => {
        if (!disposed) {
          setInitError(e instanceof Error ? e.message : String(e))
        }
      })
    return () => {
      disposed = true
      ro?.disconnect()
      // Pixi 8 revienta dentro de destroy() en el teardown (bug de
      // RenderTargetSystem/FilterSystem: "Cannot read properties of undefined
      // (reading 'push')") — desmontar sin destruir: parar el ticker y soltar el
      // canvas; el contexto WebGL se libera con el GC del escenario.
      if (scene) {
        try {
          scene.app.ticker.stop()
        } catch {
          /* noop */
        }
        try {
          host.removeChild(scene.app.canvas)
        } catch {
          /* noop */
        }
      }
      sceneRef.current = null
    }
  }, [])

  const gameRef = useRef(game)
  gameRef.current = game

  useEffect(() => {
    sceneRef.current?.setGame(game)
  }, [game])

  useEffect(() => {
    sceneRef.current?.setTargeting(targetIds, onTargetClick, targetSourceId, chosenTargetIds)
  }, [targetIds, chosenTargetIds, onTargetClick, targetSourceId])

  useEffect(() => {
    sceneRef.current?.setPlayable(playableIds, onPlayableClick)
  }, [playableIds, onPlayableClick])

  useEffect(() => {
    sceneRef.current?.setCombatSelect(combatSelectable, combatChosen, onCombatClick, combatMode)
  }, [combatSelectable, combatChosen, combatMode, onCombatClick])

  if (initError) {
    return (
      <div className="board-error">
        <div>
          <p>No se pudo inicializar el tablero:</p>
          <p>
            <code>{initError}</code>
          </p>
        </div>
      </div>
    )
  }

  return <div className="board-host" ref={hostRef} />
}
