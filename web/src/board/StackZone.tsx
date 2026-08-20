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

function stackTypeLabel(card: CardView): string {
  if (card.isAbility) {
    const abilityKind = card.abilityType === 'ACTIVATED'
      ? 'Habilidad activada'
      : card.abilityType === 'TRIGGERED'
        ? 'Habilidad disparada'
        : card.abilityType === 'LOYALTY'
          ? 'Habilidad de lealtad'
          : 'Habilidad'
    return abilityKind
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
  // For abilities, the ability CardView has rules text
  if (card.isAbility && card.ability) {
    const rules = card.ability.rules ?? []
    return rules.length ? rules.join('\n') : null
  }
  // For spells, use the card's own rules
  const rules = card.rules ?? []
  return rules.length ? rules.join('\n') : null
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
  const typeLabel = stackTypeLabel(topCard)
  const rulesText = stackRulesText(topCard)

  return (
    <div className="stack-zone">
      <div className="stack-info">
        <div className="stack-type-badge">{typeLabel}</div>
        {rulesText && (
          <div className="stack-rules">{rulesText}</div>
        )}
      </div>
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
