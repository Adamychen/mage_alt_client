package org.mage.proxy;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JsonUtilTest {

    private enum Kind {
        SAMPLE
    }

    private static class Sample {
        private String text = "line\nquote\"";
        private UUID id = UUID.fromString("123e4567-e89b-12d3-a456-426614174000");
        private Kind kind = Kind.SAMPLE;
        private Date date = new Date(1234L);
        private Optional<String> present = Optional.of("yes");
        private Optional<String> empty = Optional.empty();
        private Map<String, Object> map = new LinkedHashMap<>();
        private Sample cycle;
        private transient String transientValue = "hidden";
        private static String staticValue = "hidden";

        private Sample() {
            map.put("items", Arrays.asList("a", "b"));
        }
    }

    @Test
    void serializesSupportedValuesAndSkipsTechnicalFields() {
        Sample sample = new Sample();
        sample.cycle = sample;

        JsonObject json = JsonParser.parseString(JsonUtil.toJson(sample)).getAsJsonObject();

        assertEquals("line\nquote\"", json.get("text").getAsString());
        assertEquals("123e4567-e89b-12d3-a456-426614174000", json.get("id").getAsString());
        assertEquals("SAMPLE", json.get("kind").getAsString());
        assertEquals(1234L, json.get("date").getAsLong());
        assertEquals("yes", json.get("present").getAsString());
        assertTrue(json.get("empty").isJsonNull());
        assertEquals(2, json.getAsJsonObject("map").getAsJsonArray("items").size());
        assertTrue(json.get("cycle").isJsonNull());
        assertTrue(!json.has("transientValue"));
        assertTrue(!json.has("staticValue"));
    }
}
