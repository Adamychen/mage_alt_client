import { useEffect, useState } from 'react'
import * as cmds from '../net/commands'
import { clearFeedback, setStoreError, useStore } from '../state/store'
import type { FeedbackOption, FeedbackPrompt } from './feedback'

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

  useEffect(() => {
    setBusy(false)
    setAmount(prompt?.min ?? 0)
    setSelected([])
    setMultiAmounts(Object.fromEntries((prompt?.items ?? []).map((item) => [item.id, item.defaultValue ?? item.min])))
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

  // ── GAME_TARGET: barra flotante (el tablero maneja los clicks) ──────────
  if (prompt.method === 'GAME_TARGET') {
    const chosenCount = prompt.chosenTargets?.length ?? 0
    return (
      <div className="targeting-bar">
        <span className="targeting-source">{prompt.sourceName ?? 'Objetivo'}</span>
        <span className="targeting-hint">
          {chosenCount > 0
            ? `${chosenCount} seleccionado(s)`
            : 'Haz clic en el tablero'}
        </span>
        {prompt.required === false && (
          <button disabled={busy} onClick={finishOptionalTarget}>Terminar</button>
        )}
        <button disabled={busy} onClick={cancel}>Cancelar</button>
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
    <div className={`feedback-backdrop ${prompt.method === 'GAME_PLAY_MANA' ? 'mana' : ''}`} role="presentation">
      <section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <div className="feedback-kicker">{prompt.method}</div>
        <h2 id="feedback-title">{prompt.title}</h2>
        <p>{prompt.message}</p>

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
                {item.label}
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

        {prompt.mode === 'mana' && (
          <p className="feedback-hint">Haz clic en tus fuentes de maná del tablero para pagar el coste.</p>
        )}

        {prompt.mode === 'mana' && (
          <div className="feedback-options">
            {prompt.playerId && poolMana(game).map((mana) => (
              <button
                key={mana.color}
                disabled={busy}
                onClick={() => void send(() => cmds.sendPlayerManaType(prompt.gameId, prompt.playerId as string, mana.color), 'No se pudo usar la reserva de maná')}
              >
                Pagar reserva: {mana.label}
              </button>
            ))}
            <button disabled={busy} onClick={() => void send(() => cmds.sendPlayerString('special', prompt.gameId), 'No se pudo activar el pago especial')}>
              Acción especial
            </button>
            <button disabled={busy} onClick={cancel}>Cancelar</button>
          </div>
        )}

        {prompt.mode === 'combat' && (
          <div className="feedback-options">
            <p className="feedback-hint">
              Haz clic en tus criaturas del tablero para declararlas (clic de nuevo para deseleccionar).
            </p>
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
        )}

        {prompt.mode !== 'integer' && prompt.mode !== 'multiString' && prompt.mode !== 'combat' && (
          <div className="feedback-options">
            {prompt.options.map((option) => (
              <button
                key={option.id}
                className={selected.includes(option.value) ? 'selected' : ''}
                disabled={busy}
                onClick={() => selectOption(option)}
              >
                {option.label}
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

function sendValue(prompt: FeedbackPrompt, value: string) {  switch (prompt.mode) {
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
