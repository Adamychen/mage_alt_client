# Proyecto: Cliente moderno para XMage (web) — Documento maestro de trabajo

> Este documento es la **fuente de verdad del proyecto**: roadmap, fases, decisiones y
> estado real verificado. Se actualiza en cada paso de trabajo, no solo al final de fases.
> Última actualización: 2026-08-15 (Fase 2 completada y verificada E2E en navegador)

---

## 1. Objetivo

Replicar la experiencia de XMage (Magic: The Gathering, multijugador y contra IA) con un
cliente web **moderno, estilo MTG Arena**: render WebGL2, animaciones, targeting visual,
y jugable **sin instalar nada** (un link y a jugar).

No reimplementamos reglas de Magic: el servidor XMage (Java) sigue siendo el motor de reglas,
la base de datos de cartas y la red social. Nosotros construimos un cliente nuevo encima.

## 2. Estado actual

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Proxy XMage (bridge) | ✅ Completada y verificada (2026-08-08) |
| 1 | Cliente web: login + lobby + tablero renderizado | ✅ Completada y verificada (2026-08-08) |
| 2 | Interacción completa: feedbacks, targeting, jugar | ✅ **Completada y verificada (2026-08-15)** — X costs, multi-target, modal y contadores validados por WS (human-test 83 checks) y E2E en navegador (spells 4/4) |
| 3 | Efectos, sonido, launcher de escritorio | ⬜ Pendiente |

## 3. Arquitectura general

```
┌──────────────┐   WS JSON    ┌────────────────┐   protocolo XMage    ┌───────────────────┐
│  Navegador   │ ───────────▶ │ Proxy Java     │ ───────────────────▶ │ Servidor XMage    │
│  React+Pixi  │ ◀─────────── │ (Mage.Proxy)   │ ◀─────────────────── │ (Mage.Server)     │
│  WebGL2      │              │ sesión real    │   jboss-serialization│ 1.4.60-V3         │
└──────────────┘              └────────────────┘                      └───────────────────┘
```

- **Servidor XMage**: motor de reglas y de juego (Java, `Mage.Server`). Ya existente, no se toca.
- **Proxy (`Mage.Proxy/`)**: módulo Java nuestro. Abre una sesión XMage real (`SessionImpl`),
  recibe callbacks del servidor y los reexpone por WebSocket como JSON; ejecuta las acciones
  del web client contra el servidor. Necesario porque el navegador no puede hablar
  jboss-serialization.
- **Cliente web (`Mage.Proxy/web/`)**: app React + PixiJS. Se comunica solo con el proxy,
  nunca con Mage.Common → cambiar cliente no rompe proxy ni viceversa.

## 4. Decisiones técnicas (y por qué)

| Decisión | Elección | Razón |
|---|---|---|
| Stack cliente | React 19 + Vite + TypeScript + PixiJS 8 (WebGL2) | PixiJS = sprites/partículas/filtros en GPU; React = UI (lobby, diálogos). Máxima velocidad de iteración y efecto |
| Arquitectura de estado | **Snapshot-diff → animación**: cada `GAME_UPDATE` trae el `GameView` completo; el cliente calcula transiciones (carta A voló de mano→battlefield, B se giró...) y las anima | La lógica es pura y testeable; los efectos son data-driven, no código por efecto |
| Efectos | Catálogo declarativo (`fx/catalog.ts`): un efecto = entrada de config (animación, ease, duración, partículas) | Añadir efectos cuesta líneas, no refactors; mantenible |
| Distribución | Navegador puro (Fases 1-2) → launcher Tauri (Fase 3) | Link = cero instalación (ventaja nº1 vs XMage); Tauri = app de escritorio de 10 MB que arranca el proxy solo |
| Mantenibilidad | `types.ts` = fuente única del protocolo; lógica pura separada del render; pocas dependencias fijadas | Riesgo real del proyecto = versiones de XMage (proxy), no el cliente |
| Rendimiento | Sprites compartidos, texturas de carta únicas, pool de partículas, DPI-aware | El juego no es performance-bound; se controla memoria y pausas de GC |

## 5. Fase 0 — Proxy XMage (✅ completada y verificada el 2026-08-08)

### Componentes entregados (`Mage.Proxy/`)

| Archivo | Función |
|---|---|
| `src/main/java/.../ProxyClient.java` | Implementa `MageClient`; sesión XMage real vía `SessionImpl`; reenvía callbacks del servidor como JSON; ejecuta comandos del web client |
| `src/main/java/.../Gateway.java` | Servidor WebSocket (Java-WebSocket) en `ws://localhost:8787` |
| `src/main/java/.../JsonUtil.java` | Serializador JSON por reflexión con detección de ciclos (clave para GameView gigante) |
| `src/main/java/.../Main.java` + `Config.java` | Arranque; flags `--host --port --username --password --wsPort --httpPort` |
| `src/main/java/.../DeckJson.java` | Parseo de mazos JSON → `DeckCardLists` |
| `src/main/resources/web/index.html` | Página de test servida en `http://localhost:8788/index.html` |
| `README.md` | Documentación del protocolo WS (comandos, eventos, ejemplos) |
| `pom.xml` (root) | Registrado módulo `Mage.Proxy`; `Mage.Proxy/pom.xml` con deps de Mage.Common 1.4.60-V3 |

### Verificación real (servidor local en test mode, `local-server/`)

Flujo completo probado de punta a punta:
- Login/sesión OK · lobby broadcast (tablas/usuarios/mensajes) cada ~2 s OK
- Chat de sala (joinChat + mensajes) OK
- Crear mesa con IA + humano, unirse con mazo JSON, `startMatch` OK
- Eventos recibidos en JSON: `START_GAME`, `GAME_INIT` (GameView completo),
  `GAME_UPDATE`, `GAME_ASK` (mulligan) OK

### Lecciones aprendidas (importantes para Fases 1-3)

1. **Proxy Y servidor** deben ejecutarse con `--add-opens=java.base/java.io=ALL-UNNAMED`
   (jboss-serialization rompe en JDK 17 sin esos flags).
2. `beta.xmage.de` está caído/bloqueado (2026-08-08); todo se verifica contra servidor local.
3. `deckType` debe ser un **nombre real de la config del servidor** (p. ej. `Constructed - Modern`).
4. Las plazas de IA se llenan **antes** que la humana (igual que el cliente oficial).
5. `createTable` exige que el `quitRatio` del mazo ≥ el del usuario (usar 100 por defecto).
6. La versión del cliente debe coincidir con la del servidor (1.4.60-V3); el servidor local
   necesita `config.xml` con `${project.version}` sustituido y los plugins en `plugins/`
   (dejado preparado en `local-server/`, ignorado por git).
7. **El connect NUNCA debe reiniciar una sesión que ya es del mismo usuario+servidor**
   (pestañas/recargas envían connect repetido). En test mode el servidor expulsa usuarios
   duplicados del mismo host (`Session.java` anon-dedup) → con el reinicio se monta un bucle
   de reconnect del `SessionImpl` (~1.5s) que vacía el registro de conexiones WS y mata los
   broadcasts. Fix: connect idempotente + `synchronized`.
8. **Los eventos de partida siguen llegando al proxy ~1 min después de que el watcher cierra**
   (GAME_UPDATE/GAME_OVER de partidas IA en curso). "Broadcast a 0 conexiones" de eventos de
   partida es normal y no debe sonar como error; los de `lobby` sí lo son (siempre debe haber
   clientes conectados).
9. **Desmontar el tablero requiere desconectar el ResizeObserver**: Pixi 8 pone `renderer` a
   null al destruir; un observer fugado dispara `resize()` contra null tras el unmount.
10. Los check de logs deben ser **time-windowed** (offset al inicio del test): los logs del
    proxy son append-only entre reinicios y los restos históricos dan falsos positivos.
11. **Semántica real de los booleanos de XMage** (verificado en `HumanPlayer`/`Mage.Client`,
    y empíricamente contra el servidor): `sendPlayerBoolean(true)` = **tomar mulligan**,
    `false` = **mantener** (el botón "Mulligan" del cliente oficial manda true). Para prioridad
    (`GAME_SELECT`), cualquier booleano = pasar. Ojo: los feedbacks de mulligan y "keep" del
    cliente web y del test estaban **invertidos**; corregidos (2026-08-09).
12. **El mulligan real (London, 0 free)**: tras `GAME_ASK "Mulligan down to N?"`, si se toma
    mulligan el servidor pide `GAME_TARGET "Select a card (N more) to put on the bottom of your
    library"` (los UUIDs de las cartas van en `targets`, **no** en `cardsView1`) y vuelve a
    preguntar con N−1. El servidor re-dispara el target si la respuesta no lo resuelve.
13. **"Select a starting player" es aleatorio**: `GameImpl.pickChoosingPlayer()` elige al azar
    quién gana el sorteo; si es el humano, llega un `GAME_TARGET` bloqueante que hay que
    responder con el UUID de un jugador (también puede dispararse 2× por la race del
    "forced join"; dedup por contenido en los tests).
14. **Los objetivos de "any target" incluyen a ambos jugadores**: para verificar daño en tests,
    hay que elegir el UUID del oponente (`gameView.players[].controlled`), no el primero de
    `targets` (el primero puede ser uno mismo).
15. **macOS: el stub `/usr/bin/java` rompe los daemons** (`Unable to locate a Java Runtime` en
    `.run/*.err.log`): `scripts/lib.mjs` ahora resuelve el binario real (`javaBin()`, Homebrew
    `openjdk@17` en `/opt/homebrew/opt` primero) y `daemon()` usa la ruta absoluta para `java`.
16. **`SESSION CALLBACK EXCEPTION - Unable to create socket` se vuelve persistente si el
    servidor acumula sesiones de proxies muertos** (matados con kill -9): los clientes antiguos
    dejan sus sockets de retorno en el servidor y el callback del nuevo login falla con retries
    infinitos. Fix empírico: reiniciar el servidor y arrancar el proxy limpio (con `javaBin()`
    el stack queda estable; el self-test pasa 15/15 repetidas veces).
17. **El pago de maná real (`GAME_PLAY_MANA`) no manda colores**: `data.options` solo trae
    `{"queryType":"PLAY_MANA"}`. El pago se hace clicando las fuentes de maná del tablero
    (UUID de `canPlayObjects` que esté en `players[].battlefield` — la gira y mete maná en la
    reserva) y **después** pagando desde la reserva con `sendPlayerManaType` (se necesita un
    segundo ask: "Pay {R}" → clic fuente → "Pay {R}" de nuevo → reserva). El cliente oficial
    hace exactamente esto.
18. **Los E2E de navegador dejan partidas corriendo en el servidor** (test-mode, `maxGameThreads`=10):
    tandas largas de runs + retries saturan el servidor y los siguientes tests (incluido el
    propio full-flow) fallan con timeouts raros. Entre tandas: `node scripts/ctl.mjs restart server`.
19. **El mazo de las IA del demo debe ser "estable"** (islas+montañas+4 bolts): si las IA juegan
    solo montañas+16 bolts la partida IA vs IA termina en 2-3 turnos y el demo/full-flow no ve
    el tablero. Mazos separados en `web/src/lobby/decks.ts` (`STABLE_DECK` demo / `DEFAULT_DECK`
    44+16 para partidas humanas).

### Comandos de arranque (verificados)

```powershell
# Servidor local (test mode)
& java --add-opens=java.base/java.io=ALL-UNNAMED -jar local-server\Mage.Server.Console\mage-server-1.4.60-V3.jar -testMode

# Proxy
& java --add-opens=java.base/java.io=ALL-UNNAMED -jar Mage.Proxy\target\mage-proxy-1.4.60.jar --username <user> --password <pass>
```

---

## 6. Fase 1 — Cliente web: login + lobby + tablero renderizado (✅ completada y verificada el 2026-08-08)

### Objetivo

App web que conecta al proxy, hace login, muestra el lobby (tablas, usuarios, chat),
permite crear/ver partidas, y **renderiza el tablero con cartas reales (Scryfall)**.
Demo estrella: ser **espectador de una partida IA vs IA** y verla jugar sola.

### Estructura de código (`Mage.Proxy/web/`)

```
web/
├── index.html
├── package.json / vite.config.ts / tsconfig.json
└── src/
    ├── main.tsx / App.tsx          — entrada, routing por estado (login/lobby/game)
    ├── net/
    │   ├── types.ts                — TIPOS TS DEL PROTOCOLO (fuente única, espejo del JSON del proxy)
    │   ├── Gateway.ts              — WS, reconexión, routing por tipo, promesas por result
    │   └── commands.ts             — helpers de acciones al proxy
    ├── state/
    │   ├── store.ts                — estado de conexión + lobby
    │   └── gameStore.ts            — snapshot GameView actual + log de partida
    ├── lobby/
    │   ├── LoginScreen.tsx         — host/ws/user/pass → connect
    │   ├── LobbyScreen.tsx         — tablas, usuarios, chat de sala, crear mesa
    │   └── CreateTableDialog.tsx   — tipo de juego, formato, nº de IA
    ├── cards/
    │   └── cardImages.ts           — Scryfall (set+número) con caché IndexedDB y placeholder
    ├── board/
    │   ├── BoardView.tsx           — monta Pixi.Application (WebGL) dentro de React
    │   ├── BoardScene.ts           — orquesta: snapshot → sprites; zonas, tap, contadores
    │   ├── zones.ts                — layout: dónde vive cada carta (slots en px)
    │   └── gameToScene.ts          — mapeo GameView → entidades del escenario
    └── ui/
        ├── TopBar.tsx              — turno, fase/paso, vida/maná de ambos jugadores
        └── GameLog.tsx             — log desde GAME_UPDATE_AND_INFORM / CHATMESSAGE
```

### Tareas y estado real

- [x] **1.0** Decisiones de stack y alcance (2026-08-08): React+Vite+TS+PixiJS; Fase 1 entera.
- [x] **1.1** Entorno: instalado Node.js (v24.19.0) y scaffolding de `web/`.
- [x] **1.2** `types.ts`: tipos de EventMessage, GameView, PlayerView, CardView, TableView, ChatMessage.
- [x] **1.3** `Gateway.ts`: conexión WS, reconexión con backoff, promesas por `result`, routing de eventos.
- [x] **1.4** LoginScreen + store de conexión → conecta y ve el lobby.
- [x] **1.5** LobbyScreen: tablas (broadcast `lobby`), usuarios, chat de sala, crear mesa (AI vs AI).
- [x] **1.6** `cardImages.ts`: carga Scryfall con caché; placeholder con coste de maná.
- [x] **1.7** Board: `zones.ts` + `BoardScene.ts` + `BoardView.tsx`: battlefield 2 filas, mano en abanico, library/cementerio/exilio, stack; tap = giro; cartas ocultas con dorso.
- [x] **1.8** TopBar (turno/fase/vida/maná) + GameLog.
- [x] **1.9** Demo espectador: `watchTable` en partida IA vs IA (2 × COMPUTER_MAD) → la partida avanza y el tablero se redibuja.
- [x] **1.10** Auto-respuesta mínima para partida propia (toggle): mulligan "keep" + paso de prioridad XMage mediante booleano.
- [x] **1.11** Verificación: servidor local + proxy + `vite dev`; partida IA vs IA en directo. README del web client.

### Calidad: tests e integración continua (añadido 2026-08-08)

| Capa | Herramienta | Comando | Estado |
|---|---|---|---|
| Unitario (lógica pura) | vitest | `npm --prefix Mage.Proxy/web run test` | ✅ 60 tests |
| Cobertura de núcleo web | vitest/v8 | `npm --prefix Mage.Proxy/web run test:coverage` | ✅ 60 tests · 88.2% statements · 91.1% lines |
| Typecheck | tsc | `npm --prefix Mage.Proxy/web run typecheck` | ✅ |
| Build producción | vite | `npm --prefix Mage.Proxy/web run build` | ✅ |
| Proxy Java | Maven/JUnit 5 | `mvn -pl Mage.Proxy -am test` | ✅ 14 tests del proxy |
| E2E headless (proxy real) | `scripts/self-test.mjs` | `node scripts/self-test.mjs` | ✅ 15 checks |
| E2E jugador humano vs IA | Node/WebSocket | `node scripts/human-test.mjs` | ✅ 26 checks (partida completa: mulligan → tierra → Bolt → objetivo → maná → resolución) |
| E2E navegador (login→lobby→demo→tablero) | Playwright | `npm --prefix Mage.Proxy/web run test:e2e` | ✅ re-ejecutado tras F2 (2026-08-09) |

- **Un solo comando para todo**: `node scripts/test.mjs [unit|coverage|typecheck|build|java|self-test|human-test|e2e]` (con `--skip=`).
- **CI en GitHub** (para cuando se pushee a un fork propio): `.github/workflows/web-ci.yml`
  (npm ci + vitest + typecheck + build). El `maven.yml` existente ya compila `Mage.Proxy`.
- **Instalación desde cero para el usuario**: `node scripts/install.mjs` (mvn base+plugins, copia
  plugins, npm install) → `node scripts/ctl.mjs start` → `node scripts/test.mjs`.
- **Control del stack sin bloquear el shell**: `node scripts/ctl.mjs start|stop|restart|status`
  (usa un proceso independiente en Windows; logs en `.run/*.log`); logs en vivo con `node scripts/tail.mjs`.

### Bugs reales encontrados y arreglados en Fase 1

1. **Crash de espectador** (`store.ts:maybeAutoPass`): `game.players` es `undefined` en modo
   espectador → TypeError al renderizar. Guards `?.`/`??` en store, gameToScene y BoardScene;
   tipos de `GameView` corregidos (`players?`, `stack?`).
2. **Thrash de sesión en el proxy** (`ProxyClient.connect`): cada reconexión de pestaña enviaba
   `connect(player1)` y el proxy reiniciaba la sesión (connectStop+sleep+connectStart), matando
   los callbacks y dejando los broadcasts a 0 conexiones en bucle infinito (test-mode kicks a
   usuarios duplicados del mismo host). Fix: **connect idempotente** (mismo usuario+host → no-op).
3. **ResizeObserver fugado** (`BoardView.tsx`): al terminar la partida, el observer seguía
   llamando `resize()` contra una app Pixi destruida → TypeError. Fix: `ro.disconnect()` en
   cleanup + guard `!app.renderer` en `BoardScene.resize`.
4. **Pestaña congelada en la demo (GPU real)**: el navegador del usuario moría (ws 1006) justo
   al recibir `GAME_INIT` e inicializar Pixi — reproducido solo con GPU real, no en headless.
   Defensas añadidas:
   - `ErrorBoundary` global (`src/ui/ErrorBoundary.tsx`): error de render → pantalla con "Recargar".
   - `createBoardScene()` con pre-check `hasWebGL2()` + timeout de init de 8s → mensaje claro
     ("GPU colgada / sin aceleración por hardware") en vez de tab muerta.
   - **Throttling de render** en `BoardScene`: la partida IA emite ~5 `GAME_UPDATE`/s con el
     GameView completo; ahora se acumula el último snapshot y se redibuja como mucho cada 80ms
     (antes: reconstrucción total de todos los sprites por cada update → congelaba GPUs débiles).
   - Banner "Conexión perdida — reconectando…" (`store.wsAlive`) y timeouts explícitos en
     `runDemo`/join/start/watch (el botón nunca se queda en "…" infinito).

### Criterios de aceptación (Fase 1)

1. Login contra el proxy (servidor local) sin errores y lobby poblado en ≤ 3 s. ✅
2. Chat de sala funcional (enviar y recibir). ✅
3. Partida IA vs IA visible como espectador: tablero completo renderizado con imágenes reales, y la partida avanza sola (turnos, fases, jugadas). ✅
4. Cero dependencias de XMage en el navegador; solo WS JSON contra el proxy. ✅
5. `npm run build` y `npm run typecheck` en verde. ✅ (además vitest + self-test + Playwright)

### Entorno real instalado (2026-08-08)

- Node.js: v24.19.0 · npm (bundled) · Java: OpenJDK 17.0.20
- Dependencias npm: react 19.2.x, pixi.js 8.19.x, vite 8.2.x, typescript 7.0.x,
  vitest (última), @playwright/test (última, chromium instalado)

---

## 7. Fase 2 — Interacción completa (en progreso)

- Cubrir completamente los callbacks de diálogo reales de XMage (`GAME_ASK`, `GAME_TARGET`,
  `GAME_PLAY_MANA`, `GAME_CHOOSE_*`, `GAME_SELECT`, cantidades...): diálogos genéricos + interacción por clic.
- Targeting visual: líneas de targeting punteadas, resaltado pulsante de objetivos válidos.
- Drag & drop / clic para jugar cartas, elegir modos, X costs, contadores de +1/+1.
- Enviar `sendPlayerAction` / `sendPlayerString` / `sendPlayerUUID` según el feedback.

Implementado en Fase 2:
- Contrato real de prioridad (`GAME_SELECT` + boolean), `GAME_UPDATE_AND_INFORM.gameView` y `canPlayObjects` tipado.
- Adaptador puro y testeado para `GAME_ASK`, `GAME_TARGET`, `GAME_SELECT`, elecciones,
  pilas, cantidades, multi-cantidades y maná.
- Diálogo web común conectado al `gameId` y a las acciones del protocolo.
- Objetivos con UUIDs directos, `cardsView1`, jugadores y selección opcional.
- Cartas jugables resaltadas; clic sobre una carta envía su UUID XMage real.
- ✅ **Validado E2E real (2026-08-09)**: `scripts/human-test.mjs` juega una partida completa
  humano vs IA: sorteo de starting player (aleatorio), mulligan (keep + London bottom-of-library),
  jugar tierra, pasar turnos, lanzar **Lightning Bolt**, elegir al oponente como objetivo,
  pagar maná y verificar la resolución (vida 17). 26 checks PASS.
- ✅ E2E Playwright del navegador re-ejecutado tras los cambios (verde).
- Corregidos bugs reales del contrato (ver sección 5.11-5.14): semántica de booleanos de
  mulligan invertida en `feedback.ts`/`store.ts`/`human-test.mjs`, `"Select a starting player"`
  sin manejar, deck del test sin Lightning Bolt (`HUMAN_DECK` no se usaba), elección de
  objetivo contra uno mismo, y etiquetado de targets de mano/battlefield en el diálogo.

Pendiente en Fase 2:
- ~~Drag & drop, modos avanzados (X costs, elecciones múltiples), contadores de +1/+1 y rutas de
  pago alternativas (multi-maná, X mana) en el cliente web~~ → ✅ Implementado y validado
  (2026-08-15): X costs, modal y contadores resueltos por UI y verificados por WS + E2E.
- Drag & drop de cartas (pulido de interacción, aplazado a Fase 3 con los efectos).

### Añadido 2026-08-10 (tarde) — cierre de Fase 2: multi-target UX + verificación avanzada (EN CURSO)

**Commit `a1af5bb202`**: trabajo del 10-08 consolidado (targeting visual, pago de maná por UI,
mesas humano vs IA, E2E targeting).

- **Multi-target desde el tablero**: verificado contra el servidor que `GAME_TARGET` se
  **re-dispara por cada objetivo elegido** (`HumanPlayer.chooseTarget`, bucle con
  `options.chosenTargets` con los ya elegidos); por tanto el clic secuencial ya resuelve
  consultas de 2+ objetivos. Mejoras UI:
  - `feedback.ts` parsea `options.chosenTargets` → `FeedbackPrompt.chosenTargets` (con test).
  - `BoardScene` dibuja los objetivos ya elegidos en **verde sólido con badge "✓"**
    (líneas punteadas verdes, aros verdes) frente al pulso naranja de los pendientes;
    clic de nuevo deselecciona (el servidor lo gestiona: `target.remove`).
  - `GameScreen.onTargetClick` ya **no limpia el feedback** al elegir (el servidor siempre
    re-dispara el siguiente diálogo; limpiar creaba una race).
  - Diálogo muestra "Objetivos ya elegidos: N (clic de nuevo para deseleccionar)".
- **Mazo avanzado de verificación** (`web/src/lobby/decks.ts` → `ADVANCED_DECK`, 66 cartas,
  Modern legal): 34 Mountain + 4 Plains + 8 Bolt + 8 **Blaze** ({X}{R}, X cost) + 4 **Arc Trail**
  (2 objetivos) + 4 **Boros Charm** ({R}{W}, "Choose one", pago multi-color) + 4 **Walking
  Ballista** (contadores +1/+1, X = maná gastado). Selector "Tu mazo" nuevo en
  `CreateTableDialog` (DEFAULT/ADVANCED/STABLE).
- **`human-test.mjs` ampliado** (escenario avanzado tras el Bolt): X cost (Blaze, `GAME_GET_AMOUNT`
  → `sendPlayerInteger(2)` → objetivo → pago {R}{2}), multi-target (Arc Trail 2 objetivos con
  verificación de `chosenTargets`), modal (Boros Charm `GAME_CHOOSE_CHOICE` → clave del modo
  de 4 de daño), contadores (Ballista {4} → `counters` = 4 en el GameView).
- **Validado por WS (human-test)**: X cost COMPLETO (Blaze X=2: announce → target → 3 pagos de
  maná → vida oponente 17→15 en la última ejecución con Blaze resuelto pendiente de pasar
  prioridad). unit 67/67 + typecheck ✅.

**Bugs reales encontrados y corregidos en el test** (lecciones para el E2E y el cliente):
1. **Race de cursor en el test**: un `GAME_SELECT` (prioridad) que llega en el hueco entre dos
   esperas se pierde con `waitEvent(after=events.length)` y la partida queda bloqueada esperando
   respuesta. Fix: estado `openPriorityEvent` (el GAME_SELECT abierto se registra al recibir y
   se limpia solo si la acción que enviamos resuelve exactamente ese diálogo) + `waitNextPriority`.
2. **La mano >7 cartas bloquea la partida**: el servidor pide `GAME_TARGET "Select a card to
   discard"` al final del turno y, sin respuesta, nadie vuelve a tener prioridad (síntoma:
   "timeout esperando prioridad"). Fix: `autoDiscard` en el test (descarta Mountain/Plains/primera
   carta de `cardsView1`). **Recién aplicado, pendiente de verificación.**
3. **El pago de maná no resuelve el hechizo**: tras pagar hay que pasar prioridad
   (`sendPlayerBoolean(false)`) para que el stack resuelva; `resolveCast` + `passPriority`.
4. **Faltan fuentes**: Blaze X=2 necesita 3 tierras sin girar; helper `ensureLands` (juega una
   tierra por turno hasta `need`).
5. **La IA con mazo de 60 tierras pierde la partida ~turno 10-15** (se agota el mazo o se
   rinde): pendiente engrosar el mazo IA del human-test (p. ej. 50+50) y/o jugar más rápido.

**Pendiente para terminar el cierre de Fase 2**:
- [x] Cambiar el mazo IA del human-test a 100 cartas (50 Island + 50 Mountain) para que no se
      agote ni se rinda durante el escenario avanzado (~turno 90 de presupuesto).
- [x] Verificar `autoDiscard` + ejecutar `human-test.mjs` completo (Bolt → Blaze → Arc Trail →
      Boros Charm → Ballista) hasta TODO PASS (83 checks, 2026-08-15).
- [x] E2E Playwright `e2e/spells.spec.ts`: partida humana con `ADVANCED_DECK` por el selector
      "Tu mazo" (reestructurado a 4 tests independientes, ver abajo).
- [x] Suite completa (`node scripts/test.mjs`) + actualizar este documento y commitear.
- [x] Borrar `scripts/askprobe.tmp.mjs` (sonda temporal; ya no existía).

### Añadido 2026-08-15 — cierre de Fase 2 (✅ completada): X costs, multi-target, modal y contadores E2E

- **`human-test.mjs` completo en verde: 83 checks** (Bolt → Blaze X=2 → Arc Trail 2 objetivos →
  Boros Charm modo 4 daño → Walking Ballista X=4 con 4 contadores), con el mazo IA a 100 cartas
  (50 Island + 50 Mountain) y `autoDiscard` verificados.
- **`e2e/spells.spec.ts` reestructurado a 4 tests independientes** (seriales, uno por hechizo,
  cada uno con su propia partida, presupuesto y retries) + **`e2e/targeting.spec.ts`** intacto:
  1. **Blaze X=2**: diálogo integer del X, evidencia del targeting visual (screenshot diff),
     pago {R}{2} y resolución (vida oponente -2).
  2. **Arc Trail**: dos objetivos (el 2º ask se re-dispara solo si hay otro objetivo legal; si
     no, el servidor auto-elige y va directo al maná — ambas rutas cubiertas), resolución -2.
  3. **Boros Charm**: el modo llega como **`GAME_CHOOSE_ABILITY`** (chooseMode →
     AbilityPickerView), NO `GAME_CHOOSE_CHOICE` (verificado contra el servidor); pago {R}{W}
     con **respeto del color** y resolución -4.
  4. **Walking Ballista**: `GAME_CHOOSE_ABILITY` "Cast" → integer X=4 → pago {8} → permanente
     con 4 contadores en el campo.
- **Robustez de clics E2E** (lecciones): el canvas puede ir un render por detrás de los frames
  (throttling ~80ms + descartes en marcha) → **clic por posición REAL del escenario**
  (`BoardScene` expone `window.__mageScene` = posiciones de cartas + playables en vivo; el test
  clica por UUID de carta, no por índice de una vista parseada). La comprobación de jugabilidad
  usa el estado de la app (no el `canPlayObjects` intermitente de los frames) con reintento.
- **Mazo IA benigno** (`AI_OPPONENT_DECK` 50 Island + 50 Mountain) para las mesas humanas del
  lobby: la IA con 16 Bolts mataba al humano en partidas largas y volvía flaky todos los E2E de
  hechizos. El demo IA vs IA sigue con `STABLE_DECK`.
- **Hallazgo de contrato**: en objetivos SEPARADOS (Arc Trail = 2 `Target` distintos) el servidor
  **no puebla `options.chosenTargets`** (llega `[]`); el hint "Objetivos ya elegidos: N" y el
  verde ✓ solo aplican a consultas de un único `Target` multi-elección (no cubiertas por
  ADVANCED_DECK). El parseo queda verificado por unit test (fixture).

### Añadido 2026-08-10 — targeting visual + pago de maná (validado E2E en navegador)

- **Targeting visual** (`BoardScene`): capa de efectos con ticker propio — outlines pulsantes
  (alfa/ancho con seno) sobre los objetivos válidos, **líneas punteadas animadas** (guiones que
  fluyen) desde la carta fuente (hechizo en el stack o permanente con habilidad activada) a cada
  objetivo, y **aros pulsantes** sobre objetivos de jugador (header del oponente).
  - `sourceName` viene de `data.options.secondMessage` (el servidor NO manda el UUID de la
    fuente; se empareja por nombre contra stack/battlefield: `resolveTargetSourceId`).
  - Los objetivos de jugador son **clicables** con hit-areas invisibles (antes no se podía
    apuntar a un jugador desde la UI).
  - Hover sobre un objetivo: línea y outline se intensifican.
- **Pago de maná** (`GAME_PLAY_MANA`): el diálogo muestra el prompt con hint ("haz clic en tus
  fuentes de maná"), el backdrop ya no bloquea el tablero, y ofrece botones de **reserva de
  maná** (`sendPlayerManaType` por color con maná en el pool). El flujo completo de un
  Lightning Bolt por UI: clic carta → GAME_TARGET (pulso+líneas) → clic objetivo → clic
  Mountain del tablero (la gira) → "Pagar reserva: R" → pasar prioridad → resolución (vida 17).
- **Mesas humano vs IA en el lobby**: el creador ocupa su plaza automáticamente (como el
  cliente oficial), el diálogo de mesa tiene toggle "Tu plaza" (HUMAN) con plazas IA limitadas
  por el tipo de juego, y cada mesa con plaza IA libre muestra "Unirse IA".
- **E2E nuevo** (`e2e/targeting.spec.ts`): partida completa humana por navegador — sorteo de
  starting player, mulligan auto-keep, Mountain, Lightning Bolt, aserciones del targeting
  visual (el canvas cambia al entrar en targeting y pulsa entre capturas), resolución (vida 17)
  y cero pageerrors. Mazo humano 44 montañas + 16 bolts en `lobby/decks.ts` (`DEFAULT_DECK`).
- Evidencia: `Mage.Proxy/web/e2e/shots/targeting-bolt.png` (canvas durante el targeting;
  análisis de píxeles: naranja del pulso/líneas presente en stack, banda central y header del
  oponente).

## 8. Fase 3 — Efectos, pulido y distribución (⬜ pendiente)

- Motor de efectos declarativo (`fx/engine.ts`, `fx/catalog.ts`): vuelos arqueados, partículas
  de maná por color, glow/outline (filters de Pixi), shake de pantalla, números flotantes de
  daño/vida, sonido.
- Interpretación del texto de `GAME_UPDATE_AND_INFORM` → efectos temáticos.
- Launcher Tauri: app de escritorio que arranca el proxy y abre la ventana (o el navegador).
- PWA: instalable, caché offline de cartas.
- Rendimiento: DPI-aware, memory budgets, telemetría básica.

---

## 9. Registro de trabajo (log real)

| Fecha | Paso | Qué se hizo | Verificación |
|---|---|---|---|
| 2026-08-08 | F0 | Construido `Mage.Proxy` (client, gateway, json, deck, main) + página de test | Compilado con `mvn -pl Mage,Mage.Common,Mage.Sets,Mage.Server,Mage.Proxy -am package` |
| 2026-08-08 | F0 | Servidor local en `local-server/` (test mode) con config corregida y plugins | Login, lobby, chat, crear mesa, startMatch OK |
| 2026-08-08 | F0 | Verificado flujo completo: eventos `START_GAME`/`GAME_INIT`/`GAME_UPDATE`/`GAME_ASK` en JSON | Página `http://localhost:8788/index.html` |
| 2026-08-08 | F0 | Limpieza repo: `.gitignore` (local-server, target, plugins), `pom.xml` con módulo `Mage.Proxy` | `git status` limpio (solo cambios intencionados) |
| 2026-08-08 | F1 | Creado este documento maestro + decisiones de stack (React+Vite+TS+PixiJS) | Aprobado por el usuario |
| 2026-08-08 | F1.1 | Instalación Node.js v24.19.0 y scaffolding `web/` | `npm install` + `vite dev` OK |
| 2026-08-08 | F1 | Implementado el cliente completo (types, Gateway, store, lobby, board Pixi, cards, log) | typecheck + build verdes |
| 2026-08-08 | F1 | **Bug crash espectador**: `game.players` undefined → guards + tipos `players?`/`stack?` | `vite.log` sin pageerrors |
| 2026-08-08 | F1 | **Bug thrash de sesión proxy**: connect idempotente (mismo user → no-op) | self-test 15/15, E2E sin pageerrors |
| 2026-08-08 | F1 | **Bug ResizeObserver fugado**: disconnect en cleanup + guard en BoardScene.resize | Playwright sin TypeError |
| 2026-08-08 | F1 | Tests unitarios vitest (zones, gameToScene, Gateway, store) + fixtures | 38/38 verde |
| 2026-08-08 | F1 | `scripts/test.mjs` (orquestador 5 capas), `scripts/install.mjs` (setup 1 comando), `scripts/ctl.mjs` (stack en background) | `node scripts/test.mjs` todo verde |
| 2026-08-08 | F1 | E2E Playwright full-flow (login→lobby→demo espectador→tablero avanza) + screenshots | 1/1 verde, 0 pageerrors |
| 2026-08-08 | F1 | CI: `.github/workflows/web-ci.yml` (npm ci + vitest + typecheck + build) | Listo para fork propio |
| 2026-08-08 | F1 | `scripts/install.mjs` verificado de cero (mvn base+plugins, plugins copiados, npm install) | Instalación completada OK |
| 2026-08-08 | F1 | **Bug tab congelada (GPU real)**: ErrorBoundary + hasWebGL2/timeout de init + throttling de render (80ms) + banner de reconexión + timeouts en lobby | Suite 5/5 verde, E2E headed y headless OK |
| 2026-08-08 | Hardening | Proxy local-first: bind loopback, allowlist de Origin, límites de WebSocket, path traversal canónico, auth por conexión y broadcast solo autorizado | Maven proxy tests + integración WebSocket ✅ |
| 2026-08-08 | Contrato | Respuestas con `requestId`, `errorCode`, `protocolVersion` y `gameId` obligatorio en acciones de partida; fix `HUMAN` | 14 tests Java + 53 tests web + typecheck/build ✅ |
| 2026-08-09 | F2 | Corregido contrato XMage: prioridad booleana, `GAME_UPDATE_AND_INFORM.gameView`, callbacks reales y `canPlayObjects` tipado | 60 tests web + typecheck ✅ |
| 2026-08-09 | F2 | Feedback de objetivos sin UUID explícita, jugadores, objetivos opcionales, pago especial y cancelación de maná | Vitest + cobertura ✅ |
| 2026-08-09 | F2 | Cartas jugables resaltadas y clic conectado a `sendPlayerUUID`; `human-test` ampliado hasta resolución de `Lightning Bolt` | Build + 14 tests Java ✅; E2E local pendiente |
| 2026-08-09 | F2 | **Bug semántica booleana de XMage**: mulligan TRUE=mulligan/FALSE=keep (verificado en `HumanPlayer`/`Mage.Client` y empíricamente). Invertido en `feedback.ts`, `store.ts` (auto-keep) y `human-test.mjs` → corregidos + tests | 62 tests web + typecheck + build ✅ |
| 2026-08-09 | F2 | **"Select a starting player" aleatorio** (sorteo): GAME_TARGET bloqueante si el humano gana; manejo + dedup de duplicados del "forced join" en el test | Validado empíricamente con dump de eventos |
| 2026-08-09 | F2 | **London mulligan real**: tras mulligan, `GAME_TARGET` para poner cartas en el fondo de la library (UUIDs en `targets`, no `cardsView1`); re-ask del servidor si no resuelve | Dump de eventos (re-fire en bucle confirmado) |
| 2026-08-09 | F2 | **Objetivo de "any target"**: el primero de `targets` puede ser uno mismo; elegir al oponente (`gameView.players[].controlled`) para validar daño | `human-test` verificó vida 20→17 |
| 2026-08-09 | F2 | **human-test completo en verde**: sorteo → mulligan → tierra → turnos → `Lightning Bolt` → objetivo → maná → resolución → quitMatch | 26 checks PASS; suite 7/7 (unit, coverage, typecheck, build, java, self-test, human-test) + E2E Playwright ✅ |
| 2026-08-10 | Entorno | **Entorno macOS reconstruido desde cero**: instalado Java 17.0.20 + Maven 3.9.16 (Homebrew), build Maven completa, `local-server/` regenerado (config.xml con `${project.version}`→1.4.60 en `local-server/config/config.xml`, 27 plugins), jar del proxy | `install.mjs` + `build.mjs proxy` + stack arriba |
| 2026-08-10 | Infra | **Bug daemons macOS**: el stub `/usr/bin/java` mataba server/proxy; `javaBin()` en `lib.mjs` resuelve el JDK real (Homebrew) y `daemon()` lo usa | ctl.mjs start/restart con java real; stack estable |
| 2026-08-10 | Infra | **Diagnóstico callbacks caídos**: `SESSION CALLBACK EXCEPTION - Unable to create socket` persistente por sesiones obsoletas de proxies muertos (kill -9); reiniciar servidor + proxy limpio lo resuelve (ver lección 16) | self-test 15/15 repetido ×2 |
| 2026-08-10 | F2 | **Targeting visual** en BoardScene: capa fx con ticker — outlines pulsantes, líneas punteadas animadas desde la fuente (stack/battlefield por `secondMessage`), aros de jugador, hit-areas clicables para jugadores, hover intensificado | unit + typecheck ✅ |
| 2026-08-10 | F2 | **Pago de maná por UI**: `GAME_PLAY_MANA` sin colores (options={queryType}), backdrop no bloquea tablero, hint + botones de reserva (`sendPlayerManaType`) + pago por clic en fuentes del tablero | unit + typecheck ✅ |
| 2026-08-10 | F2 | **Lobby humano vs IA**: auto-join del creador, toggle "Tu plaza" (HUMAN) en el diálogo, botón "Unirse IA" por mesa; mazos separados (`STABLE_DECK` demo / `DEFAULT_DECK` 44+16) | full-flow E2E ✅ |
| 2026-08-10 | F2 | **E2E targeting visual** (`e2e/targeting.spec.ts`): partida humana completa por navegador: sorteo, mulligan, Mountain, Bolt, aserciones de pulso/líneas en canvas (byte-diff + píxeles), pago de maná (fuente + reserva), prioridad, resolución (vida 17) | 2× verde en secuencia + suite completa ✅ |
| 2026-08-10 | F2 | **Verificación final**: `node scripts/test.mjs` completo (unit 66, coverage, typecheck, build, java, self-test 15/15, human-test 27/27) + E2E Playwright 2/2 | suite 8/8 ✅ (self-test 1 reintento por cold-start flake) |
| 2026-08-10 | F2 | Commit `a1af5bb202` del trabajo validado (targeting visual, pago de maná, mesas humano vs IA, E2E) | 15 archivos, 879+/49- |
| 2026-08-10 | F2 | Multi-target UX: `chosenTargets` parseado (`feedback.ts`), objetivos elegidos en verde sólido + badge "✓" (`BoardScene`), sin `clearFeedback` tras elegir, hint en el diálogo | unit 67/67 + typecheck ✅ |
| 2026-08-10 | F2 | `ADVANCED_DECK` (Blaze/Arc Trail/Boros Charm/Walking Ballista, 66 cartas) + selector "Tu mazo" en `CreateTableDialog`; cartas verificadas en Scryfall (6ED 168, SOM 81, FDN 721, 2XM 306) | typecheck ✅ |
| 2026-08-10 | F2 | `human-test` escenario avanzado: X cost (Blaze X=2) validado por WS — `GAME_GET_AMOUNT` → `sendPlayerInteger` → objetivo → pago {R}{2} en 3 pasos | 39 pass, Blaze completo; faltan Arc Trail/Boros Charm/Ballista |
| 2026-08-10 | F2 | **Bug race de prioridad en tests**: `GAME_SELECT` perdido en huecos entre esperas (partida bloqueada) → estado `openPriorityEvent` (registrar al recibir, limpiar solo si la acción resuelve ese diálogo) | human-test avanza al flujo avanzado |
| 2026-08-10 | F2 | **Bug mano llena**: "Select a card to discard" sin responder bloquea la partida → `autoDiscard` en human-test (descarta Mountain/Plains/primera) | recién aplicado, pendiente verificación |
| 2026-08-10 | F2 | **Lecciones de pago**: tras pagar maná hay que pasar prioridad para que el stack resuelva (`passPriority`); X=2 necesita 3 tierras sin girar (`ensureLands`); la IA de 60 tierras pierde ~turno 10-15 → engrosar su mazo | pendiente: mazo IA 50+50 |
| 2026-08-15 | F2 | **Cierre de Fase 2 verificado**: mazo IA del human-test a 50+50, `autoDiscard` preferente de tierras, escenario avanzado completo (Blaze X=2, Arc Trail, Boros Charm, Ballista X=4) | `human-test` 83 checks TODO PASS ✅ |
| 2026-08-15 | F2 | **`e2e/spells.spec.ts` reescrito**: 4 tests seriales independientes (Blaze/Arc Trail/Boros/Ballista) con retries y presupuesto propios | e2e completo 6/6 (varias tandas) ✅ |
| 2026-08-15 | F2 | **Clics E2E por estado real del canvas**: hook `window.__mageScene` en `BoardScene` (posiciones + playables en vivo); el test clica por UUID real, reintenta si el canvas va por detrás, y comprueba jugabilidad contra la app (no contra el `canPlayObjects` intermitente de los frames) | fallo "clic cayó en la carta equivocada" (Boros→Ballista) eliminado ✅ |
| 2026-08-15 | F2 | **Pago de maná con color**: `payMana` parsea "Pay {R}{W}…" y clica fuentes del color pedido (una Plains no paga {R} y el servidor re-pregunta en bucle); cursores con lookback (el `hasMyPriority` puede llegar durante el clic) | "Pay {R}{W}"→"{R}" resuelto sin re-asks ✅ |
| 2026-08-15 | F2 | **Modo de Boros Charm y "Cast" de Ballista**: el servidor los manda como `GAME_CHOOSE_ABILITY` (no `GAME_CHOOSE_CHOICE` como asumía el test); assert de vida solo del oponente (la IA con Bolts dabaña al humano durante la resolución) | Boros/Ballista verdes ✅ |
| 2026-08-15 | F2 | **Mazo IA benigno** (`AI_OPPONENT_DECK` 50/50) en `LobbyScreen.joinAi`: la IA con 16 Bolts mataba al humano en partidas largas → flakes sistemáticos en spells E2E | e2e de 6.5-7 min a 3.9-5.3 min y sin muertes por IA ✅ |
| 2026-08-15 | F2 | **Suite completa** (unit 67, coverage, typecheck, build, java, self-test, human-test 83, e2e 6) | 7/8 + self-test flake WATCHGAME conocido (pasa al reintento 15/15) |
| 2026-08-15 | F2 | Hallazgo de contrato: `options.chosenTargets` llega `[]` en objetivos separados (Arc Trail = 2 `Target`); el hint "ya elegidos" y el ✓ verde solo aplican a un único `Target` multi-elección | documentado en sección 7 |

## 10. Notas de ejecución

- Regla: al terminar cada paso, actualizar sección 6 (checklist) y sección 9 (log) con lo real.
- Verificación siempre contra el entorno real (servidor local + proxy), nunca "en teoría".
- Documentar cualquier descubrimiento en la sección 5 (lecciones), aunque no sea de Fase 0.
