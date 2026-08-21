# web — Mage.Proxy web client

React 19 + Vite + TypeScript + PixiJS 8 client. It communicates **only** with the
proxy over a JSON WebSocket and contains **no XMage/Java code**.

## Scope

- This folder is fully isolated from the Java proxy and the XMage fork.
- You do **not** need Java, Maven, or the XMage fork to work here.
- The only deliberate coupling to the proxy is the protocol contract:
  `web/schema/contract.schema.json` → `web/src/net/types.generated.ts`
  (regenerate with `npm run gen-types` after editing the schema).

## Everyday workflow (no stack needed)

- `npm install` (once)
- `npm run dev` — Vite dev server (port 5173)
- `npm run test` / `test:coverage` — vitest (pure logic)
- `npm run typecheck` — `tsc -b --noEmit`
- `npm run build` — `tsc -b && vite build`
- `npm run test:e2e` (alias `test:e2e:fake`) — Playwright against the
  **FakeServer** (`web/fixtures/fake.ts`): a Node WS server that speaks the real
  protocol derived from `web/src/net/types.ts`. No proxy, no server, no flakes.
  Dedicated port **8789** (8788 is the Java proxy's HTTP test page — never use it here).
- `E2E_BACKEND=real npm run test:e2e:real` — against a live stack (needs the
  proxy running; see `Mage.Proxy/AGENTS.md`). Use only as the anti-drift net.

## Rules

- After touching `web/`: run `unit` and `typecheck` (and `build` if the build
  changed).
- Do not hand-edit `web/src/net/types.generated.ts` — regenerate it.
- The protocol contract in `web/schema/contract.schema.json` is the single
  source of truth for the wire format.
- Do not commit unless explicitly requested.
