# Mage — Modern Web Client for XMage

A modern web client for [XMage](https://github.com/magefree/mage) (Magic: The Gathering), with a visual style inspired by MTG Arena. Play directly in the browser **without installing anything**.

> **Note:** This is an alternative client, NOT the official XMage client. The rules engine remains XMAGE (Java).

## Architecture

```
┌──────────────────┐   WS JSON    ┌────────────────────┐   XMage protocol    ┌───────────────────┐
│  Browser         │ ──────────▶ │ Proxy Java (Mage    │ ─────────────────── │ Server XMage        │
│  React + PixiJS  │ ◀────────── │ .Proxy)             │ ◀────────────────── │ (Mage.Server)       │
│  WebGL2          │              │ WebSocket :8787     │                     │ 1.4.61-V1           │
└──────────────────┘              └────────────────────┘                     └───────────────────┘
```

- **XMage Server** (`Mage.Server/`): rules engine, card database and networking (Java). Existing project, not modified.
- **WebSocket Proxy** (`Mage.Proxy/`): bridge that translates between JSON/WebSocket and the XMage protocol (Java serialization). The browser only communicates with this proxy.
- **Web Client** (`web/`): React + PixiJS (WebGL2) application that renders the board, animations and UI.

## Tech Stack

| Layer | Technologies |
|---|---|
| XMage Server | Java, jboss-remoting (1.4.61-V1) |
| Proxy | Java, Java-WebSocket, Gson |
| Web Client | React 19, PixiJS 8 (WebGL2), TypeScript, Vite 8, Playwright |

## Requirements

- **JDK 17+** (server and proxy)
- **Node.js 20+**, pnpm/npm (web client)
- **Maven** (proxy build)

## Installation

1. Clone the repository:
   ```bash
   git clone <url>
   cd mage_alt_client
   ```

2. Build the proxy:
   ```bash
   node scripts/build.mjs proxy
   # or full build: node scripts/build.mjs
   ```

3. Install web client dependencies:
   ```bash
   cd web && npm install
   ```

## Development

### Start the full stack
```bash
node scripts/ctl.mjs start all        # server + proxy + vite (background)
node scripts/dev.mjs start            # server + proxy + vite (foreground / diagnostic)
```

### Individual controls
```bash
node scripts/ctl.mjs start|stop|restart [server|proxy|vite|all]
node scripts/ctl.mjs status
```

### Logs
```bash
node scripts/tail.mjs [server|proxy|vite|all] [lines]   # .run/*.log
```

### Build proxy
```bash
node scripts/build.mjs proxy          # rebuild only the proxy jar
node scripts/build.mjs                # full build: server + plugins + proxy
```

### URLs
| Service | URL |
|---|---|
| Web Client (Vite dev) | `http://localhost:5173` |
| Proxy WebSocket | `ws://127.0.0.1:8787` |
| Proxy HTTP (test page) | `http://127.0.0.1:8788/index.html` |
| XMage Server (test mode) | `127.0.0.1:17171` / remote `beta.xmage.today:17171` |

## Tests

```bash
# Full test suite
node scripts/test.mjs all

# Individual layers
node scripts/test.mjs unit            # unit tests (vitest)
node scripts/test.mjs typecheck       # tsc -b --noEmit
node scripts/test.mjs build           # web client build
node scripts/test.mjs java            # mvn test (proxy)
node scripts/test.mjs self-test       # headless E2E against real proxy
node scripts/test.mjs e2e             # browser tests (Playwright)

# E2E: fake mode (deterministic, local fixture, no real stack)
npm run test:e2e:fake

# E2E: real mode (against server + proxy + vite)
E2E_BACKEND=real npm run test:e2e:real

# E2E by domain
npm run test:e2e:spells
npm run test:e2e:targeting
npm run test:e2e:combat
npm run test:e2e:fullflow
```

> **Note:** Fake mode (default) does not require a real stack. Real mode detects protocol drift and runs in CI/nightly.

## Documentation

- **[PROJECT.md](PROJECT.md)** — master document: roadmap, phases, technical decisions, project status.
- **[AGENTS.md](AGENTS.md)** — development rules, commands, conventions, known bugs.

## License

This web client is a separate project from the XMage server. See [LICENSE.txt](LICENSE.txt) for details.
