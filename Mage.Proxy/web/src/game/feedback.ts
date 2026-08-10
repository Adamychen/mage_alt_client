export type FeedbackMode = 'boolean' | 'string' | 'uuid' | 'integer' | 'multiString' | 'mana'

export interface FeedbackOption {
  id: string
  label: string
  value: string
}

export interface FeedbackItem {
  id: string
  label: string
  min: number
  max: number
  defaultValue?: number
}

export interface FeedbackPrompt {
  method: string
  gameId: string
  title: string
  message: string
  mode: FeedbackMode
  options: FeedbackOption[]
  min: number
  max: number
  items?: FeedbackItem[]
  playerId?: string
  required?: boolean
  /** Nombre del objeto que pide el objetivo (options.secondMessage del servidor). */
  sourceName?: string
}

type JsonRecord = Record<string, unknown>

export function parseFeedback(method: string, objectId: string | null, raw: unknown): FeedbackPrompt | null {
  const data = asRecord(raw)
  const gameId = objectId ?? stringValue(data.gameId)
  if (!gameId) return null

  const message = stringValue(data.message) ?? stringValue(data.question) ?? 'Elige una opción'
  const bounds = boundsFrom(data)

  switch (method) {
    case 'GAME_SELECT':
      // XMage uses GAME_SELECT for priority. The board remains interactive while
      // the player decides whether to play a card or pass with a boolean.
      return null
    case 'GAME_ASK': {
      const isMulligan = /mulligan|keep your hand|keep hand/i.test(message)
      const options = optionEntries(data.options)
      const choices = options.length
        ? options.map((option, index) => ({ ...option, value: isMulligan ? booleanValue(option.label, index) : option.value }))
        : isMulligan
          ? [
              { id: 'keep', label: 'Keep hand', value: 'false' },
              { id: 'mulligan', label: 'Mulligan', value: 'true' },
            ]
          : []
      return prompt(method, gameId, isMulligan ? 'Mulligan' : 'Confirmación', message, isMulligan ? 'boolean' : 'string', choices, bounds)
    }
    case 'GAME_TARGET':
      return prompt(method, gameId, 'Elige objetivo', message, 'uuid', targetOptions(data), bounds, undefined, undefined, data.flag !== false && data.flag !== 'false', secondMessageOf(data))
    case 'GAME_SELECT':
    case 'GAME_SELECT_CARDS':
    case 'GAME_SELECT_TARGETS':
      return prompt(method, gameId, 'Selecciona cartas', message, 'uuid', cardOptions(data.cardsView1 ?? data.options), bounds)
    case 'GAME_CHOOSE_ABILITY': {
      const abilities = asRecord(raw)
      return prompt(method, gameId, 'Elige habilidad', stringValue(abilities.message) ?? message, 'uuid', optionEntries(abilities.choices), bounds)
    }
    case 'GAME_CHOOSE_CHOICE': {
      const choice = asRecord(data.choice)
      const choices = optionEntries(choice.keyChoices ?? choice.choices ?? choice)
      return prompt(method, gameId, 'Elige una opción', stringValue(choice.message) ?? message, 'string', choices, bounds)
    }
    case 'GAME_CHOOSE_PILE': {
      const pile1 = cardSummary(data.cardsView1, 'Pila 1')
      const pile2 = cardSummary(data.cardsView2, 'Pila 2')
      return prompt(method, gameId, 'Elige una pila', message, 'boolean', [
        { id: 'pile1', label: pile1, value: 'true' },
        { id: 'pile2', label: pile2, value: 'false' },
      ], bounds)
    }
    case 'GAME_PLAY_MANA':
      // El servidor NO manda los colores de maná: options solo trae {queryType: "PLAY_MANA"}.
      // El pago real se hace clicando las fuentes de maná en el tablero
      // (canPlayObjects del gameView incrustado), igual que el cliente oficial.
      return prompt(method, gameId, 'Pagar maná', message, 'mana', [], bounds, undefined, controlledPlayerId(data.gameView))
    case 'GAME_PLAY_XMANA':
      return prompt(method, gameId, 'Pagar maná', message, 'boolean', [
        { id: 'yes', label: 'Confirmar', value: 'true' },
        { id: 'no', label: 'Cancelar', value: 'false' },
      ], bounds)
    case 'GAME_GET_AMOUNT':
    case 'GAME_SELECT_AMOUNT':
      return prompt(method, gameId, 'Elige cantidad', message, 'integer', [], bounds)
    case 'GAME_GET_MULTI_AMOUNT':
      return prompt(method, gameId, 'Elige cantidades', message, 'multiString', [], bounds, multiAmountItems(data.messages))
    default:
      return null
  }
}

function prompt(
  method: string,
  gameId: string,
  title: string,
  message: string,
  mode: FeedbackMode,
  options: FeedbackOption[],
  bounds: { min: number; max: number },
  items?: FeedbackItem[],
  playerId?: string,
  required = true,
  sourceName?: string,
): FeedbackPrompt {
  return { method, gameId, title, message, mode, options, min: bounds.min, max: bounds.max, items, playerId, required, sourceName }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : value == null ? undefined : String(value)
}

function secondMessageOf(data: JsonRecord): string | undefined {
  const value = asRecord(data.options).secondMessage
  return stringValue(value)
}

function controlledPlayerId(value: unknown): string | undefined {
  const game = asRecord(value)
  const players = Array.isArray(game.players) ? game.players : []
  const player = players.find((item) => asRecord(item).controlled === true)
  return stringValue(asRecord(player).playerId)
}

function boundsFrom(data: JsonRecord): { min: number; max: number } {
  const min = numberValue(data.min, 0)
  const max = numberValue(data.max, 1)
  return { min, max: max < min ? min : max }
}

function numberValue(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

function optionEntries(value: unknown): FeedbackOption[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const record = asRecord(item)
      const id = stringValue(record.id) ?? String(index)
      const label = stringValue(record.label) ?? stringValue(record.name) ?? stringValue(item) ?? id
      return { id, label, value: stringValue(record.value) ?? id }
    })
  }
  return Object.entries(asRecord(value)).map(([id, item]) => {
    const itemRecord = asRecord(item)
    const label = stringValue(itemRecord.label) ?? stringValue(itemRecord.name) ?? stringValue(item) ?? id
    return { id, label, value: stringValue(itemRecord.value) ?? id }
  })
}

function cardOptions(value: unknown): FeedbackOption[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const card = asRecord(item)
      const id = stringValue(card.id) ?? stringValue(card.parentId) ?? String(index)
      return { id, label: stringValue(card.displayName) ?? stringValue(card.name) ?? id, value: id }
    })
  }
  return Object.entries(asRecord(value)).map(([id, item]) => {
    const card = asRecord(item)
    const actualId = stringValue(card.id) ?? id
    return { id: actualId, label: stringValue(card.displayName) ?? stringValue(card.name) ?? actualId, value: actualId }
  })
}

function targetOptions(data: JsonRecord): FeedbackOption[] {
  const labels = new Map(cardOptions(data.cardsView1).map((option) => [option.id, option.label]))
  const game = asRecord(data.gameView)
  for (const card of Object.values(asRecord(game.myHand))) {
    const record = asRecord(card)
    const id = stringValue(record.id) ?? stringValue(record.parentId)
    if (id) labels.set(id, stringValue(record.displayName) ?? stringValue(record.name) ?? id)
  }
  const players = Array.isArray(game.players) ? game.players : []
  for (const player of players) {
    const record = asRecord(player)
    const id = stringValue(record.playerId)
    if (id) labels.set(id, stringValue(record.name) ?? id)
    for (const card of Object.values(asRecord(record.battlefield))) {
      const cardRecord = asRecord(card)
      const cardId = stringValue(cardRecord.id) ?? stringValue(cardRecord.parentId)
      if (cardId) labels.set(cardId, stringValue(cardRecord.displayName) ?? stringValue(cardRecord.name) ?? cardId)
    }
  }
  const targets = stringList(data.targets)
  const possibleTargets = stringList(asRecord(data.options).possibleTargets)
  const candidateIds = targets.length
    ? targets
    : possibleTargets.length
      ? possibleTargets
      : cardOptions(data.cardsView1).map((option) => option.id)
  return candidateIds.map((id, index) => {
    return { id, label: labels.get(id) ?? `Objetivo ${index + 1} (${id.slice(0, 8)})`, value: id }
  })
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === 'string' ? item : stringValue(asRecord(item).id))
      .filter((item): item is string => Boolean(item))
  }
  if (value && typeof value === 'object') return Object.keys(value)
  return []
}

function multiAmountItems(value: unknown): FeedbackItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const record = asRecord(item)
    return {
      id: stringValue(record.id) ?? String(index),
      label: stringValue(record.message) ?? `Cantidad ${index + 1}`,
      min: numberValue(record.min, 0),
      max: numberValue(record.max, 999),
      defaultValue: numberValue(record.defaultValue, numberValue(record.min, 0)),
    }
  })
}

function cardSummary(value: unknown, fallback: string): string {
  const cards = cardOptions(value)
  return cards.length ? `${fallback}: ${cards.length} cartas` : fallback
}

function booleanValue(label: string, index: number): string {
  // XMage: el mulligan usa sendPlayerBoolean(true) para TOMAR mulligan y false para mantener.
  if (/mulligan/i.test(label)) return 'true'
  if (/keep/i.test(label)) return 'false'
  if (/no|cancel/i.test(label)) return 'false'
  if (/yes|confirm|ok/i.test(label)) return 'true'
  return index === 0 ? 'true' : 'false'
}
