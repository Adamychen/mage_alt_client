/**
 * Modo dual de los E2E: el MISMO spec corre contra dos backends.
 * - fake (por defecto, E2E_BACKEND != 'real'): FixtureServer determinista en
 *   puerto dedicado (8788). Segundos, sin Java, sin flakes.
 * - real (E2E_BACKEND=real): proxy + servidor XMage reales (contrato, puerto 8787).
 * El fake se arranca por worker (e2e/fixtures.ts) y el real es el stack
 * (node scripts/ctl.mjs start).
 */

export const FAKE_MODE = process.env.E2E_BACKEND !== 'real'

export const BACKEND_HOST = 'localhost'
export const BACKEND_PORT = 8788

export function backendUrl(): string {
  return `ws://${BACKEND_HOST}:${BACKEND_PORT}`
}
