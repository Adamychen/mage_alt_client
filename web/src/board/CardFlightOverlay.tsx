import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CardView, GameView, PermanentView } from '../net/types'
import { awaitImageUrl, cardName } from '../cards/cardImages'
import './CardFlightOverlay.css'

const CARD_BACK_URL = 'https://cards.scryfall.io/back.png'
const FLIGHT_DURATION_MS = 380

export interface CardFlightItem {
  id: string
  card: CardView | PermanentView
  type: 'draw' | 'cast' | 'play' | 'resolve' | 'graveyard' | 'exile'
  faceDown?: boolean
  startX: number
  startY: number
  startW: number
  startH: number
  endX: number
  endY: number
  endW: number
  endH: number
}

interface CardFlightOverlayProps {
  game: GameView | null
  boardRef: React.RefObject<HTMLDivElement | null>
}

interface Rect2D {
  x: number
  y: number
  w: number
  h: number
}

function getRelRect(domRect: DOMRect, boardRect: DOMRect): Rect2D {
  return {
    x: domRect.left - boardRect.left,
    y: domRect.top - boardRect.top,
    w: domRect.width,
    h: domRect.height,
  }
}

export default function CardFlightOverlay({ game, boardRef }: CardFlightOverlayProps) {
  const prevGameRef = useRef<GameView | null>(null)
  const cardRectsRef = useRef<Map<string, Rect2D>>(new Map())
  const lastStackCenterRef = useRef<Rect2D | null>(null)
  const [flights, setFlights] = useState<CardFlightItem[]>([])
  const isInitialRef = useRef(true)

  // Continuously record card and zone bounding rectangles before DOM updates
  useLayoutEffect(() => {
    if (!boardRef.current) return
    const boardEl = boardRef.current
    const boardRect = boardEl.getBoundingClientRect()
    if (boardRect.width <= 0 || boardRect.height <= 0) return

    const rectMap = new Map<string, Rect2D>()

    // Record every card slot with an id
    const cardEls = boardEl.querySelectorAll<HTMLElement>('[data-card-id]')
    cardEls.forEach((el) => {
      const id = el.getAttribute('data-card-id')
      if (id) {
        rectMap.set(id, getRelRect(el.getBoundingClientRect(), boardRect))
      }
    })

    // Record key board zones
    const stackEl = boardEl.querySelector('.stack-zone')
    if (stackEl) {
      const stackRect = getRelRect(stackEl.getBoundingClientRect(), boardRect)
      rectMap.set('stack', stackRect)
      lastStackCenterRef.current = stackRect
    }

    const myLib = boardEl.querySelector('.pz-bottom-row .library-stack')
    if (myLib) rectMap.set('my-library', getRelRect(myLib.getBoundingClientRect(), boardRect))

    const myGrave = boardEl.querySelector('.pz-bottom-row .graveyard-stack')
    if (myGrave) rectMap.set('my-graveyard', getRelRect(myGrave.getBoundingClientRect(), boardRect))

    const oppLib = boardEl.querySelector('.opp-top-row .library-stack')
    if (oppLib) rectMap.set('opp-library', getRelRect(oppLib.getBoundingClientRect(), boardRect))

    const oppGrave = boardEl.querySelector('.opp-top-row .graveyard-stack')
    if (oppGrave) rectMap.set('opp-graveyard', getRelRect(oppGrave.getBoundingClientRect(), boardRect))

    const myHand = boardEl.querySelector('.pz-bottom-row .hand-zone')
    if (myHand) rectMap.set('my-hand', getRelRect(myHand.getBoundingClientRect(), boardRect))

    const oppHand = boardEl.querySelector('.opp-zone .hand-zone')
    if (oppHand) rectMap.set('opp-hand', getRelRect(oppHand.getBoundingClientRect(), boardRect))

    cardRectsRef.current = rectMap
  })

  useEffect(() => {
    if (!game || !boardRef.current) return

    const prevGame = prevGameRef.current
    prevGameRef.current = game

    if (isInitialRef.current || !prevGame) {
      isInitialRef.current = false
      return
    }

    const boardEl = boardRef.current
    const boardRect = boardEl.getBoundingClientRect()
    if (boardRect.width <= 0 || boardRect.height <= 0) return

    const rectMap = cardRectsRef.current
    const newFlights: CardFlightItem[] = []
    const now = Date.now()

    const prevMe = prevGame.players?.find((p) => p.controlled)
    const opp = game.players?.find((p) => !p.controlled)
    const prevOpp = prevGame.players?.find((p) => !p.controlled)

    const myHand = game.myHand ?? {}
    const prevMyHand = prevGame.myHand ?? {}

    const currStack = game.stack ?? {}
    const prevStack = prevGame.stack ?? {}

    // Default fallback rects
    const defaultStackRect: Rect2D = lastStackCenterRef.current || {
      x: boardRect.width / 2 - 45,
      y: boardRect.height / 2 - 63,
      w: 90,
      h: 126,
    }
    const defaultMyLib: Rect2D = rectMap.get('my-library') || {
      x: boardRect.width - 120,
      y: boardRect.height - 80,
      w: 50,
      h: 70,
    }
    const defaultOppLib: Rect2D = rectMap.get('opp-library') || {
      x: boardRect.width - 120,
      y: 40,
      w: 50,
      h: 70,
    }
    const defaultMyGrave: Rect2D = rectMap.get('my-graveyard') || {
      x: boardRect.width - 60,
      y: boardRect.height - 80,
      w: 50,
      h: 70,
    }
    const defaultOppGrave: Rect2D = rectMap.get('opp-graveyard') || {
      x: boardRect.width - 60,
      y: 40,
      w: 50,
      h: 70,
    }

    // 1. DRAW: Player hand cards newly added
    for (const [id, card] of Object.entries(myHand)) {
      if (!prevMyHand[id] && !prevStack[id] && !prevMe?.battlefield?.[id]) {
        const start = defaultMyLib
        const targetEl = boardEl.querySelector(`[data-card-id="${id}"]`)
        const end = targetEl ? getRelRect(targetEl.getBoundingClientRect(), boardRect) : (rectMap.get('my-hand') || { x: boardRect.width / 2, y: boardRect.height - 120, w: 80, h: 112 })

        newFlights.push({
          id: `draw-${id}-${now}`,
          card: card as CardView,
          type: 'draw',
          startX: start.x,
          startY: start.y,
          startW: start.w,
          startH: start.h,
          endX: end.x,
          endY: end.y,
          endW: end.w,
          endH: end.h,
        })
      }
    }

    // 2. DRAW: Opponent drawn cards
    if (opp && prevOpp && (opp.libraryCount ?? 0) < (prevOpp.libraryCount ?? 0)) {
      const start = defaultOppLib
      const end = rectMap.get('opp-hand') || { x: boardRect.width / 2, y: 40, w: 70, h: 98 }

      newFlights.push({
        id: `opp-draw-${now}`,
        card: { name: 'Card', manaValue: 0, expansionSetCode: '', cardNumber: '0' } as CardView,
        type: 'draw',
        faceDown: true,
        startX: start.x,
        startY: start.y,
        startW: start.w,
        startH: start.h,
        endX: end.x,
        endY: end.y,
        endW: end.w,
        endH: end.h,
      })
    }

    // 3. CAST: Spells newly appearing on the stack
    for (const [id, spell] of Object.entries(currStack)) {
      if (!prevStack[id]) {
        const wasInMyHand = !!prevMyHand[id]
        const start = rectMap.get(id) || (wasInMyHand ? (rectMap.get('my-hand') || { x: boardRect.width / 2, y: boardRect.height - 120, w: 80, h: 112 }) : (rectMap.get('opp-hand') || { x: boardRect.width / 2, y: 60, w: 70, h: 98 }))
        const stackCardEl = boardEl.querySelector(`[data-card-id="${id}"]`)
        const end = stackCardEl ? getRelRect(stackCardEl.getBoundingClientRect(), boardRect) : defaultStackRect

        newFlights.push({
          id: `cast-${id}-${now}`,
          card: spell as CardView,
          type: 'cast',
          startX: start.x,
          startY: start.y,
          startW: start.w,
          startH: start.h,
          endX: end.x,
          endY: end.y,
          endW: end.w,
          endH: end.h,
        })
      }
    }

    // 4. RESOLVE / PLAY: Permanents entering battlefield
    for (const p of game.players ?? []) {
      const currBf = p.battlefield ?? {}
      const prevP = prevGame.players?.find((x) => x.playerId === p.playerId)
      const prevBf = prevP?.battlefield ?? {}

      for (const [id, perm] of Object.entries(currBf)) {
        if (!prevBf[id]) {
          const wasInStack = !!prevStack[id]
          const start = rectMap.get(id) || (wasInStack ? defaultStackRect : (p.controlled ? (rectMap.get('my-hand') || { x: boardRect.width / 2, y: boardRect.height - 120, w: 80, h: 112 }) : (rectMap.get('opp-hand') || { x: boardRect.width / 2, y: 60, w: 70, h: 98 })))
          const permEl = boardEl.querySelector(`[data-card-id="${id}"]`)

          if (permEl) {
            const end = getRelRect(permEl.getBoundingClientRect(), boardRect)
            newFlights.push({
              id: `play-${id}-${now}`,
              card: perm as PermanentView,
              type: wasInStack ? 'resolve' : 'play',
              startX: start.x,
              startY: start.y,
              startW: start.w,
              startH: start.h,
              endX: end.x,
              endY: end.y,
              endW: end.w,
              endH: end.h,
            })
          }
        }
      }
    }

    // 5. STACK RESOLUTION TO GRAVEYARD: Spells leaving stack into graveyard
    for (const [id, prevSpell] of Object.entries(prevStack)) {
      if (!currStack[id]) {
        // Spell was on stack and is no longer on stack
        // Check if it didn't enter battlefield (e.g. Instant / Sorcery / counterspell / destroyed)
        const isNowOnBf = (game.players ?? []).some((p) => p.battlefield?.[id])
        if (!isNowOnBf) {
          const start = rectMap.get(id) || defaultStackRect
          // Determine target graveyard (controller of spell or active player)
          const isMySpell = (prevSpell as any).controlled || !!prevMyHand[id]
          const end = isMySpell ? defaultMyGrave : defaultOppGrave

          newFlights.push({
            id: `stack-resolve-grave-${id}-${now}`,
            card: prevSpell as CardView,
            type: 'graveyard',
            startX: start.x,
            startY: start.y,
            startW: start.w,
            startH: start.h,
            endX: end.x,
            endY: end.y,
            endW: end.w,
            endH: end.h,
          })
        }
      }
    }

    // 6. BATTLEFIELD TO GRAVEYARD: Dying creatures / destroyed permanents
    for (const p of game.players ?? []) {
      const prevP = prevGame.players?.find((x) => x.playerId === p.playerId)
      const prevBf = prevP?.battlefield ?? {}
      const currBf = p.battlefield ?? {}

      for (const [id, prevPerm] of Object.entries(prevBf)) {
        if (!currBf[id] && !currStack[id]) {
          const isNowInGrave = !!p.graveyard?.[id]
          if (isNowInGrave) {
            const start = rectMap.get(id) || { x: boardRect.width / 2, y: p.controlled ? boardRect.height / 2 + 50 : boardRect.height / 2 - 50, w: 80, h: 112 }
            const end = p.controlled ? defaultMyGrave : defaultOppGrave

            newFlights.push({
              id: `die-grave-${id}-${now}`,
              card: prevPerm as PermanentView,
              type: 'graveyard',
              startX: start.x,
              startY: start.y,
              startW: start.w,
              startH: start.h,
              endX: end.x,
              endY: end.y,
              endW: end.w,
              endH: end.h,
            })
          }
        }
      }
    }

    if (newFlights.length > 0) {
      const capped = newFlights.slice(0, 8)
      setFlights((curr) => [...curr, ...capped])

      setTimeout(() => {
        setFlights((curr) => curr.filter((f) => !capped.some((c) => c.id === f.id)))
      }, FLIGHT_DURATION_MS)
    }
  }, [game, boardRef])

  if (flights.length === 0) return null

  return (
    <div className="card-flight-overlay">
      {flights.map((flight) => (
        <FlyingCard key={flight.id} flight={flight} />
      ))}
    </div>
  )
}

function FlyingCard({ flight }: { flight: CardFlightItem }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null)

  useEffect(() => {
    if (flight.faceDown) return
    let cancelled = false
    void awaitImageUrl(flight.card).then((url) => {
      if (!cancelled && url) setImgUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [flight.card, flight.faceDown])

  // Preserve standard MTG 1:1.4 aspect ratio to completely avoid any deformation or squishing
  const cardWidth = Math.max(48, Math.min(130, flight.endW || 80))
  const cardHeight = Math.round(cardWidth * 1.4)
  const dx = flight.endX - flight.startX
  const dy = flight.endY - flight.startY
  const startScale = Math.min(1.15, Math.max(0.65, (flight.startW || cardWidth) / cardWidth))

  const style: React.CSSProperties = {
    left: `${flight.startX}px`,
    top: `${flight.startY}px`,
    width: `${cardWidth}px`,
    height: `${cardHeight}px`,
    ['--dx' as string]: `${dx}px`,
    ['--dy' as string]: `${dy}px`,
    ['--start-scale' as string]: `${startScale}`,
  }

  return (
    <div className={`flying-card type-${flight.type}`} style={style}>
      <div className="flying-card-inner">
        {flight.faceDown ? (
          <img src={CARD_BACK_URL} alt="" className="flying-card-img" draggable={false} />
        ) : imgUrl ? (
          <img src={imgUrl} alt={cardName(flight.card)} className="flying-card-img" draggable={false} />
        ) : (
          <div className="flying-card-fallback">
            {cardName(flight.card)}
          </div>
        )}
      </div>
    </div>
  )
}
