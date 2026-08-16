/**
 * Schema runtime del contrato del proxy (espejo validable de src/net/types.ts).
 * Es la red anti-deriva: cualquier frame (real o del FixtureServer) que no
 * cumpla el schema rompe el test en vez de propagarse silenciosamente.
 * Fuente única de verdad de los TIPOS: types.ts (typecheck). Este archivo solo
 * añade la validación RUNTIME de los campos que el cliente realmente consume.
 */

import { z } from 'zod'

export const resultSchema = z.object({
  type: z.literal('result'),
  action: z.string(),
  requestId: z.union([z.string(), z.number()]).optional(),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
})

export const eventSchema = z.object({
  type: z.literal('event'),
  method: z.string(),
  messageId: z.number(),
  objectId: z.union([z.string(), z.null()]).optional(),
  data: z.unknown().optional(),
})

export const lobbySchema = z.object({
  type: z.literal('lobby'),
  roomId: z.string().optional(),
  tables: z.array(z.record(z.string(), z.unknown())),
  users: z.record(z.string(), z.unknown()),
  serverMessages: z.array(z.string()),
})

export const connectedSchema = z.object({
  type: z.literal('connected'),
  message: z.string().optional(),
})

export const infoSchema = z.object({
  type: z.literal('info'),
  message: z.string(),
})

/** Campos del GameView que el cliente consume (turn/phase/step/myHand/stack/
 *  players). La vista real tiene más campos; aquí solo lo que es crítico. */
export const gameViewSchema = z.object({
  priorityTime: z.number(),
  turn: z.number(),
  phase: z.string(),
  step: z.string(),
  activePlayerId: z.string(),
  activePlayerName: z.string(),
  priorityPlayerName: z.string(),
  players: z.array(z.record(z.string(), z.unknown())).nullish(),
  myHand: z.record(z.string(), z.unknown()).optional(),
  stack: z.record(z.string(), z.unknown()).nullish(),
  myPlayerId: z.union([z.string(), z.null()]).optional(),
  canPlayObjects: z.record(z.string(), z.unknown()).nullish(),
})

/** Evento de partida: el payload debe traer el gameView (directo o en data). */
export const gameEventSchema = z.object({
  method: z.string().startsWith('GAME_'),
  objectId: z.union([z.string(), z.null()]).optional(),
  data: z.unknown().optional(),
})

export type ParsedMessage =
  | z.infer<typeof resultSchema>
  | z.infer<typeof eventSchema>
  | z.infer<typeof lobbySchema>
  | z.infer<typeof connectedSchema>
  | z.infer<typeof infoSchema>

const baseSchemas: Record<string, z.ZodTypeAny> = {
  result: resultSchema,
  event: eventSchema,
  lobby: lobbySchema,
  connected: connectedSchema,
  info: infoSchema,
}

/** Valida un mensaje entrante y devuelve true si es conforme. */
export function validateMessage(raw: unknown): { ok: boolean; errors?: string[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['no es un objeto'] }
  }
  const type = (raw as { type?: unknown }).type
  if (typeof type !== 'string' || !(type in baseSchemas)) {
    return { ok: false, errors: [`type desconocido: ${String(type)}`] }
  }
  const parsed = baseSchemas[type].safeParse(raw)
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
  }
  return { ok: true }
}

/** Valida un GameView extraído de un evento de partida. */
export function validateGameView(view: unknown): { ok: boolean; errors?: string[] } {
  const parsed = gameViewSchema.safeParse(view)
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
  }
  return { ok: true }
}

/** Extrae el GameView de un payload de evento (data.gameView o data directo),
 *  igual que store.gameViewFrom, y lo valida. */
export function gameViewFromAndValidate(data: unknown): { ok: boolean; errors?: string[] } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['data no es un objeto'] }
  }
  const record = data as Record<string, unknown>
  const embedded = record.gameView
  const view = embedded && typeof embedded === 'object' && !Array.isArray(embedded) ? embedded : 'myHand' in record && 'phase' in record ? record : null
  if (!view) return { ok: false, errors: ['no hay gameView en el payload'] }
  return validateGameView(view)
}
