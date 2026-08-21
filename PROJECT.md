# Proyecto: Cliente moderno para XMage (web) — Documento maestro de trabajo

> Este documento es la **fuente de verdad del proyecto**: roadmap, fases, decisiones y
> estado real verificado. Se actualiza en cada paso de trabajo, no solo al final de fases.
> Última actualización: 2026-08-21 (conexión persistente, resolución de tokens/habilidades, rediseño de pila LIFO y cartas multicara)

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
- **Cliente web (`web/`)**: app React + PixiJS. Se comunica solo con el proxy,
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

### Estructura de código (`web/`)

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
| Unitario (lógica pura) | vitest | `npm --prefix web run test` | ✅ 60 tests |
| Cobertura de núcleo web | vitest/v8 | `npm --prefix web run test:coverage` | ✅ 60 tests · 88.2% statements · 91.1% lines |
| Typecheck | tsc | `npm --prefix web run typecheck` | ✅ |
| Build producción | vite | `npm --prefix web run build` | ✅ |
| Proxy Java | Maven/JUnit 5 | `mvn -pl Mage.Proxy -am test` | ✅ 14 tests del proxy |
| E2E headless (proxy real) | `scripts/self-test.mjs` | `node scripts/self-test.mjs` | ✅ 15 checks |
| E2E jugador humano vs IA | Node/WebSocket | `node scripts/human-test.mjs` | ✅ 26 checks (partida completa: mulligan → tierra → Bolt → objetivo → maná → resolución) |
| E2E navegador (login→lobby→demo→tablero) | Playwright | `npm --prefix web run test:e2e` | ✅ re-ejecutado tras F2 (2026-08-09) |

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
- Evidencia: `web/e2e/shots/targeting-bolt.png` (canvas durante el targeting;
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
| 2026-08-16 | F2 | **Oponente Simulado (asiento `SIM`) en el proxy**: `SimPlayer.java` (sesión propia de servidor; el servidor oficial ve un humano normal). Juega tierras, lanza hechizos pagables al oponente, ataca "All attack", bloquea, responde mulligan/descartes/asks. El web lo pide con `playerTypes:['HUMAN','SIM']` + `simDecks`; la demo "IA vs IA" ahora es SIM vs SIM. `joinGame` automático en START_GAME (web y Sim) elimina los 10s de forced-join | java tests 18 ✅; unit 90 ✅; e2e combat 8s / full-flow 14s / targeting 25s ✅ |
| 2026-08-16 | F2 | **HumanHelper por WS** (`e2e/wshelper.ts`): conexión WS de Node al proxy con el mismo usuario; desarrolla tierras (1/turno, nunca durante pago de maná), pasa prioridades (fallback 1.5s por ventana main), responde descartes y asks. **Los e2e ya NO activan el auto-pase del web** (sus pases competían con la ventana de lanzamiento — flake raíz). Acciones frágiles por WS (lanzar, objetivo, maná); la UI verifica (diálogos, render, pageerrors). Timeouts cortos (15-30s) y sin retries: un fallo < 1 min | unit 90 ✅; typecheck ✅; combat/full-flow/targeting verdes |
| 2026-08-16 | F2 | **PENDIENTE — `e2e/spells.spec.ts` no verde**: el flujo llega a lanzar el Blaze por WS, X=2, targeting y target por WS; fallan el pago de maná (asks duplicados / primer pago que no registra) y la resolución (hechizo en el stack o cancelado); en un fallo la partida terminó con victoria del Sim sin causa clara en logs. Caso abierto completo con evidencia en la skill `mage-e2e-sim`; el agente `e2e-spells` está diseñado para cerrarlo | pendiente (unit/typecheck verdes) |
| 2026-08-16 | Arq | **Piloto de tests deterministas (FakeServer + modo dual)**: `web/fixtures/fake.ts` (contrato WS de types.ts, tipado), `scenarios/fullFlow.ts` (demo espectador con timeline), `e2e/dual.ts`+`fixtures.ts` (modo dual `E2E_BACKEND`), `playwright.config.ts` (webServer solo en fake), scripts `test:e2e:fake|real`. **`full-flow.spec.ts` verde en 9s con el fake, sin servidor ni proxy**; el mismo spec corre en real (`test:e2e:real`). Schema zod `fixtures/schema.ts` + tests (anti-deriva); component tests de FeedbackDialog (jsdom+Testing Library) | unit 95/95 + typecheck ✅; fake full-flow 9s ✅ |
| 2026-08-16 | Arq | **Aserciones deterministas en la UI**: `BoardScene` publica `__mageScene.targeting` (active/source/ids/chosen); `targeting.spec.ts` y `full-flow.spec.ts` sustituyen los byte-diffs del canvas por aserciones de estado de escena (screenshot solo como evidencia) | typecheck ✅ |
| 2026-08-16 | F2 | **Bug real del test (pago de maná)**: `nextManaSource` era de lectura única — si el ask llegaba con la vista stale (fuentes tapadas en frames viejos) lanzaba "sin fuente de maná". Fix: reintento de lectura (20×150ms) en `spells.spec.ts` y `targeting.spec.ts` | diagnóstico con dump `/tmp/e2e-payMana-fallback-*.jsonl` |
| 2026-08-16 | F2 | **Bug real del test (targeting)**: el "siguiente ask de maná" se buscaba con lookback `parsedLen-10` que re-matcheaba el MISMO ask y pagaba una 2ª fuente (tierras todas giradas). Fix: cursor estricto (`manaIndex+1`) como en spells | dump de frames msgId 56-60 |
| 2026-08-16 | Arq | **Bug real del stack (watcher congelado)**: el servidor manda al watcher de la demo ~48 `GAME_UPDATE_AND_INFORM`/s con el GameView en turno 1, pisando en el store los GAME_UPDATE reales → la demo en modo real no avanza. Detectado por el modo real (red anti-deriva); el fake lo emula correctamente | evidencias: dump de la página (turn=1 constante) + proxy.err.log |
| 2026-08-16 | F2 | **Diagnóstico del caso spells (parcial)**: "Sim is the winner" = artefacto del retry/session-swap (el intento 2 re-une la mesa vieja y la partida antigua concede); el pago en sí funciona cuando hay tierras. Falta cerrar la resolución (partida termina con victoria del Sim justo tras el ask de maná en TODOS los runs → sospecha de bug del SimPlayer; dominio de `e2e-spells`/`xmage-contract`) | documentado en la skill `mage-e2e-sim` |
| 2026-08-16 | F2 | **Bug 2 RESUELTO (victoria prematura del Sim)**: la causa NO es el SimPlayer sino el **estado degradado del servidor** (sesiones huérfanas de proxies muertos acumuladas → el servidor desconecta/concede). Fix operativo: **reiniciar servidor+proxy JUNTOS** (reiniciar solo el proxy deja el primer login colgado — el patrón se reprodujo 3 veces). Combinado con los fixes de test (reintento de `nextManaSource` + cursor estricto), **targeting y spells 4/4 en verde en modo real** (verificado ×2) | targeting 12.9s ✅; spells 4/4 (1.3m) ✅ |
| 2026-08-16 | F2 | **Bug 1 DIAGNOSTICADO (demo/watcher congelada, xmage-contract)**: NO es vista stale — **la partida demo se congela de verdad en turno 1** en un bucle infinito de prioridad: `HumanPlayer.priority()` (`Mage.Server.Plugins/Mage.Player.Human/.../HumanPlayer.java:1371-1397`) hace `continue` en `while(canRespond())` cuando `passWithManaPoolCheck()` (línea 2915) devuelve false (maná en pool + `confirmEmptyManaPool`), re-disparando GAME_SELECT eternamente (1931 observados). El `infiniteLoopCounter` de `GameImpl.checkInfiniteLoop` solo protege bucles de stack, no este. Cada re-fire genera un `GAME_UPDATE_AND_INFORM` al watcher (flood ~48/s) | evidencia en `proxy.err.log` (1931 SELECTs idénticos `hand=7 lands=1`) |
| 2026-08-16 | F2 | **Fix defensivo aplicado (3c)**: guardia monotónica en `store.ts` (`isOlderThanCurrentGame`): una vista entrante estrictamente anterior (turno/paso) del mismo juego ya NO pisa el estado → el flood de vistas stale no congela la UI. Mismo turno+paso siempre reemplaza (cartas movidas). 3b (dedupe de AND_INFORM en el proxy) NO aplicado: dedupear por vista descartaría mensajes legítimos del log. **3a (fix del bucle en `HumanPlayer.priority`) NO APLICABLE**: el mecanismo real NO es el `while(canRespond())` (ver fila siguiente) | unit 97/97 + typecheck ✅; fake 9s ✅; targeting/spells real ✅ |
| 2026-08-16 | F2 | **Bug 1 RESUELTO — causa raíz REAL del rechazo del Bolt (trace del servidor)**: NO es bug del servidor. `SimPlayer.tryCast` enviaba el UUID del Bolt aunque sus tierras sin girar fueran ISLANDS → el servidor lo rechaza correctamente (`canPlay=false` con `manaFull=[{U}{U}]`, `canPay` no cubre {R}); el cast se "traga" en `priority()` y el juego re-otorga prioridad con la MISMA vista → GAME_SELECT infinito (flood ~48/s). **Fix en SimPlayer: `tryCast` color-aware** (`colorsOf` + `canProduceColors`): solo castea si hay tierras sin girar que producen TODOS los colores del coste. El dedup por firma queda como defensa. Verificado: la demo castea y resuelve Bolts (GAME_TARGET → PLAY_MANA → stack) | trace `[TRACE-PLAYABLE]` en server.out.log; demo castea ✅ |
| 2026-08-16 | F2 | **Fix H2 aplicado (SimPlayer)**: `tryCast` NO re-envía el cast si la firma `(turno, paso, tamaño de mano, tierras sin girar)` no cambió desde el último intento → pasa y la partida avanza. + Instrumentación permanente: log del msg del GAME_ASK, respuesta booleana, y UUIDs/colores de tryCast (INFO) + `full-flow.spec.ts` anexa `select-dump` al error-context. **Flake residual de targeting (raro, tras `restart all`)**: el GAME_TARGET llega al web pero el diálogo no renderiza; no se reprodujo en 6+ runs consecutivos; el assert ahora muestra `pageerrors` para diagnóstico | real full-flow ✅; targeting ✅ ×6; spells 4/4 ✅; unit 97/97; typecheck; fake 9.3s; java 99+16+18 ✅; self-test ✅; human-test ✅ |
| 2026-08-17 | F2 | **E2E modulares por funcionalidad (Fases A+B+C)**: librerías comunes en `web/e2e/support/` (frames DSL, startGame→GameSession, game-screen poms, scene/canvas, withFakeServer), specs reducidos (spells ~914→~190 líneas, setup duplicado ×6 → 1), y **escenarios fake para spells/targeting/combat** con el mini-motor `fixtures/scenarios/humanGame.ts` (partida humana vs Sim compartida entre página y helper vía broadcast del FakeServer, escenario por servidor). **La suite completa corre en fake sin stack (~56s) y en real (contrato)**. Fixes de diseño encontrados: ids de mano únicos (colisión de UUIDs), battlefield como Record (el pago por índice de array rompía el maná), helper sin responder el mulligan (el auto-keep del web ya lo hace; un 2º false pasa la prioridad y pierde la ventana — flake de targeting en real). Tags por dominio (`@spells/@targeting/@combat/@fullflow`) + scripts `test:e2e:spells|targeting|combat|fullflow` | fake 7/7 ✅ 56s; real 7/7 ✅ 2.0m; unit 97/97; typecheck |
| 2026-08-17 | F2 | **Higiene de docs**: la skill `mage-e2e-sim` y el agente `e2e-spells` pasan de "caso abierto" a estado real (spells cerrado 4/4 real+fake, flake de targeting = doble-false del mulligan); AGENTS.md sin marcas de pendiente obsoletas | commit `5e821c2281` |
| 2026-08-17 | Up | **Actualización a XMage 1.4.61-V1** (upstream magefree/mage, tag `xmage_1.4.61V1`, 358 commits de desfase desde 2026-07-29): `git remote add upstream` + merge del tag (limpio, sin conflictos; nuestros 2 parches de test mode en `TableController.java` se conservan: upstream no los tocó). Subido `Mage.Proxy` a parent 1.4.61 (jar `mage-proxy-1.4.61.jar`, `dev.mjs` actualizado) y `DEFAULT_SERVER_HOST` → `beta.xmage.today` (server oficial actual; `beta.xmage.de` estaba obsoleto). Recompilado server+plugins+proxy | suite completa **8/8 PASS** (self-test/human-test/e2e con el server 1.4.61) ✅; e2e real **7/7 PASS** ✅ |
| 2026-08-17 | Up | **Smoke de viabilidad contra el server oficial (beta.xmage.today:17171, 1.4.61-V1)**: probe WS por el proxy → login OK, `getServerInfo` 1.4.61-V1, mesa con 2 asientos SIM (SimPlayer conectan al server real y se unen), `watchTable`/`WATCHGAME`, `GAME_INIT` (2 jugadores) y `GAME_UPDATEs` fluyendo → **SMOKE PASS**. Hallazgos: (a) el login anónimo al server público es **intermitente** (a veces el server manda `SHOW_USERMESSAGE` de news antes de completar el login y `connectUser` falla sin mensaje; reintentar funciona); (b) el login del web usa UN solo host para el WS del proxy y el server destino → para jugar contra servers remotos desde el navegador hay que separar esos campos (pendiente, Fase 3) | commit `0fed93f4e9` (merge) + `7e8dd8e4bb` (ajustes) |
| 2026-08-17 | Fx | **Fix: handshake buffer para `SHOW_USERMESSAGE`** (`ProxyClient.java`): el server XMage puede enviar callbacks de tipo `MESSAGE` (`SHOW_USERMESSAGE`, `SERVER_MESSAGE`) **antes** de que el RPC `connectUser` retorne y se invoque `connected()`. El cliente web recibía esos mensajes antes del evento `connected`, rompiendo el flujo de login. Fix: buffer en `ProxyClient.processCallback()` que intercepta `MESSAGE` mientras `!connected` y los libera en orden tras `connected()`. El login anónimo al server oficial ya no debería fallar por este motivo | `ProxyClient.java` + recompilado `mage-proxy-1.4.61.jar`; suite completa PASS (unit/typecheck/build/java/self-test 5/5) |
| 2026-08-18 | Arq | **Rediseño UI del tablero (Fases 1–6 del doc de arquitectura)**: (1) **CSS Grid macro** en `GameScreen.css` (`.game` rows `auto 1fr`, `.game-body` cols `64px minmax(0,1fr) 280px`); canvas Pixi llena el `board-wrap` (`width/height:100%`). (2) **`computeLayout` completo** (`zones.ts`): cada bando ahora es `SideLayout{box,status,battlefield,bands,hand,piles}` con `BattlefieldBands{creatures,other,lands}` (tierras abajo en mi bando, arriba en el del oponente), pilas compactas `PileRects` y `splitBands()`; invariantes sin solape probadas en tests (status⊥battlefield, battlefield.bottom≤hand.top, pilas dentro del canvas, tamaños pequeño/grande). (3) **`board/layouts/`** (nuevo): `common.ts` (`CardTarget` + `layoutCardsInRow/Grid/Fan/Stack`), `handLayout`, `battlefieldLayout` (`bandLayout` + `battlefieldLayout` por `kind`), `stackLayout` — todos reciben un `Rect` y devuelven `CardTarget[]`. (4) **Clasificación** en `gameToScene.ts`: `permanentKind(perm)` por `cardTypes?.includes('Land'|'Creature')` → banda; `Placement` gana campo `band`; `group` (`myBattle`/`oppBattle`) se conserva para el routing de máscaras. (5) **Reflow genérico** en `BoardScene.render`: `reposition()` tweena (easeOutCubic 0.25s) cualquier carta viva cuyo objetivo cambió (no solo las de `zoneChanges`); el sistema de tweens ahora interpola `rotation`. (6) **`GameUIState`/`MageSceneState`** tipados en `board/scene.ts`; `__mageScene` sigue como global pero tipado, y `e2e/support/scene.ts` lo importa. (7) **Unificación e2e**: `e2e/support/canvas.ts` ya NO duplica la geometría (146/204 vs 120/168) — importa `computeZones`/`splitBands`/`bandLayout`/`handLayout` de `src/board/` (fuente única). `computeZones` y `gameToScene` conservan API aditiva (no rompen tests). | unit **122/122** ✅; typecheck ✅; build ✅; e2e fake **spells 4/4, targeting, combat, combat-human, best-of-n verdes** ✅ |
| 2026-08-18 | Fx | **Fix de test preexistente (no relacionado con el rediseño)**: el selector `getByText(/Partida/)` de `start-game.ts`/`full-flow.spec.ts` rompía porque el commit `e660b190c9 "mejorando interfaz"` (HEAD) eliminó el `<span class="game-title">Partida…` del header. Corregido a `getByTestId('game-status')` (ya usado en `full-flow`). **Fallos preexistentes en HEAD** (verificados con `git stash` del rediseño, siguen en `master`): `full-flow`/`defeat`/`best-of-3`/`best-of-5` fallan por estado de partidas largas contra el servidor local (no por el rediseño — pasan en HEAD también) | diagnosticado; no bloquea el rediseño |
| 2026-08-20 | Arq | **Refactor Track A: store.ts split** en 7 módulos (`state.ts` atom, `persistence.ts` localStorage, `gameUtils.ts` pure fns, `eventHandler.ts` protocol handler, `gateway.ts` connection lifecycle, `selectors.ts` React hooks, `actions.ts` state actions) + barrel `store.ts` (re-exports). Clave: `consolidatePlayables` y `isOlderThanCurrentGame` ahora son funciones puras (reciben state como parámetro en vez de leer la variable global). `handleEvent` lee `getState()` tras cada `setState()` cuando el estado puede haber cambiado durante la misma ejecución (fix del bug GAME_PLAY_MANA → `playableObjectIds` no veía el feedback actualizado). **0 consumers need import changes** — el barrel re-exporta todo | unit 75/75 ✅; typecheck ✅; 0 archivos consumidores modificados |
| 2026-08-20 | Arq | **Refactor Track C: humanGame.ts** — constantes y tipos extraídos a `humanGameConstants.ts`, envelope helpers añadidos (`emitUpdate`/`emitSelect`/`emitUpdateAndSelect`) eliminando el patrón repetido de 2 líneas. Los 9 archivos escenario (spells, targeting, combat, cross-zone, bestOf3/5, etc.) no necesitan cambios gracias a re-exports | unit 75/75 ✅; typecheck ✅; 0 escenarios modificados |
| 2026-08-20 | Arq | **Refactor Track B: Java→TS codegen pipeline** — `schema/contract.schema.json` (27 definiciones del wire format JsonUtil), `scripts/gen-types.mjs` (generador TS desde JSON Schema con soporte para $ref, allOf inheritance, anyOf nullable, Record<string,T>), `types.generated.ts` (307 líneas generado), `types.ts` reestructurado como barrel (vue types → generated, proxy-specific types = locales). `npm run gen-types` + `--validate` para CI | typecheck ✅; unit 75/75 ✅; `--validate` PASS ✅ |
| 2026-08-20 | Fix | **Combate interactivo roto (web)**: al entrar a combate con criatura, el diálogo de declaración de atacantes/bloqueadores era un **modal** (`feedback-backdrop`) que tapaba el tablero → no se podían clicar criaturas. Y tras atacar, el juego se clavaba en **DECLARE_BLOCKERS (Bl)**: el servidor re-envía a veces un `possibleAttackers` obsoleto en ese paso, y la web lo interpretaba como ventana de declaración → mostraba el botón "Atacar con todos" (alpha) en Bl y el Pass seguía deshabilitado (`hasPriority` poco fiable). **Fixes**: (1) declaración de combate como **barra flotante NO modal** (igual que targeting/maná) → tablero clicable; (2) la ventana de combate solo se abre en el paso correcto (`possibleAttack...`→DECLARE_ATTACKERS, `possibleBlockers`→DECLARE_BLOCKERS) en `parseFeedback` y `combatFromSelect` → en Bl el atacante solo pasa prioridad, sin diálogo; (3) `CombatState.selecting` solo `true` con ventana activa, resto del combate en modo "solo visualización"; (4) `maybeAutoPass` bails solo si `combat.selecting`; (5) **Pass habilitado en nuestro turno** (`me.isActive && !feedback`) además de `hasPriority`; (6) resaltado visual de criaturas seleccionables/elegidas (`combat-selectable`/`combat-chosen`). | unit 75/75 ✅; typecheck ✅; build ✅ |
| 2026-08-20 | Fix | **E2E de combate humano (fake) 4/4 verde + regresión `start()` del FixtureServer**: añadidos tests de unidad (`parseFeedback` step-gating, `deriveCanPass`, transiciones de `combat` en `store`, barra no-modal en `FeedbackDialog`) y specs e2e `combatHumanAttackBlockersScenario` + `combatHumanAlphaScenario` (Bl sin diálogo de atacar + Pass avanza; "Atacar con todos" → `sendPlayerString('special')`). **Bug encontrado**: el commit `7f1e4b1a69 "refactor and ui fixes"` borró el cuerpo de `HumanGame.start()` dejando la llamada `this.start()` en `startMatch` → TODAS las e2e humanGame (spells/targeting/combat/full-flow/cross-zone/best-of/defeat) morían en `game-status` porque el juego nunca arrancaba (helper conectaba, pero no llegaban START_GAME/GAME_INIT). Restaurado `start()` (emite START_GAME/GAME_INIT/GAME_SELECT) = copia exacta de `e660b190c9`. `combat-human` 4/4 en fake (~10s). **Nota**: los fallos de `best-of-3/5`, `cross-zone`, `defeat`, `spells-Walking-Ballista`, `targeting` son preexistentes (ver fila 2026-08-18: fallan en HEAD/master por estado de partidas largas, NO por el trabajo de combate ni por la restauración de `start()`). | vitest **104/104** ✅; typecheck ✅; build ✅; e2e combat-human **4/4** ✅ |
| 2026-08-21 | F2/F3 | **Conexión persistente y reconexión limpia (proxy + web)**: (1) Temporizador con periodo de gracia de 60s en `ProxyClient.java` (`DISCONNECT_GRACE_PERIOD_SECS = 60`) al cerrarse las pestañas WS para evitar desconexiones accidentales en F5/recargas. (2) Cancelación del temporizador en reconexión o comando `disconnect` explícito. (3) `persistence.ts` guarda `activeGameId` y rol (`player`/`watcher`) en `localStorage` con expiración automática de 3h. (4) Al recargar (F5), `App.tsx` y `gateway.ts` re-conectan automáticamente en segundo plano restaurando la vista (Lobby, Partida en juego o Espectador). (5) Limpieza en `END_GAME_INFO.matchOver` y `reset()`. | vitest **132/132** ✅; java 18/18 ✅; unit + persistence tests ✅ |
| 2026-08-21 | F2/F3 | **Resolución de arte para Tokens y Habilidades**: (1) Búsqueda multinivel en Scryfall para tokens (`/cards/named?exact=...&set=t{set}`, fallback a token genérico, y búsqueda por nombre). Insignia dorada `TOKEN` en permanentes. (2) Extracción inteligente de la carta fuente para habilidades disparadas/activadas (`getSourceCardName` / `getSourceCard` en `cardImages.ts`), extrayendo nombres legendarios complejos (ej. *Cloud, Midgar Mercenary*) incluso cuando XMage envía `name: "Ability"`. (3) Soporte para cartas multicara (MDFCs, Aventuras, Split, Transform) con pestañas interactivas de cambio de cara en `CardPreview.tsx`. | vitest **140/140** ✅; typecheck ✅; build ✅ |
| 2026-08-21 | F2/F3 | **Rediseño visual de la Pila (Stack) en cascada LIFO**: la pila ahora renderiza todos los hechizos y habilidades activos de arriba a abajo (el más reciente / siguiente en resolver arriba con el botón `Resolver`, los subyacentes visibles en tiras ordenadas con miniatura, nombre de fuente, tipo y posición `#pos`). Hover individual sincronizado con `CardPreview` y targeteo clickeable por elemento. | vitest **145/145** ✅; StackZone.test.tsx ✅; build ✅ |
| 2026-08-21 | F2/F3 | **FloatingCardPreview & estabilización de hover (Mano y Battlefield)**: (1) Previsualización flotante HD grande (270x378px) con borde dorado, sombras y badges (P/T, contadores, token) directamente en el tablero (a la derecha en permanentes, hacia arriba en la mano). (2) Contenedor de slot fijo (`hand-card-slot`) y `pointer-events: none` que eliminan por completo el bucle de parpadeo / temblor de hover en los bordes. (3) Debounce suave de 50ms en unhover. | vitest **149/149** ✅; FloatingCardPreview.test.tsx ✅; build ✅ |
| 2026-08-21 | F2/F3 | **Barras de acción no-modales (GAME_PLAY_MANA/GAME_TARGET) & FormattedText (símbolos de maná y entidades HTML)**: (1) `GAME_PLAY_MANA` y `GAME_TARGET` migrados a barras de acción flotantes no-modales (`.action-prompt-bar` / `.mana-prompt-bar`) sobre la mano, manteniendo el campo de batalla 100% visible e interactivo para pagar y targetear. (2) Componente `FormattedText` que decodifica entidades HTML (`&iexcl;`→`¡`), limpia etiquetas y hashes internos de XMage (`[373]`), y transforma `{R}`, `{W}`, `{U}`, `{B}`, `{G}`, `{C}`, `{1}`, `{T}` en insignias gráficas circulares de maná MTG. Aplicado en diálogos, Game Log y Chat. | vitest **154/154** ✅; FormattedText.test.tsx ✅; FeedbackDialog.test.tsx ✅; build ✅; java ✅ |
| 2026-08-21 | Fix | **Ciclo de vida de Feedback, limpieza de GAME_PLAY_MANA y activación de Pass/Resolver**: (1) En `eventHandler.ts`, `GAME_SELECT` limpia de forma determinista cualquier diálogo o barra anterior que ya haya concluido (pago de maná, target o combate anterior). (2) Botón `Pass` en la barra superior habilitado con `canPass` (activo en nuestro turno o con prioridad). (3) Botón `Resolver` en la Pila habilitado para ceder prioridad (`sendPlayerBoolean(false)`) y resolver el hechizo/habilidad superior del stack. | vitest **154/154** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | F2/F3 | **Modernización y reorganización integral de la UI (Estilo MTG Arena)**: (1) **Gran Botón de Acción (`ActionButton.tsx`)**: botón principal reactivo en el panel inferior derecho (`Resolver` / `Pasar turno` / `Declarar atacantes` / `Esperando`) con atajo de teclado `Espacio` global. (2) **Barra de fases unificada (`PhaseBar.tsx`)**: eliminación de la fila duplicada de stops; stops interactivos integrados directamente en cada badge de fase (con indicadores luminosos para tu turno y el turno rival). (3) **Placas de jugador con anillo de prioridad (`PlayerInfoBar.tsx`)**: avatar circular con halo pulsante de prioridad (`has-priority`), aviso de vida crítica y badges de estado. (4) **Panel lateral por pestañas (`GameScreen.tsx`)**: selector [ Log de Partida ] y [ Chat ] optimizando el espacio vertical. (5) **Tablero de batalla inmersivo (`GameBoard.css`)**: degradado radial oscuro estilo Arena y divisor central con joya reflectante. | vitest **154/154** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | Fix | **Deselección de criaturas atacantes/bloqueadoras en combate**: `GameBoard.tsx` y `PlayerZone.tsx` ahora verifican tanto `combatSelectable` como `combatChosen` (`combatSelectable.includes(id) || combatChosen.includes(id)`), permitiendo clics de toggle bidireccional (seleccionar y deseleccionar criaturas individualmente sin importar si el servidor las remueve de `possibleAttackers` al elegirse). | vitest **154/154** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | Fix | **Criaturas giradas en combate & protección de barra espaciadora en pagos de maná**: (1) En `gameUtils.ts` y `eventHandler.ts`, `combatFromSelect` ahora extrae de forma exhaustiva atacantes/bloqueadores de `game.combat`, del campo de batalla (`perm.attacking`, `perm.tapped`) y de `options.chosen`, asignándoles borde carmesí de atacante activo (`.card-slot.tapped.chosen`) y manteniéndolos 100% clickeables para alternar selección. (2) `eventHandler.ts` cierra automáticamente cualquier barra de `GAME_PLAY_MANA` en cuanto el hechizo entra en el stack (`GAME_UPDATE`/`GAME_SELECT`). (3) La barra espaciadora solo pasa prioridad cuando no hay diálogos bloqueantes de pago de maná/targeting abiertos. | vitest **154/154** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | F2/F3 | **Corrección de proporciones verticales, sin solapamiento y rediseño de pilas de recursos**: (1) **Eliminación total de solapamiento**: filas de `PlayerZone` y `OpponentZone` reestructuradas con proporciones fluidas (`0.85fr / 1fr / 1.2fr`), garantizando que las tierras, criaturas y la mano tengan su espacio limpio sin desbordar ni pisarse. (2) **Alineación de bordes**: vida y recursos del rival anclados limpiamente al borde superior; vida, mano y recursos del jugador anclados al borde inferior. (3) **Ampliación de pilas de recursos (`ResourceBar.css`)**: biblioteca, cementerio, exilio y pool de maná aumentados a proporciones de carta (~68x96px) con números grandes (20px) en relieve y badges legibles. | vitest **154/154** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | Fix | **Alineación superior de recursos del rival & apertura de pool de maná hacia abajo**: (1) En `ResourceBar.css` y `OpponentZone.css`, `.resource-bar.opp` y sus pilas ahora están ancladas estrictamente a la parte superior (`align-items: flex-start`), quedando a la misma altura que la placa de vida y mano del oponente. (2) El menú desplegable del pool de maná del rival ahora se abre hacia abajo (`top: 48px; bottom: auto`) para no salirse de la pantalla. | vitest **154/154** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | Fase A1 | **Flechas visuales de combate y targeting SVG (`CombatArrowsOverlay.tsx`) & Targeting de Jugador**: (1) **Overlay SVG con curvas Bézier y filtros de resplandor**: dibuja flechas animadas con flujo direccional (`stroke-dasharray`) carmesí para atacantes $\to$ defensor, cian para bloqueadores $\to$ atacantes, y doradas para hechizos/habilidades en la pila $\to$ objetivos. (2) **Glow y animación de targeting en avatar de jugador (`PlayerInfoBar.css`)**: pulso dorado en relieve (`playerTargetPulse`) y atributo `data-player-id` para permitir apuntar hechizos (ej. *Lightning Bolt*) a jugadores con feedback visual inmediato. (3) **Identificadores en la pila (`StackZone.tsx`)**: atributo `data-card-id` conectado a cartas y habilidades de la pila para trazar flechas de objetivo desde el stack. | vitest **156/156** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | F2/F3 | **Paridad completa de información en partida (HUD, cartas y permanentes)**: (1) **Reloj de prioridad y victorias de match (`PlayerInfoBar.tsx`)**: temporizador numérico activo (`04:30`) con alerta roja `<30s`, gemas de victorias Bo1/Bo3/Bo5 (`[● ○]`) y badges para contadores de jugador (Veneno, Energía, Rads, Experiencia, Tickets). (2) **Carta superior de la biblioteca revelada (`ResourceBar.tsx`)**: dibuja la carta real (`player.topCard`) sobre la biblioteca con icono `👁️` cuando hay efectos activos como *Courser of Kruphix* o *Future Sight*. (3) **Mareo de invocación exclusivo para criaturas y tipos de bocabajo (`CardSlot.tsx`)**: espiral flotante `🌀` acotada exclusivamente a permanentes de tipo criatura que entraron este turno sin prisa (excluyendo tierras), y badges `Morph`, `Manifest`, `Disguise`, `Cloak` en cartas bocabajo. (4) **Anidación de Auras y Equipos (`PlayerZone.tsx` / `OpponentZone.tsx`)**: permanentes con `attachments` muestran sus auras/equipos anidados en cascada directamente sobre la criatura huésped. | vitest **156/156** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | Fase A2 | **Zona de Comandante, Emblemas y Casillas Especiales (`CommandZone.tsx`)**: (1) **Comandantes en Zona de Comando**: Renderiza los comandantes desde `player.commandList` con corona dorada `👑`, indicador de impuesto acumulado (*Commander Tax*: `+{tax}` según `castCount`), estado jugable/targeteable y casteo directo con un clic. (2) **Pila de Emblemas de Planeswalkers**: Renderizado en cascada de emblemas activos (`helperCards` / `myHelperEmblems`) con badge numérico. (3) **Integración en tablero**: Montado en `pz-commander` y `oz-commander` con colapso limpio cuando no hay comandantes ni emblemas. | vitest **159/159** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | Fase A3 | **Diálogo visual de Scry / Surveil / Reordenar Biblioteca (`LibraryOrderDialog.tsx`) & Cartas Reveladas**: (1) **Diálogo interactivo de Scry & Surveil**: Interfaz modal estilo Arena dividida en dos zonas: *"⬆️ En la parte superior de la biblioteca"* (con reordenación secuencial `◀` / `▶` para definir el orden exacto de robo) y *"⬇️ En el fondo / ☠️ Al Cementerio"* (para cartas descartadas o enviadas al fondo). Acciones rápidas "Todas arriba", "Todas al fondo/cementerio" y botón de confirmación con conteo. (2) **Cartas Reveladas de la mano del rival (`OpponentZone.tsx`)**: Las cartas conocidas de la mano del oponente (`game.revealed` / `game.opponentHands`) se muestran boca arriba con su ilustración y coste real, manteniendo boca abajo con el dorso únicamente las cartas no reveladas. | vitest **165/165** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | Feature | **Timeline / Feed Visual de Acciones en Vivo (`ActionFeed.tsx` & `gameEventParser.ts`) & Activación de Logs de XMage**: (1) **Suscripción de chat y eventos de partida en vivo (`eventHandler.ts`)**: Suscripción automática a `gameChatId` (`joinChat`) y captura de mensajes de reglas de `GAME_UPDATE_AND_INFORM`, `GAME_INFORM` y `GAME_INFORM_PERSONAL`. (2) **Parser de eventos estructurados (`gameEventParser.ts`)**: Transforma mensajes crudos de XMage en acciones tipadas (lanzamientos de hechizos, tierras, ataques, bloqueos, daño `-N ❤️`, cambios de vidas `+N 💚`, robos, descartes, habilidades y cambios de turno). (3) **Tarjetas visuales con miniatura e interactividad (`ActionFeedCard.tsx`)**: Renderiza tarjetas con el recorte de arte real de la carta, badges de daño/vida en relieve, objetivos señalados y hover conectado al inspector de cartas. (4) **Contenedor con scroll automático y alternador de vista (`ActionFeed.tsx`)**: Selector para alternar instantáneamente entre *🎨 Visual* y *📜 Texto*. | vitest **183/183** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | Fix | **Aislamiento estricto de partida activa & bloqueo de paquetes residuales (`gameUtils.ts` & `eventHandler.ts`)**: Corregido el bug donde paquetes demorados de partidas o sesiones anteriores (`objectId !== s.gameId`) sobreescribían el estado del juego activo en el store, provocando que la UI parpadeara mostrando turnos o tableros de partidas previas antes de volver a la actual. `isOlderThanCurrentGame` y `handleEvent` ahora descartan estrictamente cualquier evento con `objectId` ajeno mientras haya una partida en curso. | vitest **184/184** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | Fix | **Recuperación robusta de sesión, re-login y eliminación de bucles (`gateway.ts`, `App.tsx`, `LoginScreen.tsx`)**: (1) Limpieza automática de partidas finalizadas en `GAME_OVER` y captura de errores al reconectar/reunirse a partidas obsoletas (`joinGame.then(!ok => clearActiveGame())`). (2) Manejo ampliado de sesiones activas concurrentes (`already logged in` / `already connected`). (3) Eliminación del parpadeo del formulario de login al recargar mediante un splash visual con spinner de conexión suave. | vitest **184/184** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | Fix | **Parser de eventos reales de XMage & sufijos de zona/IDs de objeto (`gameEventParser.ts`)**: Corregido el parser para reconocer el formato nativo del motor XMage que incluye identificadores hexadecimales de objeto (ej. `[3f9]`) y sufijos de zona de casteo (ej. `from Hand`, `from Graveyard`), permitiendo que todos los lanzamientos de hechizos y jugadas de tierras se reconozcan y muestren sus cartas en el feed visual. | vitest **182/182** ✅; typecheck ✅; build ✅; java ✅ |
| 2026-08-21 | UI/UX | **Espacio completo para Feed/Log y Chat en panel lateral derecho (`GameScreen.tsx`, `GameScreen.css`, `GameChat.css`)**: Eliminado el panel estático de preview de cartas superior (`CardPreview`) que comprimía el feed/chat a una pequeña caja de 200px. Ahora las pestañas *Feed / Log* y *Chat* ocupan el 100% de la altura vertical de la pantalla, con un ancho ampliado a 330px, permitiendo una lectura fluida y completa del historial de juego. | vitest **182/182** ✅; typecheck ✅; build ✅; java ✅ |

## 10. Notas de ejecución

- Regla: al terminar cada paso, actualizar sección 6 (checklist) y sección 9 (log) con lo real.
- Verificación siempre contra el entorno real (servidor local + proxy), nunca "en teoría".
- Documentar cualquier descubrimiento en la sección 5 (lecciones), aunque no sea de Fase 0.

