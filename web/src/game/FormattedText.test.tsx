import { render, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FormattedText, { cleanMageHtml, decodeHtmlEntities } from './FormattedText'

describe('FormattedText', () => {
  it('decodes HTML entities properly', () => {
    expect(decodeHtmlEntities('&iexcl;Hola desde el cliente web!')).toBe('¡Hola desde el cliente web!')
    expect(decodeHtmlEntities('&quot;Hello&quot; &amp; &lt;World&gt;')).toBe('"Hello" & <World>')
  })

  it('cleans XMage internal object hashes and raw div tags', () => {
    const raw = "Pay {R}<div style='font-size:11pt'><font color='#FF6347' object_id='3736f396-aef9-421c-ae65-453d81b8d0aa'>Lightning Bolt</font> [373]</div>"
    expect(cleanMageHtml(raw)).toBe('Pay {R} Lightning Bolt')
  })

  it('renders MTG mana symbols as styled badges', () => {
    const { container } = render(<FormattedText text="Pay {R} to cast Lightning Bolt" />)
    expect(container.textContent).toContain('Pay')
    expect(container.textContent).toContain('to cast Lightning Bolt')
    const badge = container.querySelector('.mana-badge.mana-r')
    expect(badge).toBeTruthy()
    expect(badge?.textContent).toBe('R')
  })

  it('renders colored text and handles the exact screenshot HTML payload', () => {
    const raw = "Pay {R}<div style='font-size:11pt'><font color='#FF6347' object_id='3736f396-aef9-421c-ae65-453d81b8d0aa'>Lightning Bolt</font> [373]</div>"
    const { container } = render(<FormattedText text={raw} />)

    expect(container.textContent).toContain('Pay')
    expect(container.textContent).toContain('Lightning Bolt')
    expect(container.textContent).not.toContain('<div')
    expect(container.textContent).not.toContain('[373]')

    const colored = container.querySelector('.formatted-colored') as HTMLElement
    expect(colored).toBeTruthy()
    expect(colored.textContent).toBe('Lightning Bolt')
    expect(colored.style.color).toBe('rgb(255, 99, 71)') // #FF6347

    const manaBadge = container.querySelector('.mana-badge.mana-r')
    expect(manaBadge).toBeTruthy()
  })

  it('renders chat message entities', () => {
    const { container } = render(<FormattedText text="player1: &iexcl;Hola desde el cliente web!" />)
    expect(container.textContent).toBe('player1: ¡Hola desde el cliente web!')
  })

  it('renders complex multi-font XMage chat actions with object_id attributes cleanly without raw tags or hashes', () => {
    const raw = "<font color='#20B2AA'>ForsakenOne</font> discards <font color='#87CEFA' object_id='dcf48010-80b0-45a6-bf5b-f3997042784a'>Murktide Regent</font> [dcf] (source: <font color='#DAA520' object_id='9b43937e-1d89-405c-a630-e796de0eaa17'>Psychic Frog</font> [9b4])"

    expect(cleanMageHtml(raw)).toBe('ForsakenOne discards Murktide Regent (source: Psychic Frog)')

    const { container } = render(<FormattedText text={raw} />)
    expect(container.textContent).toBe('ForsakenOne discards Murktide Regent (source: Psychic Frog)')
    expect(container.textContent).not.toContain('<font')
    expect(container.textContent).not.toContain('object_id')
    expect(container.textContent).not.toContain('[dcf]')
    expect(container.textContent).not.toContain('[9b4]')

    const coloredSpans = container.querySelectorAll('.formatted-colored')
    expect(coloredSpans).toHaveLength(3)
    expect(coloredSpans[0].textContent).toBe('ForsakenOne')
    expect(coloredSpans[1].textContent).toBe('Murktide Regent')
    expect(coloredSpans[2].textContent).toBe('Psychic Frog')
  })

  it('triggers onHover when mouse enters card elements and clears on leave', () => {
    const onHover = vi.fn()
    const raw = "<font color='#20B2AA'>ForsakenOne</font> discards <font color='#87CEFA' object_id='dcf48010-80b0-45a6-bf5b-f3997042784a'>Murktide Regent</font>"

    const { container } = render(<FormattedText text={raw} onHover={onHover} />)
    const cardSpan = container.querySelector('.formatted-colored.is-card')
    expect(cardSpan).toBeTruthy()
    expect(cardSpan?.textContent).toBe('Murktide Regent')

    // Mouse enter card
    fireEvent.mouseEnter(cardSpan!)
    expect(onHover).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Murktide Regent' }),
      expect.anything()
    )

    // Mouse leave card
    fireEvent.mouseLeave(cardSpan!)
    expect(onHover).toHaveBeenCalledWith(null)
  })
})
