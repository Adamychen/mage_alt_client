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

  it('exposes the source object name from options.secondMessage', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-2', {
      message: 'Choose target creature or player',
      targets: ['perm-1'],
      options: { secondMessage: 'Lightning Bolt' },
      gameView: { players: [] },
    })
    expect(prompt?.sourceName).toBe('Lightning Bolt')
    expect(parseFeedback('GAME_TARGET', 'game-2', { targets: [], gameView: {} })?.sourceName).toBeUndefined()
  })

  it('strips HTML tags from secondMessage', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-2', {
      targets: ['perm-1'],
      options: { secondMessage: "<FONT COLOR='#FF6347'>Lightning Bolt</FONT> [e67]" },
      gameView: { players: [] },
    })
    expect(prompt?.sourceName).toBe('Lightning Bolt [e67]')
  })

  it('labels array-form card targets by id or parentId', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-2', {
      message: 'Choose a target',
      targets: ['card-1', 'child-2'],
      cardsView1: [
        { id: 'card-1', name: 'Forest' },
        { parentId: 'child-2', displayName: 'Island' },
      ],
    })
    expect(prompt?.options.map((option) => option.label)).toEqual(['Forest', 'Island'])
  })

  it('exposes already chosen targets for multi-target queries', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-2', {
      message: 'Choose up to two targets',
      targets: ['perm-2', 'perm-3'],
      options: { chosenTargets: ['perm-1'] },
      gameView: { players: [] },
    })
    expect(prompt?.chosenTargets).toEqual(['perm-1'])
    expect(parseFeedback('GAME_TARGET', 'game-2', { targets: [], gameView: {} })?.chosenTargets).toBeUndefined()
  })

  it('maps "pass anyway?" asks to a boolean (XMage: true = pass)', () => {
    const prompt = parseFeedback('GAME_ASK', 'game-1', {
      message: 'You still have mana in your mana pool. Do you want to continue playing or pass anyway?',
      options: { 'pass-anyway': 'Pass anyway?', 'continue': 'Continue playing' },
    })
    expect(prompt?.mode).toBe('boolean')
    expect(prompt?.options.map((option) => option.value)).toEqual(['true', 'false'])
  })

  it('maps mulligan boolean labels via no/yes keywords and positional fallbacks', () => {
    const prompt = parseFeedback('GAME_ASK', 'game-1', {
      message: 'Mulligan?',
      options: {
        maybe: 'Maybe',
        cancel: 'No, thank you',
        accept: 'Yes, go ahead',
        later: 'Never mind',
      },
    })
    expect(prompt?.mode).toBe('boolean')
    expect(prompt?.options.map((option) => option.value)).toEqual(['true', 'false', 'true', 'false'])
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

    // GAME_PLAY_MANA: el servidor no manda colores (solo queryType); el pago es
    // clicando fuentes de maná en el tablero, por lo que no debe fabricar botones.
    const mana = parseFeedback('GAME_PLAY_MANA', 'game-4', {
      gameView: { players: [{ controlled: true, playerId: 'player-1' }] },
      options: { queryType: 'PLAY_MANA' },
    })
    expect(mana).toMatchObject({ mode: 'mana', playerId: 'player-1' })
    expect(mana?.options).toEqual([])
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

  it('extracts cards from cardsView1 into the cards field', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-6', {
      message: 'Search your library for a creature card',
      cardsView1: {
        'card-1': {
          id: 'card-1', name: 'Grizzly Bears', displayName: 'Grizzly Bears',
          expansionSetCode: 'IMA', cardNumber: '165',
          manaCostLeftStr: ['{1}{G}'], manaValue: 2,
          cardTypes: ['CREATURE'], power: '2', toughness: '2',
          color: { white: false, blue: false, black: false, red: false, green: true },
          rules: ['{G}: Gets +1/+0 until EOT'],
        },
        'card-2': {
          id: 'card-2', name: 'Lightning Bolt', displayName: 'Lightning Bolt',
          expansionSetCode: 'M10', cardNumber: '147',
          manaCostLeftStr: ['{R}'], manaValue: 1,
          cardTypes: ['INSTANT'],
          color: { white: false, blue: false, black: false, red: true, green: false },
        },
      },
      targets: ['card-1'],
    })
    expect(prompt?.cards).toHaveLength(2)
    expect(prompt?.cards?.[0]).toMatchObject({
      id: 'card-1',
      name: 'Grizzly Bears',
      expansionSetCode: 'IMA',
      cardNumber: '165',
      power: '2',
      toughness: '2',
    })
    expect(prompt?.cards?.[1]).toMatchObject({
      id: 'card-2',
      name: 'Lightning Bolt',
      expansionSetCode: 'M10',
    })
  })

  it('does not populate cards when cardsView1 is absent', () => {
    const prompt = parseFeedback('GAME_TARGET', 'game-6', {
      message: 'Choose a target',
      targets: ['perm-1'],
      gameView: { players: [{ playerId: 'p-1', name: 'Alice', battlefield: { 'perm-1': { id: 'perm-1', name: 'Bear' } } }] },
    })
    expect(prompt?.cards).toBeUndefined()
  })

  it('returns prompts for GAME_CHOOSE_MODE and friends', () => {
    expect(parseFeedback('GAME_CHOOSE_MODE', 'game-7', { message: 'Choose a mode' }))?.toMatchObject({ mode: 'uuid', title: 'Elige modo' })
    expect(parseFeedback('GAME_CHOOSE_ONE', 'game-7', { message: 'Choose one', options: { a: 'Option A', b: 'Option B' } }))?.toMatchObject({ mode: 'string' })
    expect(parseFeedback('GAME_CHOOSE_COLOR', 'game-7', { message: 'Choose a color' }))?.toMatchObject({ mode: 'string', title: 'Elige un color' })
    expect(parseFeedback('GAME_CHOOSE_NUMBER', 'game-7', { message: 'Pick a number', min: 0, max: 5 }))?.toMatchObject({ mode: 'integer' })
    expect(parseFeedback('GAME_CHOOSE_STRING', 'game-7', { message: 'Name a card', options: ['Bolt', 'Swords'] }))?.toMatchObject({ mode: 'string' })
    expect(parseFeedback('GAME_CHOOSE_BETWEEN', 'game-7', { message: 'Choose', options: { a: 'A', b: 'B' } }))?.toMatchObject({ mode: 'string' })
  })
})
