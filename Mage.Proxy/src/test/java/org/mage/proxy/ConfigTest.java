package org.mage.proxy;

import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConfigTest {

    @Test
    void defaultsAreLocalAndBounded() {
        Config config = Config.parse(new String[0]);

        assertEquals(Config.DEFAULT_BIND_ADDRESS, config.getBindAddress());
        assertEquals(Config.DEFAULT_WS_PORT, config.getWsPort());
        assertEquals(Config.DEFAULT_HTTP_PORT, config.getHttpPort());
        assertEquals(Config.DEFAULT_MAX_MESSAGE_BYTES, config.getMaxMessageBytes());
        assertEquals(Config.DEFAULT_MAX_MESSAGES_PER_SECOND, config.getMaxMessagesPerSecond());
        assertTrue(config.getAllowedOrigins().isEmpty());
    }

    @Test
    void parsesSecurityOptionsAndTrimsOrigins() {
        Config config = Config.parse(new String[]{
                "--bind", "127.0.0.1",
                "--wsPort", "9001",
                "--httpPort", "9002",
                "--allowedOrigins", " http://localhost:5173,https://example.test ",
                "--maxMessageBytes", "2048",
                "--maxMessagesPerSecond", "12"
        });

        assertEquals("127.0.0.1", config.getBindAddress());
        assertEquals(9001, config.getWsPort());
        assertEquals(9002, config.getHttpPort());
        assertEquals(2048, config.getMaxMessageBytes());
        assertEquals(12, config.getMaxMessagesPerSecond());
        assertEquals(
                new java.util.HashSet<>(Arrays.asList("http://localhost:5173", "https://example.test")),
                config.getAllowedOrigins()
        );
    }

    @Test
    void invalidIntegersUseDefaults() {
        Config config = Config.parse(new String[]{
                "--wsPort", "not-a-port",
                "--maxMessageBytes", "nope"
        });

        assertEquals(Config.DEFAULT_WS_PORT, config.getWsPort());
        assertEquals(Config.DEFAULT_MAX_MESSAGE_BYTES, config.getMaxMessageBytes());
    }
}
