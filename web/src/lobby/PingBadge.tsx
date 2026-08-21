import './PingBadge.css'

export interface PingBadgeProps {
  infoPing?: string | null
  compact?: boolean
  showText?: boolean
  className?: string
}

export function parsePing(infoPing?: string | null): {
  ms: number | null
  status: 'good' | 'medium' | 'slow' | 'disconnected' | 'unknown'
  label: string
  duration?: string
} {
  if (!infoPing || infoPing === '<no ping>') {
    return { ms: null, status: 'unknown', label: '—' }
  }
  if (infoPing.toLowerCase().includes('discon') || infoPing.toLowerCase().includes('offline')) {
    return { ms: null, status: 'disconnected', label: 'Desconectado' }
  }

  const msMatch = infoPing.match(/<?(\d+)\s*ms/i)
  const ms = msMatch ? parseInt(msMatch[1], 10) : null

  const durMatch = infoPing.match(/\(([^)]+)\)/)
  const duration = durMatch ? durMatch[1] : undefined

  let status: 'good' | 'medium' | 'slow' | 'unknown' = 'unknown'
  if (ms !== null) {
    if (ms < 80) status = 'good'
    else if (ms < 200) status = 'medium'
    else status = 'slow'
  }

  const label = ms !== null ? `${ms}ms` : infoPing

  return { ms, status, label, duration }
}

export default function PingBadge({
  infoPing,
  compact = false,
  showText = true,
  className = '',
}: PingBadgeProps) {
  const { status, label, duration } = parsePing(infoPing)

  if (status === 'unknown' && !infoPing) {
    return null
  }

  const tooltip = duration ? `Latencia: ${label} (conectado ${duration})` : `Latencia: ${label}`

  return (
    <div
      className={`ping-badge ping-${status} ${compact ? 'ping-compact' : ''} ${className}`}
      title={tooltip}
    >
      <span className="ping-dot" />
      {showText && <span className="ping-text">{label}</span>}
    </div>
  )
}
