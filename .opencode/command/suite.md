---
description: Valida el Mage.Proxy completo: comprueba el stack, lo arranca si hace falta y ejecuta la suite de tests entera, reportando PASS/FAIL por capa.
agent: build
---

Ejecuta la validación completa del Mage.Proxy con este flujo:

1. Comprueba el stack: `node scripts/ctl.mjs status`. Si `server`, `proxy` o
   `vite` no están RUNNING, arranca el stack con `node scripts/ctl.mjs start`
   y espera a que los puertos estén listos (server 17171, proxy 8787, vite 5173;
   el servidor tarda ~40–60 s en frío).
2. Ejecuta la suite completa: `node scripts/test.mjs` (todas las capas: unit,
   coverage, typecheck, build, java, self-test, human-test, e2e).
3. Reporta por capa `[PASS]/[FAIL]` con el resumen final del orquestador.
4. Si `self-test` falla en WATCHGAME y se trata del flake conocido de arranque
   en frío (ver skill `mage-stack`), reintenta `node scripts/self-test.mjs`
   con el servidor caliente antes de declarar fallo.
5. Si todo pasó, actualiza `PROJECT.md` (tabla de calidad, lecciones si aplica,
   log con fecha y header) — y recuérdamelo si ves que no lo hago.

Nota: si algún argumento viene tras `/suite` (p.ej. `/suite unit typecheck`),
ejecuta solo esas capas en lugar de la suite completa.
