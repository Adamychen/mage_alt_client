/**
 * Limpieza de mesas/partidas del usuario E2E tras cada test: los tests dejan
 * partidas IA corriendo en el servidor (maxGameThreads=10) y tandas largas
 * + retries las acumulan, degradando los tests siguientes (lección 18).
 * Solo se ejecuta cuando Playwright importa este archivo (no cuando vitest lo hace).
 */

import { test } from '@playwright/test'
import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HumanHelper } from './wshelper'

// Limpieza de mesas/partidas del usuario E2E tras cada test: los tests dejan
// partidas IA corriendo en el servidor (maxGameThreads=10) y tandas largas
// + retries las acumulan, degradando los tests siguientes (lección 18).
const CLEAN_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'clean-tables.mjs')

let lastUsername: string | null = null

// helpers WS activos del test en curso: se cierran siempre al terminar el test
// (aunque falle), para no dejar conexiones huérfanas al proxy.
const activeHelpers: HumanHelper[] = []

export function cleanupUser(username: string) {
  lastUsername = username
}

export function registerHelper(helper: HumanHelper) {
  activeHelpers.push(helper)
}

// Solo definir afterEach si Playwright está disponible (no Vitest)
if (typeof test.afterEach === 'function') {
  test.afterEach(async () => {
    while (activeHelpers.length > 0) {
      const helper = activeHelpers.pop()
      if (helper?.isStarted) {
        try {
          await helper.stop()
        } catch {
          // noop
        }
      }
    }
    const username = lastUsername
    lastUsername = null
    if (!username) return
    const child = spawn(process.execPath, [CLEAN_SCRIPT, username], { detached: true, stdio: 'ignore' })
    child.unref()
  })
}
