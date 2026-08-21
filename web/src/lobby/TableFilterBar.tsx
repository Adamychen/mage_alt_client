import { useState, useMemo } from 'react'
import type { TableView } from '../net/types'
import './TableFilterBar.css'

export interface TableFilters {
  searchQuery: string
  format: string
  availability: 'all' | 'open' | 'dueling'
  mode: 'all' | '1v1' | 'multi' | 'tourney'
  skill: 'all' | 'BEGINNER' | 'CASUAL' | 'SERIOUS'
  hidePassworded: boolean
  ratedOnly: boolean
  spectatorsOnly: boolean
  aiSeatsOnly: boolean
}

export const INITIAL_TABLE_FILTERS: TableFilters = {
  searchQuery: '',
  format: 'ALL',
  availability: 'all',
  mode: 'all',
  skill: 'all',
  hidePassworded: false,
  ratedOnly: false,
  spectatorsOnly: false,
  aiSeatsOnly: false,
}

export const POPULAR_FORMATS = [
  { id: 'ALL', label: 'Todos', icon: '🌐' },
  { id: 'Commander', label: 'Commander', icon: '👑' },
  { id: 'Modern', label: 'Modern', icon: '⚡' },
  { id: 'Pioneer', label: 'Pioneer', icon: '🛡️' },
  { id: 'Standard', label: 'Standard', icon: '📜' },
  { id: 'Pauper', label: 'Pauper', icon: '💎' },
  { id: 'Limited', label: 'Limitado', icon: '📦' },
]

export const OTHER_COMMON_FORMATS = [
  'Constructed - Legacy',
  'Constructed - Vintage',
  'Constructed - Brawl',
  'Constructed - Historic',
  'Constructed - Canadian Highlander',
  'Constructed - Penny Dreadful',
  'Constructed - Freeform',
  'Constructed - Tiny Leaders',
]

export function filterTables(tables: TableView[], filters: TableFilters): TableView[] {
  return tables.filter((t) => {
    // 1. Search Query (matches name, controller, formats, seats)
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim()
      const matchName = t.tableName?.toLowerCase().includes(q)
      const matchController = t.controllerName?.toLowerCase().includes(q)
      const matchGameType = t.gameType?.toLowerCase().includes(q)
      const matchDeckType = t.deckType?.toLowerCase().includes(q)
      const matchShort = t.additionalInfoShort?.toLowerCase().includes(q)
      const matchFull = t.additionalInfoFull?.toLowerCase().includes(q)
      const matchSeats = t.seats?.some((s) => s.playerName?.toLowerCase().includes(q))
      if (!matchName && !matchController && !matchGameType && !matchDeckType && !matchShort && !matchFull && !matchSeats) {
        return false
      }
    }

    // 2. Format
    if (filters.format !== 'ALL') {
      const f = filters.format.toLowerCase()
      if (filters.format === 'Commander') {
        const isComm =
          t.deckType?.toLowerCase().includes('commander') ||
          t.gameType?.toLowerCase().includes('commander') ||
          t.deckType?.toLowerCase().includes('brawl')
        if (!isComm) return false
      } else if (filters.format === 'Modern') {
        if (!t.deckType?.toLowerCase().includes('modern')) return false
      } else if (filters.format === 'Pioneer') {
        if (!t.deckType?.toLowerCase().includes('pioneer') && !t.deckType?.toLowerCase().includes('explorer')) return false
      } else if (filters.format === 'Standard') {
        if (!t.deckType?.toLowerCase().includes('standard')) return false
      } else if (filters.format === 'Pauper') {
        if (!t.deckType?.toLowerCase().includes('pauper')) return false
      } else if (filters.format === 'Limited') {
        const isLim =
          t.limited === true ||
          t.deckType?.toLowerCase().includes('draft') ||
          t.deckType?.toLowerCase().includes('sealed') ||
          t.deckType?.toLowerCase().includes('cube')
        if (!isLim) return false
      } else {
        if (!t.deckType?.toLowerCase().includes(f) && !t.gameType?.toLowerCase().includes(f)) return false
      }
    }

    // 3. Availability
    if (filters.availability === 'open') {
      const isPending = t.tableState === 'WAITING' || t.tableState === 'READY_TO_START'
      const hasEmptySeat = t.seats?.some((s) => !s.playerName)
      if (!isPending || !hasEmptySeat) return false
    } else if (filters.availability === 'dueling') {
      const isPlaying = t.tableState === 'DUELING' || t.tableState === 'SIDEBOARDING'
      if (!isPlaying) return false
    }

    // 4. Mode
    if (filters.mode === '1v1') {
      const is1v1 = !t.isTournament && (t.gameType?.toLowerCase().includes('duel') || (t.seats && t.seats.length === 2))
      if (!is1v1) return false
    } else if (filters.mode === 'multi') {
      const isMulti =
        !t.isTournament &&
        ((t.seats && t.seats.length > 2) ||
          t.gameType?.toLowerCase().includes('free for all') ||
          t.gameType?.toLowerCase().includes('giant'))
      if (!isMulti) return false
    } else if (filters.mode === 'tourney') {
      if (!t.isTournament) return false
    }

    // 5. Skill Level
    if (filters.skill !== 'all') {
      if (t.skillLevel?.toUpperCase() !== filters.skill.toUpperCase()) return false
    }

    // 6. Modifiers
    if (filters.hidePassworded && t.passworded) return false
    if (filters.ratedOnly && !t.rated) return false
    if (filters.spectatorsOnly && !t.spectatorsAllowed) return false
    if (filters.aiSeatsOnly) {
      const hasAiSeat =
        (t.tableState === 'WAITING' || t.tableState === 'READY_TO_START') &&
        t.seats?.some((s) => !s.playerName && s.playerType && /COMPUTER|AI/i.test(s.playerType))
      if (!hasAiSeat) return false
    }

    return true
  })
}

interface TableFilterBarProps {
  tables: TableView[]
  filters: TableFilters
  onChange: (newFilters: TableFilters) => void
  onReset: () => void
}

export default function TableFilterBar({ tables, filters, onChange, onReset }: TableFilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Count active tables per popular format
  const formatCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: tables.length }
    POPULAR_FORMATS.forEach((pf) => {
      if (pf.id === 'ALL') return
      counts[pf.id] = filterTables(tables, { ...INITIAL_TABLE_FILTERS, format: pf.id }).length
    })
    return counts
  }, [tables])

  // Extract all formats present in currently loaded tables
  const extraFormats = useMemo(() => {
    const list = new Set<string>(OTHER_COMMON_FORMATS)
    tables.forEach((t) => {
      if (t.deckType) list.add(t.deckType)
    })
    return Array.from(list)
      .filter((f) => {
        const lower = f.toLowerCase()
        return (
          !lower.includes('commander') &&
          !lower.includes('modern') &&
          !lower.includes('pioneer') &&
          !lower.includes('standard') &&
          !lower.includes('pauper') &&
          !lower.includes('draft') &&
          !lower.includes('sealed') &&
          !lower.includes('cube')
        )
      })
      .sort()
  }, [tables])

  // Count active filters (excluding defaults)
  const activeCount = useMemo(() => {
    let c = 0
    if (filters.searchQuery.trim()) c++
    if (filters.format !== 'ALL') c++
    if (filters.availability !== 'all') c++
    if (filters.mode !== 'all') c++
    if (filters.skill !== 'all') c++
    if (filters.hidePassworded) c++
    if (filters.ratedOnly) c++
    if (filters.spectatorsOnly) c++
    if (filters.aiSeatsOnly) c++
    return c
  }, [filters])

  const isOtherFormatSelected = !POPULAR_FORMATS.some((p) => p.id === filters.format)

  return (
    <div className="table-filter-bar-container">
      {/* Row 1: Search & Quick Status Toggles */}
      <div className="tfb-row tfb-top-row">
        <div className="tfb-search-box">
          <span className="tfb-search-icon">🔍</span>
          <input
            type="text"
            className="tfb-search-input"
            placeholder="Buscar por mesa, anfitrión o formato… (Esc)"
            value={filters.searchQuery}
            onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onChange({ ...filters, searchQuery: '' })
            }}
          />
          {filters.searchQuery && (
            <button
              type="button"
              className="tfb-clear-search-btn"
              onClick={() => onChange({ ...filters, searchQuery: '' })}
              title="Limpiar búsqueda"
            >
              &times;
            </button>
          )}
        </div>

        <div className="tfb-quick-toggles">
          <button
            type="button"
            className={`tfb-pill-btn ${filters.availability === 'open' ? 'active' : ''}`}
            onClick={() =>
              onChange({
                ...filters,
                availability: filters.availability === 'open' ? 'all' : 'open',
              })
            }
            title="Mostrar solo mesas con plazas libres para unirse"
          >
            <span className="tfb-pill-dot open-dot" />
            <span>Plazas libres</span>
          </button>

          <button
            type="button"
            className={`tfb-pill-btn ${filters.availability === 'dueling' ? 'active' : ''}`}
            onClick={() =>
              onChange({
                ...filters,
                availability: filters.availability === 'dueling' ? 'all' : 'dueling',
              })
            }
            title="Mostrar solo partidas en juego para espectar"
          >
            <span>👁️ En juego</span>
          </button>

          <button
            type="button"
            className={`tfb-pill-btn tfb-advanced-trigger ${showAdvanced || activeCount > 0 ? 'is-open' : ''}`}
            onClick={() => setShowAdvanced((v) => !v)}
            title="Abrir filtros avanzados"
          >
            <span>⚙️ Filtros</span>
            {activeCount > 0 && <span className="tfb-active-badge">{activeCount}</span>}
            <span className="tfb-arrow-icon">{showAdvanced ? '▴' : '▾'}</span>
          </button>

          {activeCount > 0 && (
            <button
              type="button"
              className="tfb-reset-btn"
              onClick={onReset}
              title="Restablecer todos los filtros"
            >
              <span>Restablecer</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Format Pills Strip */}
      <div className="tfb-row tfb-formats-row">
        <div className="tfb-format-chips">
          {POPULAR_FORMATS.map((pf) => {
            const count = formatCounts[pf.id] ?? 0
            const isActive = filters.format === pf.id
            return (
              <button
                key={pf.id}
                type="button"
                className={`tfb-format-chip ${isActive ? 'active' : ''}`}
                onClick={() => onChange({ ...filters, format: pf.id })}
              >
                <span className="tfb-chip-icon">{pf.icon}</span>
                <span className="tfb-chip-label">{pf.label}</span>
                <span className="tfb-chip-count">{count}</span>
              </button>
            )
          })}

          {/* More Formats Dropdown */}
          <div className="tfb-more-formats-wrap">
            <select
              className={`tfb-more-select ${isOtherFormatSelected ? 'active' : ''}`}
              value={isOtherFormatSelected ? filters.format : ''}
              onChange={(e) => {
                if (e.target.value) {
                  onChange({ ...filters, format: e.target.value })
                }
              }}
            >
              <option value="" disabled>
                {isOtherFormatSelected ? `Formato: ${filters.format}` : '▾ Más formatos…'}
              </option>
              {extraFormats.map((fmt) => (
                <option key={fmt} value={fmt}>
                  {fmt.replace(/^Constructed - /, '')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Row 3: Advanced Collapsible Drawer */}
      {showAdvanced && (
        <div className="tfb-advanced-drawer">
          {/* Mode group */}
          <div className="tfb-drawer-section">
            <span className="tfb-section-label">Modo de juego:</span>
            <div className="tfb-button-group">
              <button
                type="button"
                className={`tfb-sub-pill ${filters.mode === 'all' ? 'active' : ''}`}
                onClick={() => onChange({ ...filters, mode: 'all' })}
              >
                Todos
              </button>
              <button
                type="button"
                className={`tfb-sub-pill ${filters.mode === '1v1' ? 'active' : ''}`}
                onClick={() => onChange({ ...filters, mode: '1v1' })}
              >
                ⚔️ Duelo 1v1
              </button>
              <button
                type="button"
                className={`tfb-sub-pill ${filters.mode === 'multi' ? 'active' : ''}`}
                onClick={() => onChange({ ...filters, mode: 'multi' })}
              >
                👥 Multijugador (3-4p)
              </button>
              <button
                type="button"
                className={`tfb-sub-pill ${filters.mode === 'tourney' ? 'active' : ''}`}
                onClick={() => onChange({ ...filters, mode: 'tourney' })}
              >
                🏆 Torneo
              </button>
            </div>
          </div>

          {/* Skill group */}
          <div className="tfb-drawer-section">
            <span className="tfb-section-label">Nivel de habilidad:</span>
            <div className="tfb-button-group">
              <button
                type="button"
                className={`tfb-sub-pill ${filters.skill === 'all' ? 'active' : ''}`}
                onClick={() => onChange({ ...filters, skill: 'all' })}
              >
                Cualquiera
              </button>
              <button
                type="button"
                className={`tfb-sub-pill ${filters.skill === 'BEGINNER' ? 'active' : ''}`}
                onClick={() => onChange({ ...filters, skill: 'BEGINNER' })}
              >
                ⭐ Novato
              </button>
              <button
                type="button"
                className={`tfb-sub-pill ${filters.skill === 'CASUAL' ? 'active' : ''}`}
                onClick={() => onChange({ ...filters, skill: 'CASUAL' })}
              >
                ⭐⭐ Casual
              </button>
              <button
                type="button"
                className={`tfb-sub-pill ${filters.skill === 'SERIOUS' ? 'active' : ''}`}
                onClick={() => onChange({ ...filters, skill: 'SERIOUS' })}
              >
                ⭐⭐⭐ Competitivo
              </button>
            </div>
          </div>

          {/* Options & Access Checkboxes */}
          <div className="tfb-drawer-section tfb-switches-section">
            <span className="tfb-section-label">Opciones de acceso:</span>
            <div className="tfb-switches-grid">
              <label className="tfb-switch-label">
                <input
                  type="checkbox"
                  checked={filters.hidePassworded}
                  onChange={(e) => onChange({ ...filters, hidePassworded: e.target.checked })}
                />
                <span>🔓 Ocultar privadas con contraseña</span>
              </label>

              <label className="tfb-switch-label">
                <input
                  type="checkbox"
                  checked={filters.ratedOnly}
                  onChange={(e) => onChange({ ...filters, ratedOnly: e.target.checked })}
                />
                <span>🏅 Solo clasificatorias (Rated)</span>
              </label>

              <label className="tfb-switch-label">
                <input
                  type="checkbox"
                  checked={filters.spectatorsOnly}
                  onChange={(e) => onChange({ ...filters, spectatorsOnly: e.target.checked })}
                />
                <span>👁️ Permitir espectadores</span>
              </label>

              <label className="tfb-switch-label">
                <input
                  type="checkbox"
                  checked={filters.aiSeatsOnly}
                  onChange={(e) => onChange({ ...filters, aiSeatsOnly: e.target.checked })}
                />
                <span>🤖 Con plazas de IA</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
