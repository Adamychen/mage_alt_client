/**
 * Escenario del FixtureServer para combat.spec.ts: el humano (mazo solo
 * tierras) pasa sus turnos; el Sim pone un Raging Goblin en el campo, declara
 * atacantes y hace 1 de daño al humano.
 */

import { HumanGame } from './humanGame'

export function combatScenario() {
  const game = new HumanGame({
    tableName: 'combat-test',
    hand: ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'],
    simBattle: ['Raging Goblin'],
    simAttack: true,
    simCombatDamage: 1,
  })
  return game.scenario()
}