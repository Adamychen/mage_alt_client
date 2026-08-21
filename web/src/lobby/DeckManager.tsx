import { useState, useMemo } from 'react'
import { DECKS, type Deck, type DeckCard } from './decks'
import { setMyDeck, useStore } from '../state/store'
import './DeckManager.css'

const CUSTOM_DECKS_STORAGE_KEY = 'mage_custom_decks'

function loadSavedCustomDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(CUSTOM_DECKS_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Deck[]
  } catch {
    return []
  }
}

function saveCustomDecks(decks: Deck[]) {
  try {
    localStorage.setItem(CUSTOM_DECKS_STORAGE_KEY, JSON.stringify(decks))
  } catch {}
}

export function parseArenaDeck(text: string, defaultName = 'Mazo Importado'): Deck | null {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  if (lines.length === 0) return null

  const cards: DeckCard[] = []
  const sideboard: DeckCard[] = []
  let isSideboard = false

  for (const line of lines) {
    if (line.toLowerCase() === 'deck' || line.toLowerCase() === 'main' || line.toLowerCase() === 'mainboard') {
      isSideboard = false
      continue
    }
    if (line.toLowerCase() === 'sideboard' || line.toLowerCase() === 'companion') {
      isSideboard = true
      continue
    }

    // Matches Arena format: "4 Lightning Bolt (M10) 146" or "4 Lightning Bolt" or "4x Lightning Bolt"
    const match = line.match(/^(\d+)x?\s+([^(\n\r]+?)(?:\s+\(([A-Za-z0-9_]+)\)\s+(\S+))?$/)
    if (match) {
      const amount = parseInt(match[1], 10) || 1
      const cardName = match[2].trim()
      const setCode = match[3] || 'M10'
      const cardNumber = match[4] || '1'

      const item: DeckCard = { cardName, setCode, cardNumber, amount }
      if (isSideboard) {
        sideboard.push(item)
      } else {
        cards.push(item)
      }
    }
  }

  if (cards.length === 0) return null
  return {
    name: defaultName,
    cards,
    sideboard,
  }
}

export default function DeckManager() {
  const currentStoreDeck = useStore((s) => s.myDeck)
  const [customDecks, setCustomDecks] = useState<Deck[]>(loadSavedCustomDecks)
  const [selectedDeck, setSelectedDeck] = useState<Deck>(currentStoreDeck ?? DECKS[0])
  const [importText, setImportText] = useState('')
  const [importName, setImportName] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const allDecks = useMemo(() => [...DECKS, ...customDecks], [customDecks])

  const totalCards = useMemo(() => {
    return selectedDeck.cards.reduce((acc, c) => acc + c.amount, 0)
  }, [selectedDeck])

  const totalSideboard = useMemo(() => {
    return selectedDeck.sideboard.reduce((acc, c) => acc + c.amount, 0)
  }, [selectedDeck])

  const handleSelectActive = (d: Deck) => {
    setSelectedDeck(d)
    setMyDeck(d)
  }

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setImportError(null)
    const parsed = parseArenaDeck(importText, importName.trim() || 'Mazo Importado')
    if (!parsed) {
      setImportError('No se pudieron reconocer cartas. Usa el formato MTG Arena (ej. "4 Lightning Bolt").')
      return
    }

    const updated = [...customDecks, parsed]
    setCustomDecks(updated)
    saveCustomDecks(updated)
    handleSelectActive(parsed)
    setShowImportModal(false)
    setImportText('')
    setImportName('')
  }

  const handleDeleteCustom = (d: Deck) => {
    const updated = customDecks.filter((x) => x !== d && x.name !== d.name)
    setCustomDecks(updated)
    saveCustomDecks(updated)
    if (selectedDeck.name === d.name) {
      handleSelectActive(DECKS[0])
    }
  }

  return (
    <div className="deck-manager">
      {/* Left Sidebar: List of Decks */}
      <div className="deck-sidebar">
        <div className="deck-sidebar-header">
          <h3>Mis Mazos ({allDecks.length})</h3>
          <button
            type="button"
            className="deck-import-btn"
            onClick={() => setShowImportModal(true)}
          >
            📥 Importar
          </button>
        </div>

        <div className="deck-list-items">
          {allDecks.map((d) => {
            const isActive = selectedDeck.name === d.name
            const isCustom = customDecks.some((c) => c.name === d.name)
            const count = d.cards.reduce((sum, c) => sum + c.amount, 0)

            return (
              <div
                key={d.name}
                className={`deck-card-item ${isActive ? 'active' : ''}`}
                onClick={() => handleSelectActive(d)}
              >
                <div className="deck-item-info">
                  <span className="deck-item-name">{d.name}</span>
                  <span className="deck-item-meta">{count} cartas {isCustom ? '• Personalizado' : '• Preconstruido'}</span>
                </div>
                {isActive && <span className="deck-active-badge">✓ Activo</span>}
                {isCustom && (
                  <button
                    type="button"
                    className="deck-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteCustom(d)
                    }}
                    title="Eliminar mazo"
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Main Area: Deck Viewer & Card Breakdown */}
      <div className="deck-content-view">
        <div className="deck-view-header">
          <div>
            <h2>{selectedDeck.name}</h2>
            <p className="deck-view-subtitle">
              {totalCards} cartas principales {totalSideboard > 0 ? `+ ${totalSideboard} en banquillo` : ''}
            </p>
          </div>
          <button
            type="button"
            className="primary deck-select-primary"
            onClick={() => handleSelectActive(selectedDeck)}
          >
            {currentStoreDeck?.name === selectedDeck.name ? '⭐ Mazo Seleccionado' : 'Equipar para jugar'}
          </button>
        </div>

        <div className="deck-breakdown-grid">
          <div className="deck-section-box">
            <h3>Cartas Principales ({totalCards})</h3>
            <div className="deck-cards-list">
              {selectedDeck.cards.map((c, i) => (
                <div key={i} className="deck-card-row">
                  <span className="card-amount-pill">{c.amount}x</span>
                  <span className="card-row-name">{c.cardName}</span>
                  <span className="card-row-set">{c.setCode} #{c.cardNumber}</span>
                </div>
              ))}
            </div>
          </div>

          {selectedDeck.sideboard.length > 0 && (
            <div className="deck-section-box">
              <h3>Banquillo / Sideboard ({totalSideboard})</h3>
              <div className="deck-cards-list">
                {selectedDeck.sideboard.map((c, i) => (
                  <div key={i} className="deck-card-row">
                    <span className="card-amount-pill sideboard">{c.amount}x</span>
                    <span className="card-row-name">{c.cardName}</span>
                    <span className="card-row-set">{c.setCode} #{c.cardNumber}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="overlay">
          <div className="dialog panel import-dialog">
            <h2>📥 Importar Mazo desde MTG Arena / MTGO</h2>
            <p className="import-desc">Pega la lista de cartas exportada de MTG Arena o Archidekt en formato de texto:</p>

            <label>
              Nombre del Mazo
              <input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Mi Mazo Personalizado"
                required
              />
            </label>

            <label>
              Lista de cartas
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`Deck\n4 Lightning Bolt\n20 Mountain\n\nSideboard\n2 Red Elemental Blast`}
                rows={10}
                required
              />
            </label>

            {importError && <div className="error-box">{importError}</div>}

            <div className="import-actions">
              <button type="button" onClick={() => setShowImportModal(false)}>
                Cancelar
              </button>
              <button className="primary" onClick={handleImportSubmit}>
                Guardar e Importar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
