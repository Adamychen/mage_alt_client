# XMage Nexus — Lobby Roadmap & Feature Matrix

> Documento de referencia para la evolución del Lobby web de **XMage Nexus**, basado en el análisis funcional del cliente de escritorio de XMage (`Mage.Client`).

---

## 1. Matriz de Elementos del Lobby

### A. Panel de Mesas (Active Tables)
* [ ] **1.1 Badges de Estado & Tipo**:
  * Icono distintivo Match / Torneo (`isTournament`).
  * Indicador de contraseña / candado (`passworded`).
  * Nivel de Habilidad: `Novato` (*), `Casual` (**), `Competitivo` (***) (`skillLevel`).
  * Partida Clasificatoria / ELO (`rated`).
  * Tiempo relativo transcurrido (*"Creada hace 2m"* / *"En juego 12m"*).
* [ ] **1.2 Ajustes y Permisos de Partida**:
  * Desglose de `additionalInfoShort` / `additionalInfoFull` (Wins Bo1/Bo3/Bo5, tiempo por jugador, rollback permitido `RB`, espectadores `SP`).
  * Restricciones de entrada: `Quit %` máximo y `Min Rating`.
* [ ] **1.3 Visualización de Plazas (Seats)**:
  * Avatar / Icono por tipo (Humano, IA Mad, IA Draft, Sim).
  * Bandera o país de los jugadores sentados (`flagName`).

### B. Filtros y Búsqueda
* [ ] **2.1 Buscador en tiempo real**: Filtrar por nombre de mesa, creador o formato.
* [ ] **2.2 Filtros de estado**:
  * *"Solo con plazas libres"* (Waiting).
  * *"Ocultar en juego"* (Hide dueling).
  * *"Solo sin contraseña"*.
* [ ] **2.3 Filtros por formato y nivel**: Filtro rápido por tipo de juego y skill level.

### C. Panel de Comunidad y Jugadores (`RoomUsersView`)
* [ ] **3.1 Lista de Usuarios Enriquecida**:
  * Bandera/País (`flagName`).
  * ELO / Rating Construido (`constructedRating`) y Limitado (`limitedRating`).
  * Ratio de abandono (`matchQuitRatio` MQP %).
  * Latencia / Ping en ms con semáforo de color (`infoPing`).
  * Estado detallado: *"En lobby"*, *"Jugando Mesa #X"*.
* [ ] **3.2 Acciones sobre usuarios**:
  * Enviar mensaje privado (Whisper).
  * Lista de ignorados (Ignore list).

### D. Diálogo Avanzado de Creación de Mesa (`NewTableDialog`)
* [ ] **4.1 Configuración de Reglas & Tiempo**:
  * Selector de tiempo por jugador (20m, 25m, 30m, 45m, etc.) y tiempo de reserva (buffer).
  * Toggles de *"Permitir espectadores"* y *"Permitir rollbacks"*.
  * Contraseña opcional de mesa.
  * Selector de Skill Level (Beginner / Casual / Serious) y Rated match.
* [ ] **4.2 Configuración Multijugador & Plazas**:
  * Asignación individual de tipo de IA y mazo para cada plaza de bot.
  * Rango de influencia y modo de ataque en Commander/FFA.

### E. Historial de Partidas y Replays (`MatchesTableModel`)
* [ ] **5.1 Pestaña de Partidas Terminadas**:
  * Marcador final (ej. `Jugador1 2 - 1 Jugador2`).
  * Duración y hora de finalización.
  * Botón para reproducir / ver replay.

---

## 2. Roadmap de Implementación

| Paso | Módulo | Alcance | Estado |
|---|---|---|---|
| **1** | **Tarjetas de Mesa Enriquecidas** | Badges de Skill Level, Candado, Tiempo relativo, Rated, Permisos SP/RB y tooltips informativos | 🚀 En curso |
| **2** | **Buscador & Filtros Rápidos** | Barra de búsqueda por texto y toggles de plazas libres/sin password | ⬜ Pendiente |
| **3** | **Comunidad con ELO, Ping y Banderas** | Tabla de usuarios completa con ELOs, latencia, ratio de quit y actividad | ⬜ Pendiente |
| **4** | **Modal Avanzado de Creación de Mesa** | Tiempo por turno, contraseña, skill level, espectadores y configuración de cada asiento | ⬜ Pendiente |
| **5** | **Partidas Terminadas & Replays** | Vista de historial de duelos concluidos con marcadores | ⬜ Pendiente |
