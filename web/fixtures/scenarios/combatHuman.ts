/**
 * Escenarios del FixtureServer para combat-human.spec.ts: el HUMANO declara
 * atacantes y bloqueadores por la UI (el mini-motor emite los GAME_SELECT de
 * combate con possibleAttackers/possibleBlockers como el servidor real).
 */

import { HumanGame } from './humanGame'

export function combatHumanAttackScenario() {
  const game = new HumanGame({
    tableName: 'combat-human-attack',
    hand: ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'],
    myBattle: ['Raging Goblin'],
    humanAttack: true,
    humanCombatDamage: 1,
  })
  return game.scenario()
}

export function combatHumanBlockScenario() {
  const game = new HumanGame({
    tableName: 'combat-human-block',
    hand: ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'],
    myBattle: ['Raging Goblin'],
    simBattle: ['Raging Goblin'],
    simAttack: true,
    humanBlock: true,
  })
  return game.scenario()
}
