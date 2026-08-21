# E2E Tests (Playwright)

Browser test suite for the web client with **dual backend support**: the SAME test specs run against a deterministic `FixtureServer` (fake mode, default) or against the real stack (server + proxy + vite, serving as the contract anti-drift safety net).

## Modes

- `npm run test:e2e` / `test:e2e:fake` — **fake**: FixtureServer on dedicated port (8788), declarative scenarios, no Java or real proxy needed. Ideal for the daily development loop.
- `E2E_BACKEND=real npm run test:e2e:real` — **real**: runs against the full stack (`node scripts/ctl.mjs start`). Validates protocol contracts against the authoritative XMage server.

## Subsets by Domain

Each functional domain has its own tag and script:

| Tag | Script | Coverage |
|---|---|---|
| `@spells` | `npm run test:e2e:spells` | Blaze (X), Arc Trail (2 targets), Boros Charm (modal), Walking Ballista (counters) |
| `@targeting` | `npm run test:e2e:targeting` | Lightning Bolt: GAME_TARGET + board scene visual targeting |
| `@combat` | `npm run test:e2e:combat` | Sim attacks and combat damage reduces life |
| `@fullflow` | `npm run test:e2e:fullflow` | login → lobby → AI vs AI demo match (spectator) |

## Modular Architecture

Each test creates ITS OWN isolated match. Shared utilities live in `e2e/support/`:

- `frames.ts` — WS frame DSL: parsing, GameView accessors, `waitFrame`, `waitFrameAt`, `waitOppLife`, mana payment (`nextManaSource`).
- `start-game.ts` — `startGame(page, opts)` handles login → table vs SIM → match launch → WS helper, returning the active `GameSession`.
- `game-screen.ts` — Page objects for feedback dialogs (`feedback-dialog`) and action drivers: `payMana`, `targetOpponent`, `resolveInteger`, `waitPlayable`.
- `scene.ts` / `canvas.ts` — Live scene state (`window.__mageScene`, deterministic) and Pixi canvas interactions.
- `wshelper.ts` — `HumanHelper`: plays lands, discards, and yields priority over WS for fast/fragile operations; UI verifies dialogs, rendering, and page errors.
- `fake-backend.ts` — `withFakeServer(scenario, run)`: spins up the FixtureServer with the specified test scenario and tears it down cleanly.

Fake mode scenarios (`fixtures/scenarios/`) are declarative scripts using the `humanGame.ts` mini-engine (human vs Sim player): starting hand, lands, casting prompt sequences, and resolution effects. State is shared between page and helper via WebSocket broadcast just like in the real proxy.

## Requirements

- Fake: Vite only (automatically spawned by `playwright.config.ts`).
- Real: Running stack (`node scripts/ctl.mjs start`), `npm install`, Chromium (`npx playwright install chromium`).

## Outputs

- Failure screenshots and trace archives: `test-results/`
- HTML report: `npx playwright show-report`
- Test attachments: `ws-frames`, `pageerrors`, `select-dump` (summary of SELECT/ASK events during the run) for flake diagnosis.