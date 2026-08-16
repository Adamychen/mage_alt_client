#!/usr/bin/env node
// Auto-prueba del flujo completo (sin navegador): login -> mesa IA vs IA ->
// espectador -> tablero. Imprime PASS/FAIL por paso.
// Uso: node scripts/self-test.mjs

import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from './lib.mjs'

const WS_URL = 'ws://127.0.0.1:8787'
const SERVER_HOST = 'localhost'
const SERVER_PORT = 17171
const USER = process.argv[2] ?? `selftest-${Date.now() % 100000}`

// con Bolt en el mazo las partidas IA vs IA terminan en 2-3 turnos: una partida
// sin win-con (solo tierras) corre 60+ turnos y su torrente de GAME_UPDATEs
// inunda la cola de callbacks de la sesión (el WATCHGAME siguiente se pierde
// silenciosamente: tryLock de Session.fireCallback agotado). El mazo está
// ORDENADO (con skipInitShuffling) para que la partida sea determinista.
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

let passCount = 0
let failCount = 0

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

const timeout = (ms, label) =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout esperando ${label} (${ms}ms)`)), ms))

// solo el contenido escrito DESPUÉS de iniciarse el test (los logs son
// append-only entre reinicios: los warnings históricos no deben contar)
function logSince(re, file, startOffset) {
  try {
    const size = fs.statSync(file).size
    const fh = fs.openSync(file, 'r')
    const buf = Buffer.alloc(Math.max(0, size - startOffset))
    fs.readSync(fh, buf, 0, buf.length, startOffset)
    fs.closeSync(fh)
    return re.test(buf.toString('utf8'))
  } catch {
    return false
  }
}

async function main() {
  console.log(`[self-test] conectando a ${WS_URL} como ${USER}…`)

  // offset de logs capturado ANTES del flujo: las comprobaciones del paso 7
  // solo miran lo escrito durante el test (los logs son append-only)
  const proxyLogs = [
    path.join(repoRoot, '.run', 'proxy.err.log'),
    path.join(repoRoot, 'Mage.Proxy', 'proxy.err.log'),
  ].filter((f) => fs.existsSync(f))
  const logOffsets = Object.fromEntries(
    proxyLogs.map((f) => {
      try {
        return [f, fs.statSync(f).size]
      } catch {
        return [f, 0]
      }
    }),
  )

  const ws = new WebSocket(WS_URL)
  const pending = new Map() // action -> resolver
  const waiters = [] // resolvers por condición
  let events = { gameInit: 0, startGame: 0, watchGame: 0, updates: 0, lobby: 0, dropped: 0 }

  const waitEvent = (pred, label, ms = 20000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout esperando ${label}`)), ms)
      const waiter = (ev) => {
        if (pred(ev)) {
          clearTimeout(timer)
          resolve(ev)
          return true
        }
        return false
      }
      waiters.push(waiter)
    })
  }

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
    } else {
      if (m.type === 'event') {
        if (m.method === 'GAME_INIT') events.gameInit++
        if (m.method === 'START_GAME') events.startGame++
        if (m.method === 'WATCHGAME') events.watchGame++
        if (m.method === 'GAME_UPDATE' || m.method === 'GAME_UPDATE_AND_INFORM') events.updates++
      } else if (m.type === 'lobby') {
        events.lobby++
      } else if (m.type === 'error') {
        console.log(`  nota: error del proxy: ${m.message}`)
      }
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

  let tableId = null
  try {
    await Promise.race([opened, timeout(10000, 'apertura del WebSocket')])
    check('WebSocket al proxy', true)

    // 1) login
    let res = await Promise.race([
      send('connect', { host: SERVER_HOST, port: SERVER_PORT, username: USER, password: 'x' }),
      timeout(15000, 'resultado de connect'),
    ])
    if (!check('connect/login', !!res.ok, `lastError='${res.error ?? ''}'`)) {
      ws.close()
      process.exit(1)
    }
    // el broadcast "connected" y el lobby deben llegar (salud de broadcasts)
    await Promise.race([waitEvent((m) => m.type === 'connected', 'broadcast connected'), timeout(15000, 'broadcast connected')]).catch(() => {})
    await Promise.race([waitEvent(() => events.lobby > 0, 'broadcast lobby', 15000), timeout(20000, 'broadcast lobby')])
      .then(() => check('broadcasts lobby llegan', true))
      .catch((e) => check('broadcasts lobby llegan', false, e.message))

    // 2) createTable
    res = await Promise.race([
      send('createTable', {
        name: 'Demo Self-Test',
        gameType: 'Two Player Duel',
        deckType: 'Constructed - Modern',
        winsNeeded: 1,
        playerTypes: ['COMPUTER_MAD', 'COMPUTER_MAD'],
        skipInitShuffling: true,
      }),
      timeout(15000, 'createTable'),
    ])
    tableId = res.ok ? res.data?.tableId ?? res.data?.table?.tableId : null
    if (!check('createTable', !!tableId, res.ok ? `tableId=${String(tableId).slice(0, 8)}…` : res.error)) {
      ws.close()
      process.exit(1)
    }

    // 3) joinTable x2
    for (let i = 0; i < 2; i++) {
      res = await Promise.race([
        send('joinTable', {
          tableId,
          playerName: i === 0 ? 'Computer' : `Computer ${i + 1}`,
          playerType: 'COMPUTER_MAD',
          skill: 1,
          deck: DEFAULT_DECK,
        }),
        timeout(15000, `joinTable #${i + 1}`),
      ])
      if (!check(`joinTable IA ${i + 1}`, !!res.ok, res.error ?? '')) {
        ws.close()
        process.exit(1)
      }
    }

    // 4) startMatch
    res = await Promise.race([send('startMatch', { tableId }), timeout(20000, 'startMatch')])
    if (!check('startMatch', !!res.ok, res.error ?? '')) {
      ws.close()
      process.exit(1)
    }

    // 5) watchTable -> WATCHGAME -> watchGame -> GAME_INIT
    // La primera partida tras un arranque en frío del servidor puede tardar en emitir el
    // WATCHGAME (o perderlo); reintentamos el watchTable una vez antes de declarar el fallo.
    let ev = null
    for (let attempt = 0; attempt < 2 && !ev; attempt++) {
      res = await Promise.race([send('watchTable', { tableId }), timeout(15000, 'watchTable')])
      if (attempt === 0) check('watchTable', !!res.ok, res.error ?? '')
      if (!res.ok) break
      try {
        ev = await Promise.race([
          waitEvent((m) => m.method === 'WATCHGAME', 'WATCHGAME', attempt === 0 ? 20000 : 60000),
          timeout(attempt === 0 ? 20000 : 60000, 'WATCHGAME'),
        ])
      } catch {
        if (attempt === 0) console.log('  nota: WATCHGAME lento, reintentando watchTable…')
      }
    }
    if (res.ok && ev) {
      check('evento WATCHGAME recibido', true, `gameId=${String(ev.objectId).slice(0, 8)}…`)
      const gameId = ev.objectId
      const initEv = waitEvent((m) => m.method === 'GAME_INIT' && m.objectId === gameId, 'GAME_INIT', 30000)
      const gameWatchRes = await Promise.race([send('watchGame', { gameId }), timeout(15000, 'watchGame')])
      check('watchGame', !!gameWatchRes.ok, gameWatchRes.error ?? '')
      try {
        const init = await Promise.race([initEv, timeout(30000, 'GAME_INIT')])
        const players = init.data?.players?.length ?? 0
        check('GAME_INIT con tablero', players >= 2, `${players} jugadores en el GameView`)
      } catch (e) {
        check('GAME_INIT con tablero', false, e.message)
      }
    } else {
      check('evento WATCHGAME recibido', false, res.error ?? 'timeout esperando WATCHGAME')
    }

    // 6) flujo de actualizaciones (esperar unas pocas GAME_UPDATE)
    const before = events.updates
    try {
      await Promise.race([waitEvent(() => events.updates > before + 2, 'GAME_UPDATEs', 30000), timeout(35000, 'GAME_UPDATEs')])
      check('GAME_UPDATEs fluyen', true, `${events.updates} recibidas`)
    } catch (e) {
      check('GAME_UPDATEs fluyen', false, e.message)
    }
  } catch (e) {
    check('flujo global', false, e.message)
  } finally {
    // higiene: eliminar la mesa del test para no dejar partidas IA huérfanas corriendo
    // (el servidor reenvía sus eventos al siguiente usuario que conecte por el proxy,
    // saturando la cola de callbacks y retrasando/estropeando el siguiente test)
    if (tableId) {
      try {
        await Promise.race([send('removeTable', { tableId }), timeout(10000, 'removeTable')])
      } catch {
        /* noop */
      }
    }
    try {
      ws.close()
    } catch {
      /* noop */
    }
  }

  // 7) comprobaciones cruzadas en los logs del proxy (solo lo escrito durante el test)
  console.log('[self-test] comprobaciones de logs del proxy:')
  check('proxy: GAME_INIT reenviado (log)', proxyLogs.some((f) => logSince(/event >> GAME_INIT/, f, logOffsets[f])))
  // solo broadcasts de lobby: los eventos de partida (GAME_UPDATE/GAME_OVER) siguen llegando
  // ~1 min después de que el watcher cierra el ws y "0 conexiones" ahí es normal, no un bug.
  // El lobby SIEMPRE debe llegar si hay un cliente conectado: ese es el check del bug real.
  check('proxy: sin broadcasts de lobby a 0 conexiones', !proxyLogs.some((f) => logSince(/broadcast to 0 connections: \{"type":"lobby"/, f, logOffsets[f])))
  check('proxy: sin drops por mensaje obsoleto', !proxyLogs.some((f) => logSince(/DROPPED as outdated/, f, logOffsets[f])))

  console.log('')
  console.log(`[self-test] RESULTADO: ${failCount === 0 ? 'TODO PASS ✔' : `${failCount} FALLOS`} (${passCount} pass, ${failCount} fail)`)
  process.exit(failCount === 0 ? 0 : 1)
}

await main()
