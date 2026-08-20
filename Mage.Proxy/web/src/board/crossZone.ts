import type { CardView, GameView, PlayerView } from '../net/types'

/** Carta jugable desde una zona distinta de la mano (cementerio, exilio,
 *  biblioteca, otro), resuelta a partir de `game.canPlayObjects` de la vista
 *  autoritativa del servidor. `value` es el `PlayableObjectRecord.value` del
 *  bucket, usado como fallback cuando ninguna zona trae la metadata de la carta. */
export interface CrossZonePlayable {
  id: string
  card: CardView
  value: string
  /** Zona de origen (para el hint del overlay): 'graveyard' | 'exile' | ... */
  zone: string
}

const PLAYABLE_BUCKETS = ['basicCastAbilities', 'basicPlayAbilities', 'other'] as const

/** Recupera una CardView de cualquier vista disponible del juego por id,
 *  en orden de prioridad, devolviendo además la zona de origen. */
function lookupCard(game: GameView, me: PlayerView | undefined, id: string): { card: CardView; zone: string } | null {
  const inView = (view: Record<string, CardView> | null | undefined, zone: string): { card: CardView; zone: string } | null => {
    const card = view?.[id]
    return card ? { card, zone } : null
  }

  if (me) {
    const found = inView(me.graveyard, 'graveyard') ?? inView(me.exile, 'exile') ?? inView(me.sideboard, 'sideboard') ?? inView(me.helperCards, 'helper')
    if (found) return found
    if (me.topCard) {
      const top = me.topCard
      const topId = top.parentId ?? top.id
      if ((topId ?? top.name) === id) return { card: top, zone: 'library' }
    }
    for (const perm of Object.values(me.battlefield ?? {})) {
      if ((perm.parentId ?? perm.id ?? perm.name) === id) return { card: perm, zone: 'battlefield' }
    }
  }

  for (const exile of game.exiles ?? []) {
    const found = inView(exile.cards, `exile:${exile.name}`)
    if (found) return found
  }

  const inStack = inView(game.stack, 'stack')
  if (inStack) return inStack

  for (const revealed of game.revealed ?? []) {
    const found = inView(revealed.cards, `revealed:${revealed.name}`)
    if (found) return found
  }

  return null
}

/** Devuelve las cartas jugables que NO están en la mano ni en el battlefield del
 *  jugador controlado (los "ray" cross-zone de XMage: lanzar desde cementerio,
 *  exilio, biblioteca, etc.). Derivado de `canPlayObjects` — la fuente
 *  autoritativa del servidor — filtrando los buckets de jugadas cruzadas.
 *  El pago de maná (`basicManaAbilities`) queda fuera: es una afordance del
 *  tablero, no un lanzamiento. */
export function crossZonePlayables(game: GameView | null, feedback?: { method?: string }): CrossZonePlayable[] {
  if (!game) return []
  const me = game.players?.find((p) => p.controlled)
  if (!me) return []
  const objects = game.canPlayObjects?.objects
  if (!objects) return []

  const myHand = game.myHand ?? {}
  const battlefield = me.battlefield ?? {}
  const out: CrossZonePlayable[] = []
  const seen = new Set<string>()

  for (const [id, stats] of Object.entries(objects)) {
    if (!id) continue
    if (id in myHand) continue
    if (id in battlefield && feedback?.method !== 'GAME_PLAY_MANA') continue
    if (seen.has(id)) continue

    let matched = false
    for (const bucket of PLAYABLE_BUCKETS) {
      for (const record of stats[bucket] ?? []) {
        if (record.id === id || record.id == null) {
          matched = true
          break
        }
      }
      if (matched) break
    }
    if (!matched) continue

    seen.add(id)
    const resolved = lookupCard(game, me, id)
    const value = firstValue(stats, id)
    const card: CardView =
      resolved?.card ?? { name: value || id, manaValue: 0, expansionSetCode: '', cardNumber: '0', parentId: id, id }
    out.push({ id, card, value: value || resolved?.card.name || id, zone: resolved?.zone ?? 'other' })
  }

  return out
}

/** Cuenta cartas jugables por zona (graveyard, exile). */
export function crossZoneCounts(playables: CrossZonePlayable[]): { graveyard: number; exile: number } {
  let graveyard = 0
  let exile = 0
  for (const p of playables) {
    if (p.zone === 'graveyard') graveyard++
    else if (p.zone === 'exile' || p.zone.startsWith('exile:')) exile++
  }
  return { graveyard, exile }
}

function firstValue(stats: { basicCastAbilities?: { id?: string; value: string }[]; basicPlayAbilities?: { id?: string; value: string }[]; other?: { id?: string; value: string }[] }, id: string): string {
  for (const bucket of PLAYABLE_BUCKETS) {
    for (const record of stats[bucket] ?? []) {
      if (record.id === id || record.id == null) return record.value ?? ''
    }
  }
  return ''
}
