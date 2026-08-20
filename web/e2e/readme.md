# Tests E2E (Playwright)

Suite de navegador del cliente web con **backend dual**: los MISMO specs corren
contra un `FixtureServer` determinista (fake, por defecto) o contra el stack real
(server + proxy + vite, red anti-deriva del contrato XMage).

## Modos

- `npm run test:e2e` / `test:e2e:fake` — **fake**: FixtureServer en el puerto del
  proxy (8787), escenarios declarativos, sin Java ni proxy real. El loop diario.
  El proxy real NO debe estar corriendo (puerto ocupado → fallo claro).
- `E2E_BACKEND=real npm run test:e2e:real` — **real**: contra el stack
  (`node scripts/ctl.mjs start`). Valida el contrato contra el servidor real.

## Subconjuntos por funcionalidad

Cada dominio tiene su tag y script:

| Tag | Script | Qué cubre |
|---|---|---|
| `@spells` | `npm run test:e2e:spells` | Blaze (X), Arc Trail (2 objetivos), Boros Charm (modo), Walking Ballista (contadores) |
| `@targeting` | `npm run test:e2e:targeting` | Bolt: GAME_TARGET + resaltado del tablero (escena) |
| `@combat` | `npm run test:e2e:combat` | el Sim ataca y el daño baja la vida |
| `@fullflow` | `npm run test:e2e:fullflow` | login → lobby → demo IA vs IA (espectador) |

## Arquitectura modular

Cada test crea SU PROPIA partida (independencia total). El código reutilizado
vive en librerías comunes (`e2e/support/`):

- `frames.ts` — DSL de frames WS: parseo, accesores del GameView, `waitFrame`,
  `waitFrameAt`, `waitOppLife`, pago de maná (`nextManaSource`).
- `start-game.ts` — `startGame(page, opts)` monta login → mesa vs SIM →
  arranque → helper WS y devuelve la sesión (`GameSession`).
- `game-screen.ts` — page objects de los diálogos (`feedback-dialog`) y drivers:
  `payMana`, `targetOpponent`, `resolveInteger`, `waitPlayable`.
- `scene.ts` / `canvas.ts` — estado del escenario en vivo (`window.__mageScene`,
  determinista) y clics del canvas de Pixi.
- `wshelper.ts` — `HumanHelper`: el humano juega tierras, descarta y pasa por WS
  (las acciones frágiles); la UI solo verifica diálogos, render y pageerrors.
- `fake-backend.ts` — `withFakeServer(scenario, run)`: arranca el FixtureServer
  con el escenario del test y lo para al terminar.

Los escenarios del fake (`fixtures/scenarios/`) son scripts declarativos del
mini-motor `humanGame.ts` (partida humana vs Sim): mano, tierras, secuencia de
asks del cast y daño/contadores al resolver. El estado es compartido entre la
página y el helper (broadcast del FakeServer), igual que en el proxy real.

## Requisitos

- Fake: solo vite (lo levanta `playwright.config.ts`).
- Real: stack corriendo (`node scripts/ctl.mjs start`), `npm install`, Chromium
  (`npx playwright install chromium`).

## Salidas

- Capturas de fallo y trazas: `test-results/`
- Informe HTML: `npx playwright show-report`
- Adjuntos por test: `ws-frames`, `pageerrors`, `select-dump` (resumen de
  SELECT/ASK del run) para diagnosticar flakes.