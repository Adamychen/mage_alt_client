/**
 * Arranque explícito del FixtureServer para los specs de partida humana
 * (spells/targeting/combat): cada test crea SU PROPIO servidor con el escenario
 * del guion y lo para al terminar (partida independiente). En modo real es no-op
 * (usa el stack). El escenario se construye UNA vez por test, así que la página
 * y el HumanHelper WS comparten el mismo estado (el FakeServer crea el escenario
 * por servidor, no por conexión).
 */

import { FakeServer, type Scenario } from '../../fixtures/fake'
import { BACKEND_PORT, FAKE_MODE } from '../dual'

export async function withFakeServer<T>(makeScenario: () => Scenario, run: () => Promise<T>): Promise<T> {
  if (!FAKE_MODE) return run()
  const server = await FakeServer.start(BACKEND_PORT, makeScenario)
  try {
    return await run()
  } finally {
    await server.stop()
  }
}