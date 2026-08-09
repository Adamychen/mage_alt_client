#!/usr/bin/env node
// Colas filtradas de los logs del stack.
// Uso: node scripts/tail.mjs [server|proxy|vite|all] [líneas]
// Ej:  node scripts/tail.mjs proxy 40

import { logFileFor, tailFile } from './lib.mjs'

const target = process.argv[2] ?? 'all'
const lines = parseInt(process.argv[3] ?? '25', 10)
const VALID = new Set(['server', 'proxy', 'vite', 'all'])
if (!VALID.has(target)) {
  console.error(`destino inválido: ${target} (server|proxy|vite|all)`)
  process.exit(1)
}
const wants = (t) => target === 'all' || target === t

for (const name of ['server', 'proxy', 'vite']) {
  if (!wants(name)) continue
  const files = logFileFor(name)
  if (!files.length) {
    console.log(`\n===== ${name} (sin logs) =====`)
    continue
  }
  for (const file of files) {
    tailFile(`${name} (${pathLabel(file)})`, file, lines)
  }
}

function pathLabel(file) {
  return file.split(/[\\/]/).slice(-3).join('/')
}
