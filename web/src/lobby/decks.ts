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
// ORDENADO para partidas deterministas (skipInitShuffling): mano inicial con
// 4 Mountain + 3 Bolt → Bolt jugable en el turno 2.
export const DEFAULT_DECK: Deck = {
  name: 'Mage Web bolt',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 4 },
    { cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146', amount: 4 },
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 40 },
    { cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146', amount: 12 },
  ],
  sideboard: [],
}

// Mazo de verificación de flujos avanzados de Fase 2: X costs (Blaze), elección
// de modo (Boros Charm), multi-target (Arc Trail) y contadores (Walking Ballista).
// ORDENADO para partidas deterministas (skipInitShuffling): las 7 primeras cartas
// son la mano inicial (3 Mountain + Plains + 3 hechizos), la 8ª (Ballista) llega
// al turno 1, y los turnos 2-8 roban tierras para el Ballista X=4 (8 maná).
export const ADVANCED_DECK: Deck = {
  name: 'Mage Web advanced',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 3 },
    { cardName: 'Plains', setCode: 'LEA', cardNumber: '287', amount: 1 },
    { cardName: 'Blaze', setCode: '6ED', cardNumber: '168', amount: 1 },
    { cardName: 'Arc Trail', setCode: 'SOM', cardNumber: '81', amount: 1 },
    { cardName: 'Boros Charm', setCode: 'FDN', cardNumber: '721', amount: 1 },
    { cardName: 'Walking Ballista', setCode: '2XM', cardNumber: '306', amount: 1 },
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 7 },
    { cardName: 'Blaze', setCode: '6ED', cardNumber: '168', amount: 7 },
    { cardName: 'Plains', setCode: 'LEA', cardNumber: '287', amount: 7 },
    { cardName: 'Arc Trail', setCode: 'SOM', cardNumber: '81', amount: 7 },
    { cardName: 'Boros Charm', setCode: 'FDN', cardNumber: '721', amount: 7 },
    { cardName: 'Walking Ballista', setCode: '2XM', cardNumber: '306', amount: 7 },
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 16 },
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

// Mazo del humano en el E2E de combate: solo tierras. El humano nunca lanza nada y
// solo pasa (observa cómo el Sim ataca); su vida es el reloj del daño de combate.
export const LANDS_DECK: Deck = {
  name: 'Mage Web lands',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 50 },
    { cardName: 'Island', setCode: 'LEA', cardNumber: '288', amount: 50 },
  ],
  sideboard: [],
}

// Mazo del oponente Sim en el E2E de combate: tierras + Raging Goblin (1/1 haste).
// ORDENADO para partidas deterministas: la mano inicial es 4 Mountain + 2 Raging
// Goblin + Mountain; el Sim juega tierra en el turno 1, lanza un Goblin en el turno
// 2 (haste: ataca ese mismo turno) y ataca con todo cada turno.
export const COMBAT_OPPONENT_DECK: Deck = {
  name: 'Mage Web combat sim',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 4 },
    { cardName: 'Raging Goblin', setCode: 'M10', cardNumber: '153', amount: 2 },
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 26 },
    { cardName: 'Raging Goblin', setCode: 'M10', cardNumber: '153', amount: 18 },
  ],
  sideboard: [],
}

// Mazo del humano en los E2E de combate humano: tierras + Raging Goblin (1/1
// haste). ORDENADO para partidas deterministas (skipInitShuffling): mano inicial
// con 4 Mountain + 1 Goblin → el humano lanza el Goblin en el turno 1-2 y puede
// atacar ese mismo turno (haste) o bloquear el ataque del Sim.
export const COMBAT_HUMAN_DECK: Deck = {
  name: 'Mage Web combat human',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 4 },
    { cardName: 'Raging Goblin', setCode: 'M10', cardNumber: '153', amount: 1 },
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 26 },
    { cardName: 'Raging Goblin', setCode: 'M10', cardNumber: '153', amount: 19 },
  ],
  sideboard: [],
}

// Mazo del oponente Sim en el E2E de bloqueo humano: tierras + UN solo Raging
// Goblin en la mano inicial (1/1 haste). ORDENADO (skipInitShuffling): el Sim
// lanza el Goblin en su turno 1 y ataca SOLO con él cada turno (un atacante por
// combate → el bloqueo del humano es de asignación automática, sin GAME_TARGET).
export const COMBAT_BLOCK_SIM_DECK: Deck = {
  name: 'Mage Web block sim',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 5 },
    { cardName: 'Raging Goblin', setCode: 'M10', cardNumber: '153', amount: 1 },
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 20 },
    { cardName: 'Raging Goblin', setCode: 'M10', cardNumber: '153', amount: 24 },
  ],
  sideboard: [],
}

export const DECKS = [DEFAULT_DECK, ADVANCED_DECK, STABLE_DECK, AI_OPPONENT_DECK, COMBAT_OPPONENT_DECK, COMBAT_HUMAN_DECK, COMBAT_BLOCK_SIM_DECK, LANDS_DECK]

export const CUSTOM_DECKS_STORAGE_KEY = 'mage_custom_decks'

export function loadSavedCustomDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(CUSTOM_DECKS_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Deck[]
  } catch {
    return []
  }
}

export function saveCustomDecks(decks: Deck[]) {
  try {
    localStorage.setItem(CUSTOM_DECKS_STORAGE_KEY, JSON.stringify(decks))
  } catch {}
}

export function getAllAvailableDecks(): Deck[] {
  return [...DECKS, ...loadSavedCustomDecks()]
}
