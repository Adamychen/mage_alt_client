# Mage.Proxy — XMage bridge (Java)

Java WebSocket proxy that joins a real XMage session (`SessionImpl`) and
re-exposes it as JSON over WebSocket for the web client. Maven module; depends
on the XMage fork (`mage` + `mage-common`) via the parent pom.

## Scope

- Java only. You need JDK 17 + Maven.
- The web client lives in the sibling `web/` folder; do not edit it from here.
- The XMage fork (`Mage.*`) is a separate, large codebase that you rarely touch.

## Fork dependency (read this)

- The proxy depends **only on the stable client-facing API** of the fork:
  `mage.interfaces.MageClient`, `mage.remote.SessionImpl`, `mage.view.*`
  (serialized by reflection in `JsonUtil`, so new view fields need no proxy
  change), `mage.constants.*`, `mage.players.*`. It does **not** use engine
  internals, so the churning `mage.game`/card code never affects it.
- The version is inherited from the parent `<version>` (e.g. `1.4.61`) — a
  XMage release bump is a one-line pom change + recompile, not a code edit.
- Build the fork **once** into your local `~/.m2` (see below); you do **not**
  need the fork source checked out for day-to-day proxy work.
- The only fork-side code we carry is 2–3 `isTestMode()` guards in
  `Mage.Server/src/main/java/mage/server/TableController.java` (lets the proxy
  join without deck validation). Adjust only when changing test mode.

## Build & run

- Full build (server + plugins + proxy): `node scripts/build.mjs`
- Proxy only (after the fork is in `.m2`): `node scripts/build.mjs proxy`
- Run: `node scripts/ctl.mjs start proxy` (or `node scripts/dev.mjs`)
- Java tests: `mvn -pl Mage.Proxy -am test`
- After editing Java: rebuild the jar (`build.mjs proxy`) and restart the proxy.

## Rules

- After touching proxy Java: run the `java` layer + rebuild jar + restart proxy.
- Do not commit unless explicitly requested.
