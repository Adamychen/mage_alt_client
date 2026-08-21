interface PositionRecord {
  rect: DOMRect
  timestamp: number
}

const registry = new Map<string, PositionRecord>()
const EXPIRATION_MS = 4000

/**
 * Memorizes a card's screen position when it unmounts or moves
 */
export function recordCardPosition(id: string, rect: DOMRect) {
  if (!id || rect.width <= 0 || rect.height <= 0) return
  registry.set(id, {
    rect,
    timestamp: Date.now(),
  })
}

/**
 * Retrieves the last known screen position of a card
 */
export function getPreviousCardPosition(id: string): DOMRect | null {
  if (!id) return null
  const record = registry.get(id)
  if (!record) return null
  if (Date.now() - record.timestamp > EXPIRATION_MS) {
    registry.delete(id)
    return null
  }
  return record.rect
}

/**
 * Finds a natural fallback source rect based on the card's current container
 */
export function getFallbackSourceRect(element: HTMLElement): DOMRect | null {
  const isHand = !!element.closest('.hand-zone')
  const isStack = !!element.closest('.stack-zone')
  const isPlayerZone = !!element.closest('.player-zone')
  const isOppZone = !!element.closest('.opponent-zone')

  const root = element.closest('.game-board') || document.body

  if (isHand) {
    // Draw: came from library
    const lib = isOppZone
      ? root.querySelector('.opp-top-row .library-stack')
      : root.querySelector('.pz-bottom-row .library-stack')
    if (lib) return lib.getBoundingClientRect()
  } else if (isStack) {
    // Cast: came from hand
    const hand = isOppZone
      ? root.querySelector('.opp-zone .hand-zone')
      : root.querySelector('.pz-bottom-row .hand-zone')
    if (hand) return hand.getBoundingClientRect()
  } else if (isPlayerZone || isOppZone) {
    // Permanent enter: came from stack or hand
    const stack = root.querySelector('.stack-zone')
    if (stack) return stack.getBoundingClientRect()
    const hand = isOppZone
      ? root.querySelector('.opp-zone .hand-zone')
      : root.querySelector('.pz-bottom-row .hand-zone')
    if (hand) return hand.getBoundingClientRect()
  }

  return null
}
