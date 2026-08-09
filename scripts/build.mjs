#!/usr/bin/env node
// Cadena de build completa del Mage.Proxy (Windows/macOS/Linux/WSL).
// Uso: node scripts/build.mjs [proxy]
//   (sin argumentos: compila servidor + plugins y empaqueta el proxy)
//   (arg "proxy": solo empaqueta el proxy, asumiendo el resto ya compilado)

import { copyPluginJars, log, logError, mvn, PLUGIN_MODULES, stopPid } from './lib.mjs'

function fail(step, res) {
  logError(`FALLÓ en: ${step}`)
  if (res.stderr) logError(res.stderr.split('\n').filter((l) => /ERROR/.test(l)).slice(0, 8).join('\n'))
  process.exit(1)
}

async function main() {
  const onlyProxy = process.argv[2] === 'proxy'

  if (!onlyProxy) {
    log('== paso 1/4: compilar módulos base (Mage.Common, Mage, Mage.Sets, Mage.Server) ==')
    let res = mvn(['-q', '-pl', 'Mage.Common,Mage,Mage.Sets,Mage.Server', 'install', '-DskipTests'])
    if (res.code !== 0) fail('compilación de módulos base', res)
    log('  OK')

    log('== paso 2/4: compilar módulos plugin ==')
    res = mvn(['-q', '-pl', PLUGIN_MODULES.join(','), 'install', '-DskipTests'])
    if (res.code !== 0) fail('compilación de plugins', res)
    log('  OK')

    log('== paso 3/4: copiar plugins a local-server/plugins/ ==')
    copyPluginJars()
  } else {
    log('== modo proxy: saltando compilación de servidor/plugins ==')
  }

  log('== paso final: empaquetar Mage.Proxy (clean package) ==')
  // el jar abierto por el proxy en marcha bloquea el clean en Windows
  stopPid('proxy')
  await new Promise((r) => setTimeout(r, 1000))
  const res = mvn(['-q', '-pl', 'Mage.Proxy', 'clean', 'package', '-DskipTests'])
  if (res.code !== 0) fail('empaquetado del proxy', res)

  log('')
  log('Build completado. Arranca todo con: node scripts/dev.mjs start')
}

await main()
