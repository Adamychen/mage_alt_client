export interface ContextMenuItem {
  id: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onSelect: (id: string) => void
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onSelect, onClose }: ContextMenuProps) {
  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} />
      <div
        className="context-menu"
        style={{ left: x, top: y }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            className={`context-menu-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
            onClick={() => { onSelect(item.id); onClose() }}
          >
            {item.icon && <span className="context-menu-icon">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}

export const CARD_CONTEXT_ITEMS: ContextMenuItem[] = [
  { id: 'tap', label: 'Tap / Girar', icon: '🔄' },
  { id: 'rotate', label: 'Rotar 90°', icon: '↻' },
  { id: 'flip', label: 'Voltear', icon: '🔃' },
  { id: 'move', label: 'Mover a...', icon: '➡' },
  { id: 'group', label: 'Agrupar', icon: '📋' },
  { id: 'counter', label: '+1/+1 Contador', icon: '➕' },
  { id: 'remove-counter', label: 'Quitar contador', icon: '➖' },
  { id: 'destroy', label: 'Destruir', icon: '💥', danger: true },
]