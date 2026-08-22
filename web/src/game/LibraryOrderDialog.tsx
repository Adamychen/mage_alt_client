import { useState, useMemo, useEffect } from 'react'
import * as cmds from '../net/commands'
import type { FeedbackOption, FeedbackPrompt } from './feedback'
import CardSlot from '../board/CardSlot'
import FormattedText from './FormattedText'
import './LibraryOrderDialog.css'

interface LibraryOrderDialogProps {
  prompt: FeedbackPrompt
  send: (action: () => Promise<{ ok: boolean; error?: string }>, fallback: string) => void
  cancel: () => void
  busy: boolean
}

interface OrderableCard {
  id: string
  option: FeedbackOption
  card: any
}

export default function LibraryOrderDialog({ prompt, send, cancel, busy }: LibraryOrderDialogProps) {
  // Initial card list
  const initialCards = useMemo((): OrderableCard[] => {
    const feedbackCards = prompt.cards ?? []
    const options = prompt.options ?? []

    return options.map((opt) => {
      const matchedCard = feedbackCards.find((c) => c.id === opt.id)
      return {
        id: opt.id,
        option: opt,
        card: matchedCard ?? {
          id: opt.id,
          name: opt.label,
          manaValue: 0,
          expansionSetCode: '',
          cardNumber: '0',
        },
      }
    })
  }, [prompt.options, prompt.cards])

  // Split into Top cards and Bottom / Graveyard cards
  const [topCards, setTopCards] = useState<OrderableCard[]>(initialCards)
  const [bottomCards, setBottomCards] = useState<OrderableCard[]>([])

  useEffect(() => {
    setTopCards(initialCards)
    setBottomCards([])
  }, [initialCards])

  const isSurveil = prompt.message.toLowerCase().includes('surveil') || prompt.title.toLowerCase().includes('surveil')
  const isBlockerOrder =
    prompt.message.toLowerCase().includes('blocker') ||
    prompt.message.toLowerCase().includes('bloqueador') ||
    prompt.message.toLowerCase().includes('damage order') ||
    prompt.title.toLowerCase().includes('bloqueador') ||
    prompt.title.toLowerCase().includes('blocker')

  // Move card within top zone
  const moveUp = (index: number) => {
    if (index <= 0) return
    const next = [...topCards]
    const temp = next[index]
    next[index] = next[index - 1]
    next[index - 1] = temp
    setTopCards(next)
  }

  const moveDown = (index: number) => {
    if (index >= topCards.length - 1) return
    const next = [...topCards]
    const temp = next[index]
    next[index] = next[index + 1]
    next[index + 1] = temp
    setTopCards(next)
  }

  // Move card between Top and Bottom zones
  const moveToBottom = (index: number) => {
    const card = topCards[index]
    setTopCards(topCards.filter((_, i) => i !== index))
    setBottomCards([...bottomCards, card])
  }

  const moveToTop = (index: number) => {
    const card = bottomCards[index]
    setBottomCards(bottomCards.filter((_, i) => i !== index))
    setTopCards([...topCards, card])
  }

  // Quick actions
  const allToTop = () => {
    setTopCards([...topCards, ...bottomCards])
    setBottomCards([])
  }

  const allToBottom = () => {
    setBottomCards([...bottomCards, ...topCards])
    setTopCards([])
  }

  // Confirm order
  const handleConfirm = () => {
    // Send sequence of ordered IDs (top cards in order + bottom cards in order)
    const finalOrder = [...topCards.map((c) => c.id), ...bottomCards.map((c) => c.id)]
    void send(
      () => cmds.sendPlayerString(finalOrder.join(' '), prompt.gameId),
      'No se pudo enviar el orden de las cartas'
    )
  }

  return (
    <div className="feedback-overlay library-order-overlay" role="dialog" aria-modal="true">
      <section className="feedback-dialog library-order-dialog">
        <header className="feedback-header">
          <div className="dialog-title-wrap">
            <span className="dialog-icon">{isBlockerOrder ? '🛡️' : '🔮'}</span>
            <span className="dialog-title">
              {isBlockerOrder
                ? 'Ordenar Bloqueadores (Damage Assignment Order)'
                : isSurveil
                ? 'Vigilar (Surveil)'
                : prompt.title || 'Adivinar (Scry) / Ordenar'}
            </span>
          </div>
          <div className="dialog-message">
            <FormattedText text={prompt.message} />
          </div>
        </header>

        <div className="library-order-body">
          {/* Top / Primary Order Zone */}
          <div className="order-zone top-zone">
            <div className="order-zone-header">
              <span className="zone-name">
                {isBlockerOrder
                  ? `🛡️ Orden de asignación de daño (${topCards.length} bloqueadores)`
                  : `⬆️ En la parte superior de la biblioteca (${topCards.length})`}
              </span>
              <span className="zone-hint">
                {isBlockerOrder
                  ? 'El atacante asignará daño letal en este orden (de izquierda a derecha)'
                  : 'Se robarán en este orden (de izquierda a derecha)'}
              </span>
            </div>
            <div className={`order-cards-list ${topCards.length === 0 ? 'is-empty' : 'has-cards'}`}>
              {topCards.length === 0 ? (
                <div className="empty-zone-placeholder">
                  {isBlockerOrder ? 'No hay bloqueadores seleccionados' : 'Ninguna carta se quedará en la parte superior'}
                </div>
              ) : (
                topCards.map((item, idx) => (
                  <div key={item.id} className="order-card-card">
                    <div className="order-position-tag">#{idx + 1}</div>
                    <CardSlot card={item.card} className="order-card-slot" />
                    <div className="order-card-name">{item.card.displayName || item.card.name || item.option.label}</div>
                    <div className="order-card-controls">
                      <div className="order-arrows">
                        <button
                          type="button"
                          className="btn-arrow"
                          disabled={busy || idx === 0}
                          onClick={() => moveUp(idx)}
                          title={isBlockerOrder ? 'Asignar daño antes' : 'Mover antes (robar primero)'}
                        >
                          ◀
                        </button>
                        <button
                          type="button"
                          className="btn-arrow"
                          disabled={busy || idx === topCards.length - 1}
                          onClick={() => moveDown(idx)}
                          title={isBlockerOrder ? 'Asignar daño después' : 'Mover después (robar más tarde)'}
                        >
                          ▶
                        </button>
                      </div>
                      {!isBlockerOrder && (
                        <button
                          type="button"
                          className="btn-switch-zone btn-to-bottom"
                          disabled={busy}
                          onClick={() => moveToBottom(idx)}
                          title={isSurveil ? 'Mandar al cementerio' : 'Poner al fondo de la biblioteca'}
                        >
                          {isSurveil ? '⬇️ Al Cementerio' : '⬇️ Al Fondo'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bottom of Library / Graveyard Zone (only for Scry/Surveil/Library) */}
          {!isBlockerOrder && (
            <div className="order-zone bottom-zone">
              <div className="order-zone-header">
                <span className="zone-name">
                  {isSurveil ? '☠️ Al Cementerio' : '⬇️ En el fondo de la biblioteca'} ({bottomCards.length})
                </span>
                <span className="zone-hint">
                  {isSurveil ? 'Estas cartas irán al cementerio' : 'Estas cartas irán al fondo del mazo'}
                </span>
              </div>
              <div className={`order-cards-list ${bottomCards.length === 0 ? 'is-empty' : 'has-cards'}`}>
                {bottomCards.length === 0 ? (
                  <div className="empty-zone-placeholder">
                    {isSurveil
                      ? '☠️ Ninguna carta irá al cementerio'
                      : '⬇️ Ninguna carta irá al fondo (pulsa "⬇️ Al Fondo" en una carta arriba)'}
                  </div>
                ) : (
                  bottomCards.map((item, idx) => (
                    <div key={item.id} className="order-card-card">
                      <div className="order-position-tag">#{idx + 1}</div>
                      <CardSlot card={item.card} className="order-card-slot" />
                      <div className="order-card-controls">
                        <div className="order-arrows">
                          <button
                            type="button"
                            className="btn-arrow"
                            disabled={busy || idx === 0}
                            onClick={() => {
                              if (idx <= 0) return
                              const next = [...bottomCards]
                              const temp = next[idx]
                              next[idx] = next[idx - 1]
                              next[idx - 1] = temp
                              setBottomCards(next)
                            }}
                            title="Mover antes"
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            className="btn-arrow"
                            disabled={busy || idx === bottomCards.length - 1}
                            onClick={() => {
                              if (idx >= bottomCards.length - 1) return
                              const next = [...bottomCards]
                              const temp = next[idx]
                              next[idx] = next[idx + 1]
                              next[idx + 1] = temp
                              setBottomCards(next)
                            }}
                            title="Mover después"
                          >
                            ▶
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn-switch-zone btn-to-top"
                          disabled={busy}
                          onClick={() => moveToTop(idx)}
                          title="Poner arriba en la biblioteca"
                        >
                          ⬆️ Al Top
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Global Action Controls */}
        <footer className="library-order-footer">
          {!isBlockerOrder && (
            <div className="quick-actions">
              <button type="button" disabled={busy || bottomCards.length === 0} onClick={allToTop}>
                ⬆️ Todas arriba
              </button>
              <button type="button" disabled={busy || topCards.length === 0} onClick={allToBottom}>
                {isSurveil ? '☠️ Todas al cementerio' : '⬇️ Todas al fondo'}
              </button>
            </div>
          )}
          <div className="dialog-confirm-actions">
            <button type="button" className="primary" disabled={busy} onClick={handleConfirm}>
              {isBlockerOrder
                ? `Confirmar orden (${topCards.length} bloqueadores)`
                : `Confirmar orden (${topCards.length} arriba, ${bottomCards.length} ${isSurveil ? 'cementerio' : 'fondo'})`}
            </button>
            <button type="button" disabled={busy} onClick={cancel} className="cancel-btn">
              Cancelar
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
