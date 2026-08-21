import { useState } from 'react'
import './CountryFlag.css'

export interface CountryFlagProps {
  flagName?: string | null
  className?: string
  showTextFallback?: boolean
}

export function cleanFlagCode(raw?: string | null): string | null {
  if (!raw) return null
  let code = raw.trim().toLowerCase()
  if (code.endsWith('.png')) {
    code = code.slice(0, -4)
  }
  return code || null
}

export default function CountryFlag({ flagName, className = '', showTextFallback = false }: CountryFlagProps) {
  const [errored, setErrored] = useState(false)
  const code = cleanFlagCode(flagName)

  if (!code) {
    return showTextFallback ? <span className="flag-empty">🌐</span> : null
  }

  if (errored) {
    return showTextFallback ? <span className="flag-fallback">{code.toUpperCase()}</span> : null
  }

  return (
    <img
      src={`/flags/${code}.png`}
      alt={code.toUpperCase()}
      title={`País: ${code.toUpperCase()}`}
      className={`country-flag-icon ${className}`}
      onError={() => setErrored(true)}
      loading="lazy"
    />
  )
}
