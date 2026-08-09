# Mage.Proxy — gateway para un cliente alternativo de XMage

Puente entre un servidor XMage (p. ej. `beta.xmage.de:17171`) y un cliente web moderno.
Habla el protocolo XMage real (serialización Java sobre jboss remoting) por un lado, y
JSON sobre WebSocket por el otro. Todo el motor de reglas vive en el servidor: el proxy
solo reenvía estado y acciones.

## Compilar

```bash
mvn -pl Mage.Proxy -am package -DskipTests
# genera Mage.Proxy/target/mage-proxy-1.4.60.jar (jar con todas las dependencias)
```

> Importante: XMage (jboss serialization) requiere abrir módulos de Java al ejecutar
> el jar con JDK 9+ (igual que el cliente oficial):

```bash
java \
  --add-opens=java.base/java.io=ALL-UNNAMED \
  --add-opens=java.base/java.util=ALL-UNNAMED \
  --add-opens=java.base/java.lang=ALL-UNNAMED \
  --add-opens=java.base/java.lang.reflect=ALL-UNNAMED \
  --add-opens=java.base/java.text=ALL-UNNAMED \
  -jar Mage.Proxy/target/mage-proxy-1.4.60.jar [--host beta.xmage.de] [--port 17171] \
  [--username u] [--password p] [--wsPort 8787] [--httpPort 8788] \
  [--bind 127.0.0.1] [--allowedOrigins http://localhost:5173]
```

El proxy hace bind a `127.0.0.1` por defecto. `--bind` solo debe cambiarse cuando
se configure explícitamente la exposición de red, autenticación y TLS delante del proxy.
También limita el tamaño y la frecuencia de comandos con `--maxMessageBytes` y
`--maxMessagesPerSecond`.

Servicios que abre:
- `ws://localhost:8787` — gateway WebSocket (protocolo JSON, abajo)
- `http://localhost:8788/index.html` — página de prueba (requiere la conexión `ws://localhost:8787`)

## Estado de la Fase 0 (verificada contra servidor local)

Funciona de punta a punta contra `Mage.Server` local y contra el protocolo real:
- login/sesión/versión (igual que el cliente oficial; el servidor beta valida la versión 1.4.60-V3)
- lobby (tablas, usuarios, mensajes del servidor) publicado cada ~2s
- chat de sala (join, mensajes)
- crear mesa (con jugadores IA), unirse con mazo, arrancar partida
- eventos de partida: `START_GAME`, `GAME_INIT`, `GAME_UPDATE`, `GAME_ASK`, `GAME_TARGET`, etc.
  serializados a JSON (GameView completo)

## Protocolo WebSocket (JSON)

Cliente -> proxy (`{"requestId": "42", "action": "...", "args": {...}}`):
- `connect` {host, port, username, password}
- `disconnect`, `ping`
- `getServerInfo`, `getGameTypes`, `getDeckTypes`, `getPlayerTypes`, `getTables`,
  `getRoomUsers`, `getRoomChatId`, `getFinishedMatches`, `getServerMessages`
- `joinChat` {chatId}, `leaveChat` {chatId}, `sendChatMessage` {chatId, text}
- `createTable` {name, gameType, deckType, winsNeeded, playerTypes[], password, ...}
- `joinTable` {roomId, tableId, playerName, playerType, skill, deck, password}
- `leaveTable`, `removeTable`, `startMatch`, `watchTable`, `watchGame`, `stopWatching`,
  `joinGame`, `quitMatch`
- `submitDeck` {tableId, deck}, `updateDeck` {tableId, deck}
- `sendPlayerAction` {action: "PASS_PRIORITY_UNTIL_STACK_RESOLVED"|..., gameId, data}; pasar prioridad normal usa `sendPlayerBoolean` con `false`
- `sendPlayerUUID`, `sendPlayerBoolean`, `sendPlayerInteger`, `sendPlayerString`,
  `sendPlayerManaType`

Mazo (deck): `{"name": "...", "cards": [{"cardName": "...", "setCode": "...", "cardNumber": "...", "amount": n}], "sideboard": [...]}`

Proxy -> cliente:
- `{"type":"connected"|"disconnected"|"info"|"error", ...}`
- `{"type":"lobby", "roomId": ..., "tables": [...], "users": [...], "serverMessages": [...]}`
- `{"type":"result", "requestId":"42", "action": "...", "ok":true/false, "errorCode":"...", "error":"...", "data": ...}`
- `{"type":"event", "method": "GAME_INIT"|..., "messageId": n, "objectId": ..., "data": {...}}`

El JSON de `data` refleja 1:1 los campos de las clases `mage.view.*` (GameView, PlayerView,
CardView, etc.) con UUIDs y enums como strings.

La versión del contrato está disponible en `getServerInfo.protocolVersion`.
Los errores de comandos usan códigos como `NOT_AUTHORIZED`, `GAME_ID_REQUIRED`,
`INVALID_ARGUMENT` y `FAILED`; los comandos de partida siempre deben incluir `gameId`.

## Servidor local para desarrollo

1. Copiar `Mage.Server/release/config/*` a `local-server/config/` reemplazando `${project.version}`
   por la versión (p. ej. `1.4.60`).
2. Copiar a `local-server/plugins/` los jars de `Mage.Server.Plugins/*/target/` que se quieran
   (al menos human, twoplayerduel, deck-constructed, ai-mad).
3. Lanzar desde `local-server/` con el classpath de `Mage.Server` (ver `pom.xml`) y los mismos
   `--add-opens`. En modo desarrollo el servidor arranca en test mode (sin validar contraseñas ni mazos).
