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

## E2E con backends duales: fake determinista y real

Los e2e de navegador (Playwright) corren en **dos modos con los MISMO specs**:

- **fake (por defecto, `npm run test:e2e` / `test:e2e:fake`)**: contra el
  `FixtureServer` (`Mage.Proxy/web/fixtures/fake.ts`, contrato de
  `src/net/types.ts` + escenarios declarativos en `fixtures/scenarios/`). Sin
  Java, sin proxy, sin flakes — el loop diario de iteración. **El proxy real no
  debe estar corriendo** (el fake usa el puerto 8787); si lo está, el fixture
  falla con un mensaje claro. `playwright.config.ts` levanta vite solo en fake.
- **real (`E2E_BACKEND=real npm run test:e2e:real`)**: contra el stack
  (server+proxy+vite). Es la red anti-deriva: si el protocolo real se mueve,
  este modo lo detecta. Corre en CI/nightly y a demanda.

El FakeServer se tipa contra `types.ts` (el typecheck vigila la coherencia) y
los frames que emite se validan con `fixtures/schema.ts` (zod) — si el proxy
real añade/cambia campos, el schema test falla y se regenera con el grabador.

**Aserciones de UI deterministas**: `BoardScene` publica `window.__mageScene`
(cards, playable, targeting{active,source,ids,chosen}, game). Los tests asertan
sobre ese estado (y el DOM), NO sobre píxeles del canvas (byte-diffs eran la
fuente de flakes).

**Bugs conocidos del stack real (2026-08-16, detectados por el modo real)**:
1. **La demo IA-vs-IA ya NO se congela (RESUELTO)**: `SimPlayer.tryCast` enviaba
   el UUID del Bolt aunque sus tierras sin girar fueran ISLANDs; el servidor
   rechazaba el cast correctamente (`canPay` no cubre {R}) y el juego re-otorgaba
   prioridad con la misma vista → GAME_SELECT infinito (flood ~48/s al watcher).
   **Fix**: `tryCast` ahora es color-aware (`colorsOf` + `canProduceColors`, solo
   castea si hay tierras que producen TODOS los colores del coste) + dedup por
   firma `(turno, paso, mano, tierras sin girar)` como defensa. Verificado en real
   ×6+ (la demo castea y resuelve Bolts).
2. **`spells.spec.ts` y `targeting.spec.ts` en modo real: VERDES** (2026-08-16).
   La causa de sus fallos ("victoria del Sim tras el ask de maná") era el
   **estado degradado del servidor por sesiones huérfanas** — reiniciar
   servidor+proxy JUNTOS lo resuelve (`ctl.mjs restart all`); reiniciar SOLO el
   proxy deja el primer login colgado. Combinado con fixes de test (reintento
   de `nextManaSource`, cursor estricto en el bucle de maná).
3. **La demo del modo fake (`fixtures/scenarios/fullFlow.ts`) no sufre ni el
   congelado ni el flood**: el timeline es determinista.

## E2E con oponentes simulados (Sim) y helper WS

Los e2e de UI usan asientos `SIM` (el proxy une un bot determinista con su propia
sesión) y un `HumanHelper` por WS (`Mage.Proxy/web/e2e/wshelper.ts`) que desarrolla
tierras, pasa prioridades, descarta y responde asks — las acciones frágiles van por
WS y la UI solo verifica (diálogos, render, pageerrors). Los tests NO activan el
auto-pase del web (compite con las ventanas de lanzamiento). **`spells.spec.ts`
está PENDIENTE de cerrar** (caso abierto documentado en la skill `mage-e2e-sim`;
el agente `e2e-spells` está diseñado para ello). Cargar `mage-e2e-sim` antes de
tocar o depurar cualquier e2e.

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
