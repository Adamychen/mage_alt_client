# AGENTS.md — Mage.Proxy

A modern web client for XMage (Magic: The Gathering). The stack consists of:
XMage server (Java, test mode) + WebSocket proxy (`Mage.Proxy`, Java) + web
client (`Mage.Proxy/web`, TypeScript + Vite).

**Master document: `PROJECT.md`** — source of truth for status, phases and
lessons. Update it when finishing a task (phases, lessons, quality table,
dated log) and record the date in the header.

## Development stack

- Control: `node scripts/ctl.mjs start|stop|restart|status [server|proxy|vite|all]`
- Direct diagnostics (blocks the shell): `node scripts/dev.mjs start|stop|status|restart`
- Logs: `node scripts/tail.mjs [server|proxy|vite|all] [lines]` — files in `.run/*.log`
  (`server.out.log`, `proxy.out.log`, `proxy.err.log`, `vite.out.log`)
- Ports: XMage server `17171` (testMode), proxy WS `ws://127.0.0.1:8787`,
  proxy test page `http://127.0.0.1:8788/index.html`, Vite dev `http://localhost:5173`
- Rebuild the proxy jar: `node scripts/build.mjs proxy` (requires stopping
  the proxy; `build.mjs` stops it on its own) — afterwards `node scripts/ctl.mjs restart proxy`
- Full build (server + plugins + proxy): `node scripts/build.mjs`
- XMage version: **1.4.61-V1** (upstream magefree/mage; merge of tag `xmage_1.4.61V1`).
  Proxy jar: `Mage.Proxy/target/mage-proxy-1.4.61.jar`. The proxy's default
  server is **`beta.xmage.today:17171`** (current official server; `beta.xmage.de` is obsolete).
  If the remote server changes release (strict version check `MAGE_VERSION_RELEASE_INFO_MUST_BE_SAME`),
  the proxy won't connect: the fork must be updated (fetch upstream + merge) and everything rebuilt.
- Smoke test against the public server: works via the proxy (WS probe: login, SIM table, WATCHGAME/GAME_INIT/updates).
  Notes: (a) ~~anonymous login to beta.xmage.today is intermittent~~ **RESOLVED (2026-08-17)**
  with the handshake buffer in `ProxyClient`; (b) the web login uses a SINGLE host for both the
  proxy WS and the target server → to play against remote servers from the browser those
  fields must be split (pending, Phase 3).

## Test suite

Orchestrator: `node scripts/test.mjs [layer...] [--skip=unit,e2e]` — layers:

`unit` (vitest) · `coverage` (vitest --coverage) · `typecheck` (tsc -b --noEmit) ·
`build` (tsc -b && vite build) · `java` (mvn -pl Mage.Proxy -am test) ·
`self-test` (headless E2E against the proxy; requires stack) ·
`human-test` (E2E human player vs AI; requires stack) ·
`e2e` (playwright in Mage.Proxy/web; requires vite)

Success criteria and details in the `mage-test-suite` skill.

## E2E with dual backends: deterministic fake and real

Browser E2E (Playwright) runs in **two modes with the SAME specs**:

- **fake (default, `npm run test:e2e` / `test:e2e:fake`)**: against the
  `FixtureServer` (`Mage.Proxy/web/fixtures/fake.ts`, contract from
  `src/net/types.ts` + declarative scenarios in `fixtures/scenarios/`). No
  Java, no proxy, no flakes — the daily iteration loop. **The real proxy must
  not be running** (the fake uses port 8787); if it is, the fixture fails with
  a clear message. `playwright.config.ts` starts vite only in fake mode.
- **real (`E2E_BACKEND=real npm run test:e2e:real`)**: against the stack
  (server+proxy+vite). This is the anti-drift net: if the real protocol moves,
  this mode detects it. Runs in CI/nightly and on demand.

The FakeServer is typed against `types.ts` (typecheck guards consistency) and
the frames it emits are validated with `fixtures/schema.ts` (zod) — if the real
proxy adds/changes fields, the schema test fails and is regenerated with the recorder.

**Deterministic UI assertions**: `BoardScene` publishes `window.__mageScene`
(cards, playable, targeting{active,source,ids,chosen}, game). Tests assert
against that state (and the DOM), NOT against canvas pixels (byte-diffs were
the source of flakes).

**Known bugs in the real stack (2026-08-16, detected by real mode)**:
1. **The AI-vs-AI demo NO LONGER FREEZES (RESOLVED)**: `SimPlayer.tryCast` was sending
   the Bolt UUID even when its untapped lands were ISLANDs; the server correctly
   rejected the cast (`canPay` doesn't cover {R}) and the game re-granted
   priority with the same view → infinite GAME_SELECT (flood ~48/s to the watcher).
   **Fix**: `tryCast` is now color-aware (`colorsOf` + `canProduceColors`, only
   casts if there are lands that produce ALL the colors of the cost) + dedup by
   signature `(turn, step, hand, untapped lands)` as defense. Verified in real
   ×6+ (the demo casts and resolves Bolts).
2. **`spells.spec.ts` and `targeting.spec.ts` in real mode: GREEN** (2026-08-16).
   The cause of their failures ("Sim win after the mana ask") was the
   **degraded server state caused by orphan sessions** — restarting
   server+proxy TOGETHER fixes it (`ctl.mjs restart all`); restarting ONLY the
  proxy leaves the first login hanging. Combined with test fixes (`nextManaSource`
   retry, strict cursor in the mana loop).
3. **The fake-mode demo (`fixtures/scenarios/fullFlow.ts`) suffers neither the
   freeze nor the flood**: the timeline is deterministic.

## E2E with simulated opponents (Sim) and WS helper

UI E2E uses `SIM` seats (the proxy joins a deterministic bot with its own
session) and a `HumanHelper` over WS (`Mage.Proxy/web/e2e/wshelper.ts`) that
plays lands, passes priorities, discards and answers asks — fragile actions go
over WS and the UI only verifies (dialogs, render, pageerrors). Tests do NOT
enable the web's auto-pass (it competes with the launch windows). Load `mage-e2e-sim`
before touching or debugging any E2E.

**Modular architecture (2026-08-17)**: tests by functionality, independent
game per test. Common libraries in `Mage.Proxy/web/e2e/support/`
(`frames.ts`, `start-game.ts`, `game-screen.ts`, `scene.ts`, `canvas.ts`,
`fake-backend.ts`) and declarative scenarios for the FixtureServer in
`Mage.Proxy/web/fixtures/scenarios/` (mini-engine `humanGame.ts`). Tags by
domain: `@spells`, `@targeting`, `@combat`, `@fullflow` (scripts
`test:e2e:spells|targeting|combat|fullflow`). All specs run in fake
(no stack, ~56s) and in real (contract). When touching `e2e/support/` or the
scenarios, run the full fake + real suite. **The helper does NOT answer the
mulligan** (the web's auto-keep already does it; a second false breaks the
test window).

## Rules

- **After touching `Mage.Proxy/web`**: run `unit` and `typecheck` (and `build` if
  the build changed). After touching proxy Java: `java` + rebuild jar
  (`build.mjs proxy`) + restart proxy.
- **Before declaring a task "done"**: full suite
  (`node scripts/test.mjs`) with the stack up.
- **Known failure**: `self-test` may fail in `WATCHGAME` only on the first
  game after a cold server start (the server loses the callback
  return socket: `SESSION CALLBACK EXCEPTION - Unable to create socket`
  in `server.out.log`). Retry once with a warm server; if it fails
  repeatedly, it's a real bug, not a flake.
- **Do not touch** generated files: `dist/`, `.run/`, `local-server/`,
  `node_modules/`, `target/`.
- No comments in code unless requested. Replies in Spanish.
- Do not commit unless explicitly requested.