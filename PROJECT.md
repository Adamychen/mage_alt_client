# Project: XMage Nexus (Web) — Master Working Document

> This document is the **project source of truth**: roadmap, phases, decisions, and
> verified actual state. It is updated at every work step, not just at the end of phases.
> Last updated: 2026-08-21 (e2e suite repair: fake 18/18, real-mode triage, port split fix, demo startMatch contract)

---

## 1. Objective

Replicate the full XMage experience (multiplayer and vs AI) with a
**modern, Arena-grade** web client: WebGL2 rendering, animations, visual targeting,
and instantly playable **without installing anything** (one link and play).

We do not re-implement game rules: the XMage Java server remains the authoritative rules engine,
card database (+25,000 cards), and social/multiplayer backend. We build a modern client on top.

## 2. Current Status

| Phase | Name | Status |
|---|---|---|
| 0 | XMage Proxy (bridge) | ✅ Completed and verified (2026-08-08) |
| 1 | Web Client: login + lobby + rendered board | ✅ Completed and verified (2026-08-08) |
| 2 | Full Interaction: feedback, targeting, playing | ✅ **Completed and verified (2026-08-15)** — X costs, multi-target, modal choices, and counters validated via WS (human-test 83 checks) and browser E2E (spells 4/4) |
| 3 | Effects, audio, desktop launcher | ⬜ Pending |

## 3. General Architecture

```
┌──────────────┐   WS JSON    ┌────────────────┐   XMage Protocol     ┌───────────────────┐
│  Browser     │ ───────────▶ │ Java Proxy     │ ───────────────────▶ │ XMage Server      │
│  React+Pixi  │ ◀─────────── │ (Mage.Proxy)   │ ◀─────────────────── │ (Mage.Server)     │
│  WebGL2      │              │ Real Session   │   jboss-serialization│ 1.4.61-V1         │
└──────────────┘              └────────────────┘                      └───────────────────┘
```

- **XMage Server**: Rules engine and game state (Java, `Mage.Server`). Existing project, untouched.
- **Proxy (`Mage.Proxy/`)**: Custom Java module. Opens a real XMage session (`SessionImpl`),
  receives server callbacks, re-exposes them over WebSocket as JSON, and forwards client actions
  to the server. Necessary because browsers cannot speak jboss-serialization.
- **Web Client (`web/`)**: React + PixiJS app. Communicates solely with the proxy,
  never directly with Mage.Common → modifying the client does not break the proxy or vice versa.

## 4. Technical Decisions (and Rationale)

| Decision | Choice | Rationale |
|---|---|---|
| Client Stack | React 19 + Vite + TypeScript + PixiJS 8 (WebGL2) | PixiJS = GPU sprites/particles/filters; React = UI (lobby, dialogs). Maximum iteration speed and visual fidelity |
| State Architecture | **Snapshot-diff → animation**: each `GAME_UPDATE` delivers the full `GameView`; client calculates transitions (card A moved from hand→battlefield, B tapped...) and animates them | Pure testable logic; effects are data-driven rather than hardcoded per action |
| Effects | Declarative catalog (`fx/catalog.ts`): an effect = config entry (animation, easing, duration, particles) | Adding effects takes lines of config, not refactors; maintainable |
| Distribution | Pure browser (Phases 1-2) → Tauri launcher (Phase 3) | Web link = zero installation (core advantage vs desktop Swing); Tauri = ~15 MB desktop app running the embedded proxy automatically |
| Maintainability | `types.ts` = single source of protocol truth; pure logic decoupled from rendering; minimal pinned dependencies | Real project risk is XMage protocol versions (proxy), not client-side churn |
| Performance | Shared sprite sheets, unique card textures, particle pooling, DPI-aware rendering | Game is not performance-bound; memory usage and GC pauses are kept strictly bounded |

## 5. Phase 0 — XMage Proxy (✅ Completed & Verified 2026-08-08)

### Delivered Components (`Mage.Proxy/`)

| File | Purpose |
|---|---|
| `src/main/java/.../ProxyClient.java` | Implements `MageClient`; real XMage session via `SessionImpl`; forwards server callbacks as JSON; executes web client commands |
| `src/main/java/.../Gateway.java` | WebSocket server (Java-WebSocket) at `ws://localhost:8787` |
| `src/main/java/.../JsonUtil.java` | Reflection-based JSON serializer with cycle detection (critical for huge `GameView` objects) |
| `src/main/java/.../Main.java` + `Config.java` | Startup; flags `--host --port --username --password --wsPort --httpPort` |
| `src/main/java/.../DeckJson.java` | JSON deck parsing → `DeckCardLists` |
| `src/main/resources/web/index.html` | Test page served at `http://localhost:8788/index.html` |
| `README.md` | WS protocol documentation (commands, events, examples) |
| `pom.xml` (root) | Registered `Mage.Proxy` module; `Mage.Proxy/pom.xml` with dependencies for Mage.Common |

### Real Verification (Local Server in Test Mode, `local-server/`)

Full end-to-end flow verified:
- Login/session OK · lobby broadcast (tables/users/messages) every ~2s OK
- Room chat (joinChat + messages) OK
- Create table with AI + human, join with JSON deck, `startMatch` OK
- JSON events received: `START_GAME`, `GAME_INIT` (full GameView), `GAME_UPDATE`, `GAME_ASK` (mulligan) OK

### Lessons Learned (Crucial for Phases 1-3)

1. **Proxy AND Server** must run with `--add-opens=java.base/java.io=ALL-UNNAMED` (jboss-serialization fails on JDK 17 without these flags).
2. `beta.xmage.de` is obsolete/down (2026-08-08); use `beta.xmage.today:17171` or local server.
3. `deckType` must match a **real server configuration name** (e.g. `Constructed - Modern`).
4. AI seats are filled **before** the human seat (matching the official client behavior).
5. `createTable` requires the deck's `quitRatio` to be ≥ the user's `quitRatio` (default to 100).
6. Client version must strictly match server version; local server requires `config.xml` with `${project.version}` replaced and plugins placed in `plugins/`.
7. **Connect must NEVER restart an already active session for the same user+host** (browser reloads send repeated connects). In test mode, duplicate user connections from the same host are kicked (`Session.java` anon-dedup) → restarting triggered reconnect loops (~1.5s) that cleared WS registries and killed broadcasts. Fix: idempotent connect + `synchronized`.
8. **Game events continue arriving at the proxy for ~1 min after the watcher closes** (GAME_UPDATE/GAME_OVER from ongoing AI matches). "Broadcast to 0 connections" for game events is normal; for `lobby` events it is an issue (active clients should always be present).
9. **Unmounting the board requires disconnecting the ResizeObserver**: Pixi 8 sets `renderer` to null on destroy; a leaked observer triggers `resize()` against null after unmount.
10. Log checks must be **time-windowed** (offset to test start): proxy logs are append-only across restarts and historic traces cause false positives.
11. **Real XMage Boolean Semantics**: `sendPlayerBoolean(true)` = **take mulligan**, `false` = **keep** (the official client's "Mulligan" button sends true). For priority (`GAME_SELECT`), any boolean yields priority.
12. **Real London Mulligan**: After `GAME_ASK "Mulligan down to N?"`, taking a mulligan prompts `GAME_TARGET "Select a card (N more) to put on the bottom of your library"` (card UUIDs live in `targets`, **not** in `cardsView1`) and re-prompts with N−1.
13. **"Select a starting player" is random**: `GameImpl.pickChoosingPlayer()` randomly selects who chooses; if the human wins, a blocking `GAME_TARGET` arrives requiring a player UUID response.
14. **"Any target" prompts include both players**: When validating damage in tests, select the opponent's UUID (`gameView.players[].controlled`), not the first target in `targets` (which could be oneself).
15. **macOS `/usr/bin/java` stub breaks daemon scripts**: `scripts/lib.mjs` resolves the real binary (`javaBin()`, Homebrew `openjdk@17` in `/opt/homebrew/opt` first) and `daemon()` uses the absolute path.
16. **`SESSION CALLBACK EXCEPTION - Unable to create socket` becomes persistent if dead proxy sessions linger** (killed via kill -9): old client sockets remain on the server, causing new logins to fail with endless retries. Fix: restart server and start proxy cleanly.
17. **Real Mana Payment (`GAME_PLAY_MANA`) sends no color hints**: `data.options` only provides `{"queryType":"PLAY_MANA"}`. Payment occurs by tapping mana sources on the board (UUID from `canPlayObjects` in `players[].battlefield` — taps and adds mana to pool) and **then** paying from the pool with `sendPlayerManaType`.
18. **Browser E2E tests leave matches running on the server** (test mode, `maxGameThreads`=10): long test runs saturate server threads. Restart server between heavy test batches.
19. **Port map (post-2026-08-21)**: proxy WS `8787`, proxy HTTP test page `8788` (owned by the Java process whenever the stack is up), fake FixtureServer `8789`. The 2026-08-20 choice of 8788 for fake only worked with the proxy stopped.
20. **Real-mode e2e vs scripted fixtures**: the XMage server never auto-starts IA-vs-IA tables (`startMatch` must be sent explicitly) and advances turns by priority timers. Fixture-scripted specs (fixed hands/windows, forced Sim wins) are therefore fake-only until the HumanHelper learns to HOLD priority in main instead of auto-passing.
19. **Demo AI deck must be stable** (Islands + Mountains + 4 Bolts): 16 Bolts make AI vs AI matches end in 2-3 turns, preventing spectators from seeing board interactions. Decks separated in `web/src/lobby/decks.ts` (`STABLE_DECK` demo / `DEFAULT_DECK` for human matches).

---

## 6. Phase 1 — Web Client: Login + Lobby + Rendered Board (✅ Completed & Verified 2026-08-08)

### Objective

Web application connecting to the proxy, authenticating, displaying the lobby (tables, users, chat), allowing table creation/spectating, and **rendering the board with HD card art (Scryfall)**. Flagship demo: **spectating live AI vs AI matches** running autonomously.

### Codebase Structure (`web/`)

```
web/
├── index.html
├── package.json / vite.config.ts / tsconfig.json
└── src/
    ├── main.tsx / App.tsx          — Entry point, phase routing (login/lobby/game)
    ├── net/
    │   ├── types.ts                — PROTOCOL TYPES (single source of truth, mirrors proxy JSON)
    │   ├── Gateway.ts              — WS connection, reconnect backoff, event routing, result promises
    │   └── commands.ts             — Proxy action helpers
    ├── state/
    │   ├── store.ts                — Connection and lobby state
    │   └── gameStore.ts            — Current GameView snapshot + match log
    ├── lobby/
    │   ├── LoginScreen.tsx         — host/ws/user/pass → connect
    │   ├── LobbyScreen.tsx         — Tables, users, room chat, create table
    │   └── CreateTableDialog.tsx   — Game type, format, AI count
    ├── cards/
    │   └── cardImages.ts           — Scryfall (set + number) with IndexedDB cache & placeholder
    ├── board/
    │   ├── BoardView.tsx           — Mounts Pixi.Application (WebGL) within React
    │   ├── BoardScene.ts           — Orchestrates: snapshot → sprites; zones, tap, counters
    │   ├── zones.ts                — Layout: card slot coordinates in pixels
    │   └── gameToScene.ts          — Maps GameView → scene entities
    └── ui/
        ├── TopBar.tsx              — Turn, phase/step, player life/mana
        └── GameLog.tsx             — Match log from GAME_UPDATE_AND_INFORM / CHATMESSAGE
```

### Quality & Continuous Integration

| Layer | Tool | Command | Status |
|---|---|---|---|
| Unit (Pure Logic) | vitest | `npm --prefix web run test` | ✅ Clean |
| Web Core Coverage | vitest/v8 | `npm --prefix web run test:coverage` | ✅ Clean |
| Typecheck | tsc | `npm --prefix web run typecheck` | ✅ Clean |
| Production Build | vite | `npm --prefix web run build` | ✅ Clean |
| Java Proxy | Maven/JUnit 5 | `mvn -pl Mage.Proxy -am test` | ✅ 18 tests PASS |
| Headless E2E (Real Proxy) | `scripts/self-test.mjs` | `node scripts/self-test.mjs` | ✅ 15 checks PASS |
| Human vs AI E2E | Node/WebSocket | `node scripts/human-test.mjs` | ✅ 83 checks PASS |
| Browser E2E | Playwright | `npm --prefix web run test:e2e` | ✅ 18/18 fake · real: 3 pass + 15 fake-only (documented) |

- **One Command for Everything**: `node scripts/test.mjs [unit|coverage|typecheck|build|java|self-test|human-test|e2e]`.
- **Zero-Setup User Script**: `node scripts/install.mjs` (Maven build + plugins setup + npm install) → `node scripts/ctl.mjs start` → `node scripts/test.mjs`.

---

## 7. Phase 2 — Full Interaction (✅ Completed & Verified 2026-08-15)

- Comprehensive support for server interaction callbacks (`GAME_ASK`, `GAME_TARGET`, `GAME_PLAY_MANA`, `GAME_CHOOSE_*`, `GAME_SELECT`, quantities).
- Visual targeting: animated dotted lines, glowing highlight outlines on valid targets.
- Click-to-play card interactions, mode selections, X-cost resolution, and +1/+1 counters.
- Dispatches `sendPlayerAction`, `sendPlayerString`, `sendPlayerUUID`, `sendPlayerInteger` matching server asks.
- **Validated E2E**: `scripts/human-test.mjs` executes full match: starting player choice, London mulligan, land drops, turn passing, casting *Lightning Bolt*, *Blaze* (X=2), *Arc Trail* (multi-target), *Boros Charm* (modal choice), and *Walking Ballista* (X=4 counters). 83 checks PASS.

---

## 8. Phase 3 — Visual Polish, Audio & Distribution (In Progress)

- Declarative visual effect engine (`fx/engine.ts`, `fx/catalog.ts`): card trajectory arcs, color-coded particle bursts, glow/outline shaders, screen shake, floating $-X$ combat damage numbers, Web Audio sound pack.
- Structured event feed (`ActionFeed.tsx`) parsing rules engine logs into visual action cards.
- Tauri desktop packaging: lightweight native launcher (~15 MB) bundling embedded proxy.
- PWA support: installable browser app with offline card caching.

---

## 9. Work Log (Changelog)

| Date | Step | Description | Verification |
|---|---|---|---|
| 2026-08-21 | T | Repaired e2e suite after lobby rework: best-of-3/5 cursor bugs (`waitFrame` has no `.index`; NaN cursors skipped every frame), fixture `END_GAME_INFO` aligned with real `GameEndView` (`<sim> won the match!`, "You need N more wins…" also after losing a game) | fake e2e 18/18 ✅ |
| 2026-08-21 | T | Fixed real-mode e2e blockers: (1) page+HumanHelper pointed at fake port instead of proxy WS 8787 (`PROXY_PORT` in `e2e/dual.ts`); (2) demo launcher lost the explicit `startMatch` — the server never auto-starts IA-vs-IA tables (the fake scenario was emulating it); (3) empty-lobby second "Crear Nueva Mesa" button broke `/Nueva mesa/i` selector; (4) spectator Log tab auto-switches to Stack on live games | full-flow + combat + lobby-chat green in `E2E_BACKEND=real` |
| 2026-08-21 | T | Port split fix: fake FixtureServer moved **8788→8789** — 8788 is the Java proxy's HTTP test page and collides whenever the stack is up (fake suite silently depended on the proxy being stopped) | fake 18/18 with stack up ✅ |
| 2026-08-21 | T | Real-mode triage: spells/targeting/cross-zone/combat-human/best-of-N/defeat marked **fake-only** (`test.skip(!FAKE_MODE)`): they depend on fixture-scripted windows; vs a live server the HumanHelper auto-pass races server timers (games sprint to turn ~110 before the test acts). Real suite = full-flow, combat, lobby-chat. Pending: helper redesign to HOLD priority in main when the test wants to act | `E2E_BACKEND=real`: 3 pass / 15 skipped ✅ |
| 2026-08-08 | F0 | Built `Mage.Proxy` (client, gateway, json, deck, main) + test harness page | Compiled via `mvn -pl Mage,Mage.Common,Mage.Sets,Mage.Server,Mage.Proxy -am package` |
| 2026-08-08 | F0 | Local server configured in `local-server/` with plugins and test mode | Login, lobby, chat, table creation, startMatch OK |
| 2026-08-08 | F0 | Verified complete event flow: `START_GAME`, `GAME_INIT`, `GAME_UPDATE`, `GAME_ASK` in JSON | Test harness at `http://localhost:8788/index.html` |
| 2026-08-08 | F0 | Repo hygiene: `.gitignore` (local-server, target, plugins), root `pom.xml` module registration | `git status` clean |
| 2026-08-08 | F1 | Master document & stack decisions established (React + Vite + TS + PixiJS) | Approved |
| 2026-08-08 | F1.1 | Environment: Node.js v24.19.0 and `web/` scaffolding initialized | `npm install` + `vite dev` OK |
| 2026-08-08 | F1 | Built web client (types, Gateway, store, lobby, Pixi board, cards, game log) | typecheck + build clean |
| 2026-08-08 | F1 | Spectator crash fix: `game.players` undefined guards & types | `vite.log` 0 page errors |
| 2026-08-08 | F1 | Proxy session thrash fix: idempotent connect logic | self-test 15/15, E2E 0 page errors |
| 2026-08-08 | F1 | Leaked ResizeObserver fix: proper disconnect in cleanup | Playwright 0 TypeError |
| 2026-08-08 | F1 | Vitest unit tests (zones, gameToScene, Gateway, store) + fixtures | 38/38 PASS |
| 2026-08-08 | F1 | Orchestration scripts (`test.mjs`, `install.mjs`, `ctl.mjs`) | `node scripts/test.mjs` all green |
| 2026-08-08 | F1 | Playwright E2E full-flow (login → lobby → spectator demo → board progression) | 1/1 PASS, 0 page errors |
| 2026-08-08 | Hardening | Local-first proxy security: loopback bind, origin allowlist, WS limits, canonical path traversal, per-connection auth | Maven proxy tests + WS integration ✅ |
| 2026-08-08 | Contract | Enforced `requestId`, `errorCode`, `protocolVersion`, and required `gameId` in game actions | 14 Java tests + 53 web tests + typecheck/build ✅ |
| 2026-08-09 | F2 | Corrected priority boolean semantics, `GAME_UPDATE_AND_INFORM.gameView`, typed `canPlayObjects` | 60 web tests + typecheck ✅ |
| 2026-08-09 | F2 | Explicit target feedback, player targeting, optional targets, special payments | Vitest + coverage ✅ |
| 2026-08-09 | F2 | Highlighted playable cards & click-to-dispatch `sendPlayerUUID`; extended `human-test` through *Lightning Bolt* resolution | Build + 14 Java tests ✅ |
| 2026-08-09 | F2 | Fixed boolean mulligan semantics (TRUE=mulligan/FALSE=keep) in `feedback.ts`, `store.ts`, and `human-test.mjs` | 62 web tests + typecheck + build ✅ |
| 2026-08-09 | F2 | Random starting player selection handling in `GAME_TARGET` | Empirically verified via event dumps |
| 2026-08-09 | F2 | London mulligan library bottoming resolution in `GAME_TARGET` | Confirmed server re-ask loops |
| 2026-08-09 | F2 | "Any target" selection logic pointing to opponent player UUID | Verified life drop 20→17 |
| 2026-08-09 | F2 | Complete `human-test.mjs` green: roll → mulligan → land → turns → *Lightning Bolt* → target → mana → resolution → quit | 26 checks PASS; full suite 7/7 ✅ |
| 2026-08-10 | Env | Rebuilt macOS development environment: Java 17.0.20 + Maven 3.9.16, regenerated `local-server/` with 27 plugins | `install.mjs` + `build.mjs proxy` ✅ |
| 2026-08-10 | Infra | Fixed macOS daemon spawning: absolute path resolution in `javaBin()` | ctl.mjs start/restart stable |
| 2026-08-10 | F2 | Visual targeting overlay in `BoardScene`: pulsating outlines, animated dotted lines from source to targets, player targeting rings | unit + typecheck ✅ |
| 2026-08-10 | F2 | UI mana payment: non-blocking `GAME_PLAY_MANA`, color pool buttons (`sendPlayerManaType`), board source tapping | unit + typecheck ✅ |
| 2026-08-10 | F2 | Human vs AI lobby workflows: creator auto-seat, AI seat joining | full-flow E2E ✅ |
| 2026-08-10 | F2 | Visual targeting E2E (`e2e/targeting.spec.ts`): browser-driven match with canvas pulse verification | 2× PASS in sequence |
| 2026-08-10 | F2 | Multi-target UX: `chosenTargets` parsed in `feedback.ts`, chosen targets highlighted in green with checkmark badge | unit 67/67 + typecheck ✅ |
| 2026-08-10 | F2 | `ADVANCED_DECK` (Blaze, Arc Trail, Boros Charm, Walking Ballista) + deck selector in `CreateTableDialog` | typecheck ✅ |
| 2026-08-15 | F2 | Verified Phase 2 close: 100-card AI deck, preferential land discarding, complete advanced scenario | `human-test` 83 checks ALL PASS ✅ |
| 2026-08-15 | F2 | Re-architected `e2e/spells.spec.ts` into 4 serial independent tests (Blaze, Arc Trail, Boros Charm, Ballista) | E2E 6/6 PASS ✅ |
| 2026-08-15 | F2 | Scene-driven E2E clicking: `window.__mageScene` exposes live card coordinates and playable state | Boros→Ballista misalignment eliminated ✅ |
| 2026-08-15 | F2 | Color-aware mana payment: `payMana` parses required mana strings and taps matching color sources | Clean payment without server re-asks ✅ |
| 2026-08-16 | F2 | Simulated Bot Opponent (`SIM` seat in proxy): `SimPlayer.java` with independent server session playing lands, spells, attacking, and blocking | Java tests 18 ✅; unit 90 ✅; combat/targeting/full-flow ✅ |
| 2026-08-16 | F2 | WS `HumanHelper` (`e2e/wshelper.ts`): node helper managing lands, discards, and priority yielding over WS | unit 90 ✅; typecheck ✅ |
| 2026-08-16 | Arq | Dual-mode deterministic testing: `FixtureServer` (`fixtures/fake.ts`), declarative scenarios, zod schema anti-drift testing | unit 95/95 + typecheck ✅; fake full-flow 9s ✅ |
| 2026-08-16 | Arq | Deterministic UI assertions: `BoardScene` publishes `__mageScene.targeting` replacing canvas byte-diffs | typecheck ✅ |
| 2026-08-16 | F2 | Resolved Sim victory bug: caused by degraded server state with orphaned proxy sessions; resolved by coupled restarts | targeting 12.9s ✅; spells 4/4 ✅ |
| 2026-08-16 | F2 | Resolved spectator freeze bug: `SimPlayer.tryCast` made color-aware to avoid infinite GAME_SELECT loops | trace verified; demo casts ✅ |
| 2026-08-17 | F2 | Modular E2E suite (`web/e2e/support/`): shared DSL libraries, fake scenarios in `fixtures/scenarios/` | fake 7/7 ✅; real 7/7 ✅; unit 97/97 |
| 2026-08-17 | Up | Upgraded to upstream XMage 1.4.61-V1: cleanly merged upstream tags, updated proxy parent POM, set default host to `beta.xmage.today` | full suite 8/8 PASS ✅; real E2E 7/7 PASS ✅ |
| 2026-08-17 | Fx | Handshake buffer for `SHOW_USERMESSAGE` in `ProxyClient.java`: buffers early server messages until connected | unit/typecheck/build/java/self-test PASS ✅ |
| 2026-08-18 | Arq | Complete Board UI layout redesign: CSS Grid macro layout, `SideLayout` zones with creature/other/land bands, easing repositioning | unit 122/122 ✅; typecheck ✅; build ✅ |
| 2026-08-20 | Arq | Store refactoring: split `store.ts` into 7 cohesive modules (`state`, `persistence`, `gameUtils`, `eventHandler`, `gateway`, `selectors`, `actions`) | unit 75/75 ✅; typecheck ✅; 0 breaking consumer changes |
| 2026-08-20 | Arq | Java→TS JSON Schema codegen pipeline: `contract.schema.json` with `gen-types.mjs` and CI validation | typecheck ✅; `--validate` PASS ✅ |
| 2026-08-20 | Fix | Non-modal floating combat prompt bar and step-gated blocker declarations | unit 75/75 ✅; typecheck ✅; build ✅ |
| 2026-08-20 | Fix | Verified human combat E2E 4/4 and restored `HumanGame.start()` in fixture server | vitest 104/104 ✅; combat-human 4/4 ✅ |
| 2026-08-21 | F2/F3 | Persistent connection & clean reconnect: 60s disconnect grace period, localStorage session caching, auto-rejoin on F5 | vitest 132/132 ✅; Java 18/18 ✅ |
| 2026-08-21 | F2/F3 | Token and Ability Art Resolution: Scryfall multi-tier token lookups, source card extraction for abilities, multi-face card tabs | vitest 140/140 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | F2/F3 | Cascading LIFO Stack UI: vertical cascading stack with topmost active spell, thumbnail strips, and integrated Resolve button | vitest 145/145 ✅; StackZone.test.tsx ✅; build ✅ |
| 2026-08-21 | F2/F3 | Floating HD Card Preview & hover stabilization on hand and battlefield slots | vitest 149/149 ✅; FloatingCardPreview.test.tsx ✅; build ✅ |
| 2026-08-21 | F2/F3 | Floating action prompt bars (`GAME_PLAY_MANA`/`GAME_TARGET`) & `FormattedText` component for mana badges and entity decoding | vitest 154/154 ✅; FormattedText.test.tsx ✅; build ✅ |
| 2026-08-21 | F2/F3 | Comprehensive UI Modernization (Arena-grade): Reactive ActionButton with global Space key, unified PhaseBar with stop toggles, circular PlayerInfoBar with priority ring | vitest 154/154 ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | Fix | Combat attacker/blocker toggle de-selection and tapped combatant state management | vitest 154/154 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | F2/F3 | Vertical layout proportion fixes and expanded card-sized resource piles (~68x96px) | vitest 154/154 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Fase A1 | SVG Bézier Combat & Target Arrows overlay and player avatar target glow | vitest 156/156 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | F2/F3 | Full Match HUD Parity: Player priority clocks, match win gems, revealed top library card, summon sickness spiral for creatures | vitest 156/156 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Fase A2 | Dedicated CommandZone: Commander card renders with tax badge (`+{tax}`) and Planeswalker emblem trays | vitest 159/159 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Fase A3 | Interactive Scry / Surveil / Library Order Dialog & revealed opponent hand cards | vitest 165/165 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Feature | Live Structured Action Feed (`ActionFeed.tsx` & `gameEventParser.ts`) with live game log subscriptions | vitest 183/183 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Fix | Game session isolation and stale packet drop guards | vitest 184/184 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Fase 3 | Redesigned Lobby and Login Screen: animated mana orbs, 3-column table grid, deck manager with text list import | vitest 194/194 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | UI/Fix | Unified vertical Stack card template, compact 250px right panel, and global targeting arrows | vitest 195/195 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Fix | Transform / MDFC back face artwork resolution in card preview inspector | vitest 197/197 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Feature/Fix | Universal HTML/Text sanitizer in `FormattedText.tsx` & interactive card hover previews across all chats and logs | vitest 199/199 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Feature | Interactive Library Stack & Card Viewer with standard card back | vitest 203/203 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | UI/UX | High-definition card modals (210px cards) for direct reading without zoom | vitest 203/203 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Feature/UX | Modern Lobby Table Filter Bar: Omnibox search, format chips, open seats filter, and collapsible advanced options | vitest 211/211 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Feature/UX | Interactive Spectator Staging Screen: live 1v1 and pod staging room for waiting tables | vitest 214/214 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Fix/UI | Sanitized global system messages in ChatBox and join/leave notification toggle | vitest 217/217 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Fix | Chat room isolation and automatic `leaveChat` cleanup on table exit | vitest 219/219 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Feature/UX | Quick Deck Selector on Join Table Dialog with inline text decklist importer | vitest 222/222 ✅; typecheck ✅; build ✅ |
| 2026-08-21 | Fix | Robust lobby user list extraction supporting Array of RoomUsersView and direct UsersView wire formats | vitest 226/226 ✅; typecheck ✅; build ✅; Playwright e2e ✅ |
| 2026-08-21 | Feature/UX | Advanced Table Creation Dialog with categorized tabs (General, Clocks & Rules, Security & Passwords, Bot Seats with Custom Decks) | vitest 230/230 ✅; typecheck ✅; build ✅; java ✅; Playwright e2e ✅ |

---

## 10. Execution Notes

- Rule: At the completion of each step, update Section 6 (checklist) and Section 9 (changelog) with verified reality.
- Verification must always be performed against the live environment (local server + proxy), never in theory.
- Document any discoveries in Section 5 (lessons learned).
