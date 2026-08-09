#!/usr/bin/env node
// Control del stack de desarrollo del Mage.Proxy (servidor + proxy + vite).
// Uso diagnóstico: node scripts/dev.mjs start|stop|status|restart [server|proxy|vite|all]
// Uso recomendado para no bloquear la shell: node scripts/ctl.mjs start|stop|status|restart [server|proxy|vite|all]

import fs from 'node:fs'
import path from 'node:path'
import { daemon, isAlive, log, logError, logFileFor, PORTS, readPid, SERVER_ADD_OPENS, stopPid, tailFile, waitForPort, buildServerClasspath } from './lib.mjs'

const arg = process.argv[2] ?? 'status'
const target = process.argv[3] ?? 'all'
const VALID = new Set(['server', 'proxy', 'vite', 'all'])
if (!VALID.has(target)) {
  console.error(`destino inválido: ${target} (server|proxy|vite|all)`)
  process.exit(1)
}
const wants = (t) => target === 'all' || target === t

function startServer() {
  log('arrancando servidor XMage (headless, testMode)…')
  try {
    const cp = buildServerClasspath()
    const args = [...SERVER_ADD_OPENS, '-cp', cp, 'mage.server.Main', '-testMode']
    daemon('server', 'java', args, { cwd: `${import.meta.dirname}/../local-server` })
  } catch (e) {
    logError(e.message)
    return false
  }
  return true
}

function startProxy() {
  const jar = `${import.meta.dirname}/../Mage.Proxy/target/mage-proxy-1.4.60.jar`
  if (!fs.existsSync(jar)) {
    logError(`falta el jar del proxy — ejecuta: node scripts/build.mjs`)
    return false
  }
  log('arrancando proxy…')
  daemon('proxy', 'java', [...SERVER_ADD_OPENS, '-cp', jar, 'org.mage.proxy.Main'], {
    cwd: `${import.meta.dirname}/../Mage.Proxy`,
  })
  return true
}

function startVite() {
  // se lanza el binario de vite con node directamente (sin npm.cmd ni shells):
  // así el pidfile apunta al proceso real y la salida va a .run/
  const viteBin = path.join(import.meta.dirname, '..', 'Mage.Proxy', 'web', 'node_modules', 'vite', 'bin', 'vite.js')
  if (!fs.existsSync(viteBin)) {
    logError(`falta vite en node_modules — ejecuta: npm install (en Mage.Proxy/web)`)
    return false
  }
  log('arrancando vite dev…')
  daemon('vite', 'node', [viteBin, 'dev'], { cwd: `${import.meta.dirname}/../Mage.Proxy/web` })
  return true
}

function stop(target) {
  if (wants('vite')) stopPid('vite')
  if (wants('proxy')) stopPid('proxy')
  if (wants('server')) stopPid('server')
}

function status() {
  const rows = []
  for (const name of ['server', 'proxy', 'vite']) {
    const pid = readPid(name)
    const alive = isAlive(pid)
    rows.push({ name, pid: alive ? pid : null, state: alive ? 'RUNNING' : 'stopped' })
  }
  console.table(rows)
  for (const name of ['server', 'proxy', 'vite']) {
    const logs = logFileFor(name)
    if (logs.length) tailFile(name, logs[0], 6)
  }
}

async function startAll() {
  // 1) servidor
  if (wants('server')) {
    stopPid('server')
    if (!startServer()) process.exit(1)
    await waitForRequiredPort(PORTS.server, 'servidor XMage', 60_000)
    log(`servidor OK (puerto ${PORTS.server})`)
  }

  // 2) proxy
  if (wants('proxy')) {
    stopPid('proxy')
    if (!startProxy()) process.exit(1)
    await waitForRequiredPort(PORTS.proxy, 'proxy WebSocket', 30_000)
    log(`proxy OK (ws://localhost:${PORTS.proxy})`)
  }

  // 3) vite
  if (wants('vite')) {
    stopPid('vite')
    startVite()
    await waitForRequiredPort(PORTS.vite, 'Vite', 60_000)
    log(`vite OK (http://localhost:${PORTS.vite})`)
  }

  status()
}

async function waitForRequiredPort(port, label, timeoutMs) {
  try {
    await waitForPort(port, timeoutMs)
  } catch (error) {
    logError(`${label} no arrancó: ${error.message}`)
    throw error
  }
}

async function main() {
  switch (arg) {
    case 'start':
      await startAll()
      break
    case 'stop':
      stop(target)
      break
    case 'restart':
      stop('all')
      await new Promise((r) => setTimeout(r, 1500))
      await startAll()
      break
    case 'status':
      status()
      break
    default:
      console.error('uso: node scripts/dev.mjs start|stop|status|restart [server|proxy|vite|all]')
      process.exit(1)
  }
}

await main()
