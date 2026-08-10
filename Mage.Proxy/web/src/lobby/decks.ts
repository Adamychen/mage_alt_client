export const STABLE_DECK = {
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
export const DEFAULT_DECK = {
  name: 'Mage Web bolt',
  cards: [
    { cardName: 'Mountain', setCode: 'LEA', cardNumber: '292', amount: 44 },
    { cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146', amount: 16 },
  ],
  sideboard: [],
}
