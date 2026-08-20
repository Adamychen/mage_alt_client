/**
 * Escenario del FixtureServer para best-of-n.spec.ts: match al mejor de 2 (el
 * humano gana 2 partidas seguidas quemando al Sim con Lightning Bolts — 7 bolts
 * × 3 de daño). Tras cada partida llega END_GAME_INFO + SIDEBOARD (el web
 * devuelve su mazo con submitDeck) y arranca la siguiente partida del match
 * (START_GAME con gameId NUEVO); al llegar a winsNeeded el match termina.
 */

import { HumanGame, SIM_PLAYER_ID } from './humanGame'

export function bestOfNScenario() {
  const game = new HumanGame({
    tableName: 'best-of-n-test',
    lands: [{ name: 'Mountain', count: 7 }],
    hand: ['Lightning Bolt', 'Lightning Bolt', 'Lightning Bolt', 'Mountain'],
    playable: ['Lightning Bolt'],
    cast: [
      { type: 'target', message: 'Select any target', targets: [SIM_PLAYER_ID] },
      { type: 'mana', message: 'Pay {R}', sources: 1 },
    ],
    damageToSim: 3,
    match: { winsNeeded: 2 },
  })
  return game.scenario()
}
