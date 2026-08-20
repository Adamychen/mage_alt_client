# Mage.Proxy — XMage WebSocket Bridge

A thin bridge between the XMage Java server (jboss-serialization protocol) and
any modern client (JSON over WebSocket). **Zero game logic** — the proxy only
forwards state and actions. All rules engine logic lives in the XMage server.

## Architecture

```
┌──────────────┐   WebSocket JSON   ┌────────────────┐   jboss-serialization   ┌───────────────────┐
│  Web Client  │ ◀────────────────▶ │  Mage.Proxy    │ ◀─────────────────────▶ │  XMage Server     │
│  React + TS  │   port 8787        │  (Java)        │   port 17171            │  (Mage.Server)    │
└──────────────┘                    └────────────────┘                         └───────────────────┘
```

**What the proxy does:**
1. Opens a real XMage session (`SessionImpl`) to the server
2. Receives server callbacks (game events, lobby updates, chat)
3. Serializes them to JSON using `JsonUtil` (reflection-based, field-by-field)
4. Broadcasts them to all connected WebSocket clients
5. Receives actions from clients and forwards them to the server

**What the proxy does NOT do:**
- No game rules logic
- No card database
- No state transformation (JSON mirrors Java fields 1:1)
- No event filtering (forwards everything, except outdated events on reconnect)

## How Serialization Works

The proxy uses `JsonUtil.java` — a reflection-based serializer. Rules:

| Java Type | JSON Representation |
|---|---|
| `String`, `UUID`, `Enum` | `"string"` |
| `int`, `long`, `Integer`, `Long`, `double` | `number` |
| `boolean`, `Boolean` | `boolean` |
| `Date` | `number` (epoch millis) |
| `Optional<T>` | unwrapped (`null` if empty) |
| `List<T>`, `T[]` | `[...]` |
| `Map<K,V>` | `{...}` (keys stringified) |
| Custom objects | `{field1: ..., field2: ...}` (camelCase field names) |
| `null` fields | omitted or `null` |
| `static`, `transient` fields | skipped |
| Technical fields (`serialVersionUID`, `logger`, `Class`, `Throwable`) | skipped |

Field names come from Java reflection (camelCase). The TypeScript types mirror
these exactly — see `schema/contract.schema.json` and `types.generated.ts`.

## Protocol: Client → Proxy (Actions)

Request format:
```json
{"requestId": "42", "action": "connect", "args": {"host": "localhost", "port": 17171}}
```

### Connection & Session

| Action | Args | Description |
|---|---|---|
| `connect` | `{host, port, username, password}` | Connect to XMage server |
| `disconnect` | `{}` | Disconnect from server |
| `ping` | `{}` | Keepalive |
| `getServerInfo` | `{}` | Server version, protocol version |
| `getGameTypes` | `{}` | Available game types |
| `getDeckTypes` | `{}` | Available deck types |
| `getPlayerTypes` | `{}` | Available player types (HUMAN, SIM, etc.) |
| `getRoomUsers` | `{}` | Users in the room |
| `getRoomChatId` | `{}` | Chat room ID |
| `getTables` | `{}` | All tables |
| `getFinishedMatches` | `{}` | Match history |
| `getServerMessages` | `{}` | Server news/messages |

### Lobby

| Action | Args | Description |
|---|---|---|
| `createTable` | `{name, gameType, deckType, winsNeeded, playerTypes, password, ...}` | Create a table |
| `joinTable` | `{roomId, tableId, playerName, playerType, skill, deck, password}` | Join a table |
| `leaveTable` | `{tableId}` | Leave a table |
| `removeTable` | `{tableId}` | Remove a table |
| `startMatch` | `{tableId}` | Start the match |
| `watchTable` | `{tableId}` | Watch a table |
| `watchGame` | `{gameId}` | Watch a specific game |
| `stopWatching` | `{gameId}` | Stop watching |
| `joinGame` | `{gameId}` | Join a game (as player) |
| `quitMatch` | `{tableId}` | Quit the match |

### Deck Management

| Action | Args | Description |
|---|---|---|
| `submitDeck` | `{tableId, deck}` | Submit deck for the match |
| `updateDeck` | `{tableId, deck}` | Update deck |

Deck format:
```json
{
  "name": "My Deck",
  "cards": [{"cardName": "Lightning Bolt", "setCode": "2XM", "cardNumber": "162", "amount": 4}],
  "sideboard": [{"cardName": "Path to Exile", "setCode": "2XM", "cardNumber": "30", "amount": 2}]
}
```

### Game Actions

| Action | Args | Description |
|---|---|---|
| `sendPlayerUUID` | `{gameId, value}` | Select target/card (UUID) |
| `sendPlayerBoolean` | `{gameId, value}` | Answer yes/no, keep/mulligan, pass priority (`false` = pass) |
| `sendPlayerInteger` | `{gameId, value}` | Choose a number (X cost, amount) |
| `sendPlayerString` | `{gameId, value}` | Choose a string option |
| `sendPlayerManaType` | `{gameId, value}` | Choose mana type |
| `sendPlayerAction` | `{gameId, action, data}` | Advanced actions (e.g., `PASS_PRIORITY_UNTIL_STACK_RESOLVED`) |

### Chat

| Action | Args | Description |
|---|---|---|
| `joinChat` | `{chatId}` | Join chat room |
| `leaveChat` | `{chatId}` | Leave chat room |
| `sendChatMessage` | `{chatId, text}` | Send message |

## Protocol: Proxy → Client (Events)

### Envelope Types

| Type | Description |
|---|---|
| `connected` | WebSocket connected, ready to send `connect` |
| `disconnected` | WebSocket closed |
| `info` | Server info message |
| `error` | Error message |
| `lobby` | Lobby state (tables, users) — broadcast every ~2s |
| `result` | Response to an action (`ok: true/false`) |
| `event` | Server callback (game events, chat, etc.) |

### Game Events (forwarded from XMage server)

These are the core events the web client must handle. Every event has:
```json
{"type": "event", "method": "GAME_INIT", "messageId": 42, "objectId": "game-uuid", "data": {...}}
```

#### Game Lifecycle

| Event | Data | When |
|---|---|---|
| `START_GAME` | `{gameId, tableName}` | Match started |
| `GAME_INIT` | `{gameView: GameView}` | Initial game state |
| `GAME_OVER` | `{gameId, winnerName, message}` | Game ended |
| `END_GAME_INFO` | `{gameInfo, matchInfo, won, wins, loses, matchView}` | End-of-game summary (match continues or ends) |
| `SIDEBOARD` | `{deck, currentTableId, time, flag}` | Between games in a match |

#### Game State Updates

| Event | Data | When |
|---|---|---|
| `GAME_UPDATE` | `{gameView: GameView}` | State changed (card moved, phase changed, etc.) |
| `GAME_UPDATE_AND_INFORM` | `{gameView: GameView, message}` | State changed + info message |

#### Player Interaction (must respond)

| Event | Data | Expected Response |
|---|---|---|
| `GAME_SELECT` | `{gameView, message, options}` | Priority window — pass or act |
| `GAME_ASK` | `{question, options, gameId}` | Yes/no question (mulligan, etc.) |
| `GAME_TARGET` | `{message, targets, options, gameId}` | Choose a target |
| `GAME_TARGET_PLAYER` | `{message, targets, options, gameId}` | Choose a player |
| `GAME_TARGET_AMOUNT` | `{message, min, max, gameId}` | Choose amount for target |
| `GAME_PLAY_MANA` | `{message, options, gameView}` | Pay mana (click sources on battlefield) |
| `GAME_PLAY_XMANA` | `{message, options, gameId}` | Pay X mana (confirm/cancel) |
| `GAME_GET_AMOUNT` | `{message, min, max, gameView}` | Choose a number (X cost) |
| `GAME_GET_MULTI_AMOUNT` | `{messages, gameId}` | Choose multiple numbers |
| `GAME_SELECT_AMOUNT` | `{message, min, max, gameId}` | Choose an amount |
| `GAME_CHOOSE_ABILITY` | `{message, choices, gameView}` | Choose an ability |
| `GAME_CHOOSE_ONE` | `{message, options, gameId}` | Choose one option |
| `GAME_CHOOSE_MODE` | `{message, options, gameId}` | Choose a mode |
| `GAME_CHOOSE_COLOR` | `{message, options, gameId}` | Choose a color |
| `GAME_CHOOSE_NUMBER` | `{message, min, max, gameId}` | Choose a number |
| `GAME_CHOOSE_STRING` | `{message, options, gameId}` | Choose a string |
| `GAME_CHOOSE_BETWEEN` | `{message, options, gameId}` | Choose between options |
| `GAME_CHOOSE_PILE` | `{message, cardsView1, cardsView2, gameId}` | Choose a pile |
| `GAME_CHOOSE_CARDS` | `{message, options, gameId}` | Choose N cards |
| `GAME_CHOOSE_CARDS_ORDER` | `{message, options, gameId}` | Order cards |
| `GAME_SELECT_CARDS` | `{message, cardsView1, gameId}` | Select cards |
| `GAME_SELECT_TARGETS` | `{message, options, gameId}` | Select targets |
| `GAME_SELECT_PLAYER` | `{message, targets, options, gameId}` | Select a player |

#### Lobby & Chat

| Event | Data | When |
|---|---|---|
| `JOINED_TABLE` | `{tableId, tableName}` | Joined a table |
| `CHATMESSAGE` | `{chatId, username, message}` | Chat message |
| `SERVER_MESSAGE` | (string or object) | Server announcement |
| `WATCHGAME` | `{gameId}` | Watching a game |

## TypeScript Types

The type contract lives in two files:

| File | Purpose |
|---|---|
| `src/net/types.generated.ts` | **Auto-generated** from `schema/contract.schema.json`. Do not edit manually. |
| `src/net/types.ts` | **Hand-maintained**. Proxy-specific types (envelopes, deck, events). Re-exports view types from generated. |

### Regenerating Types

When XMage upstream changes view classes (new fields, renamed fields):

```bash
cd Mage.Proxy/web
npm run gen-types          # regenerate types.generated.ts
node ../../scripts/gen-types.mjs --validate   # CI drift check
```

The schema (`schema/contract.schema.json`) describes the wire format. Update it
when Java view classes change, then regenerate.

### Adding a New Event

1. **If it's a game event** (forwarded from server):
   - Add the event handler in `src/state/eventHandler.ts` (in the `handleEvent` switch)
   - Or add feedback parsing in `src/game/feedback.ts` (if it's a player interaction)
   - Add the event method to `EVENT_METHODS` in `types.ts`

2. **If it's a new data type** (new Java view class):
   - Add the definition to `schema/contract.schema.json`
   - Run `npm run gen-types` to regenerate TypeScript interfaces
   - Use the new type in your event handler

3. **If it's a proxy action** (client → server):
   - Add the action handling in `ProxyClient.java` (the `switch (action)` block)
   - Add the TypeScript type in `types.ts` if needed

## What's NOT Supported (and Why)

| Gap | Reason | Impact |
|---|---|---|
| Card images | Binary data not serialized through JsonUtil | Cosmetic — can load from Scryfall API |
| Deck editor | Pure UI, no protocol gap | Build in TypeScript |
| Tournament support | Protocol events exist, UI not implemented | Build in TypeScript |
| Replay system | Server doesn't persist replays | Would need server modification |
| Admin tools | Proxy doesn't expose admin actions | Would need proxy modification |

**Key insight**: The proxy is a thin bridge. If the Java server sends it, the proxy
forwards it. If the Java client can do it, the web client can too — the only
limitation is what's implemented in TypeScript.

## Development

```bash
# Start the stack
node scripts/ctl.mjs start all

# Run tests
node scripts/test.mjs          # full suite
node scripts/test.mjs unit     # unit only
node scripts/test.mjs typecheck # type check only

# Tail logs
node scripts/tail.mjs proxy    # proxy logs
node scripts/tail.mjs server   # server logs
```

Ports:
- XMage server: `17171` (testMode)
- Proxy WebSocket: `ws://127.0.0.1:8787`
- Proxy test page: `http://127.0.0.1:8788/index.html`
- Vite dev: `http://localhost:5173`
