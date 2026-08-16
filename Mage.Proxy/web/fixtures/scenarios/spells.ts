/**
 * Escenarios del FixtureServer para spells.spec.ts: un guion por hechizo
 * (Blaze, Arc Trail, Boros Charm, Walking Ballista). Cada escenario tiene las
 * tierras ya desarrolladas y la mano con el hechizo jugable; el motor emite la
 * secuencia de asks (X / modo / target / maná) y resuelve el daño o los
 * contadores al terminar el pago.
 */

import { HumanGame, SIM_PLAYER_ID } from './humanGame'

export type SpellsKind = 'blaze' | 'arc' | 'boros' | 'ballista'

export function spellsScenario(kind: SpellsKind) {
  const game = new HumanGame(spellsConfig(kind))
  return game.scenario()
}

function spellsConfig(kind: SpellsKind): ConstructorParameters<typeof HumanGame>[0] {
  switch (kind) {
    case 'blaze':
      return {
        tableName: 'blaze-test',
        lands: [{ name: 'Mountain', count: 3 }],
        hand: ['Blaze', 'Mountain', 'Mountain', 'Mountain'],
        playable: ['Blaze'],
        cast: [
          { type: 'amount', message: 'Choose a value for X', min: 0, max: 5 },
          { type: 'target', message: 'Select any target', targets: [SIM_PLAYER_ID] },
          { type: 'mana', message: 'Pay {X}{R}', sources: 3 },
        ],
        damageToSim: 2,
      }
    case 'arc':
      return {
        tableName: 'arc-test',
        lands: [{ name: 'Mountain', count: 2 }],
        hand: ['Arc Trail', 'Mountain', 'Mountain'],
        playable: ['Arc Trail'],
        cast: [
          // el 2º objetivo es "any other target": sin criaturas en juego el
          // servidor lo auto-elige (verificado contra el servidor real), igual
          // que el escenario: solo un GAME_TARGET y directo al maná
          { type: 'target', message: 'Select any target', targets: [SIM_PLAYER_ID] },
          { type: 'mana', message: 'Pay {1}{R}', sources: 2 },
        ],
        damageToSim: 2,
      }
    case 'boros':
      return {
        tableName: 'boros-test',
        lands: [
          { name: 'Mountain', count: 1 },
          { name: 'Plains', count: 1 },
        ],
        hand: ['Boros Charm', 'Mountain', 'Plains'],
        playable: ['Boros Charm'],
        cast: [
          {
            type: 'ability',
            message: 'Choose a mode',
            choices: [
              { id: 'mode-4', label: 'Boros Charm deals 4 damage to any target' },
              { id: 'mode-other', label: 'Other modes' },
            ],
          },
          { type: 'target', message: 'Select any target', targets: [SIM_PLAYER_ID] },
          { type: 'mana', message: 'Pay {R}{W}', sources: 2 },
        ],
        damageToSim: 4,
      }
    case 'ballista':
      return {
        tableName: 'ballista-test',
        lands: [{ name: 'Mountain', count: 8 }],
        hand: ['Walking Ballista'],
        playable: ['Walking Ballista'],
        cast: [
          {
            type: 'ability',
            message: 'Choose a mode',
            choices: [{ id: 'cast', label: 'Cast Walking Ballista' }],
          },
          { type: 'amount', message: 'Choose a value for X', min: 0, max: 8 },
          { type: 'mana', message: 'Pay {X}{X}', sources: 8 },
        ],
        resolveEffect: { addToMyBattle: [{ name: 'Walking Ballista', counters: [{ name: 'Charge', count: 4 }] }] },
      }
  }
}