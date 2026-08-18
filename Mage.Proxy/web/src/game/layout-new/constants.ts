export const LAYOUT = {
    sidebarWidth: 70,
    // Proporciones de las áreas verticales del viewport de juego
    // Basadas en el dibujo ASCII y la estructura de cajas
    areas: {
        opponentHeight: 0.25,     // Top Area
        battlefieldHeight: 0.45,  // Middle Area (Main Board)
        playerHeight: 0.30,       // Bottom Area
    },
    // El ratio de la zona central para cálculos de escala si fuera necesario
    boardAspectRatio: 16 / 9,
};

export const COLORS = {
    bg: '#171820',
    panel: '#1d3245',
    border: '#292c35',
    accent: '#ff3b4b' // Para elementos de peligro o resaltado
};
