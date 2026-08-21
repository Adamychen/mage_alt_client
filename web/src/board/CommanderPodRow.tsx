import { useRef, useState } from 'react'
import type { CardView, PermanentView, PlayerView } from '../net/types'
import OpponentPodZone from './OpponentPodZone'
import './CommanderPodRow.css'

interface CommanderPodRowProps {
  opponents: PlayerView[]
  onCardClick?: (id: string) => void
  onCardHover?: (card: CardView | PermanentView | null, rect?: DOMRect) => void
  targetIds: Set<string>
  getRevealedCards: (opp: PlayerView) => Record<string, CardView>
  activePlayerId?: string
}

export default function CommanderPodRow({
  opponents,
  onCardClick,
  onCardHover,
  targetIds,
  getRevealedCards,
  activePlayerId,
}: CommanderPodRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [selectedOppId, setSelectedOppId] = useState<string | null>(opponents[0]?.playerId || null)

  const scrollToOpponent = (playerId: string) => {
    setSelectedOppId(playerId)
    if (!scrollRef.current) return

    const targetSlide = scrollRef.current.querySelector<HTMLElement>(`[data-pod-opp-id="${playerId}"]`)
    if (targetSlide) {
      targetSlide.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }

  const scrollByAmount = (delta: number) => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({
      left: delta,
      behavior: 'smooth',
    })
  }

  if (opponents.length === 0) return null

  return (
    <div className="commander-pod-row">
      {/* 1. Quick Jump Navigation Pill Bar */}
      <div className="pod-nav-bar">
        {opponents.map((opp) => {
          const isTurn = opp.playerId === activePlayerId || opp.isActive
          const isSelected = opp.playerId === selectedOppId

          return (
            <button
              key={opp.playerId}
              type="button"
              className={[
                'pod-nav-pill',
                isSelected ? 'active-focus' : '',
                isTurn ? 'is-turn' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => scrollToOpponent(opp.playerId)}
              title={`Ver mesa de ${opp.name}`}
            >
              <span>{opp.name}</span>
              <span className="pod-pill-life">{opp.life} ❤️</span>
              {isTurn && <span className="pod-pill-turn-badge">TURNO</span>}
            </button>
          )
        })}
      </div>

      {/* 2. Horizontal Scrollable Opponent Slides */}
      <div className="pod-slider-wrapper">
        {opponents.length > 1 && (
          <button
            type="button"
            className="pod-nav-btn prev-btn"
            onClick={() => scrollByAmount(-480)}
            title="Desplazar a la izquierda"
          >
            ‹
          </button>
        )}

        <div className="pod-slider-scroll" ref={scrollRef}>
          {opponents.map((opp) => {
            const isTurn = opp.playerId === activePlayerId || opp.isActive
            const hasPriority = opp.hasPriority

            return (
              <div
                key={opp.playerId}
                data-pod-opp-id={opp.playerId}
                className={[
                  'pod-opponent-slide',
                  isTurn ? 'is-turn' : '',
                  hasPriority ? 'has-priority' : '',
                ].filter(Boolean).join(' ')}
              >
                <OpponentPodZone
                  player={opp}
                  onCardClick={onCardClick}
                  onCardHover={onCardHover}
                  targetIds={targetIds}
                  revealedCards={getRevealedCards(opp)}
                />
              </div>
            )
          })}
        </div>

        {opponents.length > 1 && (
          <button
            type="button"
            className="pod-nav-btn next-btn"
            onClick={() => scrollByAmount(480)}
            title="Desplazar a la derecha"
          >
            ›
          </button>
        )}
      </div>
    </div>
  )
}
