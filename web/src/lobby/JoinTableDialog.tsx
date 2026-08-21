import { useState, useMemo } from 'react'
import type { TableView } from '../net/types'
import {
  getAllAvailableDecks,
  saveCustomDecks,
  loadSavedCustomDecks,
  type Deck,
  DEFAULT_DECK,
} from './decks'
import { parseArenaDeck } from './DeckManager'
import { setMyDeck, useStore } from '../state/store'
import './JoinTableDialog.css'

interface JoinTableDialogProps {
  table: TableView
  busy?: boolean
  onClose: () => void
  onJoin: (table: TableView, deck: Deck, password?: string) => Promise<void>
}

export default function JoinTableDialog({
  table,
  busy = false,
  onClose,
  onJoin,
}: JoinTableDialogProps) {
  const currentEquippedDeck = useStore((s) => s.myDeck)
  const [allDecks, setAllDecks] = useState<Deck[]>(() => getAllAvailableDecks())
  const [selectedDeck, setSelectedDeck] = useState<Deck>(() => currentEquippedDeck ?? allDecks[0] ?? DEFAULT_DECK)
  const [password, setPassword] = useState('')
  const [setAsDefault, setSetAsDefault] = useState(true)

  // Quick inline import state
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importName, setImportName] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

  const isCommanderTable = useMemo(() => {
    return (
      table.deckType?.toLowerCase().includes('commander') ||
      table.gameType?.toLowerCase().includes('commander')
    )
  }, [table])

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setImportError(null)
    const name = importName.trim() || 'Mazo Importado'
    const parsed = parseArenaDeck(importText, name)
    if (!parsed) {
      setImportError('No se pudieron reconocer cartas. Formato esperado: "4 Lightning Bolt".')
      return
    }

    const saved = loadSavedCustomDecks()
    const updatedCustom = [...saved, parsed]
    saveCustomDecks(updatedCustom)
    const updatedAll = getAllAvailableDecks()
    setAllDecks(updatedAll)
    setSelectedDeck(parsed)
    setShowImport(false)
    setImportText('')
    setImportName('')
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setJoinError(null)
    if (setAsDefault) {
      setMyDeck(selectedDeck)
    }
    try {
      await onJoin(table, selectedDeck, password.trim() || undefined)
    } catch (err) {
      setJoinError((err as Error).message)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="join-table-modal panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="join-modal-header">
          <div className="join-header-titles">
            <span className="join-target-pill">⚔️ UNIRSE A MESA</span>
            <h2 className="join-table-title">{table.tableName}</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Table summary badges */}
        <div className="join-table-meta-bar">
          <span className="meta-badge meta-format">
            📜 Formato: <strong>{table.deckType || 'Cualquiera'}</strong>
          </span>
          <span className="meta-badge meta-mode">
            🎮 Modo: <strong>{table.gameType || 'Duelo 1v1'}</strong>
          </span>
          <span className="meta-badge meta-host">
            👑 Anfitrión: <strong>{table.controllerName}</strong>
          </span>
          {table.passworded && (
            <span className="meta-badge meta-lock">
              🔒 Requiere contraseña
            </span>
          )}
        </div>

        {/* Error Banner if any */}
        {joinError && (
          <div className="join-error-banner">
            <span className="join-error-icon">⚠️</span>
            <span className="join-error-text">{joinError}</span>
          </div>
        )}

        <form onSubmit={handleConfirm} className="join-modal-form">
          {/* Password field if protected */}
          {table.passworded && (
            <div className="join-password-section">
              <label className="join-field-label">
                <span>🔑 Contraseña de la mesa:</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Introduce la contraseña para entrar…"
                  required
                  className="join-password-input"
                  autoFocus
                />
              </label>
            </div>
          )}

          {/* Deck Selection Section */}
          <div className="join-deck-section">
            <div className="join-deck-section-header">
              <span className="join-deck-section-title">
                🃏 Selecciona el mazo para esta partida:
              </span>
              <button
                type="button"
                className="join-import-toggle-btn"
                onClick={() => setShowImport(!showImport)}
              >
                {showImport ? '✕ Cancelar importación' : '📋 Pegar mazo nuevo…'}
              </button>
            </div>

            {/* Inline Quick Importer */}
            {showImport && (
              <div className="join-inline-importer">
                <h4>Importar mazo desde texto (Formato texto / Moxfield / Archidekt)</h4>
                <div className="import-row">
                  <input
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="Nombre del mazo (ej. Mi Mazo Commander)"
                    className="import-name-input"
                  />
                </div>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Pega aquí la lista de cartas (ej.&#10;1 Sol Ring&#10;1 Arcane Signet&#10;...)"
                  rows={4}
                  className="import-textarea"
                />
                {importError && <p className="import-error-msg">{importError}</p>}
                <div className="import-actions">
                  <button
                    type="button"
                    className="primary import-submit-btn"
                    onClick={handleImportSubmit}
                    disabled={!importText.trim()}
                  >
                    Guardar y Seleccionar
                  </button>
                </div>
              </div>
            )}

            {/* Deck List Cards */}
            <div className="join-deck-cards-list">
              {allDecks.map((d) => {
                const isSelected = selectedDeck.name === d.name
                const count = d.cards.reduce((acc, c) => acc + c.amount, 0)
                const sbCount = d.sideboard.reduce((acc, c) => acc + c.amount, 0)
                const sampleCards = d.cards
                  .slice(0, 3)
                  .map((c) => c.cardName)
                  .join(', ')

                const isRecommended = isCommanderTable ? count >= 100 : count === 60

                return (
                  <div
                    key={d.name}
                    className={`join-deck-card ${isSelected ? 'selected' : ''} ${
                      isRecommended ? 'recommended' : ''
                    }`}
                    onClick={() => setSelectedDeck(d)}
                  >
                    <div className="deck-card-radio">
                      <input
                        type="radio"
                        name="join-deck-choice"
                        checked={isSelected}
                        onChange={() => setSelectedDeck(d)}
                      />
                    </div>
                    <div className="deck-card-content">
                      <div className="deck-card-title-row">
                        <span className="deck-card-name">🃏 {d.name}</span>
                        <span className="deck-card-count-badge">
                          {count} cartas {sbCount > 0 ? `(+${sbCount} sb)` : ''}
                        </span>
                      </div>
                      <span className="deck-card-sample">{sampleCards}…</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="join-modal-footer">
            <label className="join-default-checkbox">
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
              />
              <span>Recordar este mazo como equipado</span>
            </label>

            <div className="join-footer-buttons">
              <button
                type="button"
                className="join-cancel-btn"
                onClick={onClose}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary join-submit-btn"
                disabled={busy || (table.passworded && !password.trim())}
              >
                {busy ? 'Uniéndose…' : `⚔️ Unirse con "${selectedDeck.name}"`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
