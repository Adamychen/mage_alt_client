import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
