# AGENTS.md — Mage.Proxy

Cliente web moderno para XMage (Magic: The Gathering). El stack se compone de:
servidor XMage (Java, modo test) + proxy WebSocket (`Mage.Proxy`, Java) + cliente
web (`Mage.Proxy/web`, TypeScript + Vite).

**Documento maestro: `PROJECT.md`** — fuente de verdad del estado, fases y
lecciones. Actualízalo al terminar una tarea (fases, lecciones, tabla de calidad,
log con fecha) y registra la fecha en el header.

## Stack de desarrollo

- Control: `node scripts/ctl.mjs start|stop|restart|status [server|proxy|vite|all]`
- Diagnóstico directo (bloquea la shell): `node scripts/dev.mjs start|stop|status|restart`
- Logs: `node scripts/tail.mjs [server|proxy|vite|all] [líneas]` — archivos en `.run/*.log`
  (`server.out.log`, `proxy.out.log`, `proxy.err.log`, `vite.out.log`)
- Puertos: servidor XMage `17171` (testMode), proxy WS `ws://127.0.0.1:8787`,
  página test del proxy `http://127.0.0.1:8788/index.html`, Vite dev `http://localhost:5173`
- Recompilar el jar del proxy: `node scripts/build.mjs proxy` (requiere detener
  el proxy; `build.mjs` lo para solo) — después `node scripts/ctl.mjs restart proxy`
- Compilación completa (servidor + plugins + proxy): `node scripts/build.mjs`

## Suite de tests

Orquestador: `node scripts/test.mjs [capa...] [--skip=unit,e2e]` — capas:

`unit` (vitest) · `coverage` (vitest --coverage) · `typecheck` (tsc -b --noEmit) ·
`build` (tsc -b && vite build) · `java` (mvn -pl Mage.Proxy -am test) ·
`self-test` (E2E headless contra el proxy; requiere stack) ·
`human-test` (E2E jugador humano contra IA; requiere stack) ·
`e2e` (playwright en Mage.Proxy/web; requiere vite)

Criterios de éxito y detalles en la skill `mage-test-suite`.

## Reglas

- **Tras tocar `Mage.Proxy/web`**: ejecutar `unit` y `typecheck` (y `build` si se
  cambió la build). Tras tocar Java del proxy: `java` + recompilar jar
  (`build.mjs proxy`) + reiniciar proxy.
- **Antes de declarar una tarea "terminada"**: suite completa
  (`node scripts/test.mjs`) con el stack arriba.
- **Fallo conocido**: `self-test` puede fallar en `WATCHGAME` solo en la primera
  partida tras arranque en frío del servidor (el servidor pierde el socket de
  retorno de callbacks: `SESSION CALLBACK EXCEPTION - Unable to create socket`
  en `server.out.log`). Reintentar una vez con el servidor caliente; si falla
  repetidamente, es un bug real, no flake.
- **No tocar** archivos generados: `dist/`, `.run/`, `local-server/`,
  `node_modules/`, `target/`.
- Sin comentarios en código salvo que se pidan. Respuestas en español.
- No commitear salvo petición explícita.
