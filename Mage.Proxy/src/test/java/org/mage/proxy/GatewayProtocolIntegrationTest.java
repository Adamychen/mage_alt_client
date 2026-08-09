package org.mage.proxy;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GatewayProtocolIntegrationTest {

    private Gateway gateway;
    private ProxyClient proxy;
    private TestClient client;

    @AfterEach
    void stop() throws Exception {
        if (client != null) {
            client.closeClient();
        }
        if (proxy != null) {
            proxy.shutdown();
        }
        if (gateway != null) {
            gateway.stop(1000);
        }
    }

    @Test
    void echoesRequestIdAndProtectsCommandsUntilConnect() throws Exception {
        start(Config.parse(new String[]{"--maxMessageBytes", "4096"}));

        JsonObject ping = sendAndAwait("ping-1", "ping", "{}");
        assertTrue(ping.get("ok").getAsBoolean());
        assertEquals("ping-1", ping.get("requestId").getAsString());
        assertEquals("pong", ping.get("data").getAsString());

        JsonObject unauthorized = sendAndAwait("info-1", "getServerInfo", "{}");
        assertFalse(unauthorized.get("ok").getAsBoolean());
        assertEquals(ProxyClient.ERR_NOT_AUTHORIZED, unauthorized.get("errorCode").getAsString());

        JsonObject connect = sendAndAwait("connect-1", "connect", "{\"host\":\"127.0.0.1\",\"port\":1,\"username\":\"proxy-test\",\"password\":\"x\"}");
        assertFalse(connect.get("ok").getAsBoolean());
        assertEquals("connect-1", connect.get("requestId").getAsString());

        JsonObject action = sendAndAwait("action-1", "sendPlayerBoolean", "{\"gameId\":\"00000000-0000-0000-0000-000000000001\",\"value\":false}");
        assertFalse(action.get("ok").getAsBoolean());
        assertEquals(ProxyClient.ERR_NOT_AUTHORIZED, action.get("errorCode").getAsString());
    }

    @Test
    void closesConnectionsThatSendOversizedMessages() throws Exception {
        start(Config.parse(new String[]{"--maxMessageBytes", "128"}));
        StringBuilder payload = new StringBuilder("{\"requestId\":\"large\",\"action\":\"ping\",\"args\":{\"value\":\"");
        for (int i = 0; i < 256; i++) {
            payload.append('x');
        }
        payload.append("\"}}");
        client.send(payload.toString());

        assertTrue(client.awaitClose(5, TimeUnit.SECONDS));
        assertEquals(1009, client.closeCode);
    }

    @Test
    void closesConnectionsThatExceedTheMessageRate() throws Exception {
        start(Config.parse(new String[]{"--maxMessagesPerSecond", "2"}));
        client.send("{\"requestId\":\"rate-1\",\"action\":\"ping\",\"args\":{}}");
        client.send("{\"requestId\":\"rate-2\",\"action\":\"ping\",\"args\":{}}");
        client.send("{\"requestId\":\"rate-3\",\"action\":\"ping\",\"args\":{}}");

        assertTrue(client.awaitClose(5, TimeUnit.SECONDS));
        assertEquals(1008, client.closeCode);
    }

    private void start(Config config) throws Exception {
        gateway = new Gateway(config, 0);
        proxy = new ProxyClient(config, gateway);
        gateway.setHandler(proxy);
        gateway.start();
        long deadline = System.currentTimeMillis() + 5000;
        while (gateway.getPort() == 0 && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
        assertTrue(gateway.getPort() > 0, "gateway did not bind an ephemeral port");
        client = new TestClient(new URI("ws://127.0.0.1:" + gateway.getPort()));
        assertTrue(client.connectBlocking(5, TimeUnit.SECONDS));
    }

    private JsonObject sendAndAwait(String requestId, String action, String args) throws Exception {
        client.send("{\"requestId\":\"" + requestId + "\",\"action\":\"" + action + "\",\"args\":" + args + "}");
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            String raw = client.messages.poll(250, TimeUnit.MILLISECONDS);
            if (raw == null) continue;
            JsonObject message = JsonParser.parseString(raw).getAsJsonObject();
            if ("result".equals(message.get("type").getAsString())
                    && requestId.equals(message.get("requestId").getAsString())) {
                assertNotNull(message.get("action"));
                return message;
            }
        }
        throw new AssertionError("timeout waiting for requestId=" + requestId);
    }

    private static class TestClient extends WebSocketClient {
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private volatile int closeCode = -1;

        private TestClient(URI serverUri) {
            super(serverUri);
        }

        @Override
        public void onOpen(ServerHandshake handshake) {
        }

        @Override
        public void onMessage(String message) {
            messages.add(message);
        }

        @Override
        public void onClose(int code, String reason, boolean remote) {
            closeCode = code;
        }

        @Override
        public void onError(Exception ex) {
        }

        private boolean awaitClose(long timeout, TimeUnit unit) throws InterruptedException {
            long deadline = System.nanoTime() + unit.toNanos(timeout);
            while (isOpen() && System.nanoTime() < deadline) {
                Thread.sleep(10);
            }
            return !isOpen();
        }

        private void closeClient() throws InterruptedException {
            if (isOpen()) {
                close();
                awaitClose(2, TimeUnit.SECONDS);
            }
        }
    }
}
