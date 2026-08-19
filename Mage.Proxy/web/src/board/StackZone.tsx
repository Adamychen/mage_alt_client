import type { CardView } from '../net/types'
import CardSlot from './CardSlot'
import './StackZone.css'

interface StackZoneProps {
  stack: Record<string, CardView> | null | undefined
  onCardClick?: (id: string) => void
  targetIds?: Set<string>
  onResolveClick?: () => void
  canResolve?: boolean
}

export default function StackZone({
  stack,
  onCardClick,
  targetIds = new Set(),
  onResolveClick,
  canResolve = false,
}: StackZoneProps) {
  const entries = Object.entries(stack ?? {}).reverse()

  if (entries.length === 0) {
    return <div className="stack-zone empty" />
  }

  const [topId, topCard] = entries[0]
  const rest = entries.slice(1)

  return (
    <div className="stack-zone">
      <div className="stack-unit">
        {rest.slice(0, 3).map(([id], i) => (
          <div
            key={id}
            className="stack-peek"
            style={{ '--i': i + 1 } as React.CSSProperties}
          />
        ))}
        <CardSlot
          card={topCard}
          onClick={onCardClick ? () => onCardClick(topId) : undefined}
          isTarget={targetIds.has(topId)}
          className="stack-top-card"
        />
        {canResolve && (
          <button type="button" className="stack-resolve-btn" onClick={onResolveClick}>
            Resolve
          </button>
        )}
      </div>
    </div>
  )
}
