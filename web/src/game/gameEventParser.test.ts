import { describe, expect, it } from 'vitest'
import { cleanMageText, parseGameEvent } from './gameEventParser'

describe('gameEventParser', () => {
  it('cleans HTML tags and XMage 3-hex object IDs', () => {
    const raw = "<font color='#ffaa00'>Player</font> casts <font color='cyan'>Lightning Bolt</font> [a1b] from Hand"
    expect(cleanMageText(raw)).toBe('Player casts Lightning Bolt from Hand')
  })

  it('parses real XMage turn events with life totals', () => {
    const res = parseGameEvent('Turn 1 Player1 (0 - 20)', 'Player1')
    expect(res).not.toBeNull()
    expect(res?.type).toBe('turn')
    expect(res?.amount).toBe(1)
    expect(res?.playerName).toBe('Player1')
    expect(res?.isMe).toBe(true)
  })

  it('parses real XMage spell casts with [abc] IDs, targets and zone suffix', () => {
    const raw1 = "<font color='#ffaa00'>Alice</font> casts <font color='cyan'>Lightning Bolt</font> [3f9] [target: <font color='#ffaa00'>Bob</font>] from Hand"
    const withTarget = parseGameEvent(raw1, 'Alice')
    expect(withTarget?.type).toBe('cast')
    expect(withTarget?.cardName).toBe('Lightning Bolt')
    expect(withTarget?.targetName).toBe('Bob')
    expect(withTarget?.isMe).toBe(true)

    const raw2 = 'Bob casts Wrath of God [12a] from Hand'
    const noTarget = parseGameEvent(raw2, 'Alice')
    expect(noTarget?.type).toBe('cast')
    expect(noTarget?.cardName).toBe('Wrath of God')
    expect(noTarget?.targetName).toBeUndefined()
    expect(noTarget?.isMe).toBe(false)
  })

  it('parses real XMage land drops with [abc] IDs and from Hand', () => {
    const raw = "<font color='#ffaa00'>Alice</font> plays <font color='cyan'>Mountain</font> [e01] from Hand"
    const res = parseGameEvent(raw, 'Alice')
    expect(res?.type).toBe('land')
    expect(res?.cardName).toBe('Mountain')
    expect(res?.isMe).toBe(true)
  })

  it('parses real XMage attacks and blocks', () => {
    const attack = parseGameEvent('Alice attacks with Grizzly Bears [4b2]', 'Alice')
    expect(attack?.type).toBe('attack')
    expect(attack?.cardName).toBe('Grizzly Bears')

    const block = parseGameEvent('Bob blocks Grizzly Bears [4b2] with Llanowar Elves [99c]', 'Alice')
    expect(block?.type).toBe('block')
    expect(block?.cardName).toBe('Llanowar Elves')
    expect(block?.targetName).toBe('Grizzly Bears')
  })

  it('parses real XMage damage and life changes', () => {
    const dmg = parseGameEvent('Lightning Bolt [3f9] deals 3 damage to Bob', 'Bob')
    expect(dmg?.type).toBe('damage')
    expect(dmg?.cardName).toBe('Lightning Bolt')
    expect(dmg?.targetName).toBe('Bob')
    expect(dmg?.amount).toBe(3)
    expect(dmg?.isMe).toBe(true)

    const lifeLoss = parseGameEvent('Bob loses 2 life', 'Bob')
    expect(lifeLoss?.type).toBe('life')
    expect(lifeLoss?.amount).toBe(-2)

    const lifeGain = parseGameEvent('Alice gains 4 life', 'Alice')
    expect(lifeGain?.type).toBe('life')
    expect(lifeGain?.amount).toBe(4)
  })
})
