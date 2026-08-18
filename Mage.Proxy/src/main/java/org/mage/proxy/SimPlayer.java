package org.mage.proxy;

import mage.cards.decks.DeckCardLists;
import mage.constants.CardType;
import mage.constants.Constants;
import mage.constants.PhaseStep;
import mage.interfaces.MageClient;
import mage.interfaces.callback.ClientCallback;
import mage.interfaces.callback.ClientCallbackMethod;
import mage.players.PlayerType;
import mage.players.net.UserData;
import mage.remote.Connection;
import mage.remote.SessionImpl;
import mage.utils.MageVersion;
import mage.view.CardView;
import mage.view.CardsView;
import mage.view.GameClientMessage;
import mage.view.GameEndView;
import mage.view.GameView;
import mage.view.PermanentView;
import mage.view.PlayerView;
import mage.view.TableClientMessage;

import java.io.Serializable;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Oponente simulado determinista (asiento "SIM"). Su propia sesión de servidor
 * (el servidor oficial ve un asiento humano normal) y un guion fijo:
 * <ul>
 * <li>juega una tierra por turno en su main phase,</li>
 * <li>lanza la primera criatura/instantáneo/conjuro de la mano que pueda pagar
 * con sus tierras sin girar (apuntando al jugador oponente),</li>
 * <li>ataca siempre con todas sus criaturas ("All attack"),</li>
 * <li>bloquea siempre con todas sus criaturas,</li>
 * <li>responde todos los diálogos obligatorios (mulligan = mantener, descarte,
 * "pass anyway", pago de maná).</li>
 * </ul>
 * Con mazos deterministas (no barajar) la partida es totalmente predecible.
 */
public class SimPlayer implements MageClient {

    private static final Logger logger = Logger.getLogger(SimPlayer.class.getName());
    private static final Pattern COLOR_PATTERN = Pattern.compile("\\{(R|W|U|B|G)\\}");

    private final String username;
    private final String password;
    private final String host;
    private final int port;
    private final DeckCardLists deck;
    private final MageVersion version;
    private final SessionImpl session;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final CompletableFuture<Boolean> ready = new CompletableFuture<>();

    private volatile boolean running = true;
    private volatile UUID roomId;
    private volatile UUID tableId;
    private volatile UUID gameId;
    private UUID myPlayerId;
    private int lastLandTurn = -1;
    private String lastCastSignature = null;

    public SimPlayer(String username, String password, DeckCardLists deck, String host, int port) {
        this.username = username;
        this.password = password;
        this.host = host;
        this.port = port;
        this.deck = deck;
        this.version = new MageVersion(SimPlayer.class);
        this.session = new SessionImpl(this);
    }

    public String getUsername() {
        return username;
    }

    /** Conecta y se une a la mesa del asiento SIM (bloquea hasta el join o timeout). */
    public boolean startAndJoin(UUID roomId, UUID tableId) {
        this.roomId = roomId;
        this.tableId = tableId;
        executor.execute(() -> {
            try {
                runConnectAndJoin();
            } catch (Exception ex) {
                logger.log(Level.WARNING, "sim " + username + " failed to start: " + ex.getMessage(), ex);
                ready.complete(false);
            }
        });
        try {
            return ready.get(5, TimeUnit.SECONDS);
        } catch (Exception ex) {
            logger.log(Level.WARNING, "sim " + username + " not ready in time: " + ex.getMessage());
            return false;
        }
    }

    public void stop() {
        running = false;
        executor.shutdownNow();
        try {
            session.connectStop(false, false);
        } catch (Exception ignored) {
        }
    }

    public boolean isRunning() {
        return running;
    }

    // ============================ MageClient ============================

    @Override
    public MageVersion getVersion() {
        return version;
    }

    @Override
    public void connected(String message) {
        logger.info("sim " + username + " connected to server: " + message);
    }

    @Override
    public void disconnected(boolean askToReconnect, boolean keepMySessionActive) {
        logger.info("sim " + username + " disconnected");
        ready.complete(false);
    }

    @Override
    public void showMessage(String message) {
        logger.info("sim " + username + " message: " + message);
    }

    @Override
    public void showError(String message) {
        logger.warning("sim " + username + " error: " + message);
    }

    @Override
    public void onNewConnection() {
        // nothing to do
    }

    @Override
    public void onCallback(ClientCallback callback) {
        if (!running) {
            return;
        }
        executor.execute(() -> processCallback(callback));
    }

    // ============================ setup ============================

    private void runConnectAndJoin() {
        if (!connect()) {
            ready.complete(false);
            return;
        }
        if (tableId == null) {
            ready.complete(true);
            return;
        }
        UUID room = roomId != null ? roomId : session.getMainRoomId();
        boolean joined = session.joinTable(room, tableId, username, PlayerType.HUMAN, 0, deck, "");
        logger.info("sim " + username + " joined table " + tableId + " => " + joined);
        ready.complete(joined);
    }

    private boolean connect() {
        Connection connection = new Connection();
        connection.setHost(host);
        connection.setPort(port);
        connection.setUsername(username);
        connection.setPassword(password);
        connection.setUserIdStr(System.getProperty("user.name") + ":" + System.getProperty("os.name") + ":mage-sim");
        connection.setUserData(UserData.getDefaultUserDataView());
        connection.setProxyType(Connection.ProxyType.NONE);
        boolean ok = session.connectStart(connection);
        logger.info("sim " + username + " connectStart=" + ok + " host=" + host + ":" + port
                + " lastError='" + session.getLastError() + "'");
        return ok;
    }

    // ============================ bot logic ============================

    private void processCallback(ClientCallback cb) {
        try {
            cb.decompressData();
            Object data = cb.getData();
            if (logger.isLoggable(Level.FINE) || cb.getMethod() != ClientCallbackMethod.GAME_UPDATE
                    && cb.getMethod() != ClientCallbackMethod.GAME_UPDATE_AND_INFORM) {
                logger.info("sim " + username + " event >> " + cb.getMethod()
                        + (cb.getObjectId() != null ? " (obj=" + cb.getObjectId() + ")" : ""));
            }
            switch (cb.getMethod()) {
                case START_GAME:
                case GAME_INIT: {
                    gameId = cb.getObjectId();
                    if (cb.getMethod() == ClientCallbackMethod.START_GAME && gameId != null) {
                        // unirse a la partida ya: elimina la espera de 10s del servidor
                        session.joinGame(gameId);
                    }
                    break;
                }
                case GAME_ASK: {
                    // mulligan: false = mantener la mano; el resto de preguntas ("pass
                    // anyway", opciones de elección) se aceptan con true
                    String msg = lower(data instanceof GameClientMessage ? ((GameClientMessage) data).getMessage() : null);
                    boolean answer = !isMulliganAsk(msg);
                    logger.info("sim " + username + " ask msg='" + msg + "' -> sendPlayerBoolean(" + answer + ")");
                    session.sendPlayerBoolean(gameId, answer);
                    break;
                }
                case GAME_SELECT: {
                    if (data instanceof GameClientMessage) {
                        onSelect((GameClientMessage) data);
                    }
                    break;
                }
                case GAME_TARGET: {
                    if (data instanceof GameClientMessage) {
                        onTarget((GameClientMessage) data);
                    }
                    break;
                }
                case GAME_PLAY_MANA: {
                    if (data instanceof GameClientMessage) {
                        onPlayMana((GameClientMessage) data);
                    }
                    break;
                }
                case GAME_PLAY_XMANA:
                case GAME_GET_AMOUNT:
                case GAME_GET_MULTI_AMOUNT:
                case GAME_CHOOSE_ABILITY:
                case GAME_CHOOSE_PILE:
                case GAME_CHOOSE_CHOICE:
                    // el guion nunca las provoca; por seguridad, cancelar
                    cancel();
                    break;
                case GAME_OVER:
                    logger.info("sim " + username + ": game over");
                    break;
                case SIDEBOARD: {
                    // match best-of-N: el match continúa y el servidor espera el
                    // mazo de la siguiente partida — devolver el mismo mazo
                    if (data instanceof TableClientMessage) {
                        TableClientMessage msg = (TableClientMessage) data;
                        if (msg.getCurrentTableId() != null) {
                            logger.info("sim " + username + " sideboard: enviando el mazo (match continúa)");
                            session.submitDeck(msg.getCurrentTableId(), deck);
                        }
                    }
                    break;
                }
                case END_GAME_INFO:
                    // tras cada game del match llega END_GAME_INFO; solo parar
                    // cuando el MATCH termina (matchView.endTime se fija al final)
                    if (isMatchOver(data)) {
                        if (gameId != null) {
                            try {
                                session.quitMatch(gameId);
                            } catch (Exception ignored) {
                            }
                        }
                        stop();
                    }
                    break;
                default:
                    break;
            }
        } catch (Exception ex) {
            logger.log(Level.WARNING, "sim " + username + " callback error: " + ex.getMessage(), ex);
        }
    }

    private void onSelect(GameClientMessage gcm) {
        GameView view = gcm.getGameView();
        if (view == null) {
            logger.info("sim " + username + " select sin gameView -> pass");
            pass();
            return;
        }
        PlayerView me = view.getMyPlayer();
        if (me != null) {
            myPlayerId = me.getPlayerId();
        }
        PhaseStep step = view.getStep();
        Map<String, Serializable> options = gcm.getOptions();
        logger.info("sim " + username + " select step=" + step + " me=" + (me == null ? "null"
                : "prio=" + me.hasPriority() + " active=" + me.isActive())
                + " hand=" + (view.getMyHand() == null ? 0 : view.getMyHand().size())
                + " lands=" + countUntappedLands(me)
                + " msg='" + gcm.getMessage() + "'");
        // atacantes: "All attack" en el primer select; fin (false) en el re-select vacío
        if (step == PhaseStep.DECLARE_ATTACKERS) {
            if (options != null && "All attack".equals(options.get(Constants.Option.SPECIAL_BUTTON))) {
                session.sendPlayerString(gameId, "special");
            } else {
                session.sendPlayerBoolean(gameId, false);
            }
            return;
        }
        // bloqueadores: un bloqueador por select; fin (false) cuando no quedan
        if (step == PhaseStep.DECLARE_BLOCKERS) {
            Object possible = options != null ? options.get(Constants.Option.POSSIBLE_BLOCKERS) : null;
            if (possible instanceof List && !((List<?>) possible).isEmpty() && ((List<?>) possible).get(0) instanceof UUID) {
                session.sendPlayerUUID(gameId, (UUID) ((List<?>) possible).get(0));
            } else {
                session.sendPlayerBoolean(gameId, false);
            }
            return;
        }
        if (me != null && me.hasPriority() && me.isActive() && step == PhaseStep.PRECOMBAT_MAIN) {
            if (tryPlayLand(view)) {
                return;
            }
            if (tryCast(view)) {
                return;
            }
        }
        pass();
    }

    private boolean tryPlayLand(GameView view) {
        int turn = view.getTurn();
        if (turn == lastLandTurn) {
            return false;
        }
        PlayerView me = view.getMyPlayer();
        if (me == null) {
            return false;
        }
        UUID land = firstLandInHand(view.getMyHand());
        if (land == null) {
            return false;
        }
        lastLandTurn = turn;
        session.sendPlayerUUID(gameId, land);
        return true;
    }

    private boolean tryCast(GameView view) {
        PlayerView me = view.getMyPlayer();
        if (me == null) {
            return false;
        }
        for (CardView card : view.getMyHand().values()) {
            if (!isSpell(card) || card.getManaValue() > countUntappedLands(me)) {
                continue;
            }
            // solo castear si las tierras sin girar pueden producir TODOS los colores
            // del coste (el servidor rechaza el cast si no: canPlay -> canPay FALSE)
            Set<Character> required = colorsOf(card.getManaCostStr());
            if (!canProduceColors(me, required)) {
                logger.info("sim " + username + " tryCast " + card.getName() + " sin maná de color "
                        + required + " -> skip");
                continue;
            }
            // si el servidor rechazó el mismo cast sin cambiar el estado (misma
            // firma turno/paso/mano/tierras), reintentarlo re-dispararía el
            // GAME_SELECT en bucle infinito -> pasar y dejar avanzar la partida
            String signature = view.getTurn() + ":" + view.getStep() + ":"
                    + view.getMyHand().size() + ":" + countUntappedLands(me);
            if (signature.equals(lastCastSignature)) {
                logger.info("sim " + username + " tryCast " + card.getName() + " rechazado (misma firma) -> pass");
                return false;
            }
            lastCastSignature = signature;
            logger.info("sim " + username + " tryCast " + card.getName() + " (mv=" + card.getManaValue()
                    + " untapped=" + countUntappedLands(me) + " colors=" + required + ")");
            session.sendPlayerUUID(gameId, card.getId());
            return true;
        }
        return false;
    }

    /** Colores (R/W/U/B/G) que aparecen en un coste de maná "{1}{R}{R}{W}". */
    private static Set<Character> colorsOf(String manaCost) {
        Set<Character> colors = new java.util.LinkedHashSet<>();
        if (manaCost == null) {
            return colors;
        }
        Matcher matcher = COLOR_PATTERN.matcher(manaCost);
        while (matcher.find()) {
            colors.add(matcher.group(1).charAt(0));
        }
        return colors;
    }

    /** true si las tierras sin girar del jugador pueden producir cada color pedido. */
    private static boolean canProduceColors(PlayerView player, Set<Character> required) {
        if (required.isEmpty()) {
            return true;
        }
        Set<Character> available = new java.util.LinkedHashSet<>();
        for (PermanentView perm : player.getBattlefield().values()) {
            if (!perm.isTapped() && isLand(perm)) {
                String name = perm.getName() == null ? "" : perm.getName();
                if (name.contains("Mountain")) {
                    available.add('R');
                } else if (name.contains("Island")) {
                    available.add('U');
                } else if (name.contains("Plains")) {
                    available.add('W');
                } else if (name.contains("Swamp")) {
                    available.add('B');
                } else if (name.contains("Forest")) {
                    available.add('G');
                }
            }
        }
        return available.containsAll(required);
    }

    private void onPlayMana(GameClientMessage gcm) {
        GameView view = gcm.getGameView();
        String msg = gcm.getMessage() == null ? "" : gcm.getMessage();
        Set<Character> required = requiredColors(msg);
        PlayerView me = view != null ? view.getMyPlayer() : null;
        if (me == null) {
            logger.info("sim " + username + " playMana sin jugador -> cancel ('" + msg + "')");
            cancel();
            return;
        }
        UUID source = null;
        String sourceName = null;
        for (PermanentView perm : me.getBattlefield().values()) {
            if (perm.isTapped() || !isLand(perm)) {
                continue;
            }
            if (required.isEmpty() || landProduces(perm, required)) {
                source = perm.getId();
                sourceName = perm.getName();
                break;
            }
        }
        if (source != null) {
            logger.info("sim " + username + " playMana: paga '" + msg + "' con " + sourceName + " (" + source + ") untapped=" + countUntappedLands(me));
            session.sendPlayerUUID(gameId, source);
        } else {
            logger.info("sim " + username + " playMana: sin fuente para '" + msg + "' (untapped=" + countUntappedLands(me) + ") -> cancel");
            cancel();
        }
    }

    private void onTarget(GameClientMessage gcm) {
        Set<UUID> targets = gcm.getTargets();
        if (targets == null || targets.isEmpty()) {
            cancel();
            return;
        }
        String msg = lower(gcm.getMessage());
        if (msg.contains("discard")) {
            CardsView cards = gcm.getCardsView1();
            UUID card = null;
            if (cards != null && !cards.isEmpty()) {
                card = cards.keySet().iterator().next();
            }
            session.sendPlayerUUID(gameId, card != null ? card : targets.iterator().next());
            return;
        }
        UUID opponent = opponentPlayerId(gcm.getGameView());
        if (opponent != null && targets.contains(opponent)) {
            session.sendPlayerUUID(gameId, opponent);
            return;
        }
        session.sendPlayerUUID(gameId, targets.iterator().next());
    }

    // ============================ helpers ============================

    private void pass() {
        if (gameId != null) {
            session.sendPlayerBoolean(gameId, false);
        }
    }

    private void cancel() {
        if (gameId != null) {
            session.sendPlayerBoolean(gameId, false);
        }
    }

    static boolean isMulliganAsk(String msg) {
        return msg != null && (msg.contains("keep your hand") || msg.contains("mulligan") || msg.contains("keep hand"));
    }

    /** true si el END_GAME_INFO corresponde al fin del MATCH (no de un game
     *  intermedio): matchView.endTime solo se fija cuando alguien llega a
     *  winsNeeded. */
    private static boolean isMatchOver(Object data) {
        if (data instanceof GameEndView) {
            GameEndView end = (GameEndView) data;
            if (end.getMatchView() != null && end.getMatchView().getEndTime() != null) {
                return true;
            }
        }
        String info = data == null ? "" : data.toString();
        return info.contains("won the match");
    }

    private static boolean isLand(CardView card) {
        return card.getCardTypes().contains(CardType.LAND);
    }

    private static boolean isSpell(CardView card) {
        return card.getCardTypes().contains(CardType.CREATURE)
                || card.getCardTypes().contains(CardType.INSTANT)
                || card.getCardTypes().contains(CardType.SORCERY);
    }

    private static UUID firstLandInHand(CardsView hand) {
        if (hand == null) {
            return null;
        }
        for (CardView card : hand.values()) {
            if (isLand(card)) {
                return card.getId();
            }
        }
        return null;
    }

    private static int countUntappedLands(PlayerView player) {
        int count = 0;
        for (PermanentView perm : player.getBattlefield().values()) {
            if (!perm.isTapped() && isLand(perm)) {
                count++;
            }
        }
        return count;
    }

    static Set<Character> requiredColors(String message) {
        Set<Character> colors = new java.util.LinkedHashSet<>();
        if (message == null) {
            return colors;
        }
        Matcher matcher = COLOR_PATTERN.matcher(message);
        while (matcher.find()) {
            colors.add(matcher.group(1).charAt(0));
        }
        return colors;
    }

    private static boolean landProduces(PermanentView perm, Set<Character> required) {
        // los básicos se detectan por nombre (el color del view es poco fiable
        // para tierras básicas en algunos contextos de simulación)
        String name = perm.getName() == null ? "" : perm.getName();
        char namedColor = 0;
        if (name.contains("Mountain")) {
            namedColor = 'R';
        } else if (name.contains("Island")) {
            namedColor = 'U';
        } else if (name.contains("Plains")) {
            namedColor = 'W';
        } else if (name.contains("Swamp")) {
            namedColor = 'B';
        } else if (name.contains("Forest")) {
            namedColor = 'G';
        }
        if (namedColor != 0) {
            return required.isEmpty() || required.contains(namedColor);
        }
        if (required.isEmpty()) {
            return true;
        }
        mage.ObjectColor color = perm.getColor();
        return color != null && (required.contains('R') && color.isRed()
                || required.contains('W') && color.isWhite()
                || required.contains('U') && color.isBlue()
                || required.contains('B') && color.isBlack()
                || required.contains('G') && color.isGreen());
    }

    private UUID opponentPlayerId(GameView view) {
        if (view == null) {
            return null;
        }
        for (PlayerView player : view.getPlayers()) {
            if (myPlayerId == null || !player.getPlayerId().equals(myPlayerId)) {
                return player.getPlayerId();
            }
        }
        return null;
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}