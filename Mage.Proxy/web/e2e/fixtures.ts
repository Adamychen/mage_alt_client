/**
 * Fixtures de Playwright con el backend dual.
 * - fake: el FixtureServer se arranca con `{ fakeServer }` (full-flow usa el
 *   fixture; los specs de partida humana lo arrancan explícitamente con su
 *   escenario, `FakeServer.start(port, escenario())`). El proxy real debe
 *   estar detenido (puerto 8787).
 * - real: fakeServer es null (usa el stack: server + proxy + vite).
 */

import { test as base, expect as baseExpect } from '@playwright/test'
import { FakeServer } from '../fixtures/fake'
import { fullFlowScenario } from '../fixtures/scenarios/fullFlow'
import { BACKEND_PORT, FAKE_MODE } from './dual'

export const test = base.extend<{ fakeServer: FakeServer | null }>({
  fakeServer: [
    async ({}, use) => {
      if (!FAKE_MODE) {
        await use(null)
        return
      }
      let server: FakeServer
      try {
        server = await FakeServer.start(BACKEND_PORT, () => fullFlowScenario())
      } catch (err) {
        throw new Error(
          `FixtureServer no pudo arrancar en el puerto ${BACKEND_PORT}: ${(err as Error).message}. ` +
            'En modo fake el proxy real no debe estar corriendo: node scripts/ctl.mjs stop proxy',
        )
      }
      await use(server)
      await server.stop()
    },
    { scope: 'test' },
  ],
})

export const expect = baseExpect