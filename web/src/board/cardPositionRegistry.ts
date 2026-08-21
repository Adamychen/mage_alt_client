interface PositionRecord {
  rect: DOMRect
  timestamp: number
  zone: string
}

const registry = new Map<string, PositionRecord>()
const EXPIRATION_MS = 4000

export function recordCardPosition(id: string, rect: DOMRect, zone = '') {
  if (!id || rect.width <= 0 || rect.height <= 0) return
  registry.set(id, {
    rect,
    timestamp: Date.now(),
    zone,
  })
}

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

export function getPreviousCardZone(id: string): string {
  if (!id) return ''
  const record = registry.get(id)
  if (!record) return ''
  if (Date.now() - record.timestamp > EXPIRATION_MS) {
    registry.delete(id)
    return ''
  }
  return record.zone
}

export function getFallbackSourceRect(element: HTMLElement): DOMRect | null {
  const isHand = !!element.closest('.hand-zone')
  const isStack = !!element.closest('.stack-zone')
  const isPlayerZone = !!element.closest('.player-zone')
  const isOppZone = !!element.closest('.opponent-zone')

  const root = element.closest('.game-board') || document.body

  if (isHand) {
    const lib = isOppZone
      ? root.querySelector('.opp-top-row .library-stack')
      : root.querySelector('.pz-bottom-row .library-stack')
    if (lib) return lib.getBoundingClientRect()
  } else if (isStack) {
    const hand = isOppZone
      ? root.querySelector('.opp-zone .hand-zone')
      : root.querySelector('.pz-bottom-row .hand-zone')
    if (hand) return hand.getBoundingClientRect()
  } else if (isPlayerZone || isOppZone) {
    const stack = root.querySelector('.stack-zone')
    if (stack) return stack.getBoundingClientRect()
    const hand = isOppZone
      ? root.querySelector('.opp-zone .hand-zone')
      : root.querySelector('.pz-bottom-row .hand-zone')
    if (hand) return hand.getBoundingClientRect()
  }

  return null
}
