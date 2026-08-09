#!/usr/bin/env node
// Instalación completa desde cero del Mage.Proxy (deps + jars del servidor).
// Uso: node scripts/install.mjs
// NOTA: no arranca el stack ni empaqueta el proxy (eso lo hace dev.mjs/build.mjs).

import { binName, copyPluginJars, log, logError, mvn, PLUGIN_MODULES, run } from './lib.mjs'

function fail(step, res) {
  logError(`FALLÓ en: ${step}`)
  if (res.stderr) logError(res.stderr.split('\n').filter((l) => /ERROR/.test(l)).slice(0, 8).join('\n'))
  process.exit(1)
}

/** Comprueba que una herramienta exista en el PATH y devuelve su versión. */
function requireTool(cmd, args, label) {
  const res = run(cmd, args, { quiet: true })
  const version = (res.stdout + res.stderr).trim().split(/\r?\n/)[0] ?? ''
  if (res.code !== 0) {
    logError(`${label} no disponible — instala ${label} y asegúrate de que esté en el PATH (comando: ${cmd})`)
    process.exit(1)
  }
  return version
}

async function main() {
  log('== paso 1/5: comprobar herramientas (Java y Node.js) ==')
  const javaVer = requireTool('java', ['-version'], 'Java')
  const nodeVer = requireTool('node', ['--version'], 'Node.js')
  log(`  Java ${javaVer} — Node ${nodeVer}`)

  log('== paso 2/5: mvn install de módulos base ==')
  let res = mvn(['-q', '-pl', 'Mage.Common,Mage,Mage.Sets,Mage.Server', 'install', '-DskipTests'])
  if (res.code !== 0) fail('instalación de módulos base', res)
  log('  OK')

  log('== paso 3/5: mvn install de plugins ==')
  res = mvn(['-q', '-pl', PLUGIN_MODULES.join(','), 'install', '-DskipTests'])
  if (res.code !== 0) fail('instalación de plugins', res)
  log('  OK')

  log('== paso 4/5: copiar plugins a local-server/plugins/ ==')
  copyPluginJars()

  log('== paso 5/5: npm install en Mage.Proxy/web ==')
  res = run(binName('npm'), ['--prefix', 'Mage.Proxy/web', 'install'])
  if (res.code !== 0) fail('npm install en Mage.Proxy/web', res)

  log('')
  log('Instalación completada. Arranca todo sin bloquear la shell con: node scripts/ctl.mjs start — y testea con: node scripts/test.mjs')
}

await main()
