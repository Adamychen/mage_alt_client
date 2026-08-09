package org.mage.proxy;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProtocolTest {

    @Test
    void resultEchoesRequestIdAndErrorCode() {
        String raw = ProxyClient.resultJson("sendPlayerAction", "42", false, ProxyClient.ERR_GAME_ID_REQUIRED, "gameId is required");
        JsonObject result = JsonParser.parseString(raw).getAsJsonObject();

        assertEquals("result", result.get("type").getAsString());
        assertEquals("sendPlayerAction", result.get("action").getAsString());
        assertEquals("42", result.get("requestId").getAsString());
        assertTrue(!result.get("ok").getAsBoolean());
        assertEquals(ProxyClient.ERR_GAME_ID_REQUIRED, result.get("errorCode").getAsString());
        assertEquals("gameId is required", result.get("error").getAsString());
        assertTrue(!result.has("data"));
    }

    @Test
    void successfulResultDoesNotAddAnErrorCode() {
        JsonObject result = JsonParser.parseString(
                ProxyClient.resultJson("ping", "7", true, null, "pong")
        ).getAsJsonObject();

        assertEquals("7", result.get("requestId").getAsString());
        assertTrue(result.get("ok").getAsBoolean());
        assertTrue(!result.has("errorCode"));
        assertEquals("pong", result.get("data").getAsString());
    }

    @Test
    void identifiesCommandsThatMustCarryAGameId() {
        assertTrue(ProxyClient.requiresGameId("sendPlayerAction"));
        assertTrue(ProxyClient.requiresGameId("sendPlayerUUID"));
        assertTrue(ProxyClient.requiresGameId("sendPlayerBoolean"));
        assertTrue(ProxyClient.requiresGameId("sendPlayerInteger"));
        assertTrue(ProxyClient.requiresGameId("sendPlayerString"));
        assertTrue(ProxyClient.requiresGameId("sendPlayerManaType"));
        assertTrue(ProxyClient.requiresGameId("watchGame"));
        assertTrue(ProxyClient.requiresGameId("quitMatch"));
        assertTrue(!ProxyClient.requiresGameId("getServerInfo"));
        assertTrue(!ProxyClient.requiresGameId("createTable"));
    }
}
