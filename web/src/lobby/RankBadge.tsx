import { getRankInfo } from './ranking'
import './RankBadge.css'

interface RankBadgeProps {
  elo?: number | string | null
  showElo?: boolean
  compact?: boolean
  className?: string
}

export default function RankBadge({ elo, showElo = false, compact = false, className = '' }: RankBadgeProps) {
  const rank = getRankInfo(elo)
  const numericElo = typeof elo === 'number' ? elo : parseInt(String(elo ?? '1500'), 10) || 1500

  return (
    <div
      className={`rank-badge ${rank.tier.toLowerCase()} ${compact ? 'compact' : ''} ${className}`}
      style={{
        backgroundColor: rank.bg,
        borderColor: rank.border,
        color: rank.color,
      }}
      title={`Rango: ${rank.label} (${numericElo} ELO)`}
    >
      <span className="rank-badge-icon">{rank.icon}</span>
      <span className="rank-badge-name">{compact ? rank.name : rank.label}</span>
      {showElo && <span className="rank-badge-elo">({numericElo})</span>}
    </div>
  )
}
