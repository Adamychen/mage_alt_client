import { useCallback, useState } from 'react'
import type { CardView } from '../net/types'
import { getSourceCardName, isAbilityCard } from '../cards/cardImages'
import CardSlot from './CardSlot'
import FloatingCardPreview from './FloatingCardPreview'
import FormattedText from '../game/FormattedText'
import './StackZone.css'

interface StackZoneProps {
  stack: Record<string, CardView> | null | undefined
  onCardClick?: (id: string) => void
  onHover?: (card: CardView | null, rect?: DOMRect) => void
  targetIds?: Set<string>
  onResolveClick?: () => void
  canResolve?: boolean
}

function isStackAbility(card: CardView): boolean {
  return isAbilityCard(card)
}

function stackTypeLabel(card: CardView): string {
  if (isStackAbility(card)) {
    const at = card.abilityType ?? ''
    if (at === 'Triggered' || at === 'Triggered Mana') return '🔔 Habilidad disparada'
    if (at === 'Activated' || at === 'Mana') return '⚡ Habilidad activada'
    if (at === 'Static') return '🛡️ Habilidad estática'
    if (at === 'Loyalty') return '👑 Habilidad de lealtad'
    return '⚡ Habilidad'
  }
  const types = card.cardTypes ?? []
  const supers = card.superTypes ?? []
  const subs = Array.isArray(card.subTypes)
    ? card.subTypes.flatMap((v: unknown) => typeof v === 'string' ? [v] : typeof v === 'object' && v ? Object.keys(v as Record<string, unknown>) : [])
    : []

  if (types.includes('CREATURE')) return `${supers.includes('LEGENDARY') ? 'Legendario — ' : ''}Criatura${subs.length ? ` (${subs.join(' ')})` : ''}`
  if (types.includes('INSTANT')) return 'Instantáneo'
  if (types.includes('SORCERY')) return 'Conjuro'
  if (types.includes('ENCHANTMENT')) return `Encantamiento${subs.length ? ` (${subs.join(' ')})` : ''}`
  if (types.includes('ARTIFACT')) return `Artefacto${subs.length ? ` (${subs.join(' ')})` : ''}`
  if (types.includes('PLANESWALKER')) return 'Planeswalker'
  if (types.includes('LAND')) return 'Tierra'
  return 'Hechizo'
}

function stackRulesText(card: CardView): string | null {
  const rules = card.rules ?? []
  if (rules.length) return rules.join('\n')
  return null
}

export default function StackZone({
  stack,
  onCardClick,
  onHover,
  targetIds = new Set(),
  onResolveClick,
  canResolve = false,
}: StackZoneProps) {
  const [hoverCard, setHoverCard] = useState<CardView | null>(null)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)

  const handleHover = useCallback(
    (card: CardView | null, rect?: DOMRect) => {
      setHoverCard(card)
      setHoverRect(rect ?? null)
      onHover?.(card, rect)
    },
    [onHover]
  )

  const entries = Object.entries(stack ?? {})

  if (entries.length === 0) {
    return (
      <div className="stack-zone empty">
        <div className="stack-empty-state">
          <span className="stack-empty-icon">⚡</span>
          <span className="stack-empty-title">Pila vacía</span>
          <span className="stack-empty-desc">Los hechizos y habilidades jugados aparecerán aquí para resolver.</span>
        </div>
      </div>
    )
  }

  // XMage serializes state.getStack() in resolution order (top/newest item is first)
  const ordered = entries

  return (
    <div className="stack-zone">
      <div className="stack-header">
        <span className="stack-header-title">Pila ({ordered.length})</span>
        <span className="stack-header-hint">Resuelve de arriba a abajo</span>
      </div>

      <div className="stack-items-list">
        {ordered.map(([id, card], idx) => {
          const isTop = idx === 0
          const isAbility = isStackAbility(card)
          const sourceName = isAbility ? getSourceCardName(card) : card.name
          const typeLabel = stackTypeLabel(card)
          const rulesText = stackRulesText(card) || card.rules?.join('\n') || (isAbility ? 'Efecto de habilidad en la pila.' : null)
          const manaCost = (card.manaCostLeftStr ?? []).join('')
          const isTargetable = targetIds.has(id)
          const showResolve = isTop && canResolve

          return (
            <div
              key={id}
              data-card-id={id}
              className={[
                'stack-item',
                'stack-card-entry',
                isTop ? 'stack-item--top is-top' : 'stack-item--underlying is-underlying',
                isTargetable ? 'targetable' : '',
                onCardClick ? 'clickable' : '',
              ].filter(Boolean).join(' ')}
              onClick={onCardClick ? () => onCardClick(id) : undefined}
              onMouseEnter={(e) => handleHover(card, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => handleHover(null)}
              style={{ zIndex: ordered.length - idx }}
            >
              {/* Header badge with position and type */}
              <div className="stack-top-badge-row stack-card-badge-row">
                <span className={`stack-top-indicator stack-pos-indicator ${isTop ? 'top' : ''}`}>
                  {isTop ? '▶ #1 Siguiente en resolver' : `#${idx + 1}`}
                </span>
                <span className="stack-type-badge">{typeLabel}</span>
              </div>

              {/* Large Card Display */}
              <div className="stack-spell-wrapper">
                <CardSlot
                  cardId={id}
                  card={card}
                  onClick={onCardClick ? () => onCardClick(id) : undefined}
                  onHover={handleHover}
                  isTarget={isTargetable}
                  className={`stack-top-card stack-entry-card${showResolve && !rulesText ? ' has-resolve-btn' : ''}`}
                />

                {/* Rules & Description Box */}
                {rulesText && (
                  <div className={`stack-card-rules-box${showResolve ? ' has-resolve-btn' : ''}`}>
                    <div className="stack-card-rules-header">
                      <span className="stack-card-rules-title">{sourceName}</span>
                      {manaCost && (
                        <span className="stack-card-mana">
                          <FormattedText text={manaCost} />
                        </span>
                      )}
                    </div>
                    <div className="stack-card-rules-body">
                      <FormattedText text={rulesText} />
                    </div>
                  </div>
                )}

                {/* Resolve Action Button for Top Item */}
                {showResolve && (
                  <button
                    type="button"
                    className="stack-resolve-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      onResolveClick?.()
                    }}
                  >
                    ⚡ Resolver
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating Card Preview on hover */}
      <FloatingCardPreview
        card={hoverCard}
        anchorRect={hoverRect}
        fixedSide="left"
      />
    </div>
  )
}
