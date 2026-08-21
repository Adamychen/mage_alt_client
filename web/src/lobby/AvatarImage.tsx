import { useState } from 'react'
import { resolveAvatarPath } from './avatars'
import './AvatarImage.css'

interface AvatarImageProps {
  avatarId?: number | null
  username?: string
  size?: 'small' | 'medium' | 'large' | 'huge'
  className?: string
  onClick?: () => void
}

export default function AvatarImage({
  avatarId,
  username = '',
  size = 'medium',
  className = '',
  onClick,
}: AvatarImageProps) {
  const [errored, setErrored] = useState(false)
  const initial = username.trim().charAt(0).toUpperCase() || 'M'
  const path = resolveAvatarPath(avatarId)

  if (errored) {
    return (
      <div
        className={`avatar-image-fallback avatar-size-${size} ${className}`}
        onClick={onClick}
        title={username || 'Avatar'}
      >
        <span>{initial}</span>
      </div>
    )
  }

  return (
    <img
      src={path}
      alt={username || 'Avatar'}
      title={username ? `Avatar de ${username}` : 'Avatar'}
      className={`avatar-image avatar-size-${size} ${className}`}
      onError={() => setErrored(true)}
      onClick={onClick}
      loading="lazy"
    />
  )
}
