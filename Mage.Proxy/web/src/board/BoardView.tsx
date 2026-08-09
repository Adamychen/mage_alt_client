import { useEffect, useRef, useState } from 'react'
import type { GameView } from '../net/types'
import { createBoardScene, type BoardScene } from './BoardScene'
import './BoardView.css'

export default function BoardView({ game, targetIds = [], onTargetClick, playableIds = [], onPlayableClick }: {
  game: GameView
  targetIds?: string[]
  onTargetClick?: (id: string) => void
  playableIds?: string[]
  onPlayableClick?: (id: string) => void
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
          s.app.destroy(true)
          return
        }
        scene = s
        sceneRef.current = s
        s.setTargeting(targetIds, onTargetClick)
        s.setPlayable(playableIds, onPlayableClick)
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
      scene?.app.destroy(true)
      sceneRef.current = null
    }
  }, [])

  const gameRef = useRef(game)
  gameRef.current = game

  useEffect(() => {
    sceneRef.current?.setGame(game)
  }, [game])

  useEffect(() => {
    sceneRef.current?.setTargeting(targetIds, onTargetClick)
  }, [targetIds, onTargetClick])

  useEffect(() => {
    sceneRef.current?.setPlayable(playableIds, onPlayableClick)
  }, [playableIds, onPlayableClick])

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
