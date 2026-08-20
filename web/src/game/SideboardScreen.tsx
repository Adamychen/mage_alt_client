import { useState, useEffect, useCallback, useMemo } from 'react'
import * as cmds from '../net/commands'
import { useStore } from '../state/store'
import { setState, addLog } from '../state/state'
import type { SideboardCard } from '../state/state'
import { awaitCardMeta } from '../cards/cardImages'
import './SideboardScreen.css'

const MAIN_MIN = 60
const SIDE_MAX = 15
const COPY_MAX = 4

export default function SideboardScreen() {
  const screen = useStore((s) => s.sideboardScreen)
  const [maindeck, setMaindeck] = useState<SideboardCard[]>([])
  const [sideboard, setSideboard] = useState<SideboardCard[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [resolvedImages, setResolvedImages] = useState<Record<string, string | null>>({})

  useEffect(() => {
    if (!screen) return
    setMaindeck(screen.maindeck)
    setSideboard(screen.sideboard)
    setTimeLeft(screen.timeLeft)
  }, [screen?.tableId])

  // Resolve card images in background
  useEffect(() => {
    const all = [...maindeck, ...sideboard]
    let cancelled = false
    for (const card of all) {
      if (resolvedImages[card.instanceId] !== undefined) continue
      void awaitCardMeta(card.setCode, card.cardNumber).then((meta) => {
        if (cancelled) return
        setResolvedImages((prev) => {
          if (prev[card.instanceId] !== undefined) return prev
          return { ...prev, [card.instanceId]: meta?.imageUrl ?? null }
        })
      })
    }
    return () => { cancelled = true }
  }, [maindeck, sideboard])

  // Timer countdown
  useEffect(() => {
    if (!screen || timeLeft <= 0) return
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer)
          void submitDeck()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [screen?.tableId])

  const moveToSideboard = useCallback((card: SideboardCard) => {
    setMaindeck((prev) => prev.filter((c) => c.instanceId !== card.instanceId))
    setSideboard((prev) => [...prev, card])
  }, [])

  const moveToMaindeck = useCallback((card: SideboardCard) => {
    setSideboard((prev) => prev.filter((c) => c.instanceId !== card.instanceId))
    setMaindeck((prev) => [...prev, card])
  }, [])

  const copyCount = useCallback((name: string, list: SideboardCard[]) => {
    return list.filter((c) => c.name === name).length
  }, [])

  const submitDeck = useCallback(async () => {
    if (!screen || busy) return
    setBusy(true)
    try {
      // Group cards by name+set+number → amount
      const group = (cards: SideboardCard[]) => {
        const map = new Map<string, { cardName: string; setCode: string; cardNumber: string; amount: number }>()
        for (const c of cards) {
          const key = `${c.name}|${c.setCode}|${c.cardNumber}`
          const existing = map.get(key)
          if (existing) {
            existing.amount++
          } else {
            map.set(key, { cardName: c.name, setCode: c.setCode, cardNumber: c.cardNumber, amount: 1 })
          }
        }
        return Array.from(map.values())
      }
      const deck = {
        name: screen.deckName,
        cards: group(maindeck),
        sideboard: group(sideboard),
      }
      const result = await cmds.submitDeck(screen.tableId, deck)
      if (result.ok) {
        setState({ sideboardScreen: null })
        addLog('partida', 'Mazo enviado — espera la siguiente partida…')
      } else {
        addLog('error', `Error al enviar mazo: ${result.error ?? 'desconocido'}`)
      }
    } finally {
      setBusy(false)
    }
  }, [screen, maindeck, sideboard, busy])

  if (!screen) return null

  const mainValid = maindeck.length >= MAIN_MIN
  const sideValid = sideboard.length <= SIDE_MAX
  const timerPct = Math.max(0, (timeLeft / screen.timeLeft) * 100)
  const timerUrgent = timeLeft <= 30

  return (
    <div className="sideboard-backdrop" role="presentation">
      <section className="sideboard-screen" role="dialog" aria-modal="true">
        <div className="sideboard-header">
          <div className="sideboard-title">
            <h2>Sideboard</h2>
            <span className="sideboard-deck-name">{screen.deckName}</span>
          </div>
          <div className={`sideboard-timer ${timerUrgent ? 'urgent' : ''}`}>
            <div className="sideboard-timer-bar" style={{ width: `${timerPct}%` }} />
            <span className="sideboard-timer-text">{formatTime(timeLeft)}</span>
          </div>
        </div>

        <div className="sideboard-columns">
          <SideboardColumn
            title="Mazo principal"
            cards={maindeck}
            count={maindeck.length}
            valid={mainValid}
            onMove={moveToSideboard}
            resolvedImages={resolvedImages}
            copyCount={copyCount}
            allCards={maindeck}
          />
          <SideboardColumn
            title="Sideboard"
            cards={sideboard}
            count={sideboard.length}
            valid={sideValid}
            onMove={moveToMaindeck}
            resolvedImages={resolvedImages}
            copyCount={copyCount}
            allCards={sideboard}
          />
        </div>

        <div className="sideboard-footer">
          <div className="sideboard-counts">
            <span className={mainValid ? 'valid' : 'invalid'}>Main: {maindeck.length} (mín {MAIN_MIN})</span>
            <span className={sideValid ? 'valid' : 'invalid'}>Side: {sideboard.length} (máx {SIDE_MAX})</span>
          </div>
          <button
            className="primary"
            disabled={busy || !mainValid}
            onClick={() => void submitDeck()}
          >
            {busy ? 'Enviando…' : 'Enviar mazo'}
          </button>
        </div>
      </section>
    </div>
  )
}

function SideboardColumn({
  title,
  cards,
  count,
  valid,
  onMove,
  resolvedImages,
  copyCount,
  allCards,
}: {
  title: string
  cards: SideboardCard[]
  count: number
  valid: boolean
  onMove: (card: SideboardCard) => void
  resolvedImages: Record<string, string | null>
  copyCount: (name: string, list: SideboardCard[]) => number
  allCards: SideboardCard[]
}) {
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => {
    if (!filter.trim()) return cards
    const q = filter.toLowerCase()
    return cards.filter((c) => c.name.toLowerCase().includes(q) || c.setCode.toLowerCase().includes(q))
  }, [cards, filter])

  return (
    <div className="sideboard-column">
      <div className="sideboard-col-header">
        <h3>{title}</h3>
        <span className={`sideboard-col-count ${valid ? 'valid' : 'invalid'}`}>{count}</span>
      </div>
      {cards.length > 10 && (
        <input
          className="sideboard-filter"
          type="text"
          placeholder="Filtrar..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      <div className="sideboard-card-list">
        {filtered.map((card) => {
          const copies = copyCount(card.name, allCards)
          return (
            <button
              key={card.instanceId}
              className={`sideboard-card ${copies >= COPY_MAX ? 'max-copies' : ''}`}
              onClick={() => onMove(card)}
              title={`${card.name} (${card.setCode}/${card.cardNumber})`}
            >
              {resolvedImages[card.instanceId] ? (
                <img
                  src={resolvedImages[card.instanceId]!}
                  alt={card.name}
                  className="sideboard-card-img"
                  draggable={false}
                />
              ) : (
                <div className="sideboard-card-placeholder" />
              )}
              <div className="sideboard-card-info">
                <span className="sideboard-card-name">{card.name}</span>
                <span className="sideboard-card-set">{card.setCode} · {copies}×</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
