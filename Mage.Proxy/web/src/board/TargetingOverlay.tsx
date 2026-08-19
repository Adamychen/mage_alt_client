import './TargetingOverlay.css'

interface TargetCard {
  id: string
  x: number
  y: number
}

interface TargetingOverlayProps {
  sourceId: string | undefined
  targetIds: string[]
  chosenIds?: string[]
  cards: Record<string, TargetCard>
}

export default function TargetingOverlay({
  sourceId,
  targetIds,
  chosenIds = [],
  cards,
}: TargetingOverlayProps) {
  if (!sourceId || targetIds.length === 0) return null

  const source = cards[sourceId]
  if (!source) return null

  return (
    <svg className="targeting-overlay">
      <defs>
        <filter id="target-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {targetIds.map((id) => {
        const target = cards[id]
        if (!target) return null
        const chosen = chosenIds.includes(id)
        return (
          <line
            key={id}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke={chosen ? '#7ee787' : '#ffb03a'}
            strokeWidth={chosen ? 3 : 2}
            strokeDasharray="10 7"
            filter="url(#target-glow)"
            className="target-line"
            opacity={chosen ? 0.95 : 0.7}
          />
        )
      })}
    </svg>
  )
}
