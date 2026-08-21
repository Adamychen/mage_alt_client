/**
 * Modo dual de los E2E: el MISMO spec corre contra dos backends.
 * - fake (por defecto, E2E_BACKEND != 'real'): FixtureServer determinista en
 *   puerto dedicado (8789; 8788 es la página HTTP del proxy Java). Segundos, sin Java, sin flakes.
 * - real (E2E_BACKEND=real): proxy + servidor XMage reales (contrato, puerto 8787).
 * El fake se arranca por worker (e2e/fixtures.ts) y el real es el stack
 * (node scripts/ctl.mjs start).
 */

export const FAKE_MODE = process.env.E2E_BACKEND !== 'real'

export const BACKEND_HOST = 'localhost'
/** Puerto del FixtureServer en fake. OJO: NO usar 8788 — es la página HTTP del
 *  proxy Java (Mage.Proxy), que la ocupa siempre que el stack está arriba. */
export const BACKEND_PORT = 8789

/** Puerto del proxy WS al que se conectan la página (?proxyPort=) y el
 *  HumanHelper: fake → FixtureServer dedicado (8789); real → proxy del stack
 *  (8787). Sin esto, el modo real apuntaba al puerto del fake (muerto) y el
 *  login nunca llegaba a lobby (regresión del split de puertos 2026-08-20). */
export const PROXY_PORT = FAKE_MODE ? BACKEND_PORT : 8787

export function backendUrl(): string {
  return `ws://${BACKEND_HOST}:${BACKEND_PORT}`
}
