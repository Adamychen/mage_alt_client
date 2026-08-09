---
name: mage-test-suite
description: Use cuando haya que ejecutar o interpretar la suite de tests del Mage.Proxy (scripts/test.mjs), decidir qué capas correr tras un cambio, validar criterios de éxito (unit, coverage, typecheck, build, java, self-test, human-test, e2e), o antes de declarar una tarea "terminada". Keywords: tests, suite, capas, coverage, self-test, human-test, e2e, validación.
---

# Mage.Proxy — Suite de tests

## Orquestador

`node scripts/test.mjs [capa...] [--skip=a,b]` — sin args corre TODAS las capas
en orden. Código de salida 0 = todo verde.

## Capas y criterios de éxito

| Capa | Comando efectivo | Requiere stack | Criterio |
| --- | --- | --- | --- |
| `unit` | `npm --prefix Mage.Proxy/web run test` (vitest) | no | todos los tests pasan |
| `coverage` | `npm --prefix Mage.Proxy/web run test:coverage` | no | pasa + cobertura ≥ ~87% stmts (objetivo: no bajar respecto a PROJECT.md) |
| `typecheck` | `npm --prefix Mage.Proxy/web run typecheck` (tsc -b --noEmit) | no | sin errores |
| `build` | `npm --prefix Mage.Proxy/web run build` (tsc -b && vite build) | no | build completo |
| `java` | `mvn -pl Mage.Proxy -am test` | no | tests del proxy Java pasan |
| `self-test` | `node scripts/self-test.mjs` (E2E headless WS) | server + proxy | 10+ checks PASS, 0 FAIL |
| `human-test` | `node scripts/human-test.mjs` (E2E jugador humano vs IA) | server + proxy | 26 checks TODO PASS |
| `e2e` | `npx playwright test` (en Mage.Proxy/web) | vite | 0 failed |

## Cuándo correr cada cosa

- Tocar `Mage.Proxy/web` → `unit` + `typecheck` (mínimo); `build` si cambió la
  build; `e2e` si cambió UI/flujo.
- Tocar Java del proxy (`Mage.Proxy/src`) → `java` + `node scripts/build.mjs proxy`
  + `node scripts/ctl.mjs restart proxy` (el jar cambia: los tests del stack
  ejercitan el jar viejo si no se recompila).
- Validación final de una tarea → suite completa: `node scripts/test.mjs`.
- El stack debe estar arriba para `self-test`, `human-test` y `e2e` (si no,
  test.mjs reporta SKIP con el hint "el stack no está corriendo").

## Flake conocido (importante)

`self-test` puede fallar en `WATCHGAME` SOLO en la primera partida tras arranque
en frío del servidor. El test ya reintenta (`watchTable` 2º intento). Si falla:

1. Verificar que no es bug real: el proxy no loguea `event >> GAME_INIT` (el
   servidor ni siquiera emitió callbacks) y `server.out.log` tiene
   `SESSION CALLBACK EXCEPTION - Unable to create socket`.
2. Reintentar `node scripts/self-test.mjs` con el servidor caliente → debe pasar.
3. Si falla repetidamente en caliente → es bug real, investigar (no marcar flake).

## Checklist "tarea terminada"

1. Suite completa en verde (`node scripts/test.mjs`) o capas relevantes.
2. Si E2E headless/humano pasaron, actualizar `PROJECT.md`: tabla de calidad,
   lecciones y log con fecha (header: última actualización).
3. No dejar cambios sin validar en `Mage.Proxy/web` ni en Java del proxy.
