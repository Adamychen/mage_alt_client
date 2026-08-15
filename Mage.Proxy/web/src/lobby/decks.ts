export interface DeckCard {
  cardName: string
  setCode: string
  cardNumber: string
  amount: number
}

export interface Deck {
  name: string
  cards: DeckCard[]
  sideboard: DeckCard[]
}

export const STABLE_DECK: Deck = {
  name: 'Mage Web starter',
  cards: [
    { cardName: 'Island', setCode: 'LEA', cardNumber: '288', amount: 28 },
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 28 },
    { cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146', amount: 4 },
  ],
  sideboard: [],
}

// Mazo para partidas humanas: mucha tierra + muchos Bolts, para poder jugar
// hechizos con objetivo en los primeros turnos (usado por los E2E de interacción).
export const DEFAULT_DECK: Deck = {
  name: 'Mage Web bolt',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 44 },
    { cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146', amount: 16 },
  ],
  sideboard: [],
}

// Mazo de verificación de flujos avanzados de Fase 2: X costs (Blaze), elección
// de modo (Boros Charm), multi-target (Arc Trail) y contadores (Walking Ballista).
export const ADVANCED_DECK: Deck = {
  name: 'Mage Web advanced',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 26 },
    { cardName: 'Plains', setCode: 'LEA', cardNumber: '287', amount: 8 },
    { cardName: 'Blaze', setCode: '6ED', cardNumber: '168', amount: 8 },
    { cardName: 'Arc Trail', setCode: 'SOM', cardNumber: '81', amount: 8 },
    { cardName: 'Boros Charm', setCode: 'FDN', cardNumber: '721', amount: 8 },
    { cardName: 'Walking Ballista', setCode: '2XM', cardNumber: '306', amount: 8 },
  ],
  sideboard: [],
}

// Mazo del oponente IA en mesas humanas: solo tierras. La IA con Bolts (DEFAULT_DECK)
// mata al humano en partidas largas y los E2E de hechizos avanzados se vuelven flakes.
export const AI_OPPONENT_DECK: Deck = {
  name: 'Mage Web AI lands',
  cards: [
    { cardName: 'Island', setCode: 'LEA', cardNumber: '288', amount: 50 },
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 50 },
  ],
  sideboard: [],
}

export const DECKS = [DEFAULT_DECK, ADVANCED_DECK, STABLE_DECK]
