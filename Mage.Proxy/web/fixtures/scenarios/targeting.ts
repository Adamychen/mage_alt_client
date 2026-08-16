/**
 * Escenario del FixtureServer para targeting.spec.ts: el humano lanza un
 * Lightning Bolt, elige objetivo al Sim y paga {R}. El targeting visual se
 * verifica por el feedback GAME_TARGET (la app renderiza el targeting en la
 * escena a partir de options.targets) y por la vida del Sim bajando a 17.
 */

import { HumanGame, SIM_PLAYER_ID } from './humanGame'

export function targetingScenario() {
  const game = new HumanGame({
    tableName: 'targeting-test',
    hand: ['Mountain', 'Mountain', 'Mountain', 'Lightning Bolt', 'Lightning Bolt', 'Lightning Bolt'],
    playable: ['Lightning Bolt'],
    cast: [
      { type: 'target', message: 'Select any target', targets: [SIM_PLAYER_ID] },
      { type: 'mana', message: 'Pay {R}', sources: 1 },
    ],
    damageToSim: 3,
  })
  return game.scenario()
}