import { useMemo } from 'react'
import type { CardView, PlayerView } from '../net/types'
import CardSlot from './CardSlot'
import './CommandZone.css'

interface CommandZoneProps {
  player: PlayerView | undefined
  side: 'my' | 'opp'
  onCardClick?: (id: string) => void
  onHover?: (card: any, rect?: DOMRect) => void
  onCardHover?: (card: any, rect?: DOMRect) => void
  playableIds?: Set<string>
  targetIds?: Set<string>
  helperEmblems?: Record<string, CardView>
}

interface CommandObject {
  id: string
  card: CardView
  isEmblem: boolean
  isCommander: boolean
  isCompanion: boolean
  castCount: number
}

function parseCommandList(
  commandList: unknown[] | Record<string, unknown> | undefined,
  helperCards?: Record<string, CardView>
): CommandObject[] {
  const items: CommandObject[] = []
  const seenIds = new Set<string>()

  const processCard = (card: any, defaultId?: string) => {
    if (!card || typeof card !== 'object') return
    const id = card.id || defaultId || `cmd-${Math.random().toString(36).slice(2, 7)}`
    if (seenIds.has(id)) return
    seenIds.add(id)

    const nameLower = String(card.name ?? '').toLowerCase()
    const displayNameLower = String(card.displayName ?? '').toLowerCase()

    // 1. Filter out XMage internal system helper cards (Day/Night, internal rule trackers)
    const isInternalHelper =
      nameLower.startsWith('helper emblem') ||
      displayNameLower.startsWith('helper emblem') ||
      nameLower === 'helper emblem' ||
      displayNameLower === 'helper emblem' ||
      card.mageObjectType === 'HELPER' ||
      card.mageObjectType === 'HELPER_EMBLEM' ||
      card.isHelperCard === true ||
      (Array.isArray(card.rules) && card.rules.some((r: string) => r.toLowerCase().includes('day or night') && r.toLowerCase().includes('neither day nor night')))

    if (isInternalHelper) {
      return
    }

    // 2. Real Planeswalker Emblems (e.g. "Emblem - Teferi", "Emblem - Chandra")
    const isEmblem =
      card.mageObjectType === 'EMBLEM' ||
      nameLower.startsWith('emblem -') ||
      nameLower.startsWith('emblem:') ||
      nameLower.startsWith('emblem ') ||
      (card.cardTypes && card.cardTypes.some((t: string) => String(t).toLowerCase() === 'emblem'))

    // 3. Companion Cards (e.g. Lurrus, Yorion, Jegantha)
    const isCompanion =
      card.mageObjectType === 'COMPANION' ||
      card.isCompanion === true ||
      (Array.isArray(card.rules) && card.rules.some((r: string) => String(r).toLowerCase().includes('companion')))

    // 4. Commanders (default if in command zone and not emblem or companion)
    const isCommander =
      (!isEmblem && !isCompanion) ||
      card.mageObjectType === 'COMMANDER' ||
      card.isCommander === true

    const castCount = typeof card.castCount === 'number' ? card.castCount : 0

    items.push({
      id,
      card: card as CardView,
      isEmblem,
      isCommander,
      isCompanion,
      castCount,
    })
  }

  // 1. Process player.commandList (Commanders & Companions in command zone)
  if (Array.isArray(commandList)) {
    commandList.forEach((c) => processCard(c))
  } else if (commandList && typeof commandList === 'object') {
    Object.entries(commandList).forEach(([id, c]) => processCard(c, id))
  }

  // 2. Process helperCards (Real player emblems)
  if (helperCards && typeof helperCards === 'object') {
    Object.entries(helperCards).forEach(([id, c]) => processCard(c, id))
  }

  return items
}

export default function CommandZone({
  player,
  side,
  onCardClick,
  onHover,
  onCardHover,
  playableIds = new Set(),
  targetIds = new Set(),
  helperEmblems,
}: CommandZoneProps) {
  const hoverHandler = onHover ?? onCardHover

  const items = useMemo(() => {
    return parseCommandList(player?.commandList, {
      ...(player?.helperCards ?? {}),
      ...(side === 'my' ? (helperEmblems ?? {}) : {}),
    })
  }, [player?.commandList, player?.helperCards, helperEmblems, side])

  if (items.length === 0) {
    return null
  }

  const commanders = items.filter((item) => item.isCommander || item.isCompanion)
  const emblems = items.filter((item) => item.isEmblem)

  return (
    <div className={`command-zone ${side}`}>
      {/* Commanders & Companions */}
      {commanders.map((item) => {
        const isPlayable = playableIds.has(item.id)
        const isTarget = targetIds.has(item.id)
        const tax = item.castCount > 0 ? item.castCount * 2 : 0

        return (
          <div key={item.id} className="commander-card-wrap">
            <CardSlot
              cardId={item.id}
              card={item.card}
              onClick={onCardClick ? () => onCardClick(item.id) : undefined}
              onHover={hoverHandler}
              isPlayable={isPlayable}
              isTarget={isTarget}
              className="commander-slot"
            />
            {/* Commander or Companion Badge */}
            {item.isCompanion ? (
              <div className="companion-badge" title="Compañero (Companion)">
                🦄
              </div>
            ) : (
              <div className="commander-badge" title="Comandante en la Zona de Comando">
                👑
              </div>
            )}
            {/* Commander Tax Badge */}
            {tax > 0 && (
              <div className="commander-tax-badge" title={`Impuesto de Comandante: +{${tax}} (Casteado ${item.castCount} veces)`}>
                +{tax}
              </div>
            )}
          </div>
        )
      })}

      {/* Emblems Stack */}
      {emblems.length > 0 && (
        <div className="emblems-wrap">
          {emblems.map((item, ei) => (
            <CardSlot
              key={item.id}
              cardId={item.id}
              card={item.card}
              onClick={onCardClick ? () => onCardClick(item.id) : undefined}
              onHover={hoverHandler}
              className="emblem-slot"
              style={{
                top: `${ei * 6}px`,
                left: `${ei * 6}px`,
                zIndex: ei + 1,
              }}
            />
          ))}
          <span className="emblems-count-badge" title={`${emblems.length} Emblemas activos`}>
            {emblems.length}
          </span>
        </div>
      )}
    </div>
  )
}
