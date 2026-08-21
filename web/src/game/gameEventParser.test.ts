import { describe, expect, it } from 'vitest'
import { cleanMageText, parseGameEvent } from './gameEventParser'

describe('gameEventParser', () => {
  it('cleans HTML and font tags from XMage text', () => {
    const raw = "<font color='#ffaa00'>Player</font> casts <font color='cyan'>Lightning Bolt</font>"
    expect(cleanMageText(raw)).toBe('Player casts Lightning Bolt')
  })

  it('parses turn change events', () => {
    const res = parseGameEvent('Turn 3 (Alice)', 'Bob')
    expect(res).not.toBeNull()
    expect(res?.type).toBe('turn')
    expect(res?.amount).toBe(3)
    expect(res?.playerName).toBe('Alice')
    expect(res?.isMe).toBe(false)
  })

  it('parses spell casts with and without targets', () => {
    const withTarget = parseGameEvent('Alice casts Lightning Bolt [target: Bob]', 'Alice')
    expect(withTarget?.type).toBe('cast')
    expect(withTarget?.cardName).toBe('Lightning Bolt')
    expect(withTarget?.targetName).toBe('Bob')
    expect(withTarget?.isMe).toBe(true)

    const noTarget = parseGameEvent('Bob casts Wrath of God', 'Alice')
    expect(noTarget?.type).toBe('cast')
    expect(noTarget?.cardName).toBe('Wrath of God')
    expect(noTarget?.targetName).toBeUndefined()
    expect(noTarget?.isMe).toBe(false)
  })

  it('parses land drops', () => {
    const res = parseGameEvent('Alice plays Mountain', 'Alice')
    expect(res?.type).toBe('land')
    expect(res?.cardName).toBe('Mountain')
    expect(res?.isMe).toBe(true)
  })

  it('parses attack and block declarations', () => {
    const attack = parseGameEvent('Alice attacks with Grizzly Bears', 'Alice')
    expect(attack?.type).toBe('attack')
    expect(attack?.cardName).toBe('Grizzly Bears')

    const block = parseGameEvent('Bob blocks Grizzly Bears with Llanowar Elves', 'Alice')
    expect(block?.type).toBe('block')
    expect(block?.cardName).toBe('Llanowar Elves')
    expect(block?.targetName).toBe('Grizzly Bears')
  })

  it('parses damage and life loss / gain', () => {
    const dmg = parseGameEvent('Lightning Bolt deals 3 damage to Bob', 'Bob')
    expect(dmg?.type).toBe('damage')
    expect(dmg?.cardName).toBe('Lightning Bolt')
    expect(dmg?.targetName).toBe('Bob')
    expect(dmg?.amount).toBe(3)
    expect(dmg?.isMe).toBe(true)

    const lifeLoss = parseGameEvent('Bob loses 2 life', 'Bob')
    expect(lifeLoss?.type).toBe('life')
    expect(lifeLoss?.amount).toBe(-2)

    const lifeGain = parseGameEvent('Alice gains 4 life', 'Bob')
    expect(lifeGain?.type).toBe('life')
    expect(lifeGain?.amount).toBe(4)
  })

  it('parses draw and discard', () => {
    const draw = parseGameEvent('Alice draws a card', 'Alice')
    expect(draw?.type).toBe('draw')
    expect(draw?.amount).toBe(1)

    const discard = parseGameEvent('Bob discards Thoughtseize', 'Bob')
    expect(discard?.type).toBe('discard')
    expect(discard?.cardName).toBe('Thoughtseize')
  })

  it('parses ability activations and triggers', () => {
    const trigger = parseGameEvent('Ability triggers: Soul Warden - Gain 1 life', 'Bob')
    expect(trigger?.type).toBe('ability')
    expect(trigger?.cardName).toBe('Soul Warden')

    const activate = parseGameEvent('Alice activates an ability of Sensei\'s Divining Top', 'Alice')
    expect(activate?.type).toBe('ability')
    expect(activate?.cardName).toBe('Sensei\'s Divining Top')
  })
})
