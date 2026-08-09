# Tests E2E (Playwright)

Flujo completo del cliente web: login contra el proxy -> lobby -> partida demo
IA vs IA como espectador -> verificación de que el tablero (canvas Pixi) se
redibuja sin errores de consola.

## Requisitos

- Stack corriendo (NO arrancar nada):
  - vite dev en `http://localhost:5173`
  - proxy WS en `ws://localhost:8787`
  - servidor XMage local en `localhost:17171` (test mode)
- `npm install` ya hecho (incluye `@playwright/test`)
- Chromium descargado: `npx playwright install chromium` (si faltara)

## Cómo correr

Desde `Mage.Proxy/web`:

```sh
npm run test:e2e
# o equivalente:
npx playwright test --reporter=list
```

## Qué comprueba

1. Registra `pageerror` y errores de consola.
2. Login con credenciales únicas `e2e-<timestamp>`.
3. Llega al lobby (sección "Mesas").
4. Crea la mesa demo "IA vs IA" y entra como espectador.
5. Espera la pantalla de partida y el canvas de Pixi en `.board-wrap`.
6. Espera la entrada "Espectador: mirando la partida…" en el GameLog.
7. Comprueba que el canvas se redibuja (bytes distintos) en hasta 60 s.
8. Falla si hay cualquier `pageerror` o un error fatal de consola
   (p. ej. el antiguo `TypeError` en `maybeAutoPass` con `game.players`
   undefined, o "An error occurred in the <GameScreen>").

## Salidas

- Screenshot final: `e2e/shots/full-flow-final.png`
- Capturas de fallo y trazas: `test-results/`
- Informe HTML: `npx playwright show-report` (o `playwright-report/`)
- Detalle de pageerrors/errores de consola como adjuntos en el informe HTML.
