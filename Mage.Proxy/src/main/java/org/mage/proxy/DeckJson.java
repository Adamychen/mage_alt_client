package org.mage.proxy;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mage.cards.decks.DeckCardInfo;
import mage.cards.decks.DeckCardLists;

import java.util.ArrayList;
import java.util.List;

/**
 * Parses a deck from the web client JSON format into the XMage DeckCardLists:
 * <pre>
 * {"name":"My Deck","cards":[{"cardName":"Grizzly Bears","setCode":"M21","cardNumber":"178","amount":4}],
 *  "sideboard":[{"cardName":"...","setCode":"...","cardNumber":"...","amount":1}]}
 * </pre>
 */
public final class DeckJson {

    private DeckJson() {
    }

    public static DeckCardLists parse(JsonObject deckJson) {
        DeckCardLists deck = new DeckCardLists();
        if (deckJson == null) {
            return deck;
        }
        deck.setName(deckJson.has("name") ? deckJson.get("name").getAsString() : "");
        deck.setAuthor(deckJson.has("author") ? deckJson.get("author").getAsString() : "");
        deck.setCards(parseCards(deckJson.getAsJsonArray("cards")));
        deck.setSideboard(parseCards(deckJson.getAsJsonArray("sideboard")));
        return deck;
    }

    private static List<DeckCardInfo> parseCards(JsonArray array) {
        List<DeckCardInfo> result = new ArrayList<>();
        if (array == null) {
            return result;
        }
        for (JsonElement element : array) {
            JsonObject card = element.getAsJsonObject();
            String cardName = card.has("cardName") ? card.get("cardName").getAsString() : "";
            String setCode = card.has("setCode") ? card.get("setCode").getAsString() : "";
            String cardNumber = card.has("cardNumber") ? card.get("cardNumber").getAsString() : "";
            int amount = card.has("amount") ? card.get("amount").getAsInt() : 1;
            if (!cardName.isEmpty()) {
                result.add(new DeckCardInfo(cardName, cardNumber, setCode, amount));
            }
        }
        return result;
    }
}
