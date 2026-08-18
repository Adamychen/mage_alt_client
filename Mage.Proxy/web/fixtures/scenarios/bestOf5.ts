import { HumanGame, SIM_PLAYER_ID } from './humanGame'

export function bestOf5Scenario() {
  const game = new HumanGame({
    tableName: 'best-of-5-test',
    lands: [{ name: 'Mountain', count: 7 }],
    hand: ['Lightning Bolt', 'Lightning Bolt', 'Lightning Bolt', 'Lightning Bolt', 'Mountain', 'Mountain', 'Mountain', 'Mountain'],
    playable: ['Lightning Bolt'],
    cast: [
      { type: 'target', message: 'Select any target', targets: [SIM_PLAYER_ID] },
      { type: 'mana', message: 'Pay {R}', sources: 1 },
    ],
    damageToSim: 3,
    match: { winsNeeded: 3 },
  })
  return game.scenario()
}