# XMage Nexus — Lobby Roadmap & Feature Matrix

> Reference document for the evolution of the **XMage Nexus** Web Lobby, based on functional analysis of the desktop XMage client (`Mage.Client`).

---

## 1. Lobby Feature Matrix

### A. Active Tables Panel
* [x] **1.1 Status & Type Badges**:
  * Match / Tournament distinction (`isTournament`).
  * Password / Lock indicator (`passworded`).
  * Skill Level: `Beginner` (*), `Casual` (**), `Competitive` (***) (`skillLevel`).
  * Rated match / ELO (`rated`).
  * Relative elapsed time (*"Created 2m ago"* / *"In match 12m"*).
* [x] **1.2 Match Settings & Permissions**:
  * Detailed breakdown of `additionalInfoShort` / `additionalInfoFull` (Bo1/Bo3/Bo5 match wins, player clock, rollback allowed `RB`, spectators allowed `SP`).
  * Entry restrictions: Max `Quit %` and `Min Rating`.
* [x] **1.3 Seat Visualizer**:
  * Avatar / Icon by type (Human, AI Mad, AI Draft, Sim).
  * Country / Flag for seated players (`flagName`).

### B. Search & Filters
* [x] **2.1 Real-Time Search**: Filter by table name, host/creator, or format.
* [x] **2.2 Status Filters**:
  * *"Open seats only"* (Waiting).
  * *"Hide in-progress"* (Hide dueling).
  * *"No password only"*.
* [x] **2.3 Format & Skill Filters**: Quick chips by game format and skill level.

### C. Community & Players Panel (`RoomUsersView`)
* [x] **3.1 Enriched User List**:
  * Country / Flag (`flagName`, 264 country flag PNG icons).
  * ELO / Constructed Rating (`constructedRating`) and Limited Rating (`limitedRating`).
  * Match Quit Ratio (`matchQuitRatio` MQP %).
  * Latency / Ping in ms with status indicators (`infoPing`).
  * Granular state: *"In lobby"*, *"Playing Table #X"*.
* [x] **3.2 MTG Arena Official Rank Tiers & Live Room Leaderboard**:
  * 6 official tiers (Bronze 🟤, Silver ⚪, Gold 🟡, Platinum 💠, Diamond 💎, Mythic 🟠).
  * Interactive Leaderboard Modal (`Top Sala`, `Mi Perfil Competitivo`, `Guía de Rangos`).
  * Rank badges with glowing borders and tooltips.
* [x] **3.3 Direct User Actions**:
  * Direct private messaging (Whisper `/w <user> <msg>` or `/whisper`).
  * Interactive User Action Modal with avatar, flag, ELO, and status.
  * Direct Spectate Match button for active players.
  * Leaderboard & Profile link.
  * Server ignore / mute toggle (`/ignore <user>`, `/unignore <user>`).

### D. Advanced Table Creation Dialog (`NewTableDialog`)
* [x] **4.1 Timing & Rules Configuration**:
  * Per-player clock selection (15m, 20m, 25m, 30m, 45m, 60m, 90m, None) and buffer reserve timer.
  * Toggles for *"Allow spectators"* and *"Allow rollbacks"*.
  * Optional table password.
  * Skill Level selector (Beginner / Casual / Serious) and Rated match flag.
  * Player entry restrictions: Minimum ELO Rating (`minimumRating`), Max Quit Ratio (`quitRatio`), and Commander EDH Power Level (`edhPowerLevel`).
* [x] **4.2 Multiplayer & Seat Configuration**:
  * Individual AI archetype and deck assignment for bot seats.
  * Influence range and attack mode for multiplayer/Commander FFA.

### E. Match History & Replays (`MatchesTableModel`)
* [ ] **5.1 Finished Matches View**:
  * Final score (e.g. `Player1 2 - 1 Player2`).
  * Match duration and completion timestamp.
  * Replay launcher / viewer.

---

## 2. Implementation Roadmap

| Step | Module | Scope | Status |
|---|---|---|---|
| **1** | **Enriched Table Cards** | Skill Level badges, Lock icon, Relative time, Rated badge, SP/RB permissions, entry restrictions, and tooltips | ✅ Completed |
| **2** | **Search & Quick Filters** | Live text search bar and open-seats / no-password toggles | ✅ Completed |
| **3** | **Community, Country Flags & ELO** | User list with flags, ELO, stats, status, and MTG Arena rank badges | ✅ Completed |
| **4** | **Advanced Table Creation Modal** | Turn clocks, rules, password, skill level, player restrictions, and seat setup | ✅ Completed |
| **5** | **Live Room Leaderboard & Tiers** | MTG Arena style 6-tier ladder modal (Bronze to Mythic) with room ranking & profile | ✅ Completed |
| **6** | **Finished Matches & Replays** | History view of completed duels with final scores and replay viewer | ⬜ Pending |
