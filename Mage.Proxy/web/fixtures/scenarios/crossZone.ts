/**
 * Escenario del FixtureServer para cross-zone.spec.ts: el "ray" de XMage.
 * La carta vive en el cementerio (o exilio) y el jugador la lanza desde ahí
 * con sendPlayerUUID. La secuencia de asks es la de un cast normal.
 */

import { HumanGame, SIM_PLAYER_ID } from './humanGame'

export type CrossZoneKind = 'graveyard-cast' | 'exile-cast'

export function crossZoneScenario(kind: CrossZoneKind) {
  const game = new HumanGame(crossZoneConfig(kind))
  return game.scenario()
}

function crossZoneConfig(kind: CrossZoneKind): ConstructorParameters<typeof HumanGame>[0] {
  switch (kind) {
    case 'exile-cast':
      return {
        tableName: 'cz-exile-test',
        lands: [{ name: 'Mountain', count: 2 }],
        hand: ['Mountain', 'Mountain'],
        crossZone: [{ name: 'Arc Trail', zone: 'exile' }],
        cast: [
           { type: 'target', message: 'Select any target', targets: [SIM_PLAYER_ID] },
           { type: 'mana', message: 'Pay {1}{R}', sources: 2 },
          ],
        damageToSim: 2,
       }
    case 'graveyard-cast':
    default:
      return {
        tableName: 'cz-test',
        lands: [{ name: 'Mountain', count: 2 }],
        hand: ['Mountain', 'Mountain'],
        crossZone: [{ name: 'Arc Trail', zone: 'graveyard' }],
        cast: [
           { type: 'target', message: 'Select any target', targets: [SIM_PLAYER_ID] },
           { type: 'mana', message: 'Pay {1}{R}', sources: 2 },
          ],
        damageToSim: 2,
       }
   }
}
