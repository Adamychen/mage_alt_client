package org.mage.proxy;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.InetSocketAddress;
import java.net.URI;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * WebSocket server: transport between the web client and the proxy logic.
 * <p>
 * Seguridad local-first (todo aplicado en el transporte):
 * - bind a 127.0.0.1 por defecto (configurable con --bind)
 * - rechazo de orígenes WebSocket que no sean localhost (o --allowedOrigins)
 * - límite de tamaño de mensaje y de frecuencia por conexión
 */
public class Gateway extends WebSocketServer {

    private ProxyClient handler;
    private final Config config;

    /** recuento de mensajes por conexión (ventana deslizante de 1 s) */
    private final Map<WebSocket, Deque<Long>> messageTimes =
            Collections.synchronizedMap(new IdentityHashMap<WebSocket, Deque<Long>>());

    public Gateway(Config config) {
        this(config, config.getWsPort());
    }

    public Gateway(Config config, int port) {
        super(new InetSocketAddress(config.getBindAddress(), port));
        this.config = config;
        setReuseAddr(true);
    }

    public Config getConfig() {
        return config;
    }

    public void setHandler(ProxyClient handler) {
        this.handler = handler;
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        System.err.println("[proxy] ws open: " + conn.getRemoteSocketAddress() + " -> " + conn.getLocalSocketAddress());
        String origin = handshake.getFieldValue("Origin");
        if (!originAllowed(origin)) {
            System.err.println("[proxy] ws rejected origin=" + origin);
            conn.close(1008, "origin not allowed");
            return;
        }
        if (handler != null) {
            handler.onClientOpen(conn);
        }
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        messageTimes.remove(conn);
        System.err.println("[proxy] ws close: " + conn.getRemoteSocketAddress() + " code=" + code + " reason='" + reason + "'");
        if (handler != null) {
            handler.onClientClose(conn);
        }
    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        if (!rateLimit(conn)) {
            conn.close(1008, "message rate limit exceeded");
            return;
        }
        if (utf8Length(message) > config.getMaxMessageBytes()) {
            conn.close(1009, "message too large");
            return;
        }
        if (handler != null) {
            handler.onClientMessage(conn, message);
        }
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        System.err.println("[proxy] websocket error: " + ex);
    }

    @Override
    public void onStart() {
    }

    public void send(WebSocket conn, String json) {
        if (conn != null && conn.isOpen()) {
            conn.send(json);
        }
    }

    public void broadcast(String json) {
        int n = getConnections().size();
        if (n == 0) {
            System.err.println("[proxy] WARNING broadcast to 0 connections: " + (json.length() > 60 ? json.substring(0, 60) + "..." : json));
        }
        for (WebSocket conn : getConnections()) {
            if (conn.isOpen()) {
                conn.send(json);
            }
        }
    }

    /**
     * Permite conexiones sin Origin (node/self-test) y orígenes de localhost.
     * Si --allowedOrigins está definido, solo se aceptan esos valores exactos.
     */
    boolean originAllowed(String origin) {
        if (origin == null || origin.isEmpty()) {
            return true;
        }
        Set<String> allowed = config.getAllowedOrigins();
        if (!allowed.isEmpty()) {
            return allowed.contains(origin);
        }
        try {
            String host = new URI(origin).getHost();
            if (host == null) {
                return false;
            }
            String h = host.toLowerCase(Locale.ROOT);
            return h.equals("localhost") || h.equals("127.0.0.1") || h.equals("::1");
        } catch (Exception ex) {
            return false;
        }
    }

    private boolean rateLimit(WebSocket conn) {
        int max = config.getMaxMessagesPerSecond();
        if (max <= 0) {
            return true;
        }
        long now = System.currentTimeMillis();
        Deque<Long> times;
        synchronized (messageTimes) {
            times = messageTimes.get(conn);
            if (times == null) {
                times = new ArrayDeque<>();
                messageTimes.put(conn, times);
            }
        }
        synchronized (times) {
            while (!times.isEmpty() && now - times.peekFirst() > 1000) {
                times.pollFirst();
            }
            if (times.size() >= max) {
                return false;
            }
            times.addLast(now);
            return true;
        }
    }

    private static int utf8Length(String s) {
        int bytes = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            bytes += c < 0x80 ? 1 : (c < 0x800 ? 2 : 3);
        }
        return bytes;
    }
}
