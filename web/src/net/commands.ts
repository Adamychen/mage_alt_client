import { Gateway } from './Gateway'
import type { DeckJson } from './types'

/** Tipo de juego y tipo de jugador reales del servidor (getGameTypes/getPlayerTypes). */
export interface GameTypeInfo {
  name: string
  minPlayers: number
  maxPlayers: number
  isMiniGame?: boolean
  [k: string]: unknown
}

let gateway: Gateway | null = null

export function setGateway(g: Gateway | null) {
  gateway = g
}

export function getGateway(): Gateway {
  if (!gateway) throw new Error('gateway no inicializado')
  return gateway
}

export async function connect(host: string, port: number, username: string, password: string) {
  return getGateway().send('connect', { host, port, username, password })
}

export async function getGameTypes(): Promise<GameTypeInfo[]> {
  const res = await getGateway().send<GameTypeInfo[]>('getGameTypes')
  return res.ok ? (res.data ?? []) : []
}

export async function getPlayerTypes(): Promise<string[]> {
  const res = await getGateway().send<string[]>('getPlayerTypes')
  return res.ok ? (res.data ?? []) : []
}

export async function getDeckTypes(): Promise<string[]> {
  const res = await getGateway().send<string[]>('getDeckTypes')
  return res.ok ? (res.data ?? []) : []
}

export async function getRoomChatId(): Promise<string | undefined> {
  const res = await getGateway().send<string>('getRoomChatId')
  return res.ok ? res.data : undefined
}

export async function getGameChatId(gameId: string): Promise<string | undefined> {
  const res = await getGateway().send<string>('getGameChatId', { gameId })
  return res.ok ? res.data : undefined
}

export async function joinChat(chatId: string) {
  return getGateway().send('joinChat', { chatId })
}

export async function sendChatMessage(chatId: string, text: string) {
  return getGateway().send('sendChatMessage', { chatId, text })
}

export interface CreateTableArgs {
  name: string
  gameType: string
  deckType: string
  winsNeeded: number
  playerTypes: string[]
  password?: string
  skipInitShuffling?: boolean
  skipStartingPlayerChoice?: boolean
  /** mazos de los asientos "SIM" (oponentes simulados que une el proxy) */
  simDecks?: DeckJson[]
}

export async function createTable(args: CreateTableArgs) {
  return getGateway().send('createTable', { ...args })
}

export interface JoinTableArgs {
  roomId?: string
  tableId: string
  playerName: string
  playerType: string
  skill?: number
  deck?: DeckJson
  password?: string
}

export async function joinTable(args: JoinTableArgs) {
  return getGateway().send('joinTable', { ...args })
}

export async function startMatch(tableId: string) {
  return getGateway().send('startMatch', { tableId })
}

export async function watchTable(tableId: string) {
  return getGateway().send('watchTable', { tableId })
}

export async function watchGame(gameId: string) {
  return getGateway().send('watchGame', { gameId })
}

export async function joinGame(gameId: string) {
  return getGateway().send('joinGame', { gameId })
}

export async function stopWatching(gameId: string) {
  return getGateway().send('stopWatching', { gameId })
}

export async function leaveTable(tableId: string) {
  return getGateway().send('leaveTable', { tableId })
}

export async function removeTable(tableId: string) {
  return getGateway().send('removeTable', { tableId })
}

export async function submitDeck(tableId: string, deck: DeckJson) {
  return getGateway().send('submitDeck', { tableId, deck })
}

export async function updateDeck(tableId: string, deck: DeckJson) {
  return getGateway().send('updateDeck', { tableId, deck })
}

export interface PhaseStops {
  yourTurn: Record<string, boolean>
  opponentTurn: Record<string, boolean>
}

export async function updatePreferences(phases: PhaseStops) {
  return getGateway().send('updatePreferences', { phases })
}

export async function quitMatch(gameId: string) {
  return getGateway().send('quitMatch', { gameId })
}

export async function sendPlayerAction(action: string, gameId: string, data?: unknown) {
  return getGateway().send('sendPlayerAction', { action, gameId, data })
}

export async function sendPlayerBoolean(value: boolean, gameId: string) {
  return getGateway().send('sendPlayerBoolean', { value, gameId })
}

export async function sendPlayerInteger(value: number, gameId: string) {
  return getGateway().send('sendPlayerInteger', { value, gameId })
}

export async function sendPlayerString(value: string, gameId: string) {
  return getGateway().send('sendPlayerString', { value, gameId })
}

export async function sendPlayerUUID(uuid: string, gameId: string) {
  return getGateway().send('sendPlayerUUID', { value: uuid, gameId })
}

export async function sendPlayerManaType(gameId: string, playerId: string, manaType: string) {
  return getGateway().send('sendPlayerManaType', { gameId, playerId, manaType })
}

export async function disconnect() {
  return getGateway().send('disconnect')
}
