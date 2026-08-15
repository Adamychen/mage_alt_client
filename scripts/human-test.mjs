#!/usr/bin/env node
// Flujo real de jugador humano: login -> mulligan -> tierra -> hechizo -> objetivo -> resolución.

const WS_URL = 'ws://127.0.0.1:8787'
const SERVER_HOST = 'localhost'
const SERVER_PORT = 17171
const USER = process.argv[2] ?? `human-${String(Date.now()).slice(-7)}`

const DEFAULT_DECK = {
  name: 'Mage Web human test',
  cards: [
    { cardName: 'Island', setCode: 'LEA', cardNumber: '288', amount: 50 },
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 50 },
  ],
  sideboard: [],
}

const HUMAN_DECK = {
  name: 'Mage Web playable human test',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 34 },
    { cardName: 'Plains', setCode: 'LEA', cardNumber: '287', amount: 4 },
    { cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146', amount: 8 },
    { cardName: 'Blaze', setCode: '6ED', cardNumber: '168', amount: 8 },
    { cardName: 'Arc Trail', setCode: 'SOM', cardNumber: '81', amount: 4 },
    { cardName: 'Boros Charm', setCode: 'FDN', cardNumber: '721', amount: 4 },
    { cardName: 'Walking Ballista', setCode: '2XM', cardNumber: '306', amount: 4 },
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
// GAME_SELECT de prioridad actualmente abierto (el servidor re-dispara diálogos
// entre eventos; sin este estado, una prioridad llegada en un hueco se pierde y
// la partida queda bloqueada esperando nuestra respuesta).
let openPriorityEvent = null

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function opened(socket) {
  return new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = () => reject(new Error('no se pudo abrir el WebSocket'))
  })
}

function send(action, args = {}) {
  const requestId = `human-${sequence++}`
  const dialog = openPriorityEvent
  ws.send(JSON.stringify({ requestId, action, args }))
  return new Promise((resolve) => {
    pending.set(requestId, (result) => {
      // la acción resuelve el diálogo abierto (si sigue siendo el mismo)
      if (dialog && openPriorityEvent === dialog) openPriorityEvent = null
      resolve(result)
    })
  })
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

function controlledPlayer(game) {
  return game?.players?.find((player) => player.controlled)
}

function plainsUntappedIn(game) {
  return Object.values(controlledPlayer(game)?.battlefield ?? {})
    .some((perm) => !perm.tapped && (perm.displayName ?? perm.name) === 'Plains')
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

/** Último GameView recibido (para comprobar la mano/el tablero sin esperar un evento nuevo). */
function latestGameView() {
  for (let i = events.length - 1; i >= 0; i--) {
    const view = eventGame(events[i])
    if (view && view.players) return view
  }
  return null
}

function isTargetEvent(event, gameId) {
  return event.method === 'GAME_TARGET'
    && event.objectId === gameId
    && !/bottom of your library/i.test(String(event.data?.message ?? ''))
    && !/starting player/i.test(String(event.data?.message ?? ''))
    && !/discard/i.test(String(event.data?.message ?? ''))
}

// Descarte automático de mano llena (fin de turno, >7 cartas): el servidor pide
// elegir una carta con GAME_TARGET y la partida se bloquea (y acaba a los ~45s)
// si nadie responde. El prompt trae las cartas en data.targets + data.gameView.myHand
// (cardsView1 viene vacío). Orden: tierras primero (Plains solo si ya hay otro en
// el campo), y los hechizos del escenario solo se descartan si no queda tierra en
// mano (menos valiosos primero: Bolt/Blaze tienen 8 copias, Arc/Ballista/Charm 4).
function autoDiscard(message) {
  if (message.method !== 'GAME_TARGET' || !/discard/i.test(String(message.data?.message ?? ''))) return
  const data = message.data ?? {}
  const handById = { ...(data.cardsView1 ?? {}), ...(data.gameView?.myHand ?? {}) }
  const ids = Array.isArray(data.targets) ? data.targets.map(String) : Object.keys(handById)
  const cards = ids.map((id) => [id, handById[id]]).filter(([, card]) => card)
  if (!cards.length) return
  const named = (id, card) => (card?.displayName ?? card?.name) ?? id
  const view = latestGameView()
  const me = controlledPlayer(view)
  const plainsOnBoard = Object.values(me?.battlefield ?? {})
    .some((perm) => (perm.displayName ?? perm.name) === 'Plains')
  const byName = (name) => cards.find(([, card]) => named(0, card) === name)?.[0]
  const spellOrder = ['Lightning Bolt', 'Blaze', 'Arc Trail', 'Walking Ballista', 'Boros Charm']
  const drop = plainsOnBoard
    ? byName('Plains') ?? byName('Mountain') ?? spellOrder.map(byName).find(Boolean) ?? cards[0][0]
    : byName('Mountain') ?? spellOrder.map(byName).find(Boolean) ?? cards[0][0]
  if (drop) void send('sendPlayerUUID', { gameId: message.objectId, value: drop })
}

// Espera (pasando prioridad entre turnos) hasta que una carta concreta de la mano
// sea jugable (canPlayObjects). Juega la tierra de la mano cada turno mientras
// espera el draw: el tablero avanza (maná para los X y el Ballista) y la mano no
// se llena. Con `colors` con 'W', juega el Plains antes si no hay uno sin girar
// (Boros Charm {R}{W}). Devuelve { id, game, priority } o null si se agotan.
// NOTA: el servidor re-dispara el diálogo de prioridad ~6-7 veces por turno, así
// que `maxTurns` se cuenta por turnos REALES (la library del jugador baja al
// robar), no por eventos.
async function waitUntilPlayable(gameId, name, maxTurns = 22, colors = []) {
  let priority = await waitNextPriority(`prioridad esperando ${name}`)
  let lastLib = null
  let turnsSeen = 0
  for (let iter = 0; iter < 400; iter++) {
    const game = eventGame(priority)
    const lib = controlledPlayer(game)?.libraryCount ?? 0
    if (lastLib !== null && lib !== lastLib) turnsSeen++
    lastLib = lib
    const id = game ? playableCardId(game, name) : null
    if (id) return { id, game, priority }
    if (turnsSeen >= maxTurns) break
    const landId = colors.includes('W') && !plainsUntappedIn(game)
      ? playableCardId(game, 'Plains') ?? playableCardId(game, 'Mountain')
      : playableCardId(game, 'Mountain') ?? playableCardId(game, 'Plains')
    if (landId) {
      const res = await Promise.race([
        send('sendPlayerUUID', { gameId, value: landId }),
        timeout(15000, 'jugar tierra esperando draw'),
      ])
      if (res.ok) {
        priority = await waitNextPriority('prioridad tras jugar tierra (espera)')
        continue
      }
    }
    const passCursor = events.length
    const pass = await Promise.race([
      send('sendPlayerBoolean', { gameId, value: false }),
      timeout(15000, `pasar prioridad esperando ${name}`),
    ])
    if (!pass.ok) return null
    // el servidor re-dispara el diálogo de prioridad: dormir evita responder en
    // ráfaga (el proxy corta la conexión por rate limit a 100 msg/s)
    await sleep(400)
    priority = await waitEvent(hasHumanPriority, `prioridad esperando ${name}`, 45000, passCursor)
  }
  const endGame = eventGame(priority)
  const endMe = controlledPlayer(endGame)
  console.error(`[dbg] waitUntilPlayable agotado ${name} colores=[${colors.join(',')}] mano=[${Object.values(endGame?.myHand ?? {}).map((c) => c.displayName ?? c.name).join(', ')}] grave=[${Object.values(endMe?.graveyard ?? {}).map((c) => c.displayName ?? c.name).join(', ')}] lib=${endMe?.libraryCount ?? '?'} battlefield=[${Object.values(endMe?.battlefield ?? {}).map((p) => `${p.displayName ?? p.name}${p.tapped ? '(T)' : ''}`).join(', ')}]`)
  return null
}

// Pago de maná genérico: clic en fuentes del tablero o reserva, repitiendo hasta
// que el servidor deje de pedir GAME_PLAY_MANA. Devuelve la prioridad posterior.
async function payMana(gameId, label, firstEvent = null) {
  let manaEvent = firstEvent ?? await waitEvent(
    (event) => event.method === 'GAME_PLAY_MANA' && event.objectId === gameId,
    `GAME_PLAY_MANA de ${label}`,
    40000,
  )
  while (true) {
    const game = eventGame(manaEvent)
    const sourceId = manaSourceId(game)
    const me = game?.players?.find((player) => player.controlled)
    let result
    if (sourceId) {
      result = await Promise.race([
        send('sendPlayerUUID', { gameId, value: sourceId }),
        timeout(15000, `activar fuente de maná (${label})`),
      ])
    } else if (me?.playerId && Object.values(me?.manaPool ?? {}).some((n) => (n ?? 0) > 0)) {
      const color = Object.entries(me.manaPool).find(([, n]) => (n ?? 0) > 0)?.[0]
      result = await Promise.race([
        send('sendPlayerManaType', { gameId, playerId: me.playerId, manaType: String(color).toUpperCase() }),
        timeout(15000, `usar reserva de maná (${label})`),
      ])
    } else {
      check(`fuente o reserva de maná para ${label}`, false)
      return null
    }
    check(`pagar maná de ${label}`, result.ok, result.error ?? '')
    if (!result.ok) return null
    const actionCursor = events.length
    const next = await waitEvent(
      (event) => event.method === 'GAME_PLAY_MANA' || hasHumanPriority(event),
      `siguiente decisión de maná de ${label}`,
      40000,
      actionCursor,
    )
    if (next.method === 'GAME_PLAY_MANA') {
      manaEvent = next
      continue
    }
    return next
  }
}

// Elige al oponente como objetivo (el primero de targets puede ser uno mismo).
async function chooseOpponentTarget(gameId, cursor, label) {
  const targetEvent = await waitEvent((event) => isTargetEvent(event, gameId), `GAME_TARGET de ${label}`, 40000, cursor)
  const possible = targetIds(targetEvent)
  const view = eventGame(targetEvent)
  const opponent = view?.players?.find((player) => !player.controlled)
  const opponentId = opponent?.playerId && possible.includes(opponent.playerId) ? opponent.playerId : null
  const id = opponentId ?? possible[0]
  if (!check(`GAME_TARGET de ${label} contiene objetivos`, Boolean(id), `targets=${possible.length}`)) return null
  const result = await Promise.race([
    send('sendPlayerUUID', { gameId, value: id }),
    timeout(15000, `elegir objetivo de ${label}`),
  ])
  check(`elegir objetivo de ${label} (${opponentId ? 'oponente' : 'primer objetivo'})`, result.ok, result.error ?? '')
  return result.ok ? id : null
}

// Elige la habilidad "Cast ..." cuando el servidor pide GAME_CHOOSE_ABILITY
// (las criaturas con habilidades activadas muestran un selector al lanzarlas).
async function chooseSpellAbility(gameId, label, cursor) {
  const picker = await waitEvent(
    (event) => event.method === 'GAME_CHOOSE_ABILITY' && event.objectId === gameId,
    `GAME_CHOOSE_ABILITY de ${label}`,
    40000,
    cursor,
  )
  const choices = Object.entries(picker.data?.choices ?? {})
  const cast = choices.find(([, text]) => /(^|\.\s*)Cast /i.test(String(text)))
  if (!check(`GAME_CHOOSE_ABILITY de ${label} ofrece "Cast"`, Boolean(cast), choices.map(([, t]) => t).join(' | '))) return null
  const result = await Promise.race([
    send('sendPlayerUUID', { gameId, value: cast[0] }),
    timeout(15000, `elegir habilidad de ${label}`),
  ])
  check(`elegir habilidad de ${label}`, result.ok, result.error ?? '')
  return result.ok ? cast[0] : null
}

// Espera la próxima prioridad humana (GAME_SELECT fresco) y la devuelve.
function waitNextPriority(label) {
  if (openPriorityEvent) {
    const event = openPriorityEvent
    openPriorityEvent = null
    return Promise.resolve(event)
  }
  return waitEvent(hasHumanPriority, label, 45000, events.length)
}

// Pasa la prioridad actual (deja resolver el stack) y lo registra en los checks.
async function passPriority(gameId, label) {
  const result = await Promise.race([
    send('sendPlayerBoolean', { gameId, value: false }),
    timeout(15000, `pasar prioridad (${label})`),
  ])
  check(`pasar prioridad (${label})`, result.ok, result.error ?? '')
  return result.ok
}

// Juega tierras (una por turno) hasta tener `need` tierras sin girar en el campo;
// si `colors` incluye 'W' (Boros Charm {R}{W}), exige además al menos un Plains
// sin girar y prioriza jugar el Plains de la mano cuando no lo haya en el campo.
// `maxTurns` cuenta turnos REALES (la library baja al robar; el servidor
// re-dispara el diálogo de prioridad varias veces por turno).
async function ensureLands(gameId, need, maxTurns = 22, currentPriority = null, colors = []) {
  let priority = currentPriority ?? await waitNextPriority('prioridad para jugar tierras')
  let lastLib = null
  let turnsSeen = 0
  for (let iter = 0; iter < 400; iter++) {
    while (true) {
      const game = eventGame(priority)
      const landId = colors.includes('W') && !plainsUntappedIn(game)
        ? playableCardId(game, 'Plains') ?? playableCardId(game, 'Mountain')
        : playableCardId(game, 'Mountain') ?? playableCardId(game, 'Plains')
      if (!landId) break
      const playCursor = events.length
      const res = await Promise.race([
        send('sendPlayerUUID', { gameId, value: landId }),
        timeout(15000, 'jugar tierra'),
      ])
      if (!res.ok) return false
      priority = await waitNextPriority('prioridad tras jugar tierra')
    }
    const game = eventGame(priority)
    const me = controlledPlayer(game)
    const untapped = Object.values(me?.battlefield ?? {}).filter((perm) => !perm.tapped).length
    if (untapped >= need && (!colors.includes('W') || plainsUntappedIn(game))) return true
    const lib = me?.libraryCount ?? 0
    if (lastLib !== null && lib !== lastLib) turnsSeen++
    lastLib = lib
    if (turnsSeen >= maxTurns) break
    const passCursor = events.length
    const pass = await Promise.race([
      send('sendPlayerBoolean', { gameId, value: false }),
      timeout(15000, 'pasar prioridad esperando tierras'),
    ])
    if (!pass.ok) return false
    await sleep(400)
    priority = await waitEvent(hasHumanPriority, 'prioridad para jugar tierras', 45000, passCursor)
  }
  const game = eventGame(priority)
  const me = controlledPlayer(game)
  console.error(`[dbg] ensureLands agotado need=${need} colores=[${colors.join(',')}] mano=[${Object.values(game?.myHand ?? {}).map((c) => c.displayName ?? c.name).join(', ')}] cementerio=[${Object.values(me?.graveyard ?? {}).map((c) => c.displayName ?? c.name).join(', ')}] library=${me?.libraryCount ?? '?'}`)
  return false
}

// Tras lanzar un hechizo: responde GAME_TARGET y GAME_PLAY_MANA en el orden que el
// servidor los pida (el orden varía entre hechizos). Devuelve la prioridad final.
async function resolveCast(gameId, label) {
  let cursor = events.length
  let priority = null
  for (let step = 0; step < 12 && !priority; step++) {
    const open = await waitEvent(
      (event) => isTargetEvent(event, gameId) || (event.method === 'GAME_PLAY_MANA' && event.objectId === gameId) || hasHumanPriority(event),
      `siguiente decisión de ${label} (paso ${step})`,
      40000,
      cursor,
    )
    cursor = events.length
    if (open.method === 'GAME_PLAY_MANA') {
      priority = await payMana(gameId, label, open)
    } else if (isTargetEvent(open, gameId)) {
      const possible = targetIds(open)
      const view = eventGame(open)
      const opponent = view?.players?.find((player) => !player.controlled)
      const opponentId = opponent?.playerId && possible.includes(opponent.playerId) ? opponent.playerId : null
      const id = opponentId ?? possible[0]
      if (!check(`GAME_TARGET de ${label} contiene objetivos`, Boolean(id), `targets=${possible.length}`)) return null
      const result = await Promise.race([
        send('sendPlayerUUID', { gameId, value: id }),
        timeout(15000, `elegir objetivo de ${label}`),
      ])
      check(`elegir objetivo de ${label} (${opponentId ? 'oponente' : 'primer objetivo'})`, result.ok, result.error ?? '')
      if (!result.ok) return null
    } else {
      priority = open
    }
  }
  return priority
}

// Espera la resolución verificando la vida exacta de un jugador con el stack vacío.
async function waitLife(gameId, playerField, expectedLife, cursor, label) {
  const event = await waitEvent(
    (event) => {
      if (event.objectId !== gameId || !['GAME_UPDATE', 'GAME_UPDATE_AND_INFORM'].includes(event.method)) return false
      const view = eventGame(event)
      if (Object.keys(view?.stack ?? {}).length !== 0) return false
      return view?.players?.some((player) => player[playerField] === expectedLife) ?? false
    },
    label,
    40000,
    cursor,
  )
  check(label, Boolean(event), `life=${expectedLife}`)
  return Boolean(event)
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
  if (['GAME_ASK', 'GAME_OVER', 'END_GAME_INFO', 'GAME_TARGET', 'GAME_PLAY_MANA', 'GAME_GET_AMOUNT', 'GAME_CHOOSE_CHOICE'].includes(message.method)) {
    console.error(`[dbg] ${message.method} msg=${String(message.data?.message ?? '').slice(0, 90)}`)
  }
  events.push(message)
  if (hasHumanPriority(message)) openPriorityEvent = message
  autoDiscard(message)
  // Confirmación de maná sobrante al pasar ("will be lost. Pass anyway?"): el
  // pago multi-paso puede dejar maná en la reserva; responder sí evita bloquear.
  if (message.method === 'GAME_ASK' && /mana in your mana pool/i.test(String(message.data?.message ?? ''))) {
    void send('sendPlayerBoolean', { gameId: message.objectId, value: true })
  }
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (waiters[i](message)) waiters.splice(i, 1)
  }
}

async function main() {
  console.log(`[human-test] conectando como ${USER}…`)
  ws = new WebSocket(WS_URL)
  ws.onmessage = (event) => handleMessage(event.data)
  ws.onclose = (event) => console.error(`[dbg] WS CLOSE code=${event.code} reason=${String(event.reason ?? '')}`)
  ws.onerror = (event) => console.error(`[dbg] WS ERROR ${String(event.message ?? '')}`)
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
      await sleep(400)
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
      await sleep(400)
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

    // ── Fase 2 avanzada: X cost (Blaze) ──────────────────────────────────────
    // Blaze {X}{R}: el servidor pide el valor de X con GAME_GET_AMOUNT (integer).
    let advancedCursor = events.length
    const blaze = await waitUntilPlayable(gameId, 'Blaze')
    if (check('Blaze jugable desde la mano (canPlayObjects)', Boolean(blaze?.id))) {
      if (!check('suficientes tierras para X=2 ({2}{R})', await ensureLands(gameId, 3, 22, blaze.priority), '3 tierras')) return
      result = await Promise.race([
        send('sendPlayerUUID', { gameId, value: blaze.id }),
        timeout(15000, 'jugar Blaze'),
      ])
      check('jugar Blaze con UUID', result.ok, result.error ?? '')
      if (result.ok) {
        const amount = await waitEvent(
          (event) => event.method === 'GAME_GET_AMOUNT' && event.objectId === gameId,
          'GAME_GET_AMOUNT del X de Blaze',
          40000,
          advancedCursor,
        )
        const min = amount.data?.min ?? 0
        const max = amount.data?.max ?? 0
        check('X de Blaze pedido con GAME_GET_AMOUNT', typeof min === 'number' && max >= 2, `min=${min} max=${max}`)
        if (max >= 2) {
          result = await Promise.race([
            send('sendPlayerInteger', { gameId, value: 2 }),
            timeout(15000, 'anunciar X=2'),
          ])
          check('anunciar X=2 con sendPlayerInteger', result.ok, result.error ?? '')
          if (result.ok) {
            const priorityAfterBlaze = await resolveCast(gameId, 'Blaze')
            if (priorityAfterBlaze && await passPriority(gameId, 'Blaze')) {
              await waitLife(gameId, 'life', 15, events.length, 'Blaze X=2 resuelto (vida oponente 15)')
            }
          }
        }
      }
    }

    // ── Fase 2 avanzada: multi-target (Arc Trail, 2 objetivos distintos) ─────
    const arcTrail = await waitUntilPlayable(gameId, 'Arc Trail')
    if (check('Arc Trail jugable desde la mano (canPlayObjects)', Boolean(arcTrail?.id))) {
      if (!check('suficientes tierras para Arc Trail ({1}{R})', await ensureLands(gameId, 2, 22, arcTrail.priority), '2 tierras')) return
      result = await Promise.race([
        send('sendPlayerUUID', { gameId, value: arcTrail.id }),
        timeout(15000, 'jugar Arc Trail'),
      ])
      check('jugar Arc Trail con UUID', result.ok, result.error ?? '')
      if (result.ok) {
        const firstTarget = await chooseOpponentTarget(gameId, events.length, 'Arc Trail (1/2)')
        if (firstTarget) {
          // El 2º objetivo es "another target": si solo queda un objetivo legal el
          // servidor lo auto-elige y no manda prompt (va directo al pago de maná).
          const nextCursor = events.length
          const next = await waitEvent(
            (event) => isTargetEvent(event, gameId) || (event.method === 'GAME_PLAY_MANA' && event.objectId === gameId),
            'segundo objetivo de Arc Trail o pago de maná',
            40000,
            nextCursor,
          )
          if (isTargetEvent(next, gameId)) {
            const secondView = eventGame(next)
            const me = secondView?.players?.find((player) => player.controlled)
            const possible = targetIds(next)
            const myId = me?.playerId && possible.includes(me.playerId) ? me.playerId : null
            const secondId = myId ?? possible.find((id) => id !== firstTarget) ?? possible[0]
            if (!check('segundo objetivo de Arc Trail disponible', Boolean(secondId), `targets=${possible.join(',')}`)) return
            // dos objetivos de objetivo único: el segundo debe ser distinto del primero
            if (!check('objetivos de Arc Trail distintos', Boolean(secondId) && secondId !== firstTarget, `primero=${firstTarget.slice(0, 8)} segundo=${secondId.slice(0, 8)}`)) return
            result = await Promise.race([
              send('sendPlayerUUID', { gameId, value: secondId }),
              timeout(15000, 'elegir segundo objetivo de Arc Trail'),
            ])
            check('elegir segundo objetivo de Arc Trail', result.ok, result.error ?? '')
            if (!result.ok) return
          } else {
            check('segundo objetivo de Arc Trail auto-elegido (único legal)', true, 'va directo al pago')
          }
          const priorityAfterArc = next.method === 'GAME_PLAY_MANA'
            ? await payMana(gameId, 'Arc Trail', next)
            : await resolveCast(gameId, 'Arc Trail (pago)')
          if (priorityAfterArc && await passPriority(gameId, 'Arc Trail')) {
            await waitLife(gameId, 'life', 13, events.length, 'Arc Trail resuelto (oponente 15→13)')
            await waitLife(gameId, 'life', 19, events.length, 'Arc Trail resuelto (nosotros 20→19)')
          }
        }
      }
    }

    // ── Fase 2 avanzada: elección de modo (Boros Charm "Choose one") ─────────
    // {R}{W}: sin un Plains sin girar el charm no está en canPlayObjects, así que
    // la espera juega el Plains de la mano y verifica ambos requisitos juntos.
    const charm = await waitUntilPlayable(gameId, 'Boros Charm', 30, ['W'])
    if (check('Boros Charm jugable desde la mano (canPlayObjects)', Boolean(charm?.id))) {
      const charmView = eventGame(charm.priority)
      const charmMe = controlledPlayer(charmView)
      const charmUntapped = Object.values(charmMe?.battlefield ?? {}).filter((perm) => !perm.tapped).length
      if (!check('suficientes tierras para Boros Charm ({R}{W})', charmUntapped >= 2 && plainsUntappedIn(charmView), `untapped=${charmUntapped}`)) return
      result = await Promise.race([
        send('sendPlayerUUID', { gameId, value: charm.id }),
        timeout(15000, 'jugar Boros Charm'),
      ])
      check('jugar Boros Charm con UUID', result.ok, result.error ?? '')
      if (result.ok) {
        // el modo llega como GAME_CHOOSE_ABILITY (chooseMode -> AbilityPickerView)
        const modeEvent = await waitEvent(
          (event) => event.method === 'GAME_CHOOSE_ABILITY' && event.objectId === gameId,
          'GAME_CHOOSE_ABILITY del modo de Boros Charm',
          40000,
          events.length,
        )
        const keyChoices = Object.entries(modeEvent.data?.choices ?? {})
        const damageMode = keyChoices.find(([, label]) => /4 damage|deals 4/i.test(String(label)))
        check('Boros Charm ofrece el modo de 4 de daño', Boolean(damageMode), keyChoices.map(([, l]) => l).join(' | '))
        if (damageMode) {
          result = await Promise.race([
            send('sendPlayerUUID', { gameId, value: damageMode[0] }),
            timeout(15000, 'elegir modo de 4 de daño'),
          ])
          check('elegir modo de Boros Charm con UUID', result.ok, result.error ?? '')
          if (result.ok) {
            const priorityAfterCharm = await resolveCast(gameId, 'Boros Charm')
            if (priorityAfterCharm && await passPriority(gameId, 'Boros Charm')) {
              await waitLife(gameId, 'life', 9, events.length, 'Boros Charm resuelto (oponente 13→9)')
            }
          }
        }
      }
    }

    // ── Fase 2 avanzada: contadores +1/+1 (Walking Ballista, {X}{X} con X=4) ──
    // Walking Ballista cuesta {X}{X} (no {4}): anunciando X=4 se pagan 8 maná y
    // entra con 4 contadores +1/+1 (coste verificado en Mage.Sets).
    const ballista = await waitUntilPlayable(gameId, 'Walking Ballista')
    if (check('Walking Ballista jugable desde la mano (canPlayObjects)', Boolean(ballista?.id))) {
      if (!check('suficientes tierras para Walking Ballista ({X}{X} X=4)', await ensureLands(gameId, 8, 22, ballista.priority), '8 tierras')) return
      result = await Promise.race([
        send('sendPlayerUUID', { gameId, value: ballista.id }),
        timeout(15000, 'jugar Walking Ballista'),
      ])
      check('jugar Walking Ballista con UUID', result.ok, result.error ?? '')
      if (result.ok) {
        const castCursor = events.length
        if (await chooseSpellAbility(gameId, 'Walking Ballista', castCursor)) {
          const amountCursor = events.length
          const amount = await waitEvent(
            (event) => event.method === 'GAME_GET_AMOUNT' && event.objectId === gameId,
            'GAME_GET_AMOUNT del X de Walking Ballista',
            40000,
            amountCursor,
          )
          const min = amount.data?.min ?? 0
          const max = amount.data?.max ?? 0
          check('X de Walking Ballista pedido con GAME_GET_AMOUNT', typeof min === 'number' && max >= 4, `min=${min} max=${max}`)
          if (max >= 4) {
            result = await Promise.race([
              send('sendPlayerInteger', { gameId, value: 4 }),
              timeout(15000, 'anunciar X=4'),
            ])
            check('anunciar X=4 con sendPlayerInteger', result.ok, result.error ?? '')
            if (result.ok) {
              const priorityAfterBallista = await payMana(gameId, 'Walking Ballista')
              if (priorityAfterBallista && await passPriority(gameId, 'Walking Ballista')) {
                const ballistaCursor = events.length
                const ballistaEvent = await waitEvent((event) => {
                  if (event.objectId !== gameId || !['GAME_UPDATE', 'GAME_UPDATE_AND_INFORM'].includes(event.method)) return false
                  const view = eventGame(event)
                  const me = view?.players?.find((player) => player.controlled)
                  if (!me) return false
                  const permanents = Object.values(me.battlefield ?? {})
                  return permanents.some((perm) => (perm.displayName ?? perm.name) === 'Walking Ballista')
                }, 'Walking Ballista en el battlefield', 40000, ballistaCursor)
                const ballistaView = eventGame(ballistaEvent)
                const me = ballistaView?.players?.find((player) => player.controlled)
                const perm = Object.values(me?.battlefield ?? {}).find((p) => (p.displayName ?? p.name) === 'Walking Ballista')
                const counters = (perm?.counters ?? []).reduce((sum, counter) => sum + (counter?.count ?? 0), 0)
                check('Walking Ballista con contadores +1/+1 (X=4)', counters === 4, `counters=${counters}`)
              }
            }
          }
        }
      }
    }

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
}

// Los `return` tempranos del flujo saltarían el log de resultado: se imprime y se
// decide el exit code aquí, en un finally de nivel superior.
try {
  await main()
} finally {
  console.log(`[human-test] RESULTADO: ${failCount === 0 ? 'TODO PASS' : `${failCount} FALLOS`} (${passCount} pass, ${failCount} fail)`)
  process.exit(failCount === 0 ? 0 : 1)
}
