import { useEffect, useRef, useState } from 'react'

const MIN_CARD_W = 52
const MAX_CARD_W = 130
const CARD_ASPECT = 1.4

interface ZoneScale {
  cardW: number
  ref: React.RefObject<HTMLDivElement | null>
}

export function useZoneScale(): ZoneScale {
  const ref = useRef<HTMLDivElement | null>(null)
  const [cardW, setCardW] = useState(86)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const h = el.getBoundingClientRect().height
      if (h <= 0) return

      const gaps = 12
      const rows = 3
      const maxCardH = (h - gaps) / rows
      const w = Math.max(MIN_CARD_W, Math.min(MAX_CARD_W, maxCardH / CARD_ASPECT))
      setCardW(Math.round(w))
    }

    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { cardW, ref }
}
