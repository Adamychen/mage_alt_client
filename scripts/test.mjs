#!/usr/bin/env node
// Orquestador de todas las capas de test del Mage.Proxy.
// Uso: node scripts/test.mjs [layer...] [--skip=unit,typecheck]
//   (sin argumentos: ejecuta todas las capas en orden)
// Capas: unit, coverage, typecheck, build, java, self-test, human-test, e2e

import path from 'node:path'
import { binName, log, logError, PORTS, repoRoot, run, waitForPort, waitForPortDown } from './lib.mjs'

const WEB_DIR = path.join(repoRoot, 'web')
const STACK_HINT = 'el stack no está corriendo — ejecuta primero: node scripts/ctl.mjs start'

const LAYERS = [
  { name: 'unit', desc: 'vitest run (web)' },
  { name: 'coverage', desc: 'vitest run --coverage (web)' },
  { name: 'typecheck', desc: 'tsc -b --noEmit (web)' },
  { name: 'build', desc: 'tsc -b && vite build (web)' },
  { name: 'java', desc: 'mvn -pl Mage.Proxy -am test' },
  { name: 'self-test', desc: 'E2E headless (ws://127.0.0.1:8787)' },
  { name: 'human-test', desc: 'E2E jugador humano contra IA (ws://127.0.0.1:8787)' },
  { name: 'e2e', desc: 'playwright test (web)' },
]
const NAMES = new Set(LAYERS.map((l) => l.name))

function usage() {
  console.log(`
Uso: node scripts/test.mjs [layer...] [--skip=capas]

Capas (orden por defecto):
${LAYERS.map((l) => `  ${l.name.padEnd(10)} ${l.desc}`).join('\n')}

Opciones:
  --skip=unit,typecheck   excluye capas (separadas por coma)
  --help                  muestra esta ayuda

Ejemplos:
  node scripts/test.mjs                  # todas las capas
  node scripts/test.mjs typecheck        # solo typecheck
  node scripts/test.mjs --skip=unit,e2e  # todas menos unit y e2e
`)
}

function parseArgs(args) {
  const opts = { help: false, skip: new Set(), layers: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--help' || a === '-h') {
      opts.help = true
    } else if (a.startsWith('--skip=')) {
      a.slice(7).split(',').forEach((s) => s.trim() && opts.skip.add(s.trim()))
    } else if (a === '--skip') {
      const next = args[++i]
      if (next) next.split(',').forEach((s) => s.trim() && opts.skip.add(s.trim()))
    } else {
      opts.layers.push(a)
    }
  }
  return opts
}

/** Comprueba si un puerto del stack está abierto (timeout corto, ~5s). */
async function stackUp(port, label) {
  try {
    await waitForPort(port, 5000)
    return true
  } catch {
    log(`${label} no disponible (puerto ${port})`)
    return false
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.help) {
    usage()
    process.exit(0)
  }

  for (const l of opts.layers) {
    if (!NAMES.has(l)) {
      logError(`capa inválida: ${l}`)
      usage()
      process.exit(1)
    }
  }

  let selected = opts.layers.length ? opts.layers : LAYERS.map((l) => l.name)
  selected = selected.filter((l) => !opts.skip.has(l))
  if (selected.length === 0) {
    log('no hay capas que ejecutar (todas excluidas con --skip)')
    log('RESULTADO: 0 pass, 0 fail, 0 skip (0.0s)')
    process.exit(0)
  }

  log(`capas a ejecutar: ${selected.join(', ')}`)
  const startedAt = Date.now()
  const results = []
  let fails = 0
  let skips = 0

  // warm-up del stack antes de las capas E2E que requieren proxy (self-test/human-test):
  // la PRIMERA partida tras un arranque en frío del servidor puede perder el socket de
  // callbacks (SESSION CALLBACK EXCEPTION) y tumbarse un WATCHGAME/GAME_INIT; una partida
  // descartable la "tripa" fuera de los tests (no afecta al conteo de la suite).
  // En modo fake (e2e) no se necesita el stack, así que se omite el warmup.
  const stackE2eLayers = selected.filter((l) => l === 'self-test' || l === 'human-test')
  if (stackE2eLayers.length > 0) {
    const upServer = await stackUp(PORTS.server, 'servidor')
    if (upServer) {
      const warmStart = Date.now()
      const warm = run('node', ['scripts/warmup.mjs'], { quiet: true })
      const warmSecs = ((Date.now() - warmStart) / 1000).toFixed(1)
      const warmOut = `${(warm.stdout + warm.stderr).trim().split(/\r?\n/).filter(Boolean).pop() ?? ''}`
      if (warm.code === 0) {
        log(`${warmOut || '[warmup] OK'} (${warmSecs}s)`)
      } else {
        log(`[warmup] falló (${warmSecs}s) — los tests seguirán con sus reintentos: ${warmOut}`)
      }
    }
  }

  for (const name of selected) {
    const layerStart = Date.now()
    let res = null
    let skipReason = ''

    switch (name) {
      case 'unit':
        res = run(binName('npm'), ['--prefix', 'web', 'run', 'test'])
        break
      case 'coverage':
        res = run(binName('npm'), ['--prefix', 'web', 'run', 'test:coverage'])
        break
      case 'typecheck':
        res = run(binName('npm'), ['--prefix', 'web', 'run', 'typecheck'])
        break
      case 'build':
        res = run(binName('npm'), ['--prefix', 'web', 'run', 'build'])
        break
      case 'java':
        res = run(binName('mvn'), ['-pl', 'Mage.Proxy', '-am', 'test'])
        break
      case 'self-test': {
        const upServer = await stackUp(PORTS.server, 'servidor')
        const upProxy = await stackUp(PORTS.proxy, 'proxy')
        if (!upServer || !upProxy) {
          res = { code: 1, stdout: '', stderr: STACK_HINT }
        } else {
          res = run('node', ['scripts/self-test.mjs'])
        }
        break
      }
      case 'human-test': {
        const upServer = await stackUp(PORTS.server, 'servidor')
        const upProxy = await stackUp(PORTS.proxy, 'proxy')
        if (!upServer || !upProxy) {
          res = { code: 1, stdout: '', stderr: STACK_HINT }
        } else {
          res = run('node', ['scripts/human-test.mjs'])
        }
        break
      }
      case 'e2e': {
        // en modo fake (default) playwright arranca vite solo (webServer en
        // playwright.config.ts). Solo se requiere vite pre-existente en modo real.
        const isReal = process.env.E2E_BACKEND === 'real'
        if (isReal) {
          const upVite = await stackUp(PORTS.vite, 'vite')
          if (!upVite) {
            res = { code: 1, stdout: '', stderr: STACK_HINT }
            break
          }
        }
        // el e2e por defecto corre en FAKE (FixtureServer) en puerto 8788.
        // No se toca el proxy (puerto 8787) — ambos pueden correr simultáneamente.
        res = run(binName('npx'), ['playwright', 'test'], { cwd: WEB_DIR })
        break
      }
    }

    const seconds = ((Date.now() - layerStart) / 1000).toFixed(1)
    if (skipReason) {
      skips++
      results.push({ name, status: 'skip' })
      console.log(`[SKIP] ${name} (${seconds}s) — ${skipReason}`)
    } else if (res.code === 0) {
      results.push({ name, status: 'pass' })
      console.log(`[PASS] ${name} (${seconds}s)`)
    } else {
      fails++
      results.push({ name, status: 'fail' })
      console.log(`[FAIL] ${name} (${seconds}s)`)
      const lines = `${res.stderr ?? ''}\n${res.stdout ?? ''}`.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      if (lines.length) {
        console.log('  salida de error:')
        lines.slice(-12).forEach((l) => console.log(`    ${l}`))
      }
    }
  }

  const total = ((Date.now() - startedAt) / 1000).toFixed(1)
  const pass = results.filter((r) => r.status === 'pass').length
  log(`RESULTADO: ${pass} pass, ${fails} fail, ${skips} skip (${total}s)`)
  process.exit(fails === 0 ? 0 : 1)
}

await main()
