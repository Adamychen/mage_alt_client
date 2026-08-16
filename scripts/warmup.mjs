#!/usr/bin/env node
// Calentamiento del stack: crea una partida IA vs IA descartable para "tripar" el
// canal de callbacks del servidor tras un arranque en frío (la PRIMERA partida
// puede perder el socket de retorno: "SESSION CALLBACK EXCEPTION - Unable to
// create socket" en server.out.log). Si el fallo ocurre, se reintenta una vez.
// Uso: node scripts/warmup.mjs

const WS_URL = 'ws://127.0.0.1:8787'
const SERVER_HOST = 'localhost'
const SERVER_PORT = 17171
// el servidor limita el nombre de usuario a 14 caracteres (config.xml maxUserNameLength)
const USER = `warmup-${String(Date.now()).slice(-6)}`

// con Bolt las partidas IA vs IA terminan rápido (2-3 turnos): un mazo sin
// win-con correría 60+ turnos y su torrente de GAME_UPDATEs inundaría la cola
// de callbacks de la siguiente sesión (WATCHGAME perdido silenciosamente).
// El mazo está ORDENADO (con skipInitShuffling) para que sea determinista.
const DEFAULT_DECK = {
  name: 'Mage Web starter',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 4 },
    { cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146', amount: 4 },
    { cardName: 'Island', setCode: 'LEA', cardNumber: '288', amount: 20 },
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 16 },
    { cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146', amount: 4 },
  ],
  sideboard: [],
}

const timeout = (ms, label) =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout esperando ${label} (${ms}ms)`)), ms))

function client() {
  const ws = new WebSocket(WS_URL)
  const pending = new Map()
  const waiters = []
  let gameInit = null

  ws.onmessage = (msg) => {
    let m
    try {
      m = JSON.parse(String(msg.data))
    } catch {
      return
    }
    if (m.type === 'result') {
      const list = pending.get(m.action) ?? []
      const res = list.shift()
      if (res) res(m)
    } else if (m.type === 'event') {
      if (m.method === 'GAME_INIT') gameInit = m
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i](m)) waiters.splice(i, 1)
      }
    }
  }

  const opened = new Promise((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('no se pudo conectar al proxy'))
  })

  const send = (action, args) => {
    ws.send(JSON.stringify({ action, args }))
    return new Promise((resolve) => {
      const list = pending.get(action) ?? []
      list.push(resolve)
      pending.set(action, list)
    })
  }

  const waitEvent = (pred, label, ms = 20000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout esperando ${label}`)), ms)
      waiters.push((ev) => {
        if (pred(ev)) {
          clearTimeout(timer)
          resolve(ev)
          return true
        }
        return false
      })
    })

  return { ws, opened, send, waitEvent, gameInit: () => gameInit }
}

async function cleanup(tableId, gameId) {
  if (!tableId && !gameId) return
  const c = client()
  try {
    await Promise.race([c.opened, timeout(10000, 'apertura del WebSocket de limpieza')])
    let res = await Promise.race([
      c.send('connect', { host: SERVER_HOST, port: SERVER_PORT, username: USER, password: 'x' }),
      timeout(15000, 'resultado de connect (limpieza)'),
    ])
    if (!res.ok) return
    if (gameId) {
      await Promise.race([c.send('quitMatch', { gameId }), timeout(10000, 'quitMatch (limpieza)')]).catch(() => {})
    }
    if (tableId) {
      await Promise.race([c.send('removeTable', { tableId }), timeout(10000, 'removeTable (limpieza)')]).catch(() => {})
    }
  } catch {
    /* la limpieza nunca debe romper el warmup */
  } finally {
    try {
      c.ws.close()
    } catch {
      /* noop */
    }
  }
}

async function runOnce() {
  const c = client()
  let tableId = null
  let gameId = null
  try {
    await Promise.race([c.opened, timeout(10000, 'apertura del WebSocket')])

    let res = await Promise.race([
      c.send('connect', { host: SERVER_HOST, port: SERVER_PORT, username: USER, password: 'x' }),
      timeout(15000, 'resultado de connect'),
    ])
    if (!res.ok) throw new Error(`connect falló: ${res.error ?? ''}`)

    res = await Promise.race([
      c.send('createTable', {
        name: `Warmup ${USER}`,
        gameType: 'Two Player Duel',
        deckType: 'Constructed - Modern',
        winsNeeded: 1,
        playerTypes: ['COMPUTER_MAD', 'COMPUTER_MAD'],
        skipInitShuffling: true,
        skipStartingPlayerChoice: true,
      }),
      timeout(15000, 'createTable'),
    ])
    tableId = res.ok ? res.data?.tableId ?? res.data?.table?.tableId : null
    if (!tableId) throw new Error(`createTable falló: ${res.error ?? ''}`)

    for (let i = 0; i < 2; i++) {
      res = await Promise.race([
        c.send('joinTable', {
          tableId,
          playerName: i === 0 ? 'Warmup CPU' : `Warmup CPU ${i + 1}`,
          playerType: 'COMPUTER_MAD',
          skill: 1,
          deck: DEFAULT_DECK,
        }),
        timeout(15000, `joinTable IA ${i + 1}`),
      ])
      if (!res.ok) throw new Error(`joinTable IA ${i + 1} falló: ${res.error ?? ''}`)
    }

    res = await Promise.race([c.send('startMatch', { tableId }), timeout(20000, 'startMatch')])
    if (!res.ok) throw new Error(`startMatch falló: ${res.error ?? ''}`)

    res = await Promise.race([c.send('watchTable', { tableId }), timeout(15000, 'watchTable')])
    if (!res.ok) throw new Error(`watchTable falló: ${res.error ?? ''}`)

    const watch = await Promise.race([c.waitEvent((m) => m.method === 'WATCHGAME', 'WATCHGAME'), timeout(30000, 'WATCHGAME')])
    gameId = watch.objectId

    res = await Promise.race([c.send('watchGame', { gameId }), timeout(15000, 'watchGame')])
    if (!res.ok) throw new Error(`watchGame falló: ${res.error ?? ''}`)

    await Promise.race([c.waitEvent((m) => m.method === 'GAME_INIT' && m.objectId === gameId, 'GAME_INIT'), timeout(30000, 'GAME_INIT')])

    await Promise.race([c.send('quitMatch', { gameId }), timeout(10000, 'quitMatch')]).catch(() => {})
    await Promise.race([c.send('removeTable', { tableId }), timeout(10000, 'removeTable')]).catch(() => {})
    return { ok: true, gameId }
  } catch (e) {
    try {
      c.ws.close()
    } catch {
      /* noop */
    }
    await cleanup(tableId, gameId)
    throw e
  }
}

async function main() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { gameId } = await runOnce()
      console.log(`[warmup] OK (intento ${attempt}): canal de callbacks operativo (GAME_INIT de ${String(gameId).slice(0, 8)}…)`)
      process.exit(0)
    } catch (e) {
      if (attempt === 1) console.log(`  [warmup] intento ${attempt} falló (${e.message}) — reintentando…`)
      else {
        console.log(`[warmup] FALLÓ: ${e.message}`)
        process.exit(1)
      }
    }
  }
}

await main()
