#!/usr/bin/env node
// Flujo real de jugador humano: login -> mulligan -> tierra -> hechizo -> objetivo -> resolución.

const WS_URL = 'ws://127.0.0.1:8787'
const SERVER_HOST = 'localhost'
const SERVER_PORT = 17171
const USER = process.argv[2] ?? `human-${String(Date.now()).slice(-7)}`

const DEFAULT_DECK = {
  name: 'Mage Web human test',
  cards: [
    { cardName: 'Island', setCode: 'LEA', cardNumber: '288', amount: 30 },
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 30 },
  ],
  sideboard: [],
}

const HUMAN_DECK = {
  name: 'Mage Web playable human test',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 44 },
    { cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146', amount: 16 },
  ],
  sideboard: [],
}

let ws
let sequence = 0
let passCount = 0
let failCount = 0
const pending = new Map()
const events = []
const waiters = []

function check(name, ok, detail = '') {
  if (ok) {
    passCount++
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failCount++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
  return ok
}

function timeout(ms, label) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout esperando ${label}`)), ms))
}

function opened(socket) {
  return new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = () => reject(new Error('no se pudo abrir el WebSocket'))
  })
}

function send(action, args = {}) {
  const requestId = `human-${sequence++}`
  ws.send(JSON.stringify({ requestId, action, args }))
  return new Promise((resolve) => pending.set(requestId, resolve))
}

function waitEvent(predicate, label, ms = 40000, after = 0) {
  const existing = events.slice(after).find(predicate)
  if (existing) return Promise.resolve(existing)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando ${label}`)), ms)
    waiters.push((event) => {
      if (events.length - 1 < after) return false
      if (!predicate(event)) return false
      clearTimeout(timer)
      resolve(event)
      return true
    })
  })
}

function eventGame(event) {
  const data = event?.data
  if (!data || typeof data !== 'object') return null
  if (data.gameView && typeof data.gameView === 'object') return data.gameView
  return data
}

function hasHumanPriority(event) {
  return event.method === 'GAME_SELECT'
    && eventGame(event)?.players?.some((player) => player.controlled && player.hasPriority)
}

function playableCardId(game, name) {
  const playable = Object.keys(game?.canPlayObjects?.objects ?? {})
  return playable.find((id) => game.myHand?.[id]?.name === name || game.myHand?.[id]?.displayName === name)
}

function targetIds(event) {
  const data = event.data && typeof event.data === 'object' ? event.data : {}
  if (Array.isArray(data.targets) && data.targets.length) return data.targets.map(String)
  if (data.cardsView1 && typeof data.cardsView1 === 'object') return Object.keys(data.cardsView1)
  return []
}

function askFingerprint(event) {
  return `ask:${String(event.data?.message ?? '')}`
}

function bottomFingerprint(event) {
  const data = event.data && typeof event.data === 'object' ? event.data : {}
  const targets = Array.isArray(data.targets) ? data.targets.map(String) : []
  return `bottom:${String(data.message ?? '')}|${targets.join(',')}`
}

function isBottomTarget(event) {
  return event.method === 'GAME_TARGET'
    && /bottom of your library/i.test(String(event.data?.message ?? ''))
}

function isStartingPlayerTarget(event) {
  return event.method === 'GAME_TARGET'
    && /starting player/i.test(String(event.data?.message ?? ''))
}

function manaSourceId(game) {
  const me = game?.players?.find((player) => player.controlled)
  const playable = Object.keys(game?.canPlayObjects?.objects ?? {})
  return playable.find((id) => me?.battlefield?.[id])
}

// Tras GAME_INIT, el servidor lanza (en orden aleatorio según quién gana el sorteo):
//  - GAME_TARGET "Select a starting player" (solo si el humano gana el sorteo)
//  - GAME_ASK de mulligan
// El arranque puede disparar cada prompt dos veces (race del "forced join"); se deduplica por fingerprint.
// Devuelve el GAME_ASK del mulligan, respondiendo el sorteo si hace falta.
async function waitForStartupDialog(gameId) {
  const cursor = events.length
  const answered = new Set()
  while (true) {
    const next = await waitEvent(
      (event) => {
        if (event.objectId !== gameId) return false
        if (event.method === 'GAME_ASK') return true
        return isStartingPlayerTarget(event) && !answered.has(`starting:${String(event.data?.message ?? '')}`)
      },
      'diálogo de inicio (starting player o mulligan)',
      40000,
      cursor,
    )
    if (next.method === 'GAME_ASK') return next
    answered.add(`starting:${String(next.data?.message ?? '')}`)
    const [playerId] = targetIds(next)
    if (!check('elegir starting player', Boolean(playerId))) return null
    const result = await Promise.race([
      send('sendPlayerUUID', { gameId, value: playerId }),
      timeout(15000, 'elegir starting player'),
    ])
    check('responder starting player', result.ok, result.error ?? '')
    if (!result.ok) return null
  }
}

// Espera la siguiente decisión del ciclo de mulligan, ignorando duplicados ya respondidos.
// Los GAME_TARGET de "poner cartas en el fondo de la library" se responden aquí mismo.
async function waitForNextMulliganDecision(gameId, answeredAskFingerprint, answeredBottom) {
  const cursor = events.length
  while (true) {
    const next = await waitEvent(
      (event) => {
        if (event.objectId !== gameId) return false
        if (event.method === 'GAME_ASK') return askFingerprint(event) !== answeredAskFingerprint
        return isBottomTarget(event) && !answeredBottom.has(bottomFingerprint(event))
      },
      'siguiente decisión de mulligan',
      40000,
      cursor,
    )
    if (next.method === 'GAME_ASK') return next
    answeredBottom.add(bottomFingerprint(next))
    const [cardId] = targetIds(next)
    if (!check('GAME_TARGET del mulligan contiene cartas', Boolean(cardId))) throw new Error('mulligan sin cartas para el fondo')
    const result = await Promise.race([
      send('sendPlayerUUID', { gameId, value: cardId }),
      timeout(15000, 'poner carta en el fondo'),
    ])
    check('poner carta en el fondo de la library', result.ok, result.error ?? '')
    if (!result.ok) throw new Error(result.error ?? 'no se pudo poner carta en el fondo')
  }
}

function handleMessage(raw) {
  let message
  try {
    message = JSON.parse(String(raw))
  } catch {
    return
  }
  if (message.type === 'result') {
    const resolver = pending.get(String(message.requestId))
    if (resolver) {
      pending.delete(String(message.requestId))
      resolver(message)
    }
    return
  }
  if (message.type !== 'event') return
  events.push(message)
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (waiters[i](message)) waiters.splice(i, 1)
  }
}

async function main() {
  console.log(`[human-test] conectando como ${USER}…`)
  ws = new WebSocket(WS_URL)
  ws.onmessage = (event) => handleMessage(event.data)
  await Promise.race([opened(ws), timeout(10000, 'apertura del WebSocket')])
  check('WebSocket al proxy', true)

  let cleanupTableId = null
  let cleanupGameId = null
  try {
    let result = await Promise.race([
      send('connect', { host: SERVER_HOST, port: SERVER_PORT, username: USER, password: 'x' }),
      timeout(15000, 'connect'),
    ])
    if (!check('connect/login', result.ok, result.error ?? '')) return

    result = await Promise.race([
      send('createTable', {
        name: 'Human Web Test',
        gameType: 'Two Player Duel',
        deckType: 'Constructed - Modern',
        winsNeeded: 1,
        playerTypes: ['HUMAN', 'COMPUTER_MAD'],
      }),
      timeout(15000, 'createTable'),
    ])
    const tableId = result.ok ? result.data?.tableId ?? result.data?.table?.tableId : null
    cleanupTableId = tableId
    if (!check('createTable HUMAN vs IA', Boolean(tableId), result.error ?? '')) return

    result = await Promise.race([
      send('joinTable', {
        tableId,
        playerName: USER,
        playerType: 'HUMAN',
        skill: 1,
        deck: HUMAN_DECK,
      }),
      timeout(15000, 'joinTable HUMAN'),
    ])
    if (!check('joinTable HUMAN', result.ok, result.error ?? '')) return

    result = await Promise.race([
      send('joinTable', {
        tableId,
        playerName: 'Computer',
        playerType: 'COMPUTER_MAD',
        skill: 1,
        deck: DEFAULT_DECK,
      }),
      timeout(15000, 'joinTable IA'),
    ])
    if (!check('joinTable IA', result.ok, result.error ?? '')) return

    const startEvent = waitEvent((event) => event.method === 'START_GAME', 'START_GAME')
    const initEvent = waitEvent((event) => event.method === 'GAME_INIT', 'GAME_INIT')
    result = await Promise.race([send('startMatch', { tableId }), timeout(20000, 'startMatch')])
    if (!check('startMatch HUMAN vs IA', result.ok, result.error ?? '')) return

    const started = await startEvent
    const gameId = started.objectId ?? started.data?.gameId
    cleanupGameId = gameId
    check('START_GAME con gameId', Boolean(gameId), String(gameId ?? ''))
    const init = await initEvent
    check('GAME_INIT para jugador humano', (init.data?.players?.length ?? 0) >= 2, `${init.data?.players?.length ?? 0} jugadores`)

    let ask = await waitForStartupDialog(gameId)
    if (!check('inicio de partida: starting player o mulligan', Boolean(ask))) return

    const answeredAsks = new Set()
    const answeredBottom = new Set()
    let keptHand = false
    for (let attempt = 0; attempt < 4; attempt++) {
      const hand = Object.values(eventGame(ask)?.myHand ?? {})
      const keep = hand.some((card) => card.name === 'Mountain') && hand.some((card) => card.name === 'Lightning Bolt')
      const currentAskFingerprint = askFingerprint(ask)
      if (answeredAsks.has(currentAskFingerprint)) {
        check('ask de mulligan duplicado ignorado', true)
        ask = await waitForNextMulliganDecision(gameId, currentAskFingerprint, answeredBottom)
        continue
      }
      answeredAsks.add(currentAskFingerprint)
      const askGameId = ask.objectId ?? gameId
      // XMage: sendPlayerBoolean(true) = tomar mulligan, false = mantener la mano.
      result = await Promise.race([
        send('sendPlayerBoolean', { gameId: askGameId, value: !keep }),
        timeout(15000, keep ? 'keep mulligan' : 'mulligan'),
      ])
      check(`${keep ? 'mantener' : 'hacer'} mulligan con boolean`, result.ok, result.error ?? '')
      if (!result.ok) return
      if (keep) {
        keptHand = true
        break
      }
      // London mulligan: el servidor pide elegir cartas para el fondo de la library antes del siguiente ask.
      ask = await waitForNextMulliganDecision(gameId, currentAskFingerprint, answeredBottom)
    }
    if (!check('mano inicial contiene tierra y hechizo', keptHand)) return

    const gameCursor = events.length
    const update = await waitEvent((event) =>
      (event.method === 'GAME_UPDATE' || event.method === 'GAME_UPDATE_AND_INFORM') && event.objectId === gameId,
      'GAME_UPDATE después del mulligan',
      40000,
      gameCursor,
    )
    check('GAME_UPDATE tras decisión humana', Boolean(update.data), `gameId=${String(gameId).slice(0, 8)}…`)

    let priority = await waitEvent(hasHumanPriority, 'GAME_SELECT de prioridad', 40000, gameCursor)
    let game = eventGame(priority)
    let landId = playableCardId(game, 'Mountain')
    for (let attempt = 0; !landId && attempt < 6; attempt++) {
      // no es nuestro main phase (la IA juega primero): pasar hasta que toque jugar tierras
      const passCursor = events.length
      result = await Promise.race([
        send('sendPlayerBoolean', { gameId, value: false }),
        timeout(15000, 'pasar prioridad esperando main phase'),
      ])
      check('pasar prioridad en espera de turno propio', result.ok, result.error ?? '')
      priority = await waitEvent(hasHumanPriority, 'prioridad en nuestro turno', 40000, passCursor)
      game = eventGame(priority)
      landId = playableCardId(game, 'Mountain')
    }
    if (!check('Mountain jugable desde la mano', Boolean(landId), 'canPlayObjects')) return
    let actionCursor = events.length
    result = await Promise.race([
      send('sendPlayerUUID', { gameId, value: landId }),
      timeout(15000, 'jugar Mountain'),
    ])
    check('jugar Mountain con UUID', result.ok, result.error ?? '')
    priority = await waitEvent(hasHumanPriority, 'prioridad después de jugar tierra', 40000, actionCursor)
    game = eventGame(priority)

    let boltId = playableCardId(game, 'Lightning Bolt')
    for (let attempt = 0; !boltId && attempt < 4; attempt++) {
      actionCursor = events.length
      result = await Promise.race([
        send('sendPlayerBoolean', { gameId, value: false }),
        timeout(15000, 'pasar prioridad esperando Bolt'),
      ])
      check('pasar prioridad con boolean', result.ok, result.error ?? '')
      priority = await waitEvent(hasHumanPriority, 'prioridad para robar Bolt', 40000, actionCursor)
      game = eventGame(priority)
      boltId = playableCardId(game, 'Lightning Bolt')
    }
    if (!check('Lightning Bolt jugable desde la mano', Boolean(boltId), 'canPlayObjects')) return

    actionCursor = events.length
    result = await Promise.race([
      send('sendPlayerUUID', { gameId, value: boltId }),
      timeout(15000, 'jugar Lightning Bolt'),
    ])
    check('jugar Lightning Bolt con UUID', result.ok, result.error ?? '')

    const targetEvent = await waitEvent(
      (event) => event.method === 'GAME_TARGET' && event.objectId === gameId,
      'GAME_TARGET de Lightning Bolt',
      40000,
      actionCursor,
    )
    // "Select any target" incluye a ambos jugadores; preferimos al oponente para verificar el daño.
    const possibleTargets = targetIds(targetEvent)
    const targetView = eventGame(targetEvent)
    const opponentPlayer = targetView?.players?.find((player) => !player.controlled)
    const opponentId = opponentPlayer?.playerId && possibleTargets.includes(opponentPlayer.playerId)
      ? opponentPlayer.playerId
      : null
    const targetId = opponentId ?? possibleTargets[0]
    if (!check('GAME_TARGET contiene un objetivo', Boolean(targetId))) return
    if (!check('objetivo = oponente', Boolean(opponentId), opponentId ?? 'primer objetivo')) return
    const targetCursor = events.length
    result = await Promise.race([
      send('sendPlayerUUID', { gameId, value: targetId }),
      timeout(15000, 'elegir objetivo'),
    ])
    check('elegir objetivo con UUID', result.ok, result.error ?? '')

    let manaEvent = await waitEvent(
      (event) => event.method === 'GAME_PLAY_MANA' && event.objectId === gameId,
      'GAME_PLAY_MANA de Lightning Bolt',
      40000,
      targetCursor,
    )
    while (true) {
      game = eventGame(manaEvent)
      const sourceId = manaSourceId(game)
      const me = game?.players?.find((player) => player.controlled)
      if (sourceId) {
        result = await Promise.race([
          send('sendPlayerUUID', { gameId, value: sourceId }),
          timeout(15000, 'activar fuente de maná'),
        ])
      } else if ((me?.manaPool?.red ?? 0) > 0 && me?.playerId) {
        result = await Promise.race([
          send('sendPlayerManaType', { gameId, playerId: me.playerId, manaType: 'RED' }),
          timeout(15000, 'usar maná rojo'),
        ])
      } else {
        check('fuente o pool de maná rojo disponible', false)
        return
      }
      check('pagar maná', result.ok, result.error ?? '')
      if (!result.ok) return
      actionCursor = events.length
      const next = await waitEvent(
        (event) => event.method === 'GAME_PLAY_MANA' || hasHumanPriority(event),
        'siguiente decisión de maná o prioridad',
        40000,
        actionCursor,
      )
      if (next.method === 'GAME_PLAY_MANA') {
        manaEvent = next
        continue
      }
      priority = next
      break
    }

    actionCursor = events.length
    result = await Promise.race([
      send('sendPlayerBoolean', { gameId, value: false }),
      timeout(15000, 'pasar prioridad tras lanzar Bolt'),
    ])
    check('pasar prioridad después del hechizo', result.ok, result.error ?? '')

    const resolved = await waitEvent((event) => {
      if (event.objectId !== gameId || !['GAME_UPDATE', 'GAME_UPDATE_AND_INFORM'].includes(event.method)) return false
      const resolvedGame = eventGame(event)
      const opponent = resolvedGame?.players?.find((player) => !player.controlled)
      return Object.keys(resolvedGame?.stack ?? {}).length === 0 && (opponent?.life ?? 20) < 20
    }, 'resolución de Lightning Bolt', 40000, actionCursor)
    check('Lightning Bolt resuelto y vida del oponente modificada', Boolean(resolved.data))

    result = await Promise.race([
      send('quitMatch', { gameId }),
      timeout(15000, 'quitMatch'),
    ])
    check('quitMatch con gameId', result.ok, result.error ?? '')
  } catch (error) {
    check('flujo humano global', false, error instanceof Error ? error.message : String(error))
  } finally {
    // higiene: cerrar partida y mesa para no dejar huérfanas (sus eventos reflotarían
    // al siguiente usuario del proxy y saturarían la cola de callbacks)
    if (cleanupGameId) {
      try {
        await Promise.race([send('quitMatch', { gameId: cleanupGameId }), timeout(10000, 'quitMatch limpieza')])
      } catch {
        // noop
      }
    } else if (cleanupTableId) {
      try {
        await Promise.race([send('removeTable', { tableId: cleanupTableId }), timeout(10000, 'removeTable limpieza')])
      } catch {
        // noop
      }
    }
    try {
      ws.close()
    } catch {
      // noop
    }
  }

  console.log(`[human-test] RESULTADO: ${failCount === 0 ? 'TODO PASS' : `${failCount} FALLOS`} (${passCount} pass, ${failCount} fail)`)
  process.exit(failCount === 0 ? 0 : 1)
}

await main()
