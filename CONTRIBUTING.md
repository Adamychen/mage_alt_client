# Contributing to Mage.Proxy

Guide for developers working on the web client or the proxy.

## Quick Reference

```bash
node scripts/ctl.mjs start all     # start server + proxy + vite
node scripts/ctl.mjs stop all      # stop everything
node scripts/test.mjs              # full test suite
node scripts/tail.mjs proxy        # tail proxy logs
```

## Architecture in 30 Seconds

```
XMage Server (Java) ──jboss-serialization──▶ Mage.Proxy (Java) ──WebSocket JSON──▶ Web Client (React/TS)
```

- **Server**: game rules engine. We don't modify it (except test mode patches).
- **Proxy**: thin bridge. Forwards everything. No game logic.
- **Client**: UI implementation. All features live here.

The proxy serializes Java objects to JSON field-by-field (`JsonUtil.java`). Field
names are camelCase (from Java reflection). The TypeScript types mirror this exactly.

## Common Tasks

### Adding a new game event handler

The server sends events like `GAME_SELECT_PLAYER`, `GAME_CHOOSE_ONE`, etc. If the
web client doesn't handle them, they fall through to the default case (logged but ignored).

**Step 1**: Check if the event needs feedback (player interaction) or just state update.

**Step 2a**: If it's a player interaction (asks user to choose something):
- Add parsing in `src/game/feedback.ts` (the `parseFeedback` switch)
- Add UI rendering in the appropriate component

**Step 2b**: If it's a state update:
- Add handling in `src/state/eventHandler.ts` (the `handleEvent` switch)

**Step 3**: Add the event method name to `EVENT_METHODS` in `src/net/types.ts`.

### Adding a new Java view type

When the XMage server introduces a new view class (e.g., `NewThingView`):

**Step 1**: Add the definition to `Mage.Proxy/web/schema/contract.schema.json`:
```json
{
  "NewThingView": {
    "type": "object",
    "properties": {
      "field1": { "type": "string" },
      "field2": { "type": "number" }
    },
    "required": ["field1"]
  }
}
```

**Step 2**: Regenerate TypeScript:
```bash
cd Mage.Proxy/web
npm run gen-types
```

**Step 3**: Use the new type in your code. It's automatically exported from `types.ts`.

### Adding a new proxy action

When the client needs to send a new action to the server:

**Step 1**: Add handling in `Mage.Proxy/src/main/java/org/mage/proxy/ProxyClient.java`
(the `switch (action)` block in the action handler).

**Step 2**: Add the TypeScript type/interface in `src/net/types.ts` if needed.

**Step 3**: Call the action from the web client using the commands module.

### Syncing types after XMage upstream update

When XMage releases a new version with changed view classes:

```bash
# 1. Update the schema (manually diff the Java changes)
# Edit Mage.Proxy/web/schema/contract.schema.json

# 2. Regenerate types
cd Mage.Proxy/web
npm run gen-types

# 3. Verify no type errors
npx tsc -b --noEmit

# 4. Run tests
npx vitest run
```

## File Map

### Proxy (Java)

| File | Purpose |
|---|---|
| `Mage.Proxy/src/.../ProxyClient.java` | Core: session management, action routing, event forwarding |
| `Mage.Proxy/src/.../JsonUtil.java` | Reflection-based Java → JSON serializer |
| `Mage.Proxy/src/.../SimPlayer.java` | Bot player for E2E tests (SIM seat) |

### Web Client (TypeScript)

| File | Purpose |
|---|---|
| `web/src/net/types.ts` | Protocol types (barrel: generated + proxy-specific) |
| `web/src/net/types.generated.ts` | Auto-generated view types (DO NOT EDIT) |
| `web/src/net/Gateway.ts` | WebSocket connection management |
| `web/src/net/commands.ts` | Action wrappers (connect, joinGame, etc.) |
| `web/src/state/eventHandler.ts` | Server event routing (the big switch) |
| `web/src/state/store.ts` | State management barrel |
| `web/src/game/feedback.ts` | Player interaction parsing (GAME_TARGET, GAME_ASK, etc.) |
| `web/src/game/FeedbackDialog.tsx` | UI for player interactions |
| `web/src/board/` | Game board rendering |

### Schema & Codegen

| File | Purpose |
|---|---|
| `Mage.Proxy/web/schema/contract.schema.json` | Wire format definition (source of truth for types) |
| `scripts/gen-types.mjs` | JSON Schema → TypeScript generator |
| `scripts/export-schema.mjs` | (Future) Java source → JSON Schema extractor |

### E2E Testing

| File | Purpose |
|---|---|
| `web/fixtures/fake.ts` | FakeServer: deterministic mock of the proxy |
| `web/fixtures/scenarios/` | Test scenarios (spells, targeting, combat, etc.) |
| `web/e2e/support/` | Test helpers (start game, game screen, scene assertions) |
| `web/e2e/wshelper.ts` | HumanHelper: plays via WebSocket for E2E |

## Testing

```bash
# Unit tests (vitest)
cd Mage.Proxy/web && npx vitest run

# Type checking
cd Mage.Proxy/web && npx tsc -b --noEmit

# Full suite (all layers)
node scripts/test.mjs

# Specific layers
node scripts/test.mjs unit
node scripts/test.mjs typecheck
node scripts/test.mjs build
node scripts/test.mjs java

# E2E (fake mode, no Java needed)
cd Mage.Proxy/web && npx playwright test

# E2E (real mode, requires stack)
cd Mage.Proxy/web && E2E_BACKEND=real npx playwright test
```

## Common Pitfalls

1. **Stale types**: If you see runtime errors about missing fields, the TypeScript
   types may be out of sync with the Java server. Run `npm run gen-types` and check.

2. **Event not reaching the client**: The proxy drops outdated events on reconnect
   and events for games the session never joined. Check `proxy.err.log`.

3. **Type errors after schema change**: Always run `npx tsc -b --noEmit` after
   modifying `types.ts` or `types.generated.ts`.

4. **E2E flakes**: The fake server is deterministic. If E2E fails in fake mode,
   it's a real bug. If it fails only in real mode, it's a timing issue.

## Protocol Version

The server's protocol version is available via `getServerInfo.protocolVersion`.
The proxy's version is in the jar filename (`mage-proxy-1.4.61.jar`).

When the server version changes, the proxy may need recompilation and the
types may need regeneration.
