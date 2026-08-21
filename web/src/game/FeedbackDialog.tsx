import { useEffect, useState } from 'react'
import * as cmds from '../net/commands'
import { clearFeedback, setStoreError, useStore } from '../state/store'
import type { FeedbackOption, FeedbackPrompt } from './feedback'
import CardGrid from './CardGrid'
import FormattedText from './FormattedText'

const POOL_COLORS = ['white', 'blue', 'black', 'red', 'green', 'colorless'] as const

function isResultOk(result: { ok: boolean; error?: string }, fallback: string) {
  if (result.ok) {
    clearFeedback()
    return true
  }
  setStoreError(result.error ?? fallback)
  return false
}

export default function FeedbackDialog() {
  const prompt = useStore((s) => s.feedback)
  const game = useStore((s) => s.game)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [multiAmounts, setMultiAmounts] = useState<Record<string, number>>({})
  const [orderedIds, setOrderedIds] = useState<string[]>([])

  useEffect(() => {
    setBusy(false)
    setAmount(prompt?.min ?? 0)
    setSelected([])
    setMultiAmounts(Object.fromEntries((prompt?.items ?? []).map((item) => [item.id, item.defaultValue ?? item.min])))
    setOrderedIds(prompt?.options?.map((o) => o.id) ?? [])
  }, [prompt?.method, prompt?.gameId])

  if (!prompt) return null

  const send = async (action: () => Promise<{ ok: boolean; error?: string }>, fallback: string) => {
    if (busy) return
    setBusy(true)
    try {
      isResultOk(await action(), fallback)
    } catch (error) {
      setStoreError(error instanceof Error ? error.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    void send(() => cmds.sendPlayerBoolean(false, prompt.gameId), 'No se pudo cancelar la decisión')
  }

  const finishOptionalTarget = () => {
    void send(() => cmds.sendPlayerBoolean(false, prompt.gameId), 'No se pudo finalizar la selección')
  }

  // ── GAME_TARGET con cardsView1: grid de cartas (tutores, scry, descarte, etc.)
  const hasCardGrid = prompt.cards && prompt.cards.length > 0
  if (prompt.method === 'GAME_TARGET' && hasCardGrid) {
    return <CardGrid prompt={prompt} selected={selected} setSelected={setSelected} send={send} cancel={cancel} busy={busy} />
  }

  // ── GAME_TARGET sin cardsView1: barra flotante no-modal
  if (prompt.method === 'GAME_TARGET') {
    const chosenCount = prompt.chosenTargets?.length ?? 0
    return (
      <div className="action-prompt-bar targeting-bar">
        <div className="action-prompt-info">
          <span className="action-prompt-title">
            <FormattedText text={prompt.sourceName ?? 'Objetivo'} />
          </span>
          <span className="action-prompt-hint">
            {chosenCount > 0
              ? `${chosenCount} seleccionado(s)`
              : 'Haz clic en el objetivo en el tablero'}
          </span>
        </div>
        <div className="action-prompt-actions">
          {prompt.required === false && (
            <button disabled={busy} onClick={finishOptionalTarget}>Terminar</button>
          )}
          <button disabled={busy} onClick={cancel} className="cancel-btn">Cancelar</button>
        </div>
      </div>
    )
  }

  // ── GAME_PLAY_MANA: barra flotante no-modal (el tablero maneja los clicks a las tierras)
  if (prompt.mode === 'mana') {
    return (
      <div className="action-prompt-bar mana-prompt-bar">
        <div className="action-prompt-info">
          <span className="action-prompt-title">Pagar maná:</span>
          <span className="action-prompt-msg">
            <FormattedText text={prompt.message} />
          </span>
          <span className="action-prompt-hint">Haz clic en tus fuentes de maná del tablero</span>
        </div>
        <div className="action-prompt-actions">
          {prompt.playerId && poolMana(game).map((mana) => (
            <button
              key={mana.color}
              className="mana-pool-btn"
              disabled={busy}
              onClick={() => void send(() => cmds.sendPlayerManaType(prompt.gameId, prompt.playerId as string, mana.color), 'No se pudo usar la reserva de maná')}
            >
              Pagar reserva: {mana.label}
            </button>
          ))}
          <button disabled={busy} onClick={() => void send(() => cmds.sendPlayerString('special', prompt.gameId), 'No se pudo activar el pago especial')}>
            Acción especial
          </button>
          <button disabled={busy} onClick={cancel} className="cancel-btn">
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  // ── Declaración de combate: barra flotante no-modal
  if (prompt.mode === 'combat') {
    return (
      <div className="action-prompt-bar combat-bar">
        <div className="action-prompt-info">
          <span className="action-prompt-title">{prompt.title}</span>
          <span className="action-prompt-hint">
            Haz clic en tus criaturas del tablero para declararlas
          </span>
        </div>
        <div className="action-prompt-actions">
          {prompt.special && (
            <button disabled={busy} onClick={() => void send(() => cmds.sendPlayerString('special', prompt.gameId), 'No se pudo declarar el ataque')}>
              Atacar con todos
            </button>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void send(() => cmds.sendPlayerBoolean(false, prompt.gameId), 'No se pudo confirmar el combate')}
          >
            {prompt.title === 'Declara atacantes' ? 'Confirmar atacantes' : 'Confirmar bloqueadores'}
          </button>
        </div>
      </div>
    )
  }

  const selectOption = (option: FeedbackOption) => {
    if (prompt.mode === 'uuid' && prompt.max > 1) {
      setSelected((current) => current.includes(option.value)
        ? current.filter((value) => value !== option.value)
        : current.length < prompt.max ? [...current, option.value] : current)
      return
    }
    void send(() => sendValue(prompt, option.value), 'No se pudo enviar la selección')
  }

  const confirmSelected = () => {
    void send(async () => {
      let result: { ok: boolean; error?: string } = { ok: true }
      for (const value of selected) {
        result = await cmds.sendPlayerUUID(value, prompt.gameId)
        if (!result.ok) break
      }
      return result
    }, 'No se pudo enviar la selección')
  }

  const confirmAmount = () => {
    const value = Math.max(prompt.min, Math.min(prompt.max, amount))
    void send(() => cmds.sendPlayerInteger(value, prompt.gameId), 'No se pudo enviar la cantidad')
  }

  const confirmMultiAmount = () => {
    const values = (prompt.items ?? []).map((item) => {
      const value = Math.max(item.min, Math.min(item.max, multiAmounts[item.id] ?? item.min))
      return value
    })
    const total = values.reduce((sum, value) => sum + value, 0)
    if (total < prompt.min || total > prompt.max) {
      setStoreError(`La suma debe estar entre ${prompt.min} y ${prompt.max}`)
      return
    }
    void send(() => cmds.sendPlayerString(values.join(' '), prompt.gameId), 'No se pudieron enviar las cantidades')
  }

  return (
    <div className="feedback-backdrop" role="presentation">
      <section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <div className="feedback-kicker">{prompt.method}</div>
        <h2 id="feedback-title"><FormattedText text={prompt.title} /></h2>
        <p><FormattedText text={prompt.message} /></p>

        {prompt.mode === 'integer' && (
          <div className="feedback-amount">
            <input
              aria-label="Cantidad"
              type="number"
              min={prompt.min}
              max={prompt.max}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
            />
            <button className="primary" disabled={busy} onClick={confirmAmount}>Enviar</button>
            <button disabled={busy} onClick={cancel}>Cancelar</button>
          </div>
        )}

        {prompt.mode === 'multiString' && (
          <div className="feedback-multi-amount">
            {(prompt.items ?? []).map((item) => (
              <label key={item.id}>
                <FormattedText text={item.label} />
                <input
                  aria-label={item.label}
                  type="number"
                  min={item.min}
                  max={item.max}
                  value={multiAmounts[item.id] ?? item.defaultValue}
                  onChange={(event) => setMultiAmounts((current) => ({ ...current, [item.id]: Number(event.target.value) }))}
                />
              </label>
            ))}
            <button className="primary" disabled={busy} onClick={confirmMultiAmount}>Enviar</button>
            <button disabled={busy} onClick={cancel}>Cancelar</button>
          </div>
        )}

        {prompt.mode === 'order' && (
          <div className="feedback-order">
            <p className="feedback-hint">Arrastra o usa las flechas para reordenar. La primera carta va al fondo.</p>
            <div className="feedback-order-list">
              {orderedIds.map((id, index) => {
                const option = prompt.options.find((o) => o.id === id)
                return (
                  <div key={id} className="feedback-order-item">
                    <span className="feedback-order-pos">{index + 1}</span>
                    <span className="feedback-order-label">
                      <FormattedText text={option?.label ?? id} />
                    </span>
                    <div className="feedback-order-arrows">
                      <button
                        disabled={busy || index === 0}
                        onClick={() => {
                          setOrderedIds((prev) => {
                            const next = [...prev]
                            ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                            return next
                          })
                        }}
                      >↑</button>
                      <button
                        disabled={busy || index === orderedIds.length - 1}
                        onClick={() => {
                          setOrderedIds((prev) => {
                            const next = [...prev]
                            ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
                            return next
                          })
                        }}
                      >↓</button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="feedback-options">
              <button className="primary" disabled={busy} onClick={() => {
                void send(() => cmds.sendPlayerString(orderedIds.join(' '), prompt.gameId), 'No se pudo enviar el orden')
              }}>Confirmar orden</button>
              <button disabled={busy} onClick={cancel}>Cancelar</button>
            </div>
          </div>
        )}

        {prompt.mode !== 'integer' && prompt.mode !== 'multiString' && prompt.mode !== 'order' && (
          <div className="feedback-options">
            {prompt.options.map((option) => (
              <button
                key={option.id}
                className={selected.includes(option.value) ? 'selected' : ''}
                disabled={busy}
                onClick={() => selectOption(option)}
              >
                <FormattedText text={option.label} />
              </button>
            ))}
            {prompt.mode === 'uuid' && prompt.max > 1 && (
              <button className="primary" disabled={busy || selected.length < prompt.min} onClick={confirmSelected}>
                Confirmar ({selected.length})
              </button>
            )}
            {prompt.required === false && (
              <button disabled={busy} onClick={finishOptionalTarget}>Terminar selección</button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

const COLOR_SYMBOLS: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G', colorless: 'C' }

/** Maná disponible en la reserva del jugador controlado para pagar desde el pool. */
function poolMana(game: { players?: unknown[] | null } | null) {
  const players = (game?.players ?? []) as { controlled?: boolean; manaPool?: Record<string, number> }[]
  const me = players.find((p) => p.controlled)
  const pool = (me?.manaPool ?? {}) as Record<string, number>
  return POOL_COLORS.filter((color) => (pool[color] ?? 0) > 0)
    .map((color) => ({ color: color.toUpperCase(), label: `${COLOR_SYMBOLS[color]}${pool[color] ?? 0}` }))
}

function sendValue(prompt: FeedbackPrompt, value: string) {
  switch (prompt.mode) {
    case 'boolean':
      return cmds.sendPlayerBoolean(value === 'true', prompt.gameId)
    case 'string':
      return cmds.sendPlayerString(value, prompt.gameId)
    case 'uuid':
      return cmds.sendPlayerUUID(value, prompt.gameId)
    case 'mana':
      if (!prompt.playerId) return Promise.resolve({ ok: false, error: 'No hay jugador de maná activo' })
      return cmds.sendPlayerManaType(prompt.gameId, prompt.playerId, value)
    default:
      return Promise.resolve({ ok: false, error: 'Tipo de feedback no soportado' })
  }
}
