import type { CardView, GameView, PermanentView, PlayerView } from '../net/types'
import { battlefieldRow, handFanned, opponentBattleZone, type ZoneLayout } from './zones'

export interface Placement {
  id: string
  /** UUID understood by XMage; id can include a visual-zone prefix. */
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

function myPlayer(game: GameView): PlayerView | undefined {
  return game.players?.find((p) => p.controlled)
}

function oppPlayers(game: GameView): PlayerView[] {
  return (game.players ?? []).filter((p) => !p.controlled)
}

export function playableObjectIds(game: GameView): string[] {
  return Object.keys(game.canPlayObjects?.objects ?? {})
}

export function buildPlacements(game: GameView, zones: ZoneLayout): Placement[] {
  const out: Placement[] = []
  const cw = 146 * zones.scale
  const me = myPlayer(game)
  const opps = oppPlayers(game)

  const add = (
    stableId: string,
    card: CardView,
    x: number,
    y: number,
    group: string,
    opts: { rotation?: number; faceDown?: boolean; damage?: number; sourceId?: string } = {},
  ) => {
    const perm = card as PermanentView
    out.push({
      id: stableId || card.parentId || `${group}:${card.name}:${card.expansionSetCode ?? ''}:${card.cardNumber ?? ''}`,
      sourceId: opts.sourceId ?? card.id ?? card.parentId ?? stableId,
      card,
      x,
      y,
      rotation: opts.rotation ?? 0,
      scale: zones.scale,
      faceDown: opts.faceDown ?? false,
      group,
      damage: opts.damage ?? perm.damage ?? 0,
    })
  }

  const battlefield = (p: PlayerView, row: { x: number; y: number }, isMine: boolean) => {
    const perms = Object.entries(p.battlefield ?? {})
    const slots = battlefieldRow(row, perms.length, zones.scale, cw)
    perms.forEach(([cardId, perm], i) => {
      const s = slots[i]
      add(cardId, perm, s.x, s.y, isMine ? 'myBattle' : 'oppBattle', {
        rotation: perm.tapped === true ? (isMine ? Math.PI / 2 : -Math.PI / 2) : 0,
      })
    })
  }

  const piles = (
    p: PlayerView,
    pos: { library: { x: number; y: number }; graveyard: { x: number; y: number }; exile: { x: number; y: number } },
    side: 'my' | 'opp',
    playerIndex = 0,
  ) => {
    add(`${side}${playerIndex}:library`, { name: 'library', expansionSetCode: '', cardNumber: '0' } as CardView, pos.library.x, pos.library.y, `${side}Library`, { faceDown: true })
    const gy = Object.entries(p.graveyard ?? {})
    if (gy.length) add(`${side}${playerIndex}:graveyard:${gy[gy.length - 1][0]}`, gy[gy.length - 1][1], pos.graveyard.x, pos.graveyard.y, `${side}Graveyard`)
    const ex = Object.entries(p.exile ?? {})
    if (ex.length) add(`${side}${playerIndex}:exile:${ex[ex.length - 1][0]}`, ex[ex.length - 1][1], pos.exile.x, pos.exile.y, `${side}Exile`)
  }

  if (me) {
    battlefield(me, zones.myBattle, true)
    piles(me, zones.myPiles, 'my')
  }
  for (const [index, opp] of opps.entries()) {
    const battle = opponentBattleZone(zones, index, opps.length)
    battlefield(opp, battle, false)
    const offset = battle.y - zones.oppBattle.y
    piles(
      opp,
      {
        library: { x: zones.oppPiles.library.x, y: zones.oppPiles.library.y + offset },
        graveyard: { x: zones.oppPiles.graveyard.x, y: zones.oppPiles.graveyard.y + offset },
        exile: { x: zones.oppPiles.exile.x, y: zones.oppPiles.exile.y + offset },
      },
      'opp',
      index,
    )
  }

  const myHandCards = Object.entries(game.myHand ?? {})
  const mySlots = handFanned(zones.myHand, myHandCards.length, zones.scale, zones.w, cw)
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
  const oppSlots = handFanned({ x: zones.w / 2, y: 40 }, oppHandCount, zones.scale, zones.w, cw)
  let hi = 0
  for (const handView of oppHands) {
    for (const simple of Object.values(handView)) {
      const slot = oppSlots[hi++] ?? { x: zones.w / 2, y: 40 }
      const card = { name: '?', expansionSetCode: '', cardNumber: '0', parentId: simple.id, id: simple.id } as unknown as CardView
      add(simple.id, card, slot.x, slot.y, 'oppHand', { faceDown: true })
    }
  }

  const watched = Object.values(game.watchedHands ?? {})
  const watchedCards = watched.flatMap((hand) => Object.values(hand))
  const watchedSlots = handFanned({ x: zones.w / 2, y: Math.max(48, zones.h * 0.25) }, watchedCards.length, zones.scale, zones.w, cw)
  watchedCards.forEach((simple, i) => {
    const card = { name: simple.name ?? '?', expansionSetCode: '', cardNumber: '0', parentId: simple.id, id: simple.id } as unknown as CardView
    const slot = watchedSlots[i] ?? { x: zones.w / 2, y: zones.h * 0.25 }
    add(simple.id, card, slot.x, slot.y, 'watchedHand')
  })

  const stackCards = Object.entries(game.stack ?? {})
  stackCards.forEach(([cardId, card], i) => {
    const off = 10 * zones.scale
    add(cardId, card, zones.stack.x + i * off, zones.stack.y - i * off, 'stack')
  })

  return out
}
