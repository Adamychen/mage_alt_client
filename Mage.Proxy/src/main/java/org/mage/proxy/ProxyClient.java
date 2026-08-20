package org.mage.proxy;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;
import mage.cards.decks.DeckCardLists;
import mage.constants.ManaType;
import mage.constants.PlayerAction;
import mage.game.match.MatchOptions;
import mage.interfaces.MageClient;
import mage.interfaces.callback.ClientCallback;
import mage.interfaces.callback.ClientCallbackMethod;
import mage.interfaces.callback.ClientCallbackType;
import mage.players.PlayerType;
import mage.players.net.SkipPrioritySteps;
import mage.players.net.UserData;
import mage.players.net.UserSkipPrioritySteps;
import mage.remote.Connection;
import mage.remote.SessionImpl;
import mage.utils.MageVersion;
import mage.view.TableView;
import org.java_websocket.WebSocket;

import java.util.Arrays;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Bridge between an XMage server (SessionImpl) and the WebSocket gateway.
 * <p>
 * - implements MageClient to receive server callbacks and forward them as JSON events
 * - receives JSON commands from the web client and maps them to Session calls
 * - polls the lobby (tables/users) periodically and publishes it
 * <p>
 * Seguridad del protocolo (local-first):
 * - cada conexión WebSocket debe hacer connect antes de cualquier otro comando
 *   (auth por conexión: los comandos ajenos se rechazan con NOT_AUTHORIZED)
 * - respuestas con requestId (echo del comando) y errorCode uniforme
 * - las acciones de partida exigen gameId (GAME_ID_REQUIRED si falta)
 */
public class ProxyClient implements MageClient {

    public static final String ERR_BAD_JSON = "BAD_JSON";
    public static final String ERR_NOT_AUTHORIZED = "NOT_AUTHORIZED";
    public static final String ERR_GAME_ID_REQUIRED = "GAME_ID_REQUIRED";
    public static final String ERR_INVALID_ARGUMENT = "INVALID_ARGUMENT";
    public static final String ERR_UNKNOWN_ACTION = "UNKNOWN_ACTION";
    public static final String ERR_FAILED = "FAILED";

    private static final Logger logger = Logger.getLogger(ProxyClient.class.getName());

    private final Config config;
    private final Gateway gateway;
    private final MageVersion version = new MageVersion(ProxyClient.class);
    private final SessionImpl session;

    /** conexiones WebSocket autorizadas (han hecho connect con éxito) */
    private final Set<WebSocket> authorized = Collections.newSetFromMap(new IdentityHashMap<WebSocket, Boolean>());

    // all commands from web clients are processed in order on one thread
    private final ExecutorService commandExecutor = Executors.newSingleThreadExecutor();
    // server callbacks are processed in order on one thread (recreated on user switch to drain stale ones)
    private ExecutorService callbackExecutor = Executors.newSingleThreadExecutor();
    private ScheduledExecutorService lobbyTimer = Executors.newSingleThreadScheduledExecutor();
    private final ScheduledExecutorService pingTimer = Executors.newSingleThreadScheduledExecutor();

    // out-of-order protection for reconnect/bad network (same logic as the original client)
    private final Map<ClientCallbackType, Integer> lastMessages = new java.util.HashMap<>();

    /**
     * Game ids "owned" by the current server session (seen via START_GAME / WATCHGAME / GAME_INIT
     * since the last connect). When the proxy switches users, the server re-sends the pending
     * state of the previous user's still-running games over the same channel; those events belong
     * to games this session never joined/watched, so they must not reach the new web client
     * (they flooded the single-threaded callback queue and starved real dialogs like WATCHGAME).
     */
    private final Set<UUID> sessionGameIds = new java.util.HashSet<>();

    // asientos "SIM": oponentes simulados con su propia sesión de servidor
    private final Map<String, SimPlayer> sims = new java.util.HashMap<>();
    private int simCounter = 0;
    // servidor al que conecta la sesión web (los Sim se conectan al mismo)
    private volatile String serverHost = "";
    private volatile int serverPort = 0;

    private volatile boolean connected = false;
    private final List<ClientCallback> handshakeBuffer = new java.util.LinkedList<>();

    private ScheduledFuture<?> graceDisconnectTimer = null;
    public static final int DISCONNECT_GRACE_PERIOD_SECS = 60;

    public ProxyClient(Config config, Gateway gateway) {
        this.config = config;
        this.gateway = gateway;
        this.session = new SessionImpl(this);
        Arrays.stream(ClientCallbackType.values()).forEach(t -> this.lastMessages.put(t, 0));
        lobbyTimer.scheduleWithFixedDelay(this::publishLobby, 2, 2, TimeUnit.SECONDS);
        // keep the server session alive (the original client pings from its UI; we have no UI)
        pingTimer.scheduleWithFixedDelay(this::pingServer, PING_SERVER_SECS, PING_SERVER_SECS, TimeUnit.SECONDS);
    }

    // must be less than the server's connection timeout (UserManagerImpl.USER_CONNECTION_TIMEOUTS_CHECK_SECS)
    private static final int PING_SERVER_SECS = 20;

    private void pingServer() {
        try {
            if (connected) {
                session.ping();
            }
        } catch (Throwable ex) {
            logger.log(Level.FINE, "ping failed", ex);
        }
    }

    public SessionImpl getSession() {
        return session;
    }

    public boolean isConnected() {
        return connected;
    }

    public synchronized void shutdown() {
        if (graceDisconnectTimer != null) {
            graceDisconnectTimer.cancel(true);
            graceDisconnectTimer = null;
        }
        commandExecutor.shutdownNow();
        callbackExecutor.shutdownNow();
        lobbyTimer.shutdownNow();
        try {
            session.connectStop(false, false);
        } catch (Exception ignored) {
        }
    }

    // ============================ websocket client callbacks ============================

    public synchronized void onClientOpen(WebSocket conn) {
        if (graceDisconnectTimer != null) {
            graceDisconnectTimer.cancel(false);
            graceDisconnectTimer = null;
            logger.info("New WebSocket client connected; cancelled grace disconnect timer.");
        }
        sendInfo(conn, "Proxy ready. Send {\"action\":\"connect\",...} to log in.");
    }

    public synchronized void onClientClose(WebSocket conn) {
        authorized.remove(conn);
        if (authorized.isEmpty() && connected) {
            logger.info("All WebSocket clients disconnected. Starting " + DISCONNECT_GRACE_PERIOD_SECS + "s grace period before stopping session.");
            if (graceDisconnectTimer != null) {
                graceDisconnectTimer.cancel(false);
            }
            graceDisconnectTimer = pingTimer.schedule(() -> {
                synchronized (ProxyClient.this) {
                    if (authorized.isEmpty() && connected) {
                        logger.info("Grace period expired without client reconnect. Cleaning up XMage session.");
                        stopSims();
                        try {
                            session.connectStop(false, false);
                        } catch (Exception ignored) {
                        }
                        connected = false;
                    }
                }
            }, DISCONNECT_GRACE_PERIOD_SECS, TimeUnit.SECONDS);
        }
    }

    /** Reenvía estado solo a conexiones que han autenticado su sesión local. */
    private void broadcastAuthorized(String json) {
        synchronized (authorized) {
            for (WebSocket conn : authorized) {
                gateway.send(conn, json);
            }
        }
    }

    public void onClientMessage(WebSocket conn, String message) {
        commandExecutor.execute(() -> handleCommand(conn, message));
    }

    // ============================ MageClient implementation ============================

    @Override
    public MageVersion getVersion() {
        return version;
    }

    @Override
    public void connected(String message) {
        connected = true;
        JsonObject ev = new JsonObject();
        ev.addProperty("type", "connected");
        ev.addProperty("info", message == null ? "Connected" : message);
        broadcastAuthorized(ev.toString());

        List<ClientCallback> toFlush;
        synchronized (handshakeBuffer) {
            toFlush = new java.util.LinkedList<>(handshakeBuffer);
            handshakeBuffer.clear();
        }
        for (ClientCallback cb : toFlush) {
            callbackExecutor.execute(() -> processCallback(cb));
        }
    }

    @Override
    public void disconnected(boolean askToReconnect, boolean keepMySessionActive) {
        connected = false;
        JsonObject ev = new JsonObject();
        ev.addProperty("type", "disconnected");
        ev.addProperty("info", "Disconnected from server");
        broadcastAuthorized(ev.toString());
    }

    @Override
    public void showMessage(String message) {
        JsonObject ev = new JsonObject();
        ev.addProperty("type", "info");
        ev.addProperty("message", message);
        broadcastAuthorized(ev.toString());
    }

    @Override
    public void showError(String message) {
        JsonObject ev = new JsonObject();
        ev.addProperty("type", "error");
        ev.addProperty("message", message);
        ev.addProperty("fatal", true);
        broadcastAuthorized(ev.toString());
    }

    @Override
    public void onNewConnection() {
        // nothing to do: temp data is per-proxy, not per-connection
    }

    @Override
    public void onCallback(ClientCallback callback) {
        callbackExecutor.execute(() -> processCallback(callback));
    }

    private void processCallback(ClientCallback callback) {
        try {
            callback.decompressData();

            // Buffer MESSAGE callbacks that arrive before the handshake completes.
            // The server may send SHOW_USERMESSAGE (news/disclaimer) before connected()
            // is called; flushing them after connected guarantees correct event ordering.
            if (!connected && callback.getMethod().getType() == ClientCallbackType.MESSAGE) {
                synchronized (handshakeBuffer) {
                    handshakeBuffer.add(callback);
                }
                return;
            }

            // ignore outdated game updates on reconnect/bad network (same logic as original client)
            if (!callback.getMethod().getType().equals(ClientCallbackType.CLIENT_SIDE_EVENT)) {
                int lastAnyMessageId = lastMessages.values().stream().mapToInt(x -> x).max().orElse(0);
                if (lastAnyMessageId > callback.getMessageId()) {
                    if (callback.getMethod().getType().mustIgnoreOnOutdated()) {
                        logger.info("event DROPPED as outdated: " + callback.getMethod() + " (msgId=" + callback.getMessageId()
                                + " < last=" + lastAnyMessageId + ")");
                        return;
                    }
                }
                if (!callback.getMethod().getType().canComeInAnyOrder()) {
                    lastMessages.put(callback.getMethod().getType(), callback.getMessageId());
                }
            }

            // session isolation: drop events of games this session never joined/watched.
            // After a user switch the server re-sends the previous user's still-running games
            // over the same channel; forwarding them floods the single-threaded callback queue
            // and starves real events of the new session (e.g. WATCHGAME arriving 60+ seconds late).
            UUID callbackObjectId = callback.getObjectId();
            if (callbackObjectId != null && isGameRelated(callback.getMethod())) {
                if (callback.getMethod() == ClientCallbackMethod.WATCHGAME
                        || callback.getMethod() == ClientCallbackMethod.START_GAME
                        || callback.getMethod() == ClientCallbackMethod.GAME_INIT) {
                    sessionGameIds.add(callbackObjectId);
                }
                if (!sessionGameIds.contains(callbackObjectId)) {
                    logger.info("event IGNORED (game not active in this session): " + callback.getMethod()
                            + " (msgId=" + callback.getMessageId() + ", obj=" + callbackObjectId + ")");
                    return;
                }
            }

            JsonObject ev = new JsonObject();
            ev.addProperty("type", "event");
            ev.addProperty("method", callback.getMethod().name());
            ev.addProperty("messageId", callback.getMessageId());
            if (callback.getObjectId() != null) {
                ev.addProperty("objectId", callback.getObjectId().toString());
            }
            Object data = callback.getData();
            if (data != null) {
                ev.add("data", JsonParser.parseString(JsonUtil.toJson(data)));
            }
            if (logger.isLoggable(Level.FINE) || !isGameUpdate(callback)) {
                logger.info("event >> " + callback.getMethod() + " (msgId=" + callback.getMessageId()
                        + (callback.getObjectId() != null ? ", obj=" + callback.getObjectId() : "")
                        + ", data=" + (data == null ? "null" : data.getClass().getSimpleName()) + ")");
            }
            broadcastAuthorized(ev.toString());
        } catch (Exception ex) {
            logger.log(Level.SEVERE, "Error processing callback " + callback.getInfo(), ex);
            JsonObject ev = new JsonObject();
            ev.addProperty("type", "error");
            ev.addProperty("message", "Callback error: " + callback.getMethod() + " - " + ex.getMessage());
            ev.addProperty("fatal", false);
            broadcastAuthorized(ev.toString());
        }
    }

    private static boolean isGameUpdate(ClientCallback callback) {
        ClientCallbackMethod m = callback.getMethod();
        return m == ClientCallbackMethod.GAME_UPDATE || m == ClientCallbackMethod.GAME_UPDATE_AND_INFORM;
    }

    private static boolean isGameRelated(ClientCallbackMethod method) {
        if (method == ClientCallbackMethod.START_GAME
                || method == ClientCallbackMethod.WATCHGAME
                || method == ClientCallbackMethod.END_GAME_INFO) {
            return true;
        }
        return method.name().startsWith("GAME_");
    }

    // ============================ lobby polling ============================

    private void publishLobby() {
        if (!connected) {
            return;
        }
        try {
            UUID roomId = session.getMainRoomId();
            if (roomId == null) {
                return;
            }
            JsonObject lobby = new JsonObject();
            lobby.addProperty("type", "lobby");
            lobby.addProperty("roomId", roomId.toString());
            lobby.add("tables", JsonParser.parseString(JsonUtil.toJson(session.getTables(roomId))));
            lobby.add("users", JsonParser.parseString(JsonUtil.toJson(session.getRoomUsers(roomId))));
            lobby.add("serverMessages", JsonParser.parseString(JsonUtil.toJson(session.getServerMessages())));
            broadcastAuthorized(lobby.toString());
        } catch (Throwable ex) {
            // transient errors (e.g. server restart) must not spam the log; a Throwable here
            // (e.g. a remoting Error while the server dies) would otherwise cancel the
            // periodic task silently, killing all lobby broadcasts until the proxy restarts
            logger.log(Level.WARNING, "Lobby publish failed: " + ex.getMessage(), ex);
        }
    }

    // ============================ command handling ============================

    private void handleCommand(WebSocket conn, String message) {
        String requestId = "";
        String action = "";
        JsonObject args = new JsonObject();
        JsonObject cmd;
        try {
            cmd = JsonParser.parseString(message).getAsJsonObject();
        } catch (JsonSyntaxException ex) {
            gateway.send(conn, resultJson("", requestId, false, ERR_BAD_JSON, "Bad JSON: " + ex.getMessage()));
            return;
        }
        if (cmd.has("requestId")) {
            JsonElement rid = cmd.get("requestId");
            if (rid.isJsonPrimitive()) {
                requestId = rid.getAsString();
            }
        }
        action = cmd.has("action") ? cmd.get("action").getAsString() : "";
        if (cmd.has("args") && cmd.get("args").isJsonObject()) {
            args = cmd.get("args").getAsJsonObject();
        }

        // auth por conexión: connect/ping son públicos; el resto exige sesión autorizada
        boolean isPublic = "connect".equals(action) || "ping".equals(action);
        if (!isPublic && !authorized.contains(conn)) {
            gateway.send(conn, resultJson(action, requestId, false, ERR_NOT_AUTHORIZED, "not connected: send connect first"));
            return;
        }

        // gameId obligatorio para todas las acciones de partida
        if (requiresGameId(action) && uuid(args, "gameId", null) == null) {
            gateway.send(conn, resultJson(action, requestId, false, ERR_GAME_ID_REQUIRED, "gameId is required"));
            return;
        }

        try {
            switch (action) {
                case "connect": {
                    String host = str(args, "host", config.getServerHost());
                    int port = getInt(args, "port", config.getServerPort());
                    String username = str(args, "username", config.getUsername());
                    String password = str(args, "password", config.getPassword());
                    connect(conn, requestId, host, port, username, password);
                    break;
                }
                case "disconnect": {
                    synchronized (this) {
                        if (graceDisconnectTimer != null) {
                            graceDisconnectTimer.cancel(false);
                            graceDisconnectTimer = null;
                        }
                    }
                    stopSims();
                    session.connectStop(false, false);
                    connected = false;
                    authorized.clear();
                    gateway.send(conn, resultJson(action, requestId, true, null, null));
                    break;
                }
                case "ping": {
                    gateway.send(conn, resultJson(action, requestId, true, null, "pong"));
                    break;
                }
                case "getServerInfo": {
                    JsonObject data = new JsonObject();
                    data.addProperty("host", session.getServerHost());
                    data.addProperty("version", session.getVersionInfo());
                    data.addProperty("connected", connected);
                    data.addProperty("sessionId", session.getSessionId());
                    data.addProperty("protocolVersion", Config.PROTOCOL_VERSION);
                    gateway.send(conn, resultJson(action, requestId, true, null, data));
                    break;
                }
                case "getGameTypes": {
                    gateway.send(conn, resultJson(action, requestId, true, null, session.getGameTypes()));
                    break;
                }
                case "getTournamentGameTypes": {
                    gateway.send(conn, resultJson(action, requestId, true, null, session.getTournamentGameTypes()));
                    break;
                }
                case "getDeckTypes": {
                    gateway.send(conn, resultJson(action, requestId, true, null, Arrays.asList(session.getDeckTypes())));
                    break;
                }
                case "getPlayerTypes": {
                    gateway.send(conn, resultJson(action, requestId, true, null, Arrays.asList(session.getPlayerTypes())));
                    break;
                }
                case "getTables": {
                    UUID roomId = uuid(args, "roomId", session.getMainRoomId());
                    gateway.send(conn, resultJson(action, requestId, true, null, session.getTables(roomId)));
                    break;
                }
                case "getRoomUsers": {
                    UUID roomId = uuid(args, "roomId", session.getMainRoomId());
                    gateway.send(conn, resultJson(action, requestId, true, null, session.getRoomUsers(roomId)));
                    break;
                }
                case "getRoomChatId": {
                    UUID roomId = uuid(args, "roomId", session.getMainRoomId());
                    gateway.send(conn, resultJson(action, requestId, true, null, session.getRoomChatId(roomId).orElse(null)));
                    break;
                }
                case "getFinishedMatches": {
                    UUID roomId = uuid(args, "roomId", session.getMainRoomId());
                    gateway.send(conn, resultJson(action, requestId, true, null, session.getFinishedMatches(roomId)));
                    break;
                }
                case "getServerMessages": {
                    gateway.send(conn, resultJson(action, requestId, true, null, session.getServerMessages()));
                    break;
                }
                case "joinChat": {
                    UUID chatId = uuid(args, "chatId", null);
                    boolean ok = chatId != null && session.joinChat(chatId);
                    gateway.send(conn, resultJson(action, requestId, ok, ok ? null : ERR_FAILED, ok ? null : "joinChat failed, need valid chatId"));
                    break;
                }
                case "leaveChat": {
                    UUID chatId = uuid(args, "chatId", null);
                    boolean ok = chatId != null && session.leaveChat(chatId);
                    gateway.send(conn, resultJson(action, requestId, ok, ok ? null : ERR_FAILED, null));
                    break;
                }
                case "getGameChatId": {
                    UUID gameId = uuid(args, "gameId", null);
                    UUID chatId = gameId != null ? session.getGameChatId(gameId).orElse(null) : null;
                    gateway.send(conn, resultJson(action, requestId, true, null, chatId));
                    break;
                }
                case "sendChatMessage": {
                    UUID chatId = uuid(args, "chatId", null);
                    String text = str(args, "text", "");
                    boolean ok = chatId != null && session.sendChatMessage(chatId, text);
                    gateway.send(conn, resultJson(action, requestId, ok, ok ? null : ERR_FAILED, null));
                    break;
                }
                case "createTable": {
                    MatchOptions options = parseMatchOptions(args);
                    UUID roomId = uuid(args, "roomId", session.getMainRoomId());
                    Object result = session.createTable(roomId, options);
                    boolean ok = result != null;
                    gateway.send(conn, resultJson(action, requestId, ok, ok ? null : ERR_FAILED, result));
                    if (ok && result instanceof TableView) {
                        startSims(args, roomId, ((TableView) result).getTableId());
                    }
                    break;
                }
                case "joinTable": {
                    UUID roomId = uuid(args, "roomId", session.getMainRoomId());
                    UUID tableId = uuid(args, "tableId", null);
                    String playerName = str(args, "playerName", session.getUserName());
                    PlayerType playerType = PlayerType.valueOf(str(args, "playerType", "HUMAN").toUpperCase(Locale.ROOT));
                    int skill = getInt(args, "skill", 0);
                    DeckCardLists deck = DeckJson.parse(args.getAsJsonObject("deck"));
                    String password = str(args, "password", "");
                    boolean ok = session.joinTable(roomId, tableId, playerName, playerType, skill, deck, password);
                    gateway.send(conn, resultJson(action, requestId, ok, ok ? null : ERR_FAILED, null));
                    break;
                }
                case "leaveTable": {
                    UUID roomId = uuid(args, "roomId", session.getMainRoomId());
                    UUID tableId = uuid(args, "tableId", null);
                    gateway.send(conn, resultJson(action, requestId, session.leaveTable(roomId, tableId), null, null));
                    break;
                }
                case "removeTable": {
                    // siempre la variante con roomId: removeTable(tableId) es la
                    // variante de admin (adminTableRemove) y falla con "Wrong admin
                    // access" para usuarios normales, dejando mesas huérfanas
                    UUID roomId = uuid(args, "roomId", session.getMainRoomId());
                    UUID tableId = uuid(args, "tableId", null);
                    gateway.send(conn, resultJson(action, requestId, session.removeTable(roomId, tableId), null, null));
                    break;
                }
                case "startMatch": {
                    UUID roomId = uuid(args, "roomId", session.getMainRoomId());
                    UUID tableId = uuid(args, "tableId", null);
                    gateway.send(conn, resultJson(action, requestId, session.startMatch(roomId, tableId), null, null));
                    break;
                }
                case "watchTable": {
                    UUID roomId = uuid(args, "roomId", session.getMainRoomId());
                    UUID tableId = uuid(args, "tableId", null);
                    gateway.send(conn, resultJson(action, requestId, session.watchTable(roomId, tableId), null, null));
                    break;
                }
                case "watchGame": {
                    UUID gameId = uuid(args, "gameId", null);
                    gateway.send(conn, resultJson(action, requestId, session.watchGame(gameId), null, null));
                    break;
                }
                case "stopWatching": {
                    UUID gameId = uuid(args, "gameId", null);
                    gateway.send(conn, resultJson(action, requestId, session.stopWatching(gameId), null, null));
                    break;
                }
                case "joinGame": {
                    UUID gameId = uuid(args, "gameId", null);
                    gateway.send(conn, resultJson(action, requestId, session.joinGame(gameId), null, null));
                    break;
                }
                case "quitMatch": {
                    UUID gameId = uuid(args, "gameId", null);
                    gateway.send(conn, resultJson(action, requestId, session.quitMatch(gameId), null, null));
                    break;
                }
                case "submitDeck": {
                    UUID tableId = uuid(args, "tableId", null);
                    DeckCardLists deck = DeckJson.parse(args.getAsJsonObject("deck"));
                    gateway.send(conn, resultJson(action, requestId, session.submitDeck(tableId, deck), null, null));
                    break;
                }
                case "updateDeck": {
                    UUID tableId = uuid(args, "tableId", null);
                    DeckCardLists deck = DeckJson.parse(args.getAsJsonObject("deck"));
                    gateway.send(conn, resultJson(action, requestId, session.updateDeck(tableId, deck), null, null));
                    break;
                }
                case "updatePreferences": {
                    UserData userData = UserData.getDefaultUserDataView();
                    JsonObject phases = args.getAsJsonObject("phases");
                    if (phases != null) {
                        UserSkipPrioritySteps skips = new UserSkipPrioritySteps();
                        JsonObject yourTurn = phases.getAsJsonObject("yourTurn");
                        JsonObject opponentTurn = phases.getAsJsonObject("opponentTurn");
                        if (yourTurn != null) {
                            SkipPrioritySteps yt = skips.getYourTurn();
                            yt.setUpkeep(getBool(yourTurn, "upkeep", false));
                            yt.setDraw(getBool(yourTurn, "draw", false));
                            yt.setMain1(getBool(yourTurn, "main1", true));
                            yt.setBeforeCombat(getBool(yourTurn, "beginCombat", false));
                            yt.setEndOfCombat(getBool(yourTurn, "endCombat", false));
                            yt.setMain2(getBool(yourTurn, "main2", true));
                            yt.setEndOfTurn(getBool(yourTurn, "endStep", false));
                        }
                        if (opponentTurn != null) {
                            SkipPrioritySteps ot = skips.getOpponentTurn();
                            ot.setUpkeep(getBool(opponentTurn, "upkeep", false));
                            ot.setDraw(getBool(opponentTurn, "draw", false));
                            ot.setMain1(getBool(opponentTurn, "main1", true));
                            ot.setBeforeCombat(getBool(opponentTurn, "beginCombat", false));
                            ot.setEndOfCombat(getBool(opponentTurn, "endCombat", false));
                            ot.setMain2(getBool(opponentTurn, "main2", true));
                            ot.setEndOfTurn(getBool(opponentTurn, "endStep", false));
                        }
                        userData.setUserSkipPrioritySteps(skips);
                    }
                    gateway.send(conn, resultJson(action, requestId, session.updatePreferencesForServer(userData), null, null));
                    break;
                }
                case "sendPlayerAction": {
                    PlayerAction playerAction = PlayerAction.valueOf(str(args, "action", ""));
                    UUID gameId = uuid(args, "gameId", null);
                    Object data = parseActionData(args.get("data"));
                    gateway.send(conn, resultJson(action, requestId, session.sendPlayerAction(playerAction, gameId, data), null, null));
                    break;
                }
                case "sendPlayerUUID": {
                    UUID gameId = uuid(args, "gameId", null);
                    UUID value = uuid(args, "value", null);
                    gateway.send(conn, resultJson(action, requestId, session.sendPlayerUUID(gameId, value), null, null));
                    break;
                }
                case "sendPlayerBoolean": {
                    UUID gameId = uuid(args, "gameId", null);
                    boolean value = getBool(args, "value", false);
                    gateway.send(conn, resultJson(action, requestId, session.sendPlayerBoolean(gameId, value), null, null));
                    break;
                }
                case "sendPlayerInteger": {
                    UUID gameId = uuid(args, "gameId", null);
                    int value = getInt(args, "value", 0);
                    gateway.send(conn, resultJson(action, requestId, session.sendPlayerInteger(gameId, value), null, null));
                    break;
                }
                case "sendPlayerString": {
                    UUID gameId = uuid(args, "gameId", null);
                    String value = str(args, "value", "");
                    gateway.send(conn, resultJson(action, requestId, session.sendPlayerString(gameId, value), null, null));
                    break;
                }
                case "sendPlayerManaType": {
                    UUID gameId = uuid(args, "gameId", null);
                    UUID playerId = uuid(args, "playerId", null);
                    ManaType manaType = ManaType.valueOf(str(args, "manaType", ""));
                    gateway.send(conn, resultJson(action, requestId, session.sendPlayerManaType(gameId, playerId, manaType), null, null));
                    break;
                }
                default: {
                    gateway.send(conn, resultJson(action, requestId, false, ERR_UNKNOWN_ACTION, "Unknown action: " + action));
                    break;
                }
            }
        } catch (IllegalArgumentException ex) {
            gateway.send(conn, resultJson(action, requestId, false, ERR_INVALID_ARGUMENT, "Invalid argument: " + ex.getMessage()));
        } catch (Exception ex) {
            logger.log(Level.SEVERE, "Command failed: " + action, ex);
            gateway.send(conn, resultJson(action, requestId, false, ERR_FAILED, "Command failed: " + ex.getMessage()));
        }
    }

    static boolean requiresGameId(String action) {
        switch (action) {
            case "sendPlayerAction":
            case "sendPlayerUUID":
            case "sendPlayerBoolean":
            case "sendPlayerInteger":
            case "sendPlayerString":
            case "sendPlayerManaType":
            case "watchGame":
            case "stopWatching":
            case "joinGame":
            case "quitMatch":
                return true;
            default:
                return false;
        }
    }

    private synchronized void connect(WebSocket conn, String requestId, String host, int port, String username, String password) {
        if (graceDisconnectTimer != null) {
            graceDisconnectTimer.cancel(false);
            graceDisconnectTimer = null;
            logger.info("connect: cancelled grace disconnect timer");
        }
        // idempotent connect: same user + same server already connected (e.g. several browser
        // tabs re-login after a proxy restart). Restarting the session here would kill the
        // server session and start a reconnect loop (test mode kicks duplicate users on the
        // same host), leaving the WebSocket registry empty and broadcasts at 0 connections.
        if (connected && isSameSession(host, port, username)) {
            logger.info("connect: already connected as " + username + " at " + host + ":" + port + " — no session restart");
            if (conn != null) {
                authorized.add(conn);
            }
            gateway.send(conn, resultJson("connect", requestId, true, null, null));
            return;
        }
        if (conn != null) {
            authorized.remove(conn);
        }
        if (connected) {
            // replace the old session instead of rejecting the new client (refresh/reconnect case)
            logger.info("connect: already connected, disconnecting old session first");
            stopSims();
            authorized.clear();
            session.connectStop(false, false);
            connected = false;
            try {
                Thread.sleep(500);
            } catch (InterruptedException ignored) {
            }
        }
        Connection connection = new Connection();
        connection.setHost(host);
        connection.setPort(port);
        connection.setUsername(username);
        connection.setPassword(password);
        connection.setUserIdStr(System.getProperty("user.name") + ":" + System.getProperty("os.name") + ":mage-proxy");
        connection.setUserData(UserData.getDefaultUserDataView());
        connection.setProxyType(Connection.ProxyType.NONE);

        serverHost = host;
        serverPort = port;

        boolean ok = session.connectStart(connection);
        connected = ok;
        logger.info("connectStart=" + ok + " lastError='" + session.getLastError() + "'");
        if (ok) {
            // new server session => its message ids restart low, so the outdated-guard
            // would silently drop every UPDATE event of the new session otherwise
            lastMessages.replaceAll((t, v) -> 0);
            // new session owns a fresh set of games; events of the previous user's still-running
            // games (re-sent by the server over the same channel) must be dropped, not forwarded
            sessionGameIds.clear();
            // drop callbacks still queued from the previous session instead of replaying them
            // to the new client (e.g. a WATCHGAME that lagged behind the update flood)
            callbackExecutor.shutdownNow();
            callbackExecutor = Executors.newSingleThreadExecutor();
            // a dead lobby timer (e.g. an uncatchable error during a server restart) must be
            // healed on reconnect, or the lobby UI would never receive table broadcasts again
            lobbyTimer.shutdownNow();
            lobbyTimer = Executors.newSingleThreadScheduledExecutor();
            lobbyTimer.scheduleWithFixedDelay(this::publishLobby, 0, 2, TimeUnit.SECONDS);
            if (conn != null) {
                authorized.add(conn);
            }
            gateway.send(conn, resultJson("connect", requestId, true, null, null));
        } else {
            gateway.send(conn, resultJson("connect", requestId, false, ERR_FAILED, session.getLastError()));
        }
    }

    public void connect(String host, int port, String username, String password) {
        connect(null, "", host, port, username, password);
    }

    private boolean isSameSession(String host, int port, String username) {
        try {
            return session.getUserName() != null
                    && session.getUserName().equalsIgnoreCase(username)
                    && session.getServerHost().equalsIgnoreCase(host);
        } catch (Exception ex) {
            return false;
        }
    }

    static MatchOptions parseMatchOptions(JsonObject args) {
        String name = str(args, "name", "Game " + System.currentTimeMillis());
        String gameType = str(args, "gameType", "");
        boolean multiPlayer = getBool(args, "multiPlayer", false);
        MatchOptions options = new MatchOptions(name, gameType, multiPlayer);
        options.setDeckType(str(args, "deckType", ""));
        options.setLimited(getBool(args, "limited", false));
        options.setWinsNeeded(getInt(args, "winsNeeded", 1));
        // default high value, so any user can create tables (real client lets the owner pick it)
        options.setQuitRatio(getInt(args, "quitRatio", 100));
        options.setPassword(str(args, "password", ""));
        options.setSpectatorsAllowed(getBool(args, "spectatorsAllowed", true));
        // modo test: no barajar el mazo inicial (la librería queda en el orden
        // enviado); los servidores sin modificar ignoran el campo
        options.setSkipInitShuffling(getBool(args, "skipInitShuffling", false));
        // modo test: sin sorteo aleatorio de starting player (el primer jugador de
        // la mesa empieza); los servidores sin modificar ignoran el campo
        options.setSkipStartingPlayerChoice(getBool(args, "skipStartingPlayerChoice", false));
        options.getPlayerTypes().add(PlayerType.HUMAN);
        if (args.has("playerTypes")) {
            JsonArray arr = args.getAsJsonArray("playerTypes");
            List<PlayerType> types = new java.util.ArrayList<>();
            for (JsonElement e : arr) {
                String raw = e.getAsString();
                if ("SIM".equalsIgnoreCase(raw)) {
                    // asiento simulado: el servidor oficial ve un asiento humano normal
                    types.add(PlayerType.HUMAN);
                } else {
                    types.add(PlayerType.valueOf(raw.toUpperCase(Locale.ROOT)));
                }
            }
            if (!types.isEmpty()) {
                options.getPlayerTypes().clear();
                options.getPlayerTypes().addAll(types);
            }
        }
        return options;
    }

    // ============================ simulated seats (SIM) ============================

    /** Crea y une un SimPlayer por cada asiento "SIM" de la mesa recién creada. */
    private void startSims(JsonObject args, UUID roomId, UUID tableId) {
        if (!args.has("playerTypes")) {
            return;
        }
        JsonArray types = args.getAsJsonArray("playerTypes");
        int simSeats = 0;
        for (JsonElement e : types) {
            if ("SIM".equalsIgnoreCase(e.getAsString())) {
                simSeats++;
            }
        }
        if (simSeats == 0) {
            return;
        }
        JsonArray simDecks = args.has("simDecks") && args.get("simDecks").isJsonArray()
                ? args.getAsJsonArray("simDecks") : null;
        for (int i = 0; i < simSeats; i++) {
            DeckCardLists deck = null;
            if (simDecks != null && i < simDecks.size() && simDecks.get(i).isJsonObject()) {
                deck = DeckJson.parse(simDecks.get(i).getAsJsonObject());
            }
            if (deck == null) {
                deck = defaultSimDeck();
            }
            SimPlayer sim = new SimPlayer(nextSimUsername(), config.getPassword(), deck, serverHost, serverPort);
            sims.put(tableId + "#" + i, sim);
            boolean joined = sim.startAndJoin(roomId, tableId);
            logger.info("sim seat " + i + " for table " + tableId + " (" + sim.getUsername() + ") joined=" + joined);
        }
    }

    private String nextSimUsername() {
        return "sim-" + String.format("%06d", ++simCounter) + "-" + (System.currentTimeMillis() % 1000);
    }

    /** Mazo por defecto del asiento simulado: solo tierras (partida determinista). */
    private static DeckCardLists defaultSimDeck() {
        JsonObject deck = new JsonObject();
        deck.addProperty("name", "Sim lands");
        JsonArray cards = new JsonArray();
        cards.add(cardJson("Island", "LEA", "288", 30));
        cards.add(cardJson("Mountain", "LEA", "292", 30));
        deck.add("cards", cards);
        deck.add("sideboard", new JsonArray());
        return DeckJson.parse(deck);
    }

    private static JsonObject cardJson(String name, String set, String number, int amount) {
        JsonObject card = new JsonObject();
        card.addProperty("cardName", name);
        card.addProperty("setCode", set);
        card.addProperty("cardNumber", number);
        card.addProperty("amount", amount);
        return card;
    }

    /** Detiene todos los bots simulados (nuevo usuario o desconexión del web). */
    private void stopSims() {
        for (SimPlayer sim : sims.values()) {
            try {
                sim.stop();
            } catch (Exception ignored) {
            }
        }
        sims.clear();
    }

    private static Object parseActionData(JsonElement data) {
        if (data == null || data.isJsonNull()) {
            return null;
        }
        if (data.isJsonPrimitive()) {
            com.google.gson.JsonPrimitive prim = data.getAsJsonPrimitive();
            if (prim.isBoolean()) {
                return prim.getAsBoolean();
            }
            if (prim.isNumber()) {
                return prim.getAsInt();
            }
            return prim.getAsString();
        }
        return data.toString();
    }

    // ============================ helpers ============================

    private static String str(JsonObject args, String key, String defaultValue) {
        return args.has(key) && args.get(key).isJsonPrimitive() ? args.get(key).getAsString() : defaultValue;
    }

    private static int getInt(JsonObject args, String key, int defaultValue) {
        return args.has(key) && args.get(key).isJsonPrimitive() ? args.get(key).getAsInt() : defaultValue;
    }

    private static boolean getBool(JsonObject args, String key, boolean defaultValue) {
        return args.has(key) && args.get(key).isJsonPrimitive() ? args.get(key).getAsBoolean() : defaultValue;
    }

    private static UUID uuid(JsonObject args, String key, UUID defaultValue) {
        String value = str(args, key, null);
        if (value == null || value.isEmpty()) {
            return defaultValue;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            return defaultValue;
        }
    }

    private static void sendInfo(WebSocket conn, String message) {
        JsonObject ev = new JsonObject();
        ev.addProperty("type", "info");
        ev.addProperty("message", message);
        gatewaySend(conn, ev.toString());
    }

    private static void gatewaySend(WebSocket conn, String json) {
        if (conn != null && conn.isOpen()) {
            conn.send(json);
        }
    }

    static String resultJson(String action, String requestId, boolean ok, String errorCode, Object data) {
        JsonObject res = new JsonObject();
        res.addProperty("type", "result");
        res.addProperty("action", action);
        res.addProperty("requestId", requestId == null ? "" : requestId);
        res.addProperty("ok", ok);
        if (errorCode != null) {
            res.addProperty("errorCode", errorCode);
        }
        if (!ok) {
            if (data instanceof String) {
                res.addProperty("error", (String) data);
            } else if (data != null) {
                res.addProperty("error", JsonUtil.toJson(data));
            } else {
                res.addProperty("error", errorCode == null ? "Command failed" : errorCode);
            }
        } else if (data != null) {
            if (data instanceof JsonElement) {
                res.add("data", (JsonElement) data);
            } else if (data instanceof String) {
                res.addProperty("data", (String) data);
            } else {
                res.add("data", JsonParser.parseString(JsonUtil.toJson(data)));
            }
        }
        return res.toString();
    }

    /** Compat: usado por el auto-connect de arranque (sin requestId). */
    private static String resultJson(String action, boolean ok, Object data) {
        return resultJson(action, "", ok, ok ? null : ERR_FAILED, data);
    }
}

