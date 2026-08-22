import { useState, useMemo, useEffect } from 'react'
import { MTG_KEYWORDS } from '../data/mtgKeywords'
import FormattedText from './FormattedText'
import './HelpWikiModal.css'

interface HelpWikiModalProps {
  onClose: () => void
}

type TabType = 'glossary' | 'phases' | 'shortcuts'

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Todas',
  combat: '⚔️ Combate',
  evasion: '🦅 Evasión',
  protection: '🛡️ Protección',
  cards: '🔮 Biblioteca y Robo',
  counters: '🧪 Contadores',
  mana: '⚡ Maná y Costes',
  graveyard: '☠️ Cementerio',
  mechanic: '✨ Mecánicas Especiales',
}

export default function HelpWikiModal({ onClose }: HelpWikiModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('glossary')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const filteredKeywords = useMemo(() => {
    let list = MTG_KEYWORDS

    if (selectedCategory !== 'all') {
      list = list.filter((k) => k.category === selectedCategory)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((k) =>
        k.name.toLowerCase().includes(q) ||
        k.nameEs.toLowerCase().includes(q) ||
        k.summary.toLowerCase().includes(q) ||
        (k.ruleSnippet && k.ruleSnippet.toLowerCase().includes(q))
      )
    }

    return list
  }, [searchQuery, selectedCategory])

  return (
    <div className="feedback-backdrop wiki-backdrop" role="presentation" onClick={onClose}>
      <section
        className="feedback-dialog wiki-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiki-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="wiki-header">
          <div className="wiki-title-group">
            <span className="wiki-icon">📖</span>
            <div>
              <h2 id="wiki-modal-title">Wiki de Reglas y Glosario MTG</h2>
              <p className="wiki-subtitle">Consulta de palabras clave, fases de juego y controles del cliente</p>
            </div>
          </div>
          <button type="button" className="wiki-close-btn" onClick={onClose} title="Cerrar (Esc)">
            ✕
          </button>
        </header>

        {/* Navigation Tabs */}
        <nav className="wiki-nav-tabs">
          <button
            type="button"
            className={`wiki-tab-btn ${activeTab === 'glossary' ? 'active' : ''}`}
            onClick={() => setActiveTab('glossary')}
          >
            📚 Palabras Clave ({MTG_KEYWORDS.length})
          </button>
          <button
            type="button"
            className={`wiki-tab-btn ${activeTab === 'phases' ? 'active' : ''}`}
            onClick={() => setActiveTab('phases')}
          >
            ⏱️ Fases y Prioridad
          </button>
          <button
            type="button"
            className={`wiki-tab-btn ${activeTab === 'shortcuts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shortcuts')}
          >
            ⌨️ Atajos y Controles
          </button>
        </nav>

        <div className="wiki-content">
          {/* TAB 1: GLOSARIO DE KEYWORDS */}
          {activeTab === 'glossary' && (
            <div className="wiki-glossary-tab">
              <div className="wiki-search-bar-wrap">
                <span className="wiki-search-icon">🔍</span>
                <input
                  type="text"
                  className="wiki-search-input"
                  placeholder="Buscar palabra clave por nombre en inglés, español o regla (ej. Ward, Arrollar, Scry)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searchQuery && (
                  <button type="button" className="wiki-clear-search" onClick={() => setSearchQuery('')}>
                    ✕
                  </button>
                )}
              </div>

              {/* Category pills */}
              <div className="wiki-category-pills">
                {Object.entries(CATEGORY_LABELS).map(([catKey, catLabel]) => (
                  <button
                    key={catKey}
                    type="button"
                    className={`wiki-pill ${selectedCategory === catKey ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(catKey)}
                  >
                    {catLabel}
                  </button>
                ))}
              </div>

              {/* Keywords List */}
              <div className="wiki-keywords-grid">
                {filteredKeywords.map((kw) => (
                  <article key={kw.id} className={`wiki-kw-card cat-${kw.category}`}>
                    <div className="wiki-kw-card-header">
                      <div className="wiki-kw-card-title">
                        <span className="wiki-kw-icon">{kw.icon}</span>
                        <strong className="wiki-kw-name-en">{kw.name}</strong>
                        <span className="wiki-kw-name-es">({kw.nameEs})</span>
                      </div>
                      <span className="wiki-kw-type-badge">{CATEGORY_LABELS[kw.category] ?? kw.category}</span>
                    </div>
                    <p className="wiki-kw-summary">
                      <FormattedText text={kw.summary} />
                    </p>
                    {kw.ruleSnippet && (
                      <div className="wiki-kw-rule-ref">
                        <FormattedText text={kw.ruleSnippet} />
                      </div>
                    )}
                  </article>
                ))}

                {filteredKeywords.length === 0 && (
                  <div className="wiki-empty">
                    <span>🔍</span>
                    <p>No se encontraron palabras clave que coincidan con "{searchQuery}"</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: FASES Y PRIORIDAD */}
          {activeTab === 'phases' && (
            <div className="wiki-phases-tab">
              <section className="wiki-section">
                <h3>🔄 Secuencia de Fases y Pasos del Turno</h3>
                <div className="wiki-phases-timeline">
                  <div className="phase-block phase-beginning">
                    <div className="phase-title">1. Fase Inicial (Beginning Phase)</div>
                    <div className="phase-steps">
                      <div className="phase-step"><strong>Enderezar (Untap):</strong> Enderezas todos tus permanentes. Nadie recibe prioridad.</div>
                      <div className="phase-step"><strong>Mantenimiento (Upkeep):</strong> Se disparan habilidades de inicio de turno. Los jugadores reciben prioridad.</div>
                      <div className="phase-step"><strong>Robar (Draw):</strong> El jugador activo roba una carta. Ambos jugadores reciben prioridad.</div>
                    </div>
                  </div>

                  <div className="phase-block phase-main">
                    <div className="phase-title">2. Fase Principal 1 (Pre-combat Main)</div>
                    <div className="phase-steps">
                      <div className="phase-step">Puedes jugar una tierra si no has jugado ninguna. Puedes lanzar criaturas, conjuros, artefactos, encantamientos y planeswalkers cuando la pila esté vacía.</div>
                    </div>
                  </div>

                  <div className="phase-block phase-combat">
                    <div className="phase-title">3. Fase de Combate (Combat Phase)</div>
                    <div className="phase-steps">
                      <div className="phase-step"><strong>Inicio del combate:</strong> Última oportunidad para girar criaturas enemigas antes de que ataquen.</div>
                      <div className="phase-step"><strong>Declarar atacantes:</strong> El jugador activo elige criaturas atacantes y se giran (salvo con Vigilancia).</div>
                      <div className="phase-step"><strong>Declarar bloqueadores:</strong> El jugador defensor asigna bloqueadores. Se ordena el daño si hay múltiples bloqueadores.</div>
                      <div className="phase-step"><strong>Daño de combate:</strong> Primero resuelven criaturas con Dañar Primero / Doble Golpe. Luego el daño regular.</div>
                      <div className="phase-step"><strong>Fin del combate:</strong> Se limpian los estados de combate.</div>
                    </div>
                  </div>

                  <div className="phase-block phase-main">
                    <div className="phase-title">4. Fase Principal 2 (Post-combat Main)</div>
                    <div className="phase-steps">
                      <div className="phase-step">Segunda oportunidad para jugar tierras y lanzar cualquier tipo de hechizo o permanente.</div>
                    </div>
                  </div>

                  <div className="phase-block phase-ending">
                    <div className="phase-title">5. Fase Final (Ending Phase)</div>
                    <div className="phase-steps">
                      <div className="phase-step"><strong>Paso final (End Step):</strong> Se disparan habilidades "al comienzo del paso final". Ventana para instantáneos.</div>
                      <div className="phase-step"><strong>Paso de limpieza (Cleanup):</strong> Descartas hasta tu tamaño máximo de mano (7). El daño en criaturas se cura.</div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="wiki-section">
                <h3>⚡ La Pila (The Stack) y Prioridad</h3>
                <div className="wiki-stack-card">
                  <p>
                    <strong>Estructura LIFO (Last In, First Out):</strong> El último hechizo o habilidad que entra a la pila es el primero en resolverse.
                  </p>
                  <p>
                    Cuando lanzas un hechizo o activas una habilidad, ambos jugadores deben <strong>pasar prioridad en secuencia</strong> para que el objeto superior de la pila se resuelva.
                  </p>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: ATAJOS Y CONTROLES */}
          {activeTab === 'shortcuts' && (
            <div className="wiki-shortcuts-tab">
              <div className="wiki-shortcuts-grid">
                <div className="shortcut-card">
                  <span className="shortcut-key">Espacio</span>
                  <div className="shortcut-info">
                    <strong>Pasar Prioridad / Resolver</strong>
                    <p>Resuelve el objeto superior de la pila o pasa al siguiente paso/fase del turno.</p>
                  </div>
                </div>

                <div className="shortcut-card">
                  <span className="shortcut-key">Shift / F</span>
                  <div className="shortcut-info">
                    <strong>Voltear Carta (Double-Faced / MDFC)</strong>
                    <p>Mientras tienes el ratón sobre una carta con dos caras, pulsa Shift o F para ver su reverso.</p>
                  </div>
                </div>

                <div className="shortcut-card">
                  <span className="shortcut-key">Click Izquierdo</span>
                  <div className="shortcut-info">
                    <strong>Jugar / Seleccionar / Girar Tierras</strong>
                    <p>Lanza cartas de tu mano, gira tierras para agregar maná, o declara atacantes y bloqueadores.</p>
                  </div>
                </div>

                <div className="shortcut-card">
                  <span className="shortcut-key">Hover (Ratón)</span>
                  <div className="shortcut-info">
                    <strong>Vista Ampliada & Glosario de Mecánicas</strong>
                    <p>Pasa el ratón sobre cualquier carta para ver su arte en HD y el desglose de todas sus habilidades.</p>
                  </div>
                </div>

                <div className="shortcut-card">
                  <span className="shortcut-key">Esc</span>
                  <div className="shortcut-info">
                    <strong>Cerrar / Cancelar</strong>
                    <p>Cierra ventanas modales, el glosario o cancela modos de selección de objetivos.</p>
                  </div>
                </div>

                <div className="shortcut-card">
                  <span className="shortcut-key">Auto-Pass</span>
                  <div className="shortcut-info">
                    <strong>Pase Automático de Prioridad</strong>
                    <p>Casilla superior derecha para pasar automáticamente cuando no desees responder en turnos ajenos.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="wiki-footer">
          <button type="button" className="primary" onClick={onClose}>
            Entendido
          </button>
        </footer>
      </section>
    </div>
  )
}
