import { useState } from 'react'
import { OFFICIAL_AVATARS } from './avatars'
import AvatarImage from './AvatarImage'
import './AvatarPickerModal.css'

interface AvatarPickerModalProps {
  selectedAvatarId: number
  onSelect: (avatarId: number) => void
  onClose: () => void
}

export default function AvatarPickerModal({
  selectedAvatarId,
  onSelect,
  onClose,
}: AvatarPickerModalProps) {
  const [filter, setFilter] = useState<'all' | 'standard' | 'special'>('all')

  const filteredAvatars = OFFICIAL_AVATARS.filter((a) => {
    if (filter === 'standard') return !a.isSpecial
    if (filter === 'special') return !!a.isSpecial
    return true
  })

  return (
    <div className="overlay">
      <div className="dialog panel avatar-picker-dialog">
        <div className="avatar-picker-header">
          <div className="avatar-picker-title">
            <h2>🧙‍♂️ Elige tu Avatar de Duelista</h2>
            <span className="avatar-picker-subtitle">
              Planeswalkers, leyendas y avatares animados oficiales de Magic
            </span>
          </div>
          <button type="button" className="avatar-picker-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Filter Chips */}
        <div className="avatar-picker-tabs">
          <button
            type="button"
            className={`chip ${filter === 'all' ? 'on' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todos ({OFFICIAL_AVATARS.length})
          </button>
          <button
            type="button"
            className={`chip ${filter === 'standard' ? 'on' : ''}`}
            onClick={() => setFilter('standard')}
          >
            Planeswalkers Clásicos
          </button>
          <button
            type="button"
            className={`chip ${filter === 'special' ? 'on' : ''}`}
            onClick={() => setFilter('special')}
          >
            ✨ Animados (GIF)
          </button>
        </div>

        {/* Avatars Grid */}
        <div className="avatar-picker-grid">
          {filteredAvatars.map((a) => {
            const isSelected = a.id === selectedAvatarId
            return (
              <div
                key={a.id}
                className={`avatar-picker-item ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  onSelect(a.id)
                  onClose()
                }}
              >
                <div className="avatar-item-img-wrap">
                  <AvatarImage avatarId={a.id} size="large" />
                  {isSelected && <span className="avatar-selected-check">✓</span>}
                  {a.isSpecial && <span className="avatar-special-spark">✨</span>}
                </div>
                <span className="avatar-item-name">{a.name}</span>
              </div>
            )
          })}
        </div>

        <div className="avatar-picker-footer">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
