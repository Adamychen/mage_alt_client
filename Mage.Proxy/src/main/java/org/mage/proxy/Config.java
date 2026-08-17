package org.mage.proxy;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Proxy configuration from command line args: --key value
 */
public class Config {

    public static final String DEFAULT_SERVER_HOST = "beta.xmage.today";
    public static final int DEFAULT_SERVER_PORT = 17171;
    public static final int DEFAULT_WS_PORT = 8787;
    public static final int DEFAULT_HTTP_PORT = 8788;
    public static final String DEFAULT_BIND_ADDRESS = "127.0.0.1";
    public static final int DEFAULT_MAX_MESSAGE_BYTES = 1024 * 1024;
    public static final int DEFAULT_MAX_MESSAGES_PER_SECOND = 100;

    /**
     * Protocolo JSON del gateway. Se incrementa con cada cambio incompatible del
     * contrato (campos obligatorios, formas de error, etc.).
     */
    public static final String PROTOCOL_VERSION = "1";

    private final Map<String, String> values = new HashMap<>();

    public static Config parse(String[] args) {
        Config config = new Config();
        for (int i = 0; i + 1 < args.length; i++) {
            String key = args[i];
            if (key.startsWith("--")) {
                config.values.put(key.substring(2), args[i + 1]);
                i++;
            }
        }
        return config;
    }

    public String get(String key, String defaultValue) {
        return values.getOrDefault(key, defaultValue);
    }

    public int getInt(String key, int defaultValue) {
        try {
            return Integer.parseInt(get(key, String.valueOf(defaultValue)));
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    public String getServerHost() {
        return get("host", DEFAULT_SERVER_HOST);
    }

    public int getServerPort() {
        return getInt("port", DEFAULT_SERVER_PORT);
    }

    public String getUsername() {
        return get("username", "");
    }

    public String getPassword() {
        return get("password", "");
    }

    public boolean hasAutoConnect() {
        return !getUsername().isEmpty();
    }

    public int getWsPort() {
        return getInt("wsPort", DEFAULT_WS_PORT);
    }

    public int getHttpPort() {
        return getInt("httpPort", DEFAULT_HTTP_PORT);
    }

    public String getWebDir() {
        return get("webDir", "web");
    }

    /**
     * Dirección de bind de ws/http. Por defecto solo loopback (127.0.0.1):
     * local-first seguro. Para exponer el proxy hay que pasarlo explícitamente.
     */
    public String getBindAddress() {
        return get("bind", DEFAULT_BIND_ADDRESS);
    }

    /**
     * Orígenes WebSocket exactos permitidos (separados por coma).
     * Vacío = política por defecto local-first: solo orígenes de localhost.
     */
    public Set<String> getAllowedOrigins() {
        String raw = get("allowedOrigins", "");
        if (raw.trim().isEmpty()) {
            return Collections.emptySet();
        }
        Set<String> out = new HashSet<>();
        for (String part : raw.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                out.add(trimmed);
            }
        }
        return out;
    }

    public int getMaxMessageBytes() {
        return getInt("maxMessageBytes", DEFAULT_MAX_MESSAGE_BYTES);
    }

    public int getMaxMessagesPerSecond() {
        return getInt("maxMessagesPerSecond", DEFAULT_MAX_MESSAGES_PER_SECOND);
    }
}
