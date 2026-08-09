import { describe, expect, it } from 'vitest'
import { parseFeedback } from './feedback'

describe('parseFeedback', () => {
  it('maps mulligan asks to boolean options (XMage: true = mulligan, false = keep)', () => {
    const prompt = parseFeedback('GAME_ASK', 'game-1', {
      message: 'Keep your hand or mulligan?',
      options: { keep: 'Keep hand', mulligan: 'Mulligan' },
    })
    expect(prompt?.mode).toBe('boolean')
    expect(prompt?.options).toEqual([
      { id: 'keep', label: 'Keep hand', value: 'false' },
      { id: 'mulligan', label: 'Mulligan', value: 'true' },
    ])
  })

  it('maps target UUIDs and labels them from cardsView1', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-2', {
      message: 'Choose a target',
      targets: ['card-1'],
      cardsView1: { 'card-1': { id: 'card-1', name: 'Forest' } },
    })
    expect(prompt?.mode).toBe('uuid')
    expect(prompt?.options).toEqual([{ id: 'card-1', label: 'Forest', value: 'card-1' }])
    expect(prompt?.required).toBe(true)
  })

  it('keeps optional target prompts finishable without selecting a target', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-2', {
      message: 'You may choose a target',
      flag: false,
      targets: [],
    })
    expect(prompt?.required).toBe(false)
  })

  it('falls back to cardsView1 when XMage omits the target UUID set', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-2', {
      message: 'Choose a target',
      cardsView1: { 'card-1': { id: 'card-1', name: 'Forest' } },
    })
    expect(prompt?.options).toEqual([{ id: 'card-1', label: 'Forest', value: 'card-1' }])
  })

  it('labels player targets from the embedded GameView', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-2', {
      message: 'Choose a player',
      targets: ['player-2'],
      gameView: { players: [{ playerId: 'player-2', name: 'Bob' }] },
    })
    expect(prompt?.options).toEqual([{ id: 'player-2', label: 'Bob', value: 'player-2' }])
  })

  it('labels hand-card targets from the embedded GameView (London mulligan bottom)', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-2', {
      message: 'Select a card (1 more) to put on the bottom of your library',
      targets: ['card-1', 'card-2'],
      gameView: { myHand: { 'card-1': { id: 'card-1', name: 'Mountain' }, 'card-2': { id: 'card-2', name: 'Island' } } },
    })
    expect(prompt?.options).toEqual([
      { id: 'card-1', label: 'Mountain', value: 'card-1' },
      { id: 'card-2', label: 'Island', value: 'card-2' },
    ])
  })

  it('labels battlefield targets from the embedded GameView', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-2', {
      message: 'Choose a creature',
      targets: ['perm-1'],
      gameView: { players: [{ playerId: 'p-1', name: 'Alice', battlefield: { 'perm-1': { id: 'perm-1', name: 'Grizzly Bears' } } }] },
    })
    expect(prompt?.options).toEqual([{ id: 'perm-1', label: 'Grizzly Bears', value: 'perm-1' }])
  })

  it('does not treat GAME_SELECT priority as a modal card selection', () => {
    expect(parseFeedback('GAME_SELECT', 'game-2', { message: 'Play spells and abilities' })).toBeNull()
  })

  it('maps amount bounds and multi-amount items', () => {
    const amount = parseFeedback('GAME_GET_AMOUNT', 'game-3', { message: 'How many?', min: 1, max: 4 })
    expect(amount).toMatchObject({ mode: 'integer', min: 1, max: 4 })

    const multi = parseFeedback('GAME_GET_MULTI_AMOUNT', 'game-3', {
      min: 0,
      max: 5,
      messages: [{ id: 'x', message: 'First', min: 1, max: 2, defaultValue: 2 }],
    })
    expect(multi?.mode).toBe('multiString')
    expect(multi?.items).toEqual([{ id: 'x', label: 'First', min: 1, max: 2, defaultValue: 2 }])
  })

  it('maps pile choices to booleans and mana to a controlled player', () => {
    const pile = parseFeedback('GAME_CHOOSE_PILE', 'game-4', { cardsView1: { a: {} }, cardsView2: { b: {}, c: {} } })
    expect(pile?.options.map((option) => option.value)).toEqual(['true', 'false'])

    const mana = parseFeedback('GAME_PLAY_MANA', 'game-4', {
      gameView: { players: [{ controlled: true, playerId: 'player-1' }] },
      options: { RED: 'Red' },
    })
    expect(mana).toMatchObject({ mode: 'mana', playerId: 'player-1' })
    expect(mana?.options[0].value).toBe('RED')
  })

  it('maps the server AbilityPickerView and keyed choices', () => {
    const ability = parseFeedback('GAME_CHOOSE_ABILITY', 'game-5', {
      message: 'Choose an ability',
      choices: { 'ability-1': 'Cast the first spell' },
    })
    expect(ability?.options).toEqual([{ id: 'ability-1', label: 'Cast the first spell', value: 'ability-1' }])

    const choice = parseFeedback('GAME_CHOOSE_CHOICE', 'game-5', {
      choice: { message: 'Choose a mode', keyChoices: { 'mode-a': 'First mode' } },
    })
    expect(choice?.options).toEqual([{ id: 'mode-a', label: 'First mode', value: 'mode-a' }])
  })
})
