import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import HelpWikiModal from './HelpWikiModal'

describe('HelpWikiModal', () => {
  afterEach(cleanup)
  it('renders with glossary tab active and lists keywords', () => {
    const onClose = vi.fn()
    render(<HelpWikiModal onClose={onClose} />)

    expect(screen.getByText('Wiki de Reglas y Glosario MTG')).toBeDefined()
    expect(screen.getByPlaceholderText(/Buscar palabra clave/i)).toBeDefined()
    expect(screen.getAllByText(/Flying/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Volar/i).length).toBeGreaterThan(0)
  })

  it('filters keywords based on search input', () => {
    const onClose = vi.fn()
    render(<HelpWikiModal onClose={onClose} />)

    const searchInput = screen.getByPlaceholderText(/Buscar palabra clave/i)
    fireEvent.change(searchInput, { target: { value: 'Trample' } })

    expect(screen.getByText(/Trample/i)).toBeDefined()
    expect(screen.getByText(/Arrollar/i)).toBeDefined()
    expect(screen.queryByText(/^Flying$/i)).toBeNull()
  })

  it('switches between tabs (Fases y Atajos)', () => {
    const onClose = vi.fn()
    render(<HelpWikiModal onClose={onClose} />)

    // Switch to Phases tab
    const phasesTabBtn = screen.getByRole('button', { name: /Fases y Prioridad/i })
    fireEvent.click(phasesTabBtn)

    expect(screen.getByText(/Fase Inicial/i)).toBeDefined()
    expect(screen.getByText(/Fase de Combate/i)).toBeDefined()
    expect(screen.getByText(/La Pila \(The Stack\)/i)).toBeDefined()

    // Switch to Shortcuts tab
    const shortcutsTabBtn = screen.getByRole('button', { name: /Atajos y Controles/i })
    fireEvent.click(shortcutsTabBtn)

    expect(screen.getByText('Espacio')).toBeDefined()
    expect(screen.getByText(/Pasar Prioridad \/ Resolver/i)).toBeDefined()
  })

  it('calls onClose when clicking close button or Entendido', () => {
    const onClose = vi.fn()
    render(<HelpWikiModal onClose={onClose} />)

    const closeBtn = screen.getByTitle(/Cerrar/i)
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)

    const understoodBtn = screen.getByRole('button', { name: 'Entendido' })
    fireEvent.click(understoodBtn)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
