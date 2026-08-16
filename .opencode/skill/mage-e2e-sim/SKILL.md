---
name: mage-e2e-sim
description: Contexto completo de los E2E del Mage.Proxy con oponentes simulados (Sim) y helper WS. Úsalo al tocar o depurar Mage.Proxy/web/e2e (spells, targeting, combat, full-flow, wshelper), al investigar flakes de e2e, o al trabajar en el bot Sim del proxy (SimPlayer.java). Keywords: e2e, playwright, Sim, HumanHelper, wshelper, spells.spec, targeting.spec, combat.spec, full-flow.
---

# E2E con oponente Simulado (Sim) y helper WS

## Arquitectura (3 piezas)

1. **Bot Sim en el proxy** (`Mage.Proxy/src/main/java/org/mage/proxy/SimPlayer.java`):
   Oponente determinista con su PROPIA sesión de servidor (el servidor oficial ve un
   asiento humano normal). El web pide asientos `SIM` en `createTable` (`playerTypes:
   ['HUMAN','SIM']`), el proxy los convierte a `HUMAN` para el servidor y une un
   `SimPlayer` por asiento con su propia conexión. Mazos por asiento vía `simDecks`
   (array de decks en createTable); por defecto solo tierras. Reglas del bot:
   jugar 1 tierra/turno en su main phase; lanzar la primera criatura/instantáneo/
   conjuro pagable apuntando al oponente; atacar siempre ("All attack" =
   `sendPlayerString(gameId,"special")` en DECLARE_ATTACKERS con opción
   `specialButton`); bloquear siempre (1 bloqueador por select de DECLARE_BLOCKERS);
   mulligan = keep (`sendPlayerBoolean(false)`); descarte = primer id; "pass anyway"
   = true. El jar se reconstruye con `node scripts/build.mjs proxy` + `node scripts/ctl.mjs restart proxy`.
   **OJO**: tras reiniciar SOLO el proxy, el primer login suele colgarse (sesiones
   huérfanas del servidor) — reiniciar servidor+proxy juntos (`ctl.mjs restart all`).

2. **HumanHelper** (`Mage.Proxy/web/e2e/wshelper.ts`): conexión WS de NODE al proxy
   con el MISMO usuario que la página (el connect idempotente del proxy añade la
   conexión sin reiniciar la sesión). Juega el "desarrollo" del humano y mantiene la
   partida en movimiento. Reglas actuales (handleSelect):
   - solo actúa en GAME_SELECT con `hasPriority === true`;
   - main phase (isActive && PRECOMBAT_MAIN): jugar 1 tierra/turno si hay en mano y
     **NO durante un pago de maná** (`payingUntil` = última GAME_PLAY_MANA + 3s —
     jugar tierra o pasar a mitad de pago CANCELA el hechizo);
   - stack no vacío y fuera de pago → pasar (el hechizo resuelve);
   - main phase sin actuar → `armFallback()` (timer de 1.5s que pasa si la ventana
     sigue abierta y no se está pagando); **el timer es OBLIGATORIO**: sin él, tras
     un select sin respuesta no llegan más eventos y la partida se congela;
   - no-main → pasar al instante;
   - GAME_TARGET con "discard" → primer id (descarte); el resto de targets NO se
     responden (los responde el test);
   - GAME_ASK → false si mulligan (keep), true en el resto.
   Métodos públicos: `start()`, `stop()`, `waitGameId(timeoutMs)`, `playCard(id)`
   (= `sendPlayerUUID` — vale para lanzar cartas, elegir objetivo y pagar maná).
   Los helpers se registran en `cleanup.ts` (`registerHelper`) y se cierran en
   `test.afterEach`.

3. **Diseño híbrido WS+UI** (los e2e): las acciones "aburridas" y las que causan
   carreras van por WS (desarrollo, lanzar el hechizo, elegir objetivo, pagar maná);
   la UI se usa para lo que se VERIFICA (login, lobby, mesa, diálogos "Pagar maná"/
   "Elige objetivo"/X, render del canvas, pageerrors). **Los tests NO activan el
   auto-pase del web** (`Auto-pase de prioridad`): sus pases aleatorios compiten con
   la ventana de lanzamiento y la cierran (flake raíz histórico). El helper + sus
   reglas mantienen la partida en movimiento.

## Protocolo (verificado contra el servidor)

- Jugar carta/tierra de la mano: `sendPlayerUUID(gameId, cardId)`.
- Elegir objetivo de GAME_TARGET: `sendPlayerUUID(gameId, playerId/cardId)`.
- Pagar maná: cada ask GAME_PLAY_MANA se paga con `sendPlayerUUID(gameId, sourceId)`
  (un source por ask; el servidor re-pregunta mientras quede coste).
- X-cost: `sendPlayerInteger(gameId, X)` desde el diálogo GAME_GET_AMOUNT.
- Pasar prioridad: `sendPlayerBoolean(gameId, false)`. Mulligan keep: false.
- Ataque "All attack": `sendPlayerString(gameId, "special")`.
- **Los frames pueden llegar sin gameView o con canPlayObjects vacío/desactualizado**:
  usar SIEMPRE el último view (`lastGameView`) para leer battlefield/hand/maná.

## Trampas conocidas (lecciones de hoy — NO repetir la arqueología)

- **gameId del helper**: solo se setea con objectId de eventos `START_GAME`/`GAME_*`.
  CHATMESSAGE y JOINED_TABLE también traen objectId (chat/mesa) y contaminan el id.
- **X-cost jugable con X=0**: el servidor lista el Blaze como jugable aunque no haya
  maná (X=0). `waitPlayable` exige `minUntapped` (y `needPlains`) + MI main phase
  (isActive && PRECOMBAT_MAIN) + jugabilidad leída de los FRAMES (`playableInView`,
  no de la escena). Blaze necesita 3, Arc Trail 2, Boros 2 (+Plains), Ballista 8.
- **`hasPriority` en el gameView es poco fiable** (a menudo false en MI propio turno);
  la escena (`__mageScene`) va un render por detrás en partidas rápidas. No depender
  de ellos para acciones del test.
- **El auto-pase del web compite con las ventanas**: los tests lo desactivan.
- **Pagar/pasar durante un pago de maná cancela el hechizo**: el helper lo evita con
  `payingUntil`; el bucle de pago del test espera el SIGUIENTE ask (5s de timeout =
  pago completo), nunca sale por hasMyPriority.
- **Views stale en asks de maná**: `nextManaSource` usa `lastGameView`, con fallback
  a tierras básicas sin girar del battlefield por nombre (Mountain→R, Plains→W…).
- **Un comentario JSDoc sin cerrar comenta el resto del archivo** (bug real sufrido:
  funciones "no definidas" en runtime). Cuidado al borrar funciones con edit.
- **El retry del test mata la partida anterior**: cuando un intento falla, el connect
  del siguiente usuario hace `connectStop` de la sesión anterior → la partida vieja
  termina con victoria del rival (parece "el Sim gana" pero es el session swap).

## DIAGNÓSTICO 2026-08-16 (con dump /tmp/e2e-payMana-fallback-1786898096612.jsonl)

Análisis del run de las 18:34 (fallo "sin fuente de maná para Pay {1}"):

- **El pago en el intento 1 SÍ funciona cuando hay tierras**: 3 asks (Pay {R}{2} →
  Pay {2} → Pay {1}) pagados en orden, tierras tapándose una a una (msgId 74→77).
- **"Sim is the winner" es un artefacto del retry (session-swap) CONFIRMADO**: el
  intento 2 re-une la MISMA mesa (tableId ff7b326a) y hace joinGame con el gameId
  VIEJO del intento 1 (e3e612da); al conectar, la partida vieja concede al humano →
  Sim gana. El mensaje en el log de la UI llega DESPUÉS del segundo connect.
- **Bug real del test**: `payMana` (spells.spec.ts:474-514) selecciona la fuente de
  maná UNA sola vez por ask (`nextManaSource` sobre `lastGameView`, sin reintento):
  si entre el ask y la lectura llega un frame con las fuentes tapadas/stale,
  devuelve null → throw "sin fuente de maná". Todo lo demás del spec reintenta
  (isPlayable ×6, waitPlayable bucle, clickBattlefieldCard ×10) — el pago no.
- **FIX propuesto**: en el bucle de pago, reintentar la lectura (re-parsear frames +
  `nextManaSource` hasta N veces con ~100-200ms entre lecturas) antes de lanzar el
  error. Y en `cleanup.ts`/`afterEach`, hacer `quitMatch` + `removeTable` de la
  partida del intento fallido para que el retry no re-una la mesa vieja.
- `waitPlayable(minUntapped=3)` NO es el problema en este run (3 tierras en el
  campo al lanzar, vista msgId=71); el helper jugó la 3ª tierra en el turno 5.

## CASO ABIERTO (pendiente — objetivo del agente e2e-spells)

`Mage.Proxy/web/e2e/spells.spec.ts` (4 tests: Blaze, Arc Trail, Boros Charm, Walking
Ballista) NO está verde. Estado al cierre de la sesión anterior:

- El flujo llega a: lanzar por WS ✓ → GAME_GET_AMOUNT (X=2) ✓ → targeting (diálogo +
  canvas con reintentos de captura del pulso) ✓ → target por WS ✓ → GAME_PLAY_MANA.
- Fallos observados (por orden de aparición): (a) asks de maná duplicados (el primer
  pago de cada ask no registra — sospecha: source stale/tapada); (b) el pago no
  completa y el hechizo queda en el stack (`stack=1`) o se cancela; (c) la partida
  termina con "Player sim-... is the winner" en turno ~5 DURANTE el targeting/pago
  (el servidor no loguea la razón; sin daño ni deck-out posibles — verificar si es el
  session-swap del retry, la cancelación por pago incompleto + pase, o un timeout).
- Último fallo antes de parar: "timeout esperando GAME_PLAY_MANA (0)" tras el target
  por WS + la partida terminó con victoria del Sim.
- Los otros specs están verdes: combat (8s), full-flow (14s), targeting (~25s).

## ✅ DEMO CONGELADA RESUELTA (2026-08-16 noche) — full-flow real VERDE

**Causa raíz REAL (confirmada con trace del servidor `[TRACE-PLAYABLE]`)**: `SimPlayer.tryCast`
mandaba el UUID del Lightning Bolt aunque sus tierras sin girar fueran ISLANDs. El servidor
lo rechaza correctamente (`canPlay=false` con `manaFull=[{U}{U}]`: `canPay` no cubre {R}); el
cast se "traga" en `HumanPlayer.priority` (`getPlayableActivatedAbilities` vacío → nada) y el
juego re-otorga prioridad al mismo jugador con la misma vista → GAME_SELECT infinito idéntico
(~48/s al watcher). Por eso el rechazo era intermitente: dependía de la mezcla de tierras
(Island vs Mountain) del Sim en cada partida.

**Fix (SimPlayer.java `tryCast`)**: ahora es color-aware — `colorsOf(getManaCostStr())` extrae
los colores del coste y `canProduceColors(player, required)` exige tierras sin girar que
produzcan TODOS los colores; si no, `-> skip`. El dedup por firma `(turno, paso, mano,
tierras)` queda como defensa anti-spin. Logs INFO: msg del GAME_ASK + respuesta, y
colores/UUIDs de tryCast.

**Flake residual conocido de targeting (raro, solo tras `restart all`)**: el GAME_TARGET del
Bolt llega al web pero el diálogo `.feedback-dialog` no renderiza. No se reprodujo en 6+ runs
consecutivos; el assert del diálogo ahora incluye `pageerrors` en el mensaje para diagnosticar
si reaparece. Sospecha: estado del servidor tras restart (mismo patrón que el Bug 2).

## ✅ CERRADO 2026-08-16 (por la tarde) — spells/targeting real VERDES

`spells.spec.ts` 4/4 y `targeting.spec.ts` VERDES en modo real (verificado ×2).
Causa raíz del cierre (combinación de 3 cosas):

1. **Estado degradado del servidor por sesiones huérfanas** (causa principal de la
   "victoria del Sim" y del pago que no registra): proxies muertos dejan sesiones
   en el servidor → partidas humanas corruptas. **Reiniciar servidor+proxy JUNTOS**
   (`node scripts/ctl.mjs restart all`) lo resuelve. Reiniciar SOLO el proxy deja
   el primer login colgado (reproducido 3×) — NO es el fix.
2. **Reintento de `nextManaSource`** en el bucle de pago de spells y targeting
   (20×150ms): la lectura única fallaba cuando el ask llegaba con la vista stale
   (fuentes tapadas en frames viejos).
3. **Cursor estricto en targeting**: el "siguiente ask" usaba lookback
   (`parsedLen-10`) que re-matcheaba el MISMO ask y pagaba una 2ª fuente.

Recomendación operativa: tras CUALQUIER reinicio del proxy, ejecutar
`restart all` y verificar el primer login con un test rápido antes de correr la
suite real.

## Workflow de depuración

- Test aislado: `npm --prefix Mage.Proxy/web run test:e2e -- --reporter=list e2e/spells.spec.ts -g "Blaze"`
- Frames/sent del test: se capturan en `frames`/`sent` (page.on websocket). Para verlos
  en un fallo: dump temporal con `fs.writeFileSync('/tmp/x.jsonl', ...)` en el punto
  del fallo + `console.log`.
- Decisiones del Sim: `.run/proxy.err.log` (formato "INFORMACIÓN:" — es stderr de JUL;
  los logs INFO del proxy van a `.run/proxy.out.log` con formato distinto).
- Servidor: `.run/server.out.log` (gameId del match para correlacionar).
- Error context: `Mage.Proxy/web/test-results/<test>/error-context.md` (snapshot de
  página + error).
- Tras tocar web: `npm --prefix Mage.Proxy/web run unit` + `npm --prefix Mage.Proxy/web run typecheck`.
- Tras tocar Java del proxy: `mvn -q -o -pl Mage.Proxy test-compile` → `node scripts/build.mjs proxy` → `node scripts/ctl.mjs restart all` (server+proxy juntos).

## Conocimiento del servidor (para no volver a buscar)

- El fin de partida por "idle" es `onResponseIdleTimeout` → `game.idleTimeout` →
  concede; en testMode el timeout es 3600s (`getResponseIdleTimeoutSecs`), no es la
  causa de partidas cortas.
- `GameController.startResponseIdleTimeout` se arma en cada `perform` (cada ask).
- El forced-join de 10s (`GAME_TIMEOUTS_CHECK_JOINING_STATUS_EVERY_SECS=10`) se evita
  con `joinGame(gameId)` en START_GAME (el web ya lo hace en store.ts).
- El `sendPlayerUUID` con un UUID inválido se ignora en silencio (no rompe nada).
- Cartas: Blaze = 6ED 168; Arc Trail = SOM 81; Boros Charm = FDN 721; Walking Ballista
  = 2XM 306; Lightning Bolt = M10 146; Raging Goblin = M10 153 (1/1 haste); Mountain
  = LEA 292; Plains = LEA 287; Island = LEA 288.
