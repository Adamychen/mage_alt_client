import { useState, useMemo } from 'react'
import CardSlot from '../board/CardSlot'
import type { FeedbackPrompt } from './feedback'
import './CardGrid.css'

interface CardGridProps {
  prompt: FeedbackPrompt
  selected: string[]
  setSelected: React.Dispatch<React.SetStateAction<string[]>>
  send: (action: () => Promise<{ ok: boolean; error?: string }>, fallback: string) => void
  cancel: () => void
  busy: boolean
}

export default function CardGrid({ prompt, selected, setSelected, send, cancel, busy }: CardGridProps) {
  const [filter, setFilter] = useState('')
  const cards = prompt.cards ?? []
  const isMulti = prompt.max > 1

  const filtered = useMemo(() => {
    if (!filter.trim()) return cards
    const q = filter.toLowerCase()
    return cards.filter((c) => {
      const name = (c.displayName ?? c.name).toLowerCase()
      const types = (c.cardTypes ?? []).join(' ').toLowerCase()
      const rules = (c.rules ?? []).join(' ').toLowerCase()
      return name.includes(q) || types.includes(q) || rules.includes(q)
    })
  }, [cards, filter])

  const toggle = (cardId: string) => {
    if (isMulti) {
      setSelected((current) => current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : current.length < prompt.max ? [...current, cardId] : current)
    } else {
      void send(() => sendSingle(prompt, cardId), 'No se pudo enviar la selección')
    }
  }

  const confirmMulti = () => {
    void send(async () => {
      let result: { ok: boolean; error?: string } = { ok: true }
      for (const value of selected) {
        result = await sendSingle(prompt, value)
        if (!result.ok) break
      }
      return result
    }, 'No se pudo enviar la selección')
  }

  return (
    <div className="feedback-backdrop" role="presentation">
      <section className="feedback-dialog card-grid-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <div className="feedback-kicker">{prompt.method}</div>
        <h2 id="feedback-title">{prompt.title}</h2>
        <p>{prompt.message}</p>

        {cards.length > 8 && (
          <input
            className="card-grid-filter"
            type="text"
            placeholder="Filtrar por nombre, tipo o texto..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
          />
        )}

        <div className="card-grid">
          {filtered.map((card) => (
            <button
              key={card.id}
              className={`card-grid-cell ${selected.includes(card.id) ? 'selected' : ''}`}
              disabled={busy}
              onClick={() => toggle(card.id)}
              title={`${card.displayName ?? card.name}${card.power && card.toughness ? ` (${card.power}/${card.toughness})` : ''}`}
            >
              <CardSlot
                card={card as never}
                cardId={card.id}
                isChosen={selected.includes(card.id)}
              />
              <span className="card-grid-label">{card.displayName ?? card.name}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="card-grid-empty">No se encontraron cartas</p>
        )}

        <div className="card-grid-actions">
          {isMulti && (
            <button
              className="primary"
              disabled={busy || selected.length < prompt.min}
              onClick={confirmMulti}
            >
              Confirmar ({selected.length}/{prompt.max})
            </button>
          )}
          {prompt.required === false && (
            <button disabled={busy} onClick={() => {
              void send(() => sendSingle(prompt, ''), 'No se pudo finalizar')
            }}>
              Terminar selección
            </button>
          )}
          <button disabled={busy} onClick={cancel}>Cancelar</button>
        </div>
      </section>
    </div>
  )
}

function sendSingle(prompt: FeedbackPrompt, value: string): Promise<{ ok: boolean; error?: string }> {
  if (prompt.mode === 'uuid') {
    return value
      ? import('../net/commands').then((m) => m.sendPlayerUUID(value, prompt.gameId))
      : import('../net/commands').then((m) => m.sendPlayerBoolean(false, prompt.gameId))
  }
  return import('../net/commands').then((m) => m.sendPlayerString(value, prompt.gameId))
}
