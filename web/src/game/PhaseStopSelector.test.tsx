import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PhaseStopSelector from './PhaseStopSelector'
import { reset } from '../state/store'

vi.mock('../net/commands', () => ({
  updatePreferences: vi.fn().mockResolvedValue({ ok: true }),
}))

describe('PhaseStopSelector', () => {
  beforeEach(() => {
    reset()
    vi.clearAllMocks()
  })

  it('renders rows for your turn and opponent turn', () => {
    const { container } = render(<PhaseStopSelector />)
    expect(container.textContent).toContain('You')
    expect(container.textContent).toContain('Opp')
  })

  it('renders all 7 phase abbreviations', () => {
    const { container } = render(<PhaseStopSelector />)
    const btns = container.querySelectorAll('.phase-stop-btn')
    const labels = Array.from(btns).map((b) => b.textContent)
    for (const abbr of ['UP', 'DR', 'M1', 'BC', 'EC', 'M2', 'ET']) {
      expect(labels.filter((l) => l === abbr).length).toBe(2)
    }
  })

  it('has 14 phase stop buttons total', () => {
    const { container } = render(<PhaseStopSelector />)
    const allBtns = container.querySelectorAll('.phase-stop-btn')
    expect(allBtns.length).toBe(14)
  })

  it('default state has main1 and main2 off', () => {
    const { container } = render(<PhaseStopSelector />)
    const btns = container.querySelectorAll('.phase-stop-btn')
    const activeCount = Array.from(btns).filter((b) => b.classList.contains('active')).length
    // 4 active per row (UP, DR, BC, ET) × 2 rows = 8
    expect(activeCount).toBe(8)
  })
})
