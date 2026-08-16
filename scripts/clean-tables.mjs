#!/usr/bin/env node
// Limpia mesas y partidas huérfanas de un usuario E2E del servidor local
// (los tests de navegador dejan partidas IA corriendo que saturan el servidor,
// maxGameThreads=10). Se conecta como el propio usuario (el servidor exige
// ser el dueño de la mesa para removeTable) y elimina sus mesas.
// Uso: node scripts/clean-tables.mjs <username> [username...]
// Salida: exit 0 siempre que la limpieza se completara sin errores de red.

const WS_URL = 'ws://127.0.0.1:8787'
const SERVER_HOST = 'localhost'
const SERVER_PORT = 17171
const users = process.argv.slice(2).filter((u) => u && u !== '--help')

if (users.length === 0) {
  console.error('Uso: node scripts/clean-tables.mjs <username> [username...]')
  process.exit(1)
}

const timeout = (ms, label) =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout esperando ${label} (${ms}ms)`)), ms))

async function cleanUser(username) {
  const ws = new WebSocket(WS_URL)
  const pending = new Map()
  const opened = new Promise((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('no se pudo conectar al proxy'))
  })
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
    }
  }
  const send = (action, args) => {
    ws.send(JSON.stringify({ action, args }))
    return new Promise((resolve) => {
      const list = pending.get(action) ?? []
      list.push(resolve)
      pending.set(action, list)
    })
  }

  let cleaned = 0
  try {
    await Promise.race([opened, timeout(10000, 'apertura del WebSocket')])
    let res = await Promise.race([
      send('connect', { host: SERVER_HOST, port: SERVER_PORT, username, password: 'x' }),
      timeout(15000, 'resultado de connect'),
    ])
    if (!res.ok) {
      console.log(`  [clean-tables] ${username}: connect falló (${res.error ?? ''})`)
      return 0
    }

    res = await Promise.race([send('getTables', {}), timeout(15000, 'getTables')])
    if (!res.ok || !Array.isArray(res.data)) {
      console.log(`  [clean-tables] ${username}: getTables falló (${res.error ?? ''})`)
      return 0
    }

    // controllerName es la lista "dueño, jugador1, jugador2": el dueño es el primero
    const mine = res.data.filter((t) => t && (typeof t.controllerName === 'string' && t.controllerName.split(',')[0].trim() === username || (typeof t.tableName === 'string' && t.tableName.startsWith(`${username}-`))))
    for (const table of mine) {
      const tableId = table.tableId
      if (!tableId) continue
      const games = Array.isArray(table.games) ? table.games : []
      for (const gameId of games) {
        await Promise.race([send('quitMatch', { gameId }), timeout(10000, `quitMatch ${gameId}`)]).catch(() => {})
      }
      await Promise.race([send('removeTable', { tableId }), timeout(10000, `removeTable ${tableId}`)]).catch(() => {})
      cleaned++
    }
    if (cleaned > 0) console.log(`  [clean-tables] ${username}: ${cleaned} mesa(s) limpiada(s)`)
    return cleaned
  } catch (e) {
    console.log(`  [clean-tables] ${username}: ${e.message}`)
    return 0
  } finally {
    try {
      ws.close()
    } catch {
      /* noop */
    }
  }
}

for (const username of users) {
  await cleanUser(username)
}
