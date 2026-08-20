/** Shared types and constants for the humanGame scenario engine. */

import type { FakeConn, Scenario } from '../fake'
import { makeCard, makeGameView, makePlayer, makePermanent } from '../../src/__fixtures__/gameViews'
import type { CardView, GameView, PermanentView, SeatView, TableView } from '../../src/net/types'

export const GAME_ID = 'game-human-1'
export const TABLE_ID = 'table-human-1'
export const SIM_NAME = 'sim-000001-244'
export const HUMAN_NAME = 'Mage Web'
export const HUMAN_PLAYER_ID = 'human-1'
export const SIM_PLAYER_ID = 'opp-1'

export const BASIC_LANDS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'])

export type CastStep =
  | { type: 'amount'; message: string; min?: number; max?: number }
  | { type: 'ability'; message: string; choices: Array<{ id: string; label: string }> }
  | { type: 'target'; message: string; targets?: string[] }
  | { type: 'mana'; message: string; sources: number }

export interface LandConfig {
  name: string
  count: number
}

export interface ResolveEffect {
  addToMyBattle?: Array<{ name: string; counters?: { name: string; count: number }[] }>
}

export interface CrossZoneConfig {
  name: string
  zone?: 'graveyard' | 'exile'
}

export interface HumanGameOptions {
  tableName?: string
  lands?: LandConfig[]
  hand: string[]
  playable?: string[]
  crossZone?: CrossZoneConfig[]
  cast?: CastStep[]
  damageToSim?: number
  resolveEffect?: ResolveEffect
  simBattle?: string[]
  simAttack?: boolean
  simCombatDamage?: number
  myBattle?: string[]
  humanAttack?: boolean
  humanBlock?: boolean
  humanCombatDamage?: number
  match?: { winsNeeded: number }
  simWinsGame?: number[]
}

export interface CastRuntime {
  index: number
  manaLeft: number
}
