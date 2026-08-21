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
  const [topId, topCard] = ordered[0]
  const underlyingItems = ordered.slice(1)

  const isTopAbility = isStackAbility(topCard)
  const topTypeLabel = stackTypeLabel(topCard)
  const topRulesText = stackRulesText(topCard)
  const topSourceName = isTopAbility ? getSourceCardName(topCard) : topCard.name
  const topManaCost = (topCard.manaCostLeftStr ?? []).join('')

  return (
    <div className="stack-zone">
      <div className="stack-header">
        <span className="stack-header-title">Pila ({ordered.length})</span>
        <span className="stack-header-hint">Resuelve de arriba a abajo</span>
      </div>

      <div className="stack-items-list">
        {/* Top of the Stack (Active / Resolving next) */}
        <div className="stack-item stack-item--top" key={topId} data-card-id={topId}>
          <div className="stack-top-badge-row">
            <span className="stack-top-indicator">▶ Siguiente en resolver</span>
            <span className="stack-type-badge">{topTypeLabel}</span>
          </div>

          {isTopAbility ? (
            <div
              data-card-id={topId}
              className={[
                'stack-top-card',
                'stack-ability-card',
                canResolve ? 'has-resolve-btn' : '',
                targetIds.has(topId) ? 'targetable' : '',
                onCardClick ? 'clickable' : '',
              ].filter(Boolean).join(' ')}
              onClick={onCardClick ? () => onCardClick(topId) : undefined}
              onMouseEnter={(e) => handleHover(topCard, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => handleHover(null)}
            >
              <div className="ability-card-header">
                <span className="ability-card-badge">{topTypeLabel}</span>
                <span className="ability-card-source">{topSourceName}</span>
              </div>
              <div className="ability-card-body">
                <div className="ability-card-thumb-wrap">
                  <CardSlot cardId={topId} card={topCard} className="ability-card-thumb" />
                </div>
                <div className="ability-card-text">
                  <FormattedText text={topRulesText || topSourceName || 'Efecto en la pila'} />
                </div>
              </div>
            </div>
          ) : (
            <div className="stack-spell-wrapper">
              <CardSlot
                cardId={topId}
                card={topCard}
                onClick={onCardClick ? () => onCardClick(topId) : undefined}
                onHover={handleHover}
                isTarget={targetIds.has(topId)}
                className={`stack-top-card${canResolve && !topRulesText ? ' has-resolve-btn' : ''}`}
              />
              {topRulesText && (
                <div className={`stack-card-rules-box${canResolve ? ' has-resolve-btn' : ''}`}>
                  <div className="stack-card-rules-header">
                    <span className="stack-card-rules-title">{topSourceName}</span>
                    {topManaCost && (
                      <span className="stack-card-mana">
                        <FormattedText text={topManaCost} />
                      </span>
                    )}
                  </div>
                  <div className="stack-card-rules-body">
                    <FormattedText text={topRulesText} />
                  </div>
                </div>
              )}
            </div>
          )}

          {canResolve && (
            <button type="button" className="stack-resolve-btn" onClick={onResolveClick}>
              Resolver
            </button>
          )}
        </div>

        {/* Underlying items in the stack */}
        {underlyingItems.map(([id, card], idx) => {
          const isAbility = isStackAbility(card)
          const sourceName = isAbility ? getSourceCardName(card) : card.name
          const typeLabel = stackTypeLabel(card)
          const rules = stackRulesText(card)

          return (
            <div
              key={id}
              data-card-id={id}
              className={[
                'stack-item',
                'stack-item--underlying',
                targetIds.has(id) ? 'targetable' : '',
                onCardClick ? 'clickable' : '',
              ].filter(Boolean).join(' ')}
              onClick={onCardClick ? () => onCardClick(id) : undefined}
              onMouseEnter={(e) => handleHover(card, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => handleHover(null)}
              style={{ zIndex: underlyingItems.length - idx }}
            >
              <div className="underlying-thumb-wrap">
                <CardSlot cardId={id} card={card} className="underlying-thumb" />
              </div>
              <div className="underlying-info">
                <div className="underlying-header">
                  <span className="underlying-type">{typeLabel}</span>
                  <span className="underlying-pos">#{idx + 2}</span>
                </div>
                <div className="underlying-name">{sourceName}</div>
                {rules && (
                  <div className="underlying-rule-preview">
                    <FormattedText text={rules} />
                  </div>
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
