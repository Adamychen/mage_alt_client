import { useEffect, useRef, useState } from 'react'
import type { CardView, GameView, PermanentView } from '../net/types'
import { awaitImageUrl, cardName } from '../cards/cardImages'
import './CardFlightOverlay.css'

const CARD_BACK_URL = 'https://cards.scryfall.io/back.png'
const FLIGHT_DURATION_MS = 420

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

function getRelRect(domRect: DOMRect, boardRect: DOMRect) {
  return {
    x: domRect.left - boardRect.left,
    y: domRect.top - boardRect.top,
    w: domRect.width,
    h: domRect.height,
  }
}

export default function CardFlightOverlay({ game, boardRef }: CardFlightOverlayProps) {
  const prevGameRef = useRef<GameView | null>(null)
  const [flights, setFlights] = useState<CardFlightItem[]>([])
  const isInitialRef = useRef(true)

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

    const newFlights: CardFlightItem[] = []
    const now = Date.now()

    // 1. Detect Player Drawn Cards (game.myHand)
    const me = game.players?.find((p) => p.controlled)
    const prevMe = prevGame.players?.find((p) => p.controlled)
    const opp = game.players?.find((p) => !p.controlled)
    const prevOpp = prevGame.players?.find((p) => !p.controlled)

    const myHand = game.myHand ?? {}
    const prevMyHand = prevGame.myHand ?? {}

    for (const [id, card] of Object.entries(myHand)) {
      if (!prevMyHand[id] && !prevGame.stack?.[id] && !prevMe?.battlefield?.[id]) {
        // Card was newly drawn into my hand
        const libEl = boardEl.querySelector('.pz-bottom-row .library-stack')
        const handCardEl = boardEl.querySelector(`[data-card-id="${id}"]`) || boardEl.querySelector('.pz-bottom-row .hand-zone')

        const start = libEl
          ? getRelRect(libEl.getBoundingClientRect(), boardRect)
          : { x: boardRect.width - 120, y: boardRect.height - 80, w: 50, h: 70 }
        const end = handCardEl
          ? getRelRect(handCardEl.getBoundingClientRect(), boardRect)
          : { x: boardRect.width / 2, y: boardRect.height - 120, w: 80, h: 112 }

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

    // 2. Detect Opponent Drawn Cards
    if (opp && prevOpp && (opp.libraryCount ?? 0) < (prevOpp.libraryCount ?? 0)) {
      const oppLibEl = boardEl.querySelector('.opp-top-row .library-stack')
      const oppHandEl = boardEl.querySelector('.opp-zone .hand-zone')

      const start = oppLibEl
        ? getRelRect(oppLibEl.getBoundingClientRect(), boardRect)
        : { x: boardRect.width - 120, y: 40, w: 50, h: 70 }
      const end = oppHandEl
        ? getRelRect(oppHandEl.getBoundingClientRect(), boardRect)
        : { x: boardRect.width / 2, y: 40, w: 70, h: 98 }

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

    // 3. Detect Cast Spells on Stack
    const currStack = game.stack ?? {}
    const prevStack = prevGame.stack ?? {}

    for (const [id, spell] of Object.entries(currStack)) {
      if (!prevStack[id]) {
        // Newly cast spell flying towards the stack
        const wasInMyHand = !!prevMyHand[id]
        const fromEl = wasInMyHand
          ? boardEl.querySelector('.pz-bottom-row .hand-zone')
          : boardEl.querySelector('.opp-zone .hand-zone')
        const stackEl = boardEl.querySelector('.stack-zone') || boardEl.querySelector(`[data-card-id="${id}"]`)

        const start = fromEl
          ? getRelRect(fromEl.getBoundingClientRect(), boardRect)
          : { x: boardRect.width / 2, y: wasInMyHand ? boardRect.height - 120 : 60, w: 80, h: 112 }
        const end = stackEl
          ? getRelRect(stackEl.getBoundingClientRect(), boardRect)
          : { x: boardRect.width / 2 - 45, y: boardRect.height / 2 - 60, w: 90, h: 126 }

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

    // 4. Detect Permanents entering Battlefield
    const myBf = me?.battlefield ?? {}
    const prevMyBf = prevMe?.battlefield ?? {}

    for (const [id, perm] of Object.entries(myBf)) {
      if (!prevMyBf[id]) {
        const wasInStack = !!prevStack[id]
        const wasInHand = !!prevMyHand[id]
        const fromEl = wasInStack
          ? boardEl.querySelector('.stack-zone')
          : wasInHand
          ? boardEl.querySelector('.pz-bottom-row .hand-zone')
          : null
        const permEl = boardEl.querySelector(`[data-card-id="${id}"]`)

        if (permEl) {
          const start = fromEl
            ? getRelRect(fromEl.getBoundingClientRect(), boardRect)
            : { x: boardRect.width / 2, y: boardRect.height - 120, w: 80, h: 112 }
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

    // 5. Detect Cards going to Graveyard
    const myGrave = me?.graveyard ?? {}
    const prevMyGrave = prevMe?.graveyard ?? {}

    for (const [id, card] of Object.entries(myGrave)) {
      if (!prevMyGrave[id]) {
        const wasOnBf = !!prevMyBf[id]
        const wasOnStack = !!prevStack[id]
        const graveEl = boardEl.querySelector('.pz-bottom-row .graveyard-stack')

        if (graveEl && (wasOnBf || wasOnStack)) {
          const start = wasOnStack
            ? (boardEl.querySelector('.stack-zone') ? getRelRect(boardEl.querySelector('.stack-zone')!.getBoundingClientRect(), boardRect) : { x: boardRect.width / 2, y: boardRect.height / 2, w: 80, h: 112 })
            : { x: boardRect.width / 2, y: boardRect.height / 2 + 40, w: 80, h: 112 }
          const end = getRelRect(graveEl.getBoundingClientRect(), boardRect)

          newFlights.push({
            id: `grave-${id}-${now}`,
            card: card as CardView,
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

    if (newFlights.length > 0) {
      // Limit batch size to prevent overwhelm
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
