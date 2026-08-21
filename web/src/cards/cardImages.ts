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

export function isAbilityCard(card: CardView): boolean {
  const t = card.mageObjectType ?? ''
  return t.includes('Ability') || t.includes('ABILITY')
}

export function isTokenCard(card: CardView): boolean {
  return card.isToken === true || card.mageObjectType === 'TOKEN'
}

export function getSourceCard(card: CardView): CardView | null {
  return card.sourceCard || card.ability || null
}

export function getSourceCardName(card: CardView): string {
  const src = card.sourceCard || card.ability
  if (src && src.name && !/^ability$/i.test(src.name)) {
    return src.displayName || src.name
  }
  if (card.displayName && !/^ability$/i.test(card.displayName)) {
    return card.displayName
  }
  if (card.name && !/^ability$/i.test(card.name)) {
    return card.name
  }
  const rules = card.rules ?? []
  for (const rule of rules) {
    if (!rule) continue
    const emDash = /^([A-Z0-9][A-Za-z0-9,'.\s/-]+?)\s+[—–-]\s+/.exec(rule)
    if (emDash && emDash[1].length < 40 && !/^(?:Target|Choose|Each|You|Tap|Sacrifice)/i.test(emDash[1])) {
      return emDash[1].trim()
    }
    const trigger = /^(?:When|Whenever|At the beginning of [^,]+,|As|If)\s+(.+?)\s+(?:enters(?: the battlefield)?|attacks|blocks|deals|dies|leaves(?: the battlefield)?|becomes|transforms|is put into|is dealt)/i.exec(rule)
    if (trigger && trigger[1].length < 45 && !/^(?:a|an|the|target|another|each|all|any)\s+/i.test(trigger[1])) {
      return trigger[1].trim()
    }
    const action = /^([A-Z][A-Za-z0-9,'.\s/-]+?)\s+(?:deals|gets|has|can't|enters|fights)\s+/i.exec(rule)
    if (action && action[1].length < 45 && !/^(?:This spell|This creature|Target|Each|You)\b/i.test(action[1])) {
      return action[1].trim()
    }
  }
  return 'Habilidad'
}

export function cardKey(card: CardView): string | null {
  if (card.faceDown === true) return null
  const isAbility = isAbilityCard(card)
  if (isAbility) {
    const src = card.sourceCard || card.ability
    if (src) {
      const srcKey = cardKey(src)
      if (srcKey) return srcKey
    }
    const sourceName = getSourceCardName(card)
    if (sourceName && !/^habilidad$/i.test(sourceName) && !/^ability$/i.test(sourceName)) {
      return `named:${sourceName}`
    }
    return null
  }

  const set = card.expansionSetCode
  const num = card.cardNumber
  const isToken = isTokenCard(card)

  // Cards with a real card number (including copy tokens that inherited the original's number)
  if (set && num && num !== '0') {
    return `${set}/${num}`
  }

  // Token with cardNumber=0 — resolve via Scryfall token sets (t-prefixed)
  if (isToken) {
    if (!set || set === 'XMAGE') return null
    const name = card.displayName || card.name || ''
    if (!name) return null
    const tokenSet = 't' + set.toLowerCase()
    // Strip " Token" suffix for Scryfall lookup (e.g. "Goblin Token" → "goblin")
    const stripped = name.replace(/\s+Token$/i, '')
    const slug = stripped.replace(/\s+/g, '-').toLowerCase()
    return `${tokenSet}/${slug}`
  }

  // Card with only a name (e.g. from game log feed or action history)
  const name = card.displayName || card.name
  if (name && name.trim()) {
    return `named:${name.trim()}`
  }

  return null
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

/** Build a Scryfall key for a token card. */
export function tokenScryfallKey(setCode: string, name: string): string | null {
  if (!setCode || !name) return null
  const tokenSet = 't' + setCode.toLowerCase()
  const slug = name.replace(/\s+/g, '-').toLowerCase()
  return `${tokenSet}/${slug}`
}

async function load(key: string): Promise<string | null> {
  await acquireLoadSlot()
  try {
    return await tryFetch(key)
  } finally {
    releaseLoadSlot()
  }
}

function candidateUrls(key: string): string[] {
  if (key.startsWith('named:')) {
    const name = key.slice(6)
    return [
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
    ]
  }

  if (key.startsWith('token:')) {
    const rawName = key.slice(6)
    const clean = rawName.replace(/\s+Token$/i, '')
    return [
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(clean + ' Token')}`,
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(clean)}`,
      `https://api.scryfall.com/cards/search?q=t:token+name:%22${encodeURIComponent(clean)}%22`,
    ]
  }

  // Token key format like "tgrn/goblin" or "txln/treasure"
  const tokenMatch = /^t([a-z0-9]+)\/([a-z0-9-]+)$/i.exec(key)
  if (tokenMatch) {
    const [, tokenSet, slug] = tokenMatch
    const cleanName = slug.replace(/-/g, ' ')
    return [
      `https://api.scryfall.com/cards/${key}?format=json`,
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanName + ' Token')}&set=t${tokenSet.toLowerCase()}`,
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanName)}&set=t${tokenSet.toLowerCase()}`,
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanName + ' Token')}`,
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanName)}`,
    ]
  }

  // Standard set/number like "LEA/299"
  return [`https://api.scryfall.com/cards/${key}?format=json`]
}

async function tryFetch(key: string): Promise<string | null> {
  const urls = candidateUrls(key)
  for (const url of urls) {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) {
          // 404 is not fatal for fallback candidate URLs; continue to next URL
          if (res.status === 404) break
          throw new Error(`Scryfall HTTP ${res.status}`)
        }
        const data = (await res.json()) as {
          data?: { image_uris?: { normal?: string; small?: string } }[]
          image_uris?: { normal?: string; small?: string }
          card_faces?: { image_uris?: { normal?: string; small?: string } }[]
          name?: string
          type_line?: string
          mana_cost?: string
          power?: string
          toughness?: string
        }
        const searchFirst = data.data?.[0]
        const imageUrl =
          data.image_uris?.normal ??
          data.image_uris?.small ??
          data.card_faces?.[0]?.image_uris?.normal ??
          data.card_faces?.[0]?.image_uris?.small ??
          searchFirst?.image_uris?.normal ??
          searchFirst?.image_uris?.small ??
          null

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
        if (attempt === RETRIES) break
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
      } finally {
        clearTimeout(timeout)
      }
    }
  }
  return null
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
  if (isAbilityCard(card)) {
    return getSourceCardName(card)
  }
  return card.displayName || card.name || card.alternateName || '?'
}
