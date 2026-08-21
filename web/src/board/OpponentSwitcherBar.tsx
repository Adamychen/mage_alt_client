import type { CombatGroupView, PlayerView } from '../net/types'
import './OpponentSwitcherBar.css'

interface OpponentSwitcherBarProps {
  opponents: PlayerView[]
  selectedOppId: string
  onSelectOpponent: (id: string) => void
  activePlayerId?: string
  targetIds?: Set<string>
  onTargetClick?: (id: string) => void
  combat?: CombatGroupView[]
}

export default function OpponentSwitcherBar({
  opponents,
  selectedOppId,
  onSelectOpponent,
  activePlayerId,
  targetIds = new Set(),
  onTargetClick,
  combat = [],
}: OpponentSwitcherBarProps) {
  if (opponents.length <= 1) return null

  const currentIndex = opponents.findIndex((p) => p.playerId === selectedOppId)
  const currentIdx = currentIndex >= 0 ? currentIndex : 0

  const handlePrev = () => {
    const nextIdx = (currentIdx - 1 + opponents.length) % opponents.length
    onSelectOpponent(opponents[nextIdx].playerId)
  }

  const handleNext = () => {
    const nextIdx = (currentIdx + 1) % opponents.length
    onSelectOpponent(opponents[nextIdx].playerId)
  }

  return (
    <div className="opponent-switcher-bar">
      <button
        type="button"
        className="opp-switch-btn prev"
        onClick={handlePrev}
        title="Ver oponente anterior"
      >
        ‹
      </button>

      <div className="opp-pills-list">
        {opponents.map((opp) => {
          const isSelected = opp.playerId === selectedOppId
          const isTurn = opp.playerId === activePlayerId || opp.isActive
          const isTargetable = targetIds.has(opp.playerId)

          // Check if this opponent is being attacked or has blockers in combat
          const isInvolvedInCombat = (combat ?? []).some((g) => {
            const defs = (g.defenders as unknown[]) ?? []
            return defs.includes(opp.playerId) || (g as any).defenderId === opp.playerId
          })

          return (
            <button
              key={opp.playerId}
              type="button"
              className={[
                'opp-pill',
                isSelected ? 'is-selected' : '',
                isTurn ? 'is-turn' : '',
                isTargetable ? 'is-targetable' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                if (isTargetable && onTargetClick) {
                  onTargetClick(opp.playerId)
                }
                onSelectOpponent(opp.playerId)
              }}
              title={`Ver mesa de ${opp.name}${isTargetable ? ' (Clic para seleccionar objetivo)' : ''}`}
            >
              <span>{opp.name}</span>
              <span className="opp-pill-life">{opp.life} ❤️</span>
              {isTurn && <span className="opp-pill-tag turn-tag">TURNO</span>}
              {isInvolvedInCombat && (
                <span className="opp-pill-tag combat-tag">⚔️ COMBATE</span>
              )}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="opp-switch-btn next"
        onClick={handleNext}
        title="Ver oponente siguiente"
      >
        ›
      </button>
    </div>
  )
}
