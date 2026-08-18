import type { CardView, GameView, PermanentView, PlayerView } from '../net/types'
import { battlefieldAutoGrid, CARD_H, CARD_W, handFanned, SLOT_PAD, type ZoneLayout } from './zones'

export interface Placement {
  id: string
  sourceId: string
  card: CardView
  x: number
  y: number
  rotation: number
  scale: number
  faceDown: boolean
  group: string
  damage: number
}

export interface ZoneChange {
  cardId: string
  card: CardView
  fromZone: string
  toZone: string
  fromX: number
  fromY: number
  toX: number
  toY: number
}

export interface BuildResult {
  placements: Placement[]
  zoneChanges: ZoneChange[]
}

function myPlayer(game: GameView): PlayerView | undefined {
  return game.players?.find((p) => p.controlled)
}

function oppPlayers(game: GameView): PlayerView[] {
  return (game.players ?? []).filter((p) => !p.controlled)
}

export function playableObjectIds(game: GameView, feedback?: { method?: string }): string[] {
  const myHand = game.myHand ?? {}
  const objects = game.canPlayObjects?.objects ?? {}
  if (feedback?.method === 'GAME_PLAY_MANA') {
    const me = game.players?.find((p) => p.controlled)
    const battlefield = me ? (me.battlefield ?? {}) : {}
    return Object.keys(objects).filter((id) => id in myHand || id in battlefield)
  }
  return Object.keys(objects).filter((id) => id in myHand)
}

export function resolveTargetSourceId(game: GameView, sourceName: string | undefined): string | undefined {
  if (!sourceName) return undefined
  for (const [key, card] of Object.entries(game.stack ?? {})) {
    if (card.name === sourceName) return card.id ?? card.parentId ?? key
  }
  for (const player of game.players ?? []) {
    for (const [permId, perm] of Object.entries(player.battlefield ?? {})) {
      if (perm.name === sourceName) return perm.id ?? perm.parentId ?? permId
    }
  }
  return undefined
}

function buildPlacementsInternal(game: GameView, zones: ZoneLayout): Placement[] {
  const out: Placement[] = []
  const me = myPlayer(game)
  const opps = oppPlayers(game)

  const add = (
    stableId: string,
    card: CardView,
    x: number,
    y: number,
    group: string,
    opts: { rotation?: number; faceDown?: boolean; damage?: number; sourceId?: string; scale?: number } = {},
  ) => {
    const perm = card as PermanentView
    out.push({
      id: stableId || card.parentId || `${group}:${card.name}:${card.expansionSetCode ?? ''}:${card.cardNumber ?? ''}`,
      sourceId: opts.sourceId ?? card.id ?? card.parentId ?? stableId,
      card,
      x,
      y,
      rotation: opts.rotation ?? 0,
      scale: opts.scale ?? zones.scale,
      faceDown: opts.faceDown ?? false,
      group,
      damage: opts.damage ?? perm.damage ?? 0,
    })
  }

  const battlefield = (p: PlayerView, centerCY: number, isMine: boolean) => {
    const perms = Object.entries(p.battlefield ?? {})
    const slots = battlefieldAutoGrid(centerCY, perms.length, zones)
    perms.forEach(([cardId, perm], i) => {
      const s = slots[i]
      add(cardId, perm, s.x, s.y, isMine ? 'myBattle' : 'oppBattle', {
        rotation: perm.tapped === true ? (isMine ? Math.PI / 2 : -Math.PI / 2) : 0,
      })
    })
  }

  if (me) {
    battlefield(me, zones.myBattleCenterY, true)
  }

  const oppsCount = opps.length
  for (const [index, opp] of opps.entries()) {
    // For spectators with 2+ opponents: stack opponent battlefields vertically
    let oppCenterY: number
    if (isSpectator(game) && oppsCount >= 2) {
      const spacing = CARD_H * zones.scale + SLOT_PAD
      oppCenterY = zones.oppZone.top + 0.45 * (zones.oppZone.bottom - zones.oppZone.top) + index * spacing
    } else {
      oppCenterY = zones.oppBattleCenterY
    }
    battlefield(opp, oppCenterY, false)
  }

  const myHandCards = Object.entries(game.myHand ?? {})
  const mySlots = handFanned(zones.myHand, myHandCards.length, zones.scale)
  myHandCards.forEach(([cardId, card], i) => add(
    `myHand:${cardId}`,
    card,
    mySlots[i]?.x ?? zones.myHand.x,
    mySlots[i]?.y ?? zones.myHand.y,
    'myHand',
    { sourceId: cardId },
  ))

  const oppHands = Object.values(game.opponentHands ?? {})
  const oppHandCount = oppHands.reduce((acc, h) => acc + Object.keys(h).length, 0)
  const oppSlots = handFanned(zones.oppHand, oppHandCount, zones.scale)
  let hi = 0
  for (const handView of oppHands) {
    for (const simple of Object.values(handView)) {
      const slot = oppSlots[hi++] ?? zones.oppHand
      const card = { name: '?', expansionSetCode: '', cardNumber: '0', parentId: simple.id, id: simple.id } as unknown as CardView
      add(simple.id, card, slot.x, slot.y, 'oppHand', { faceDown: true })
    }
  }

  // Watched hands (for spectators)
  const watched = Object.values(game.watchedHands ?? {})
  const watchedCards = watched.flatMap((hand) => Object.values(hand))
  if (watchedCards.length > 0 && isSpectator(game)) {
    const watchedY = zones.oppHandY - 30 // above opponent hand
    const watchedSlots = handFanned({ x: zones.worldW / 2, y: watchedY }, watchedCards.length, zones.scale)
    watchedCards.forEach((simple, i) => {
      const card = { name: simple.name ?? '?', expansionSetCode: '', cardNumber: '0', parentId: simple.id, id: simple.id } as unknown as CardView
      const slot = watchedSlots[i] ?? { x: zones.worldW / 2, y: watchedY }
      add(simple.id, card, slot.x, slot.y, 'watchedHand')
    })
  }

  // Stack — horizontal layout centered between zones
  const stackCards = Object.entries(game.stack ?? {})
  if (stackCards.length > 0) {
    const stackCenter = zones.stackZone.y + zones.stackZone.height / 2
    const stackStartX = zones.w / 2 - ((stackCards.length - 1) * (CARD_W * zones.scale + 20)) / 2
    stackCards.forEach(([cardId, card], i) => {
      const off = 6 * zones.scale // vertical overlap
      add(cardId, card, stackStartX + i * (CARD_W * zones.scale + 20), stackCenter - off * i, 'stack')
    })
  }

  return out
}

function isSpectator(game: GameView): boolean {
  return !game.players?.some((p) => p.controlled)
}

function buildPlacementMap(game: GameView, zones: ZoneLayout): Map<string, Placement> {
  const result = buildPlacementsInternal(game, zones)
  const map = new Map<string, Placement>()
  for (const p of result) {
    if (!map.has(p.sourceId)) map.set(p.sourceId, p)
  }
  return map
}

export function buildPlacements(game: GameView, zones: ZoneLayout, previousGame?: GameView | null): BuildResult {
  const placements = buildPlacementsInternal(game, zones)
  const zoneChanges: ZoneChange[] = []

  if (previousGame) {
    const oldMap = buildPlacementMap(previousGame, zones)
    const newMap = buildPlacementMap(game, zones)
    for (const [sourceId, newP] of newMap) {
      const oldP = oldMap.get(sourceId)
      if (oldP && oldP.group !== newP.group) {
        zoneChanges.push({
          cardId: newP.sourceId,
          card: newP.card,
          fromZone: oldP.group,
          toZone: newP.group,
          fromX: oldP.x,
          fromY: oldP.y,
          toX: newP.x,
          toY: newP.y,
        })
      }
    }
  }

  return { placements, zoneChanges }
}
