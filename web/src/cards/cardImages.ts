import type { CardView } from '../net/types'

const memory = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()
const MAX_MEMORY_ENTRIES = 2000
const MAX_CONCURRENT_LOADS = 6
const REQUEST_TIMEOUT_MS = 10000
const RETRIES = 1
let activeLoads = 0
const loadQueue: (() => void)[] = []

export const CARD_W = 120
export const CARD_H = 168

/** Card metadata resolved from Scryfall (name, type, mana cost, etc.). */
export interface ScryfallCardInfo {
  name: string
  typeLine: string
  manaCost: string
  power?: string
  toughness?: string
  imageUrl: string | null
}

const metaMemory = new Map<string, ScryfallCardInfo>()
const metaInflight = new Map<string, Promise<ScryfallCardInfo | null>>()

export function cardKey(card: CardView): string | null {
  const set = card.expansionSetCode
  const num = card.cardNumber
  if (!set || !num || num === '0') return null
  return `${set}/${num}`
}

export function cardFaceDown(card: CardView): boolean {
  return card.faceDown === true
}

/**
 * URL de imagen de carta vía Scryfall (normal). null si la carta no es
 * representable (boca abajo, token sin número, etc.). Con caché en memoria
 * y deduplicación de peticiones concurrentes.
 */
export function getCardImageUrl(card: CardView): string | null {
  const key = cardKey(card)
  if (!key) return null
  if (memory.has(key)) return memory.get(key) ?? null
  void awaitImageUrl(card)
  return null
}

function scryfallKey(setCode: string, cardNumber: string): string | null {
  if (!setCode || !cardNumber || cardNumber === '0') return null
  return `${setCode}/${cardNumber}`
}

async function load(key: string): Promise<string | null> {
  await acquireLoadSlot()
  try {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const res = await fetch(`https://api.scryfall.com/cards/${key}?format=json`, { signal: controller.signal })
        if (!res.ok) throw new Error(`Scryfall HTTP ${res.status}`)
        const data = (await res.json()) as {
          image_uris?: { normal?: string }
          card_faces?: { image_uris?: { normal?: string } }[]
          name?: string
          type_line?: string
          mana_cost?: string
          power?: string
          toughness?: string
        }
        const imageUrl = data.image_uris?.normal ?? data.card_faces?.[0]?.image_uris?.normal ?? null
        const info: ScryfallCardInfo = {
          name: data.name ?? key,
          typeLine: data.type_line ?? '',
          manaCost: data.mana_cost ?? '',
          power: data.power,
          toughness: data.toughness,
          imageUrl,
        }
        metaMemory.set(key, info)
        return imageUrl
      } catch {
        if (attempt === RETRIES) return null
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
      } finally {
        clearTimeout(timeout)
      }
    }
    return null
  } finally {
    releaseLoadSlot()
  }
}

export async function awaitImageUrl(card: CardView): Promise<string | null> {
  const key = cardKey(card)
  if (!key) return null
  const cached = memory.get(key)
  if (cached !== undefined) return cached
  const current = inflight.get(key)
  if (current) return current
  const p = load(key)
    .catch(() => null)
    .then((url) => {
      remember(key, url)
      return url
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key)
    })
  inflight.set(key, p)
  return p
}

/**
 * Resolve card metadata (name, type, etc.) from Scryfall by setCode+cardNumber.
 * Triggers an async fetch if not cached. Returns null if not yet loaded.
 */
export function getCardMeta(setCode: string, cardNumber: string): ScryfallCardInfo | null {
  const key = scryfallKey(setCode, cardNumber)
  if (!key) return null
  if (metaMemory.has(key)) return metaMemory.get(key) ?? null
  if (!metaInflight.has(key)) {
    const p = load(key)
      .catch(() => null)
      .then((info) => {
        if (metaInflight.get(key) === p) metaInflight.delete(key)
        return info ? metaMemory.get(key) ?? null : null
      })
    metaInflight.set(key, p as Promise<ScryfallCardInfo | null>)
  }
  return null
}

/**
 * Async version: waits for the metadata to be resolved.
 */
export async function awaitCardMeta(setCode: string, cardNumber: string): Promise<ScryfallCardInfo | null> {
  const key = scryfallKey(setCode, cardNumber)
  if (!key) return null
  const cached = metaMemory.get(key)
  if (cached) return cached
  if (metaInflight.has(key)) return metaInflight.get(key)!
  // Trigger the load
  await load(key)
  return metaMemory.get(key) ?? null
}

function remember(key: string, url: string | null) {
  if (url === null) {
    memory.delete(key)
    return
  }
  memory.delete(key)
  memory.set(key, url)
  while (memory.size > MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value as string | undefined
    if (!oldest) break
    memory.delete(oldest)
  }
}

async function acquireLoadSlot() {
  if (activeLoads < MAX_CONCURRENT_LOADS) {
    activeLoads++
    return
  }
  await new Promise<void>((resolve) => loadQueue.push(resolve))
  activeLoads++
}

function releaseLoadSlot() {
  activeLoads = Math.max(0, activeLoads - 1)
  loadQueue.shift()?.()
}

/** Solo para tests y para limpiar el estado al desmontar una sesión local. */
export function resetCardImageCache() {
  memory.clear()
  inflight.clear()
  metaMemory.clear()
  metaInflight.clear()
  loadQueue.length = 0
  activeLoads = 0
}

export function manaLand(card: CardView): string {
  return (card.manaCostLeftStr ?? []).join('')
}

export function cardName(card: CardView): string {
  return card.displayName || card.name || card.alternateName || '?'
}
