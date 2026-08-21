# XMage Nexus — UI Visual Specification

## -1. Project Context: A Full Web Client for XMage

This document defines the visual specification and design system for **XMage Nexus**, replacing the legacy Java/Swing client with a modern, high-performance web interface connected to the real XMage rules engine.

### a) XMage Proxy Architecture

XMage server communicates over Java RMI/serialization. The web client communicates with the Java proxy over WebSocket JSON:

```text
XMage Server (Java, RMI)
        │
        ▼
  Mage.Proxy (Java)
        │  WebSocket JSON (:8787)
        ▼
  XMage Nexus Web Client (React 19 + PixiJS 8)
```

El bridge es responsable de:

- Autenticarse contra el servidor XMage como si fuera el cliente oficial.
- Recibir los `GameView`, `PlayerView`, `CardView`, `PlayerAction`, etc. que expone la API interna
  de XMage.
- Serializarlos a JSON y reenviarlos al navegador (vía WebSocket).
- Recibir acciones del navegador (jugar carta, pasar prioridad, declarar bloqueadores...) y
  convertirlas en las llamadas Java que espera el servidor XMage.

**No intentes que el frontend reimplemente las reglas del juego.** XMage ya calcula legalidad de
jugadas, stack, prioridad, combate, etc. La interfaz nueva solo debe:

1. Pintar el estado que le llega del bridge.
2. Enviar la intención del usuario (qué carta se ha soltado en qué zona, qué objetivo se ha
   elegido, etc.) y dejar que el servidor la valide.

### b) El modelo de datos de las secciones 23 y 54 debe derivarse del `GameView` de XMage, no inventarse

Los tipos `CardState` / `CardInstance` / `ZoneState` / `PlayerState` que se proponen más abajo
están bien como **forma final** para el render, pero no deben ser el modelo que el bridge genera
libremente. Tienen que ser un **mapeo 1:1** de lo que ya expone XMage internamente
(`GameView`, `PlayerView`, `CardView`, `PermanentView`, `ZoneView`, `StackObjectView`, etc.).

```text
GameView (XMage)  ──mapper──▶  CardInstance / ZoneState / PlayerState (este cliente)
```

Antes de tocar CSS, conviene tener claro qué campos expone realmente `CardView`/`PermanentView`
(tapped, faceDown, counters, poder/toughness actuales, si está objetivo de algo, etc.) para no
diseñar un estado de UI que luego no se pueda rellenar con datos reales.

### c) Las acciones del jugador son peticiones, no mutaciones locales

Todo lo que la sección 26 describe como "drag & drop actualiza el estado" tiene un paso adicional
aquí: el drop no mueve la carta de verdad, **propone** un movimiento al bridge/servidor. La carta
solo se "confirma" en su nueva posición cuando llega la actualización de estado del servidor. Si
el servidor rechaza la acción (jugada ilegal), la carta debe volver a su sitio.

```text
pointerup
    ↓
sendAction({ type: "PLAY_CARD", cardId, targetZone })
    ↓
(esperar confirmación del servidor)
    ↓
server → nuevo GameView
    ↓
re-render según el nuevo estado real
```

Esto es distinto de un juego local: **el estado autoritativo vive en el servidor XMage**, el
cliente es una vista + un emisor de intenciones.

### d) Fase 0 recomendada, antes de la Fase 1 de la sección 49

Antes de maquetar nada, vale la pena tener un "Fase 0" separada:

```text
Fase 0
- Levantar el bridge Java↔WebSocket
- Conectarlo a una partida de XMage real (o a un servidor de pruebas)
- Loggear el GameView tal cual llega, en JSON, en la consola del navegador
- Confirmar que se puede enviar una acción de vuelta (aunque sea "pasar turno")
```

Solo cuando eso funciona tiene sentido empezar con el layout visual de la sección 49. Así el
agente no diseña un estado "bonito" que luego no encaja con lo que realmente manda XMage.

---

## 0. Objetivo

Este documento describe cómo reconstruir **visualmente** la pantalla de juego mostrada en la captura `deseado.png`.

La idea importante es esta:

> **No hay que pensar la interfaz como una imagen ni como un conjunto de coordenadas sueltas. Hay que pensarla como una composición de paneles HTML/CSS, con un sistema de coordenadas para el tablero y capas superpuestas para cartas, menús y overlays.**

La implementación original de TCG Arena no se puede deducir con certeza solamente a partir de una captura. La web pública describe TCG Arena como un simulador 2D de juegos de cartas, con áreas de juego configurables, drag & drop, agrupación de cartas, enlaces/flechas entre cartas y un motor de cartas con transiciones. Por tanto, esta especificación describe una arquitectura **equivalente**, no afirma que sea el código fuente original.

---

# 1. Lectura visual de la captura

## Resolución de referencia

La captura tiene:

- Ancho total: **2048 px**
- Alto total: **1330 px**

Una parte superior pertenece al navegador. Para implementar la aplicación hay que considerar únicamente el viewport de la aplicación.

En la captura, el viewport de la aplicación empieza aproximadamente debajo de la barra del navegador.

### Regla fundamental

No hagas que el navegador sea parte del layout.

La aplicación debe ocupar:

```text
100vw × 100vh
```

y funcionar independientemente de que el navegador tenga una barra superior.

---

# 2. Estructura visual general

La interfaz puede dividirse en estas grandes regiones:

```text
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                        APPLICATION VIEWPORT                          │
│                                                                      │
│ ┌───────┐ ┌────────────────────────────────────────────────────────┐ │
│ │       │ │                                                        │ │
│ │       │ │                 OPponent / upper board                 │ │
│ │       │ │                                                        │ │
│ │ TOOL  │ │                                                        │ │
│ │ BAR   │ ├────────────────────────────────────────────────────────┤ │
│ │       │ │                                                        │ │
│ │       │ │                    MAIN BOARD                           │ │
│ │       │ │                                                        │ │
│ │       │ │                                                        │ │
│ │       │ │                                                        │ │
│ │       │ ├────────────────────────────────────────────────────────┤ │
│ │       │ │                 PLAYER HAND                             │ │
│ │       │ │                                                        │ │
│ └───────┘ └────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

Pero internamente no conviene hacer únicamente tres cajas.

La arquitectura recomendada es:

```text
App
├── LeftSidebar
├── GameViewport
│   ├── OpponentArea
│   ├── Battlefield
│   │   ├── Zone
│   │   ├── Zone
│   │   ├── Zone
│   │   └── CardLayer
│   ├── PlayerArea
│   └── HandLayer
├── CardPreviewOverlay
├── ActionStack / ResolutionOverlay
├── GameLog
└── ContextMenus
```

---

# 3. El concepto más importante: capas

La interfaz parece plana, pero técnicamente conviene construirla como varias capas.

## Z-index recomendado

```text
0    background
10   game zones
20   cards
30   selected/dragged card
40   arrows / targeting lines
50   temporary markers
60   context menus
70   card enlarged preview
80   game log
90   modal dialogs
100  toast / notifications
```

No utilices z-index aleatorios como:

```css
z-index: 999999;
```

en todos los componentes.

Define una jerarquía.

---

# 4. Layout principal

La aplicación debe tener un layout de dos columnas:

```text
sidebar + game
```

Ejemplo conceptual:

```css
.app {
    width: 100vw;
    height: 100vh;
    overflow: hidden;

    display: grid;
    grid-template-columns: 70px minmax(0, 1fr);
}
```

La sidebar de la captura tiene aproximadamente 60-70 px de ancho.

La zona de juego ocupa todo lo restante.

---

# 5. Sidebar izquierda

La barra izquierda es vertical y permanece fija.

Visualmente:

```text
┌──────┐
│ Turn │
│ time │
│      │
│  ←   │
│──────│
│      │
│  ▶   │
│      │
│  ♟   │
│      │
│  ⚙   │
│      │
│  ?   │
│──────│
│  ↩   │
│      │
│  🖱  │
│      │
│  ☻   │
│      │
│  ▦   │
│      │
│  ⚔   │
│      │
│  ˅   │
│      │
│  ×   │
│      │
│  □   │
└──────┘
```

## Componentes

```text
Sidebar
├── TurnInfo
│   ├── turn number
│   ├── timer
│   └── secondary timer
├── Separator
├── NavigationButtons
│   ├── back
│   ├── play
│   ├── players
│   ├── settings
│   └── help
├── Separator
├── GameTools
│   ├── undo/back
│   ├── interaction tool
│   ├── marker tool
│   ├── grid/tool
│   └── combat tool
└── ExitButton
```

## CSS

```css
.sidebar {
    position: relative;
    width: 70px;
    height: 100%;
    background: #171820;
    border-right: 1px solid #292c35;

    display: flex;
    flex-direction: column;
    align-items: center;
}
```

Los botones no necesitan cajas visibles.

La mayoría son:

```css
.tool-button {
    width: 42px;
    height: 42px;
    border: 0;
    background: transparent;
}
```

con iconos centrados.

---

# 6. Zona de juego

No conviene construir el tablero entero con `position: absolute`.

Usa una estructura híbrida:

```text
GameViewport
    ├── BoardLayout
    │   ├── TopArea
    │   ├── MiddleArea
    │   └── BottomArea
    │
    └── OverlayLayer
```

El `BoardLayout` puede ser CSS Grid.

Por ejemplo:

```css
.board {
    position: relative;
    width: 100%;
    height: 100%;

    display: grid;
    grid-template-rows:
        minmax(180px, 1fr)
        minmax(250px, 1.4fr)
        minmax(220px, 1fr);
}
```

Esto es mejor que intentar memorizar:

```text
top = 231px
middle = 543px
bottom = 401px
```

porque las proporciones deben sobrevivir a distintas resoluciones.

---

# 7. Fondo

El fondo de la captura es prácticamente negro/azul muy oscuro.

No es un tablero de madera ni una textura.

Usa:

```css
.game {
    background: #171820;
}
```

y zonas ligeramente más claras:

```css
.zone {
    background: #1d3245;
}
```

La diferencia de color es muy pequeña.

La interfaz depende más de:

- separación
- bordes
- sombras
- contraste
- posición

que de colores fuertes.

---

# 8. Panel principal azul

La gran superficie azulada del juego debe ser un contenedor.

```css
.play-area {
    position: relative;

    margin: 0;
    border-radius: 0;

    background: #1c3245;
}
```

En la captura aparece una gran zona azul que empieza debajo de la parte superior del tablero.

No intentes dibujar esa superficie con una imagen.

Es simplemente un elemento HTML con background.

---

# 9. Zonas del tablero

Una zona de juego debe ser un componente independiente.

```tsx
<Zone
    id="battlefield"
    type="battlefield"
/>

<Zone
    id="graveyard"
    type="graveyard"
/>

<Zone
    id="deck"
    type="deck"
/>

<Zone
    id="hand"
    type="hand"
/>
```

Cada zona puede controlar:

- tamaño
- posición
- orientación
- si acepta cartas
- si las cartas se apilan
- si las cartas se giran
- si las cartas se muestran boca abajo
- spacing
- alignment
- drag/drop

Esto coincide con la idea de TCG Arena de tener áreas con distintos comportamientos.

---

# 10. Cartas

Las cartas NO deberían ser HTML complejo con todo el texto recreado.

Si ya tienes imágenes de las cartas:

```html
<div class="card">
    <img src="card.webp" />
</div>
```

La carta es principalmente:

```css
.card {
    position: absolute;

    width: var(--card-width);
    aspect-ratio: 0.714;

    border-radius: 7px;

    overflow: hidden;

    transform-origin: center center;

    user-select: none;
}
```

Y:

```css
.card img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
```

---

# 11. Relación de aspecto de las cartas

Una carta vertical típica de TCG tiene aproximadamente:

```text
width / height ≈ 0.714
```

Por tanto:

```css
aspect-ratio: 5 / 7;
```

o aproximadamente:

```css
aspect-ratio: 0.714;
```

No definas simultáneamente:

```css
width: 123px;
height: 197px;
```

para cada resolución.

Mejor:

```css
.card {
    width: clamp(70px, 7vw, 145px);
    aspect-ratio: 5 / 7;
}
```

Después puedes modificar el tamaño mediante variables según el tablero.

---

# 12. Mano del jugador

La mano inferior es un componente especial.

No es una grid normal.

Visualmente:

```text
                  ┌────────┐
          ┌───────┴────────┴───────┐
       ┌──┴───┐ ┌───────┐ ┌───────┐
       │card  │ │ card  │ │ card  │
       └──────┘ └───────┘ └───────┘
```

Las cartas pueden solaparse ligeramente.

Una implementación sencilla:

```css
.hand {
    position: absolute;
    left: 50%;
    bottom: 20px;

    display: flex;
    align-items: flex-end;
    justify-content: center;

    transform: translateX(-50%);
}
```

Y:

```css
.hand .card + .card {
    margin-left: -35px;
}
```

Esto produce el efecto de abanico/solapamiento.

---

# 13. Mano: hover

La carta que se está inspeccionando debe salir hacia arriba.

```css
.hand .card {
    transition:
        transform 120ms ease,
        margin 120ms ease;
}

.hand .card:hover {
    transform: translateY(-35px) scale(1.03);
    z-index: 100;
}
```

Importante:

No hagas que el hover cambie el layout de toda la mano.

Es mejor usar `transform`.

---

# 14. Carta ampliada de la derecha

La captura muestra una carta grande en la parte derecha.

Esta carta no pertenece realmente al layout del tablero.

Es un overlay.

Por eso debe ser algo parecido a:

```text
Game
└── CardPreviewOverlay
```

y no:

```text
Battlefield
└── RightColumn
    └── Card
```

## Estructura

```html
<div class="card-preview">
    <div class="card-preview__image">
        ...
    </div>

    <button class="resolve-button">
        Resolve
    </button>
</div>
```

## Posición

```css
.card-preview {
    position: fixed;

    right: 20px;
    bottom: 145px;

    width: min(240px, 18vw);

    z-index: 70;
}
```

La posición exacta puede ajustarse mediante variables.

---

# 15. Borde rojo de la carta ampliada

La captura muestra una especie de glow/borde rojo alrededor del preview.

No necesitas una imagen para esto.

```css
.card-preview {
    border: 2px solid rgba(255, 55, 75, 0.8);

    box-shadow:
        0 0 5px rgba(255, 55, 75, 0.8),
        0 0 15px rgba(255, 55, 75, 0.4);

    border-radius: 16px;
}
```

La carta interior tiene su propio borde redondeado.

---

# 16. Botón Resolve

El botón está debajo de la carta ampliada.

```css
.resolve {
    width: 100%;
    height: 42px;

    margin-top: 8px;

    background: #18293a;
    border: 0;
    border-radius: 5px;

    color: white;
    font-size: 16px;
}
```

El botón debe ser parte del overlay, no parte de la carta.

---

# 17. Log de eventos

A la derecha inferior aparece un historial:

```text
Player-1387 - 09:20
drew 1

Player-1387 - 09:20
played Plains from hand

Player-1387 - 09:20
played Mountain from hand

Player-1387 - 09:21
played Containment Construct from hand

Player-1387 - 09:21
played Wave of Reckoning from hand
```

Esto debe ser un componente separado.

```text
GameLog
└── LogEntry[]
```

Modelo:

```ts
type LogEntry = {
    id: string;
    timestamp: string;
    player: string;
    action: string;
}
```

Render:

```tsx
{entries.map(entry => (
    <LogEntry
        key={entry.id}
        entry={entry}
    />
))}
```

---

# 18. Scroll del log

No dejes que el log aumente indefinidamente el tamaño del tablero.

```css
.game-log {
    position: fixed;

    right: 18px;
    bottom: 80px;

    width: 260px;
    max-height: 260px;

    overflow-y: auto;
}
```

Los mensajes nuevos se añaden al final.

---

# 19. Vida del jugador

Abajo a la izquierda aparece:

```text
Player-1387

40    0
```

Esto debe ser un componente:

```text
PlayerStatus
├── PlayerName
└── Counters
    ├── Life
    └── OtherCounter
```

No lo metas dentro de la mano.

---

# 20. Selector de colores

En la parte izquierda inferior hay una pequeña barra flotante:

```text
┌─────────────────────┐
│ ● ● ● ●          ‹ │
└─────────────────────┘
```

Esto parece un pequeño control de anotaciones/colores.

Arquitectura:

```text
MarkerPalette
├── ColorButton
├── ColorButton
├── ColorButton
├── ColorButton
└── CollapseButton
```

CSS:

```css
.marker-palette {
    position: fixed;
    left: 70px;
    bottom: 365px;

    display: flex;
    gap: 10px;

    padding: 8px 10px;

    background: #151923;
    border: 1px solid #303541;
    border-radius: 8px;
}
```

---

# 21. Las cajas: sí, pero no literalmente todo

Tu intuición de "está hecho con cajas" es correcta **a nivel conceptual**.

En HTML moderno casi todo se puede imaginar como:

```text
div
 ├── div
 │    ├── div
 │    └── div
 └── div
```

Pero no debes implementar el diseño como una colección de `position:absolute` arbitrarios.

La regla correcta es:

### Layout estructural

Usa:

- CSS Grid
- CSS Flexbox

### Elementos superpuestos

Usa:

- `position: absolute`
- `position: fixed`

### Animaciones

Usa:

- `transform`
- `opacity`

### Cartas

Usa:

- una capa absoluta
- transformaciones
- drag & drop

### Overlays

Usa:

- `position: fixed`

---

# 22. Arquitectura DOM recomendada

Una estructura bastante fiel sería:

```html
<body>
    <div id="root">

        <main class="app">

            <aside class="sidebar">
                <div class="turn-info"></div>

                <div class="sidebar-tools">
                    ...
                </div>
            </aside>


            <section class="game">

                <div class="board">

                    <section class="opponent-area">
                        ...
                    </section>


                    <section class="battlefield">

                        <div class="zone zone--deck"></div>
                        <div class="zone zone--graveyard"></div>
                        <div class="zone zone--battlefield"></div>

                        <div class="card-layer">
                            ...
                        </div>

                    </section>


                    <section class="player-area">

                        <div class="player-status">
                            ...
                        </div>

                        <div class="hand-layer">
                            ...
                        </div>

                    </section>

                </div>


                <!-- overlays -->

                <div class="marker-palette"></div>

                <aside class="card-preview">
                    ...
                </aside>

                <aside class="game-log">
                    ...
                </aside>

            </section>

        </main>

    </div>
</body>
```

---

# 23. Mejor todavía: separar el modelo de juego del render

No hagas que el DOM sea la fuente de verdad.

Usa un estado:

```ts
type CardState = {
    id: string;
    cardImage: string;

    zoneId: string;

    x: number;
    y: number;

    rotation: number;

    faceDown: boolean;

    tapped: boolean;

    selected: boolean;
}
```

Zona:

```ts
type ZoneState = {
    id: string;

    type:
        | "deck"
        | "hand"
        | "battlefield"
        | "graveyard"
        | "exile";

    x: number;
    y: number;

    width: number;
    height: number;
}
```

Jugador:

```ts
type PlayerState = {
    id: string;
    name: string;

    life: number;

    counters: Record<string, number>;

    hand: string[];
}
```

---

# 24. Sistema de coordenadas

Esta parte es extremadamente importante.

No guardes siempre:

```ts
card.x = 713;
card.y = 492;
```

en píxeles de pantalla.

Es mejor utilizar coordenadas relativas al tablero:

```ts
card.x = 0.62;
card.y = 0.37;
```

donde:

```text
x = 0      izquierda
x = 1      derecha

y = 0      arriba
y = 1      abajo
```

Al renderizar:

```ts
screenX = x * boardWidth;
screenY = y * boardHeight;
```

Esto permite cambiar la resolución sin destruir el layout.

---

# 25. Posicionamiento de cartas

```css
.card {
    position: absolute;

    left: calc(var(--x) * 100%);
    top: calc(var(--y) * 100%);

    transform:
        translate(-50%, -50%)
        rotate(var(--rotation));
}
```

Ejemplo:

```html
<div
    class="card"
    style="
        --x: 0.50;
        --y: 0.40;
        --rotation: 0deg;
    "
>
```

---

# 26. Drag & Drop

El drag & drop debe modificar el estado, no manipular manualmente el DOM.

Flujo:

```text
pointerdown
    ↓
startDrag(card)
    ↓
pointermove
    ↓
calculate board coordinates
    ↓
updateCardPosition()
    ↓
pointerup
    ↓
commitMove()
```

No hagas:

```js
element.style.left = mouseX + "px";
element.style.top = mouseY + "px";
```

como sistema principal.

Puedes hacerlo durante una optimización visual, pero el estado real debe seguir siendo:

```ts
card.x
card.y
```

---

# 27. Conversión del mouse al tablero

Supongamos:

```ts
const rect = board.getBoundingClientRect();

const x = (event.clientX - rect.left) / rect.width;
const y = (event.clientY - rect.top) / rect.height;
```

Ahora tienes:

```text
0..1
```

independiente de la resolución.

---

# 28. Selección de cartas

Cuando una carta está seleccionada:

```css
.card.is-selected {
    outline: 2px solid rgba(255, 255, 255, .8);

    filter:
        drop-shadow(0 0 6px rgba(255,255,255,.4));
}
```

No cambies permanentemente su tamaño.

---

# 29. Carta siendo arrastrada

La carta que se arrastra debe pasar a una capa superior:

```css
.card.is-dragging {
    z-index: 1000;

    pointer-events: none;

    transform:
        translate(-50%, -50%)
        scale(1.04)
        rotate(var(--rotation));
}
```

También puedes aplicar una pequeña sombra.

---

# 30. Flechas entre cartas

La aplicación permite interacciones visuales entre cartas.

No uses un PNG para cada flecha.

Una opción sencilla es SVG:

```html
<svg class="interaction-layer">
    <line
        x1="..."
        y1="..."
        x2="..."
        y2="..."
    />
</svg>
```

La capa:

```css
.interaction-layer {
    position: absolute;
    inset: 0;

    width: 100%;
    height: 100%;

    pointer-events: none;

    z-index: 40;
}
```

Así puedes dibujar:

```text
Card A ───────────► Card B
```

sin afectar al layout.

---

# 31. Marcadores

Los marcadores también deben ser datos:

```ts
type Marker = {
    id: string;
    x: number;
    y: number;
    color: string;
}
```

Render:

```tsx
<div
    className="marker"
    style={{
        left: `${marker.x * 100}%`,
        top: `${marker.y * 100}%`
    }}
/>
```

---

# 32. Context menu

Muchas acciones de una interfaz de TCG no tienen que estar visibles todo el tiempo.

Por eso usa un menú contextual:

```text
Right click card
       ↓
┌──────────────────────┐
│ Tap                  │
│ Rotate               │
│ Flip                 │
│ Move                 │
│ Group                │
│ Counter              │
│ Destroy              │
└──────────────────────┘
```

Implementación:

```css
.context-menu {
    position: fixed;
    z-index: 200;

    min-width: 180px;

    background: #171a21;
    border: 1px solid #363b46;
    border-radius: 7px;

    box-shadow: 0 10px 30px rgba(0,0,0,.45);
}
```

---

# 33. Animaciones

La captura y la descripción pública de TCG Arena apuntan a un sistema donde las cartas pueden tener transiciones al:

- robar
- jugar
- voltear
- girar
- cambiar de zona

No necesitas un motor de animación enorme.

CSS puede cubrir una gran parte:

```css
.card {
    transition:
        left 180ms ease,
        top 180ms ease,
        transform 180ms ease,
        opacity 180ms ease;
}
```

Para acciones complejas:

```text
CardAnimationController
├── draw
├── play
├── flip
├── rotate
├── move
└── destroy
```

---

# 34. No uses CSS animation para el estado

Mala arquitectura:

```ts
playAnimation("move-card");
```

y después intentar averiguar dónde acabó la carta.

Mejor:

```ts
dispatch({
    type: "MOVE_CARD",
    cardId,
    zoneId
});
```

El estado cambia y la animación visual acompaña al cambio.

---

# 35. Responsive

La captura es desktop.

No intentes que todo sea responsive como una web convencional.

Una aplicación de tablero necesita mantener relaciones espaciales.

Usa:

```css
.game {
    min-width: 900px;
    min-height: 600px;
}
```

y, si la ventana es demasiado pequeña:

```css
.game {
    transform-origin: top left;
}
```

o crea un sistema de escala.

Una estrategia mejor:

```text
logical board
    ↓
scale to viewport
    ↓
render
```

Por ejemplo:

```ts
scale = Math.min(
    viewportWidth / logicalWidth,
    viewportHeight / logicalHeight
);
```

---

# 36. Sistema de escala recomendado

Define un tablero lógico:

```text
1600 × 900
```

y escala ese tablero.

```css
.board {
    width: 1600px;
    height: 900px;

    transform-origin: top left;
}
```

Luego:

```ts
const scaleX = viewportWidth / 1600;
const scaleY = viewportHeight / 900;

const scale = Math.min(scaleX, scaleY);
```

Esto hace que la reproducción visual sea mucho más estable.

---

# 37. Cuándo utilizar Grid

Usa Grid para:

```text
App
Sidebar + Game

Board
Opponent / Battlefield / Player

Paneles
columnas y filas
```

Ejemplo:

```css
.board {
    display: grid;

    grid-template-rows:
        24%
        48%
        28%;
}
```

---

# 38. Cuándo utilizar Flex

Usa Flex para:

```text
Toolbar
Buttons
Hand
Card collections
Log entries
Player counters
```

Ejemplo:

```css
.hand {
    display: flex;
    justify-content: center;
    align-items: flex-end;
}
```

---

# 39. Cuándo utilizar Absolute

Usa `absolute` para:

```text
Cards
Markers
Arrows
Floating UI
Card preview dentro del juego
```

No uses absolute para toda la aplicación.

---

# 40. Cuándo utilizar Fixed

Usa `fixed` para:

```text
Sidebar
Global overlays
Floating card preview
Context menu
Game log
```

si quieres que se posicionen respecto al viewport.

---

# 41. Fuentes

La interfaz usa una tipografía sans-serif pequeña y funcional.

No necesitas una fuente exótica.

Empieza con:

```css
font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
```

Los tamaños principales son pequeños:

```text
10-12px  metadata
12-14px  log
14-16px  buttons
16-20px  important controls
```

---

# 42. Bordes

No abuses de los bordes.

La UI se basa en:

```text
background oscuro
+
panel azul oscuro
+
border gris tenue
+
white icons
+
red selection
```

Ejemplo:

```css
border: 1px solid #303640;
```

---

# 43. Sombras

Utiliza sombras solamente para elementos que flotan:

```css
box-shadow:
    0 8px 25px rgba(0, 0, 0, .4);
```

Especialmente:

- card preview
- context menu
- selected card
- floating palette

El tablero no necesita sombra.

---

# 44. Componentes React sugeridos

Si utilizas React:

```text
src/
├── app/
│   ├── App.tsx
│   └── app.css
│
├── game/
│   ├── GameViewport.tsx
│   ├── Board.tsx
│   ├── Zone.tsx
│   ├── Card.tsx
│   ├── CardLayer.tsx
│   ├── Hand.tsx
│   ├── PlayerStatus.tsx
│   ├── GameLog.tsx
│   ├── CardPreview.tsx
│   ├── ContextMenu.tsx
│   ├── MarkerPalette.tsx
│   └── InteractionLayer.tsx
│
├── state/
│   ├── gameStore.ts
│   ├── gameReducer.ts
│   └── types.ts
│
├── interactions/
│   ├── dragCard.ts
│   ├── selectCard.ts
│   └── contextMenu.ts
│
└── styles/
    ├── variables.css
    ├── layout.css
    ├── cards.css
    └── overlays.css
```

---

# 45. Si utilizas Vue

La misma arquitectura:

```text
components/
├── Sidebar.vue
├── GameViewport.vue
├── Board.vue
├── Zone.vue
├── Card.vue
├── Hand.vue
├── CardPreview.vue
├── GameLog.vue
└── ContextMenu.vue
```

No cambia el concepto.

---

# 46. Variables CSS

Centraliza todo:

```css
:root {
    --sidebar-width: 70px;

    --bg: #171820;
    --panel: #1d3245;
    --panel-dark: #18293a;

    --border: #303640;

    --text: #f2f3f5;
    --text-muted: #9da3ad;

    --danger: #ff394d;

    --card-radius: 7px;

    --card-width: 110px;
}
```

Esto es muy útil para que un agente pueda modificar la apariencia sin tocar 40 archivos.

---

# 47. El error más común de los agentes

Un agente que no tiene visión suele producir algo parecido a:

```text
┌──────────────────────────────┐
│ Toolbar                      │
├──────────────────────────────┤
│                              │
│        BOARD                 │
│                              │
├──────────────────────────────┤
│ HAND                         │
└──────────────────────────────┘
```

y técnicamente funciona.

Pero visualmente no se parece.

¿Por qué?

Porque la similitud depende de muchas relaciones pequeñas:

- anchura de sidebar
- proporción del tablero
- posición de la mano
- solapamiento de cartas
- tamaño de cartas
- z-index
- offsets
- paneles flotantes
- log
- preview
- márgenes
- contraste
- escala

---

# 48. Cómo trabajar con agentes sin visión

No le pidas:

> "Replica esta imagen."

Dale una especificación estructurada.

Ejemplo de prompt:

```text
Implementa una interfaz de juego TCG usando React y CSS.

NO diseñes una interfaz nueva.
NO simplifiques el layout.
NO uses una imagen de fondo para simular el tablero.

La aplicación tiene:
- sidebar fija de 70px
- viewport de juego ocupando el resto
- tablero lógico de 1600x900
- tres regiones verticales
- battlefield azul oscuro
- cartas posicionadas sobre una capa absoluta
- mano inferior centrada
- cartas solapadas
- card preview flotante a la derecha
- game log debajo del preview
- player status abajo a la izquierda
- marker palette flotante
- overlays por encima del tablero

Implementa primero el layout.
No implementes lógica de cartas hasta que el layout esté correcto.

Usa CSS Grid para la estructura.
Usa Flexbox para toolbars y mano.
Usa position:absolute para cartas.
Usa position:fixed para overlays.

Todas las coordenadas de cartas deben guardarse como valores relativos 0..1.

No utilices coordenadas de pantalla como estado permanente.
```

---

# 49. Divide el trabajo en fases

No le des al agente todo a la vez.

## Fase 1

Solo:

```text
sidebar
+
board
+
three regions
```

## Fase 2

Añadir:

```text
zones
+
cards
```

## Fase 3

Añadir:

```text
hand
+
card hover
+
card preview
```

## Fase 4

Añadir:

```text
log
+
player status
+
palette
```

## Fase 5

Añadir:

```text
drag & drop
+
selection
+
context menu
```

## Fase 6

Añadir:

```text
arrows
+
markers
+
animations
```

Esto reduce muchísimo la tendencia del agente a "inventar" una UI.

---

# 50. Usa un archivo de constantes visuales

Por ejemplo:

```ts
export const BOARD = {
    width: 1600,
    height: 900,

    sidebarWidth: 70,

    opponentHeight: 0.24,
    battlefieldHeight: 0.48,
    playerHeight: 0.28,
};

export const CARD = {
    aspectRatio: 5 / 7,

    defaultWidth: 110,

    hoverLift: 35,

    handOverlap: 35,
};
```

Así un agente puede ajustar:

```ts
battlefieldHeight
```

sin romper toda la aplicación.

---

# 51. Datos frente a presentación

Mantén separado:

```text
Game state
    ↓
React/Vue state
    ↓
Components
    ↓
CSS
```

Nunca:

```text
Game logic
    ↓
document.querySelector()
    ↓
style.left
    ↓
style.top
```

Eso se vuelve imposible de mantener.

---

# 52. Rendimiento

Un tablero puede tener muchas cartas.

Evita recalcular toda la aplicación durante cada `pointermove`.

Para drag:

```text
pointermove
    ↓
requestAnimationFrame
    ↓
visual update
```

Y al soltar:

```text
pointerup
    ↓
commit state
```

También usa:

```css
will-change: transform;
```

solo en elementos que realmente se animen.

No lo pongas en todas las cartas.

---

# 53. Imágenes de cartas

Las cartas deberían estar en:

```text
/public/cards/
```

Ejemplo:

```text
public/
└── cards/
    ├── plains.webp
    ├── mountain.webp
    ├── containment-construct.webp
    └── wave-of-reckoning.webp
```

Modelo:

```ts
{
    id: "wave-of-reckoning",
    image: "/cards/wave-of-reckoning.webp"
}
```

El componente no debería conocer la lógica de la carta.

---

# 54. Estado de carta recomendado

```ts
type CardInstance = {
    instanceId: string;

    definitionId: string;

    ownerId: string;

    zoneId: string;

    position: {
        x: number;
        y: number;
    };

    rotation: number;

    faceDown: boolean;

    tapped: boolean;

    selected: boolean;

    counters: Record<string, number>;
}
```

Esto permite tener dos copias de la misma carta sin confundirlas.

---

# 55. Estado de UI

Separarlo del estado del juego:

```ts
type UIState = {
    hoveredCardId: string | null;

    selectedCardIds: string[];

    previewCardId: string | null;

    contextMenu: {
        x: number;
        y: number;
        cardId: string;
    } | null;

    activeTool:
        | "pointer"
        | "marker"
        | "arrow";
}
```

---

# 56. Por qué esto es mejor

Entonces:

```text
card.preview
```

no necesita cambiar la posición de la carta.

El preview simplemente observa:

```ts
previewCardId
```

y renderiza un overlay.

---

# 57. Arquitectura final

```text
                         ┌─────────────────────┐
                         │     UI OVERLAYS     │
                         │                     │
                         │ Card Preview        │
                         │ Context Menu        │
                         │ Game Log             │
                         │ Marker Palette       │
                         └──────────┬──────────┘
                                    │
┌───────────────┐       ┌───────────▼────────────────┐
│               │       │                            │
│   SIDEBAR     │       │       GAME VIEWPORT        │
│               │       │                            │
│ Turn          │       │  ┌──────────────────────┐  │
│ Tools         │       │  │ Opponent Area        │  │
│ Settings      │       │  ├──────────────────────┤  │
│ Help          │       │  │ Battlefield          │  │
│               │       │  │                      │  │
│               │       │  │ Zone Layer           │  │
│               │       │  │ Card Layer           │  │
│               │       │  │ Interaction Layer    │  │
│               │       │  ├──────────────────────┤  │
│               │       │  │ Player Area          │  │
│               │       │  │ Hand Layer            │  │
│               │       │  │ Player Status         │  │
│               │       │  └──────────────────────┘  │
└───────────────┘       └────────────────────────────┘
```

---

# 58. Checklist visual

Antes de implementar lógica, verifica:

- [ ] Sidebar tiene aproximadamente 70px.
- [ ] El fondo es casi negro.
- [ ] El tablero es azul oscuro.
- [ ] La sidebar no desplaza el tablero.
- [ ] El tablero ocupa todo el espacio restante.
- [ ] Las cartas están en una capa independiente.
- [ ] Las cartas mantienen proporción vertical.
- [ ] La mano está centrada.
- [ ] Las cartas de la mano se solapan.
- [ ] Hover eleva una carta.
- [ ] El preview está fuera del layout principal.
- [ ] El log está fuera del flujo del tablero.
- [ ] El estado de jugador está abajo a la izquierda.
- [ ] La paleta de colores es flotante.
- [ ] Las flechas utilizan SVG/capa independiente.
- [ ] Los overlays tienen z-index superior.
- [ ] El drag & drop utiliza coordenadas relativas.

---

# 59. Checklist de implementación

## Primera versión

```text
App
 ├── Sidebar
 └── Game
      ├── Board
      │    ├── OpponentArea
      │    ├── Battlefield
      │    └── PlayerArea
      └── Hand
```

No implementes nada más.

## Segunda versión

Añade:

```text
Card
Zone
CardLayer
```

## Tercera versión

Añade:

```text
CardPreview
GameLog
PlayerStatus
MarkerPalette
```

## Cuarta versión

Añade interacción:

```text
Drag
Drop
Select
Hover
Rotate
Flip
```

## Quinta versión

Añade:

```text
ContextMenu
SVG arrows
Markers
Animations
```

---

# 60. Conclusión

La mejor forma de replicar esta interfaz no es tratarla como una imagen.

Piensa en ella como:

```text
HTML
+
CSS Grid/Flex
+
Absolute positioning para cartas
+
Fixed overlays
+
SVG para interacciones
+
estado de juego separado
+
coordenadas relativas
```

La frase que debería guiar la implementación es:

> **"El tablero es un sistema de coordenadas; las cartas son entidades posicionadas sobre él; la UI auxiliar vive en capas independientes."**

Eso se aproxima mucho más al tipo de simulador que muestra la captura que intentar reproducirlo mediante cientos de `div`s con `top/left` escritos a mano.

---

# 61. Apéndice: inventario exacto de la captura (corrige las secciones 5, 14-19)

Esta sección sustituye por datos reales las partes del documento que eran aproximadas. Viene de
inspeccionar `deseado.png` directamente, no de memoria genérica de "un TCG online". Dale esta
sección literal al agente junto con las demás; es la que más reduce la posibilidad de que invente.

## 61.1 Sidebar — lista exacta de iconos, de arriba a abajo

El doc original (sección 5) lista 9 botones aproximados. La lista real, en orden, es:

```text
1.  Turn 1 / 02:35 / 02:35     → bloque de texto (turno, timer, timer secundario)
2.  ←                          → flecha "volver" / navegación
    ── separador ──
3.  ▶                          → play / iniciar
4.  👥 (dos personas)          → jugadores / lista de jugadores
5.  ⚙ (engranaje)              → ajustes
6.  ?                          → ayuda
    ── separador ──
7.  ↩ (flecha curva)           → deshacer / responder última acción
8.  🖐 (mano con dedo, "tap")  → herramienta de interacción / puntero
9.  💀 (calavera)              → concede / rendirse
    ── separador ──
10. ⚂ (dados)                  → aleatoriedad / dados
11. 🔧 (llave inglesa)         → herramientas / configuración de partida
12. ⌄ (chevron abajo)          → colapsar / desplegar sección
13. ⤬ (dos flechas cruzadas)   → intercambiar / mulligan
14. 🃏+ (carta con "+")        → añadir carta / zoom de carta
    ── separador ──
15. ⏏ (puerta con flecha)      → salir de la partida
```

No son 9 botones genéricos de "toolbar de editor". Son acciones específicas de una partida de TCG
(concede, mulligan, dados, deshacer). El agente debe implementarlos como botones reales con estas
funciones, no como iconos decorativos.

## 61.2 Paleta de marcadores (confirma sección 20)

Correcto tal cual está descrito: 4 círculos de color (naranja, verde, cian, morado) + botón de
colapsar `‹`, flotante, pegada al borde izquierdo justo encima del tablero.

## 61.3 Falta por completo: barra de reacciones / chat (esquina inferior derecha)

El documento cubre el `GameLog` (sección 17-18) pero **no** menciona esta zona, que es un
componente aparte, debajo del log:

```text
GameLog
   ↓
[😊]  [ Chat...                              ]  [➤]
   ↓
[👍] [👏] [⏳] [❓] [✔] [❌] [🎉]              [➕]
```

- Un input de chat de una línea, con un icono de emoji a la izquierda y un botón de enviar (➤) a
  la derecha.
- Debajo, una fila de reacciones rápidas de un solo click: pulgar arriba, aplauso, reloj de arena
  (probablemente "tómate tu tiempo" / esperar), interrogación, check, X en rojo, confeti — y un
  botón `+` al final (probablemente para más reacciones).

Arquitectura sugerida:

```text
GameSidebarRight
├── CardPreviewOverlay   (sección 14-16)
├── GameLog              (sección 17-18)
├── ChatInput
└── QuickReactionsBar
```

CSS orientativo:

```css
.chat-input {
    position: fixed;
    right: 18px;
    bottom: 52px;
    width: 320px;

    display: flex;
    align-items: center;
    gap: 8px;
}

.quick-reactions {
    position: fixed;
    right: 18px;
    bottom: 12px;

    display: flex;
    gap: 6px;
}
```

## 61.4 Falta por completo: panel de recursos del jugador (esquina inferior derecha del tablero)

Justo encima de la barra de reacciones, pero dentro del área de tablero (no del sidebar de log),
hay un panel con tres elementos en fila:

```text
[ 4 ▾ ]     [ 🂠 91 ]     [ 0 ]
mana pool   mazo/library   otro contador
(dropdown)  (dorso de carta
             + nº de cartas
             restantes)
```

- `4 ▾`: número con una flechita desplegable pequeña al lado — probablemente el pool de maná
  disponible, desplegable para ver el desglose por color.
- Dorso de carta genérico con el número `91` superpuesto: es el mazo/library del jugador,
  mostrando cuántas cartas le quedan.
- Una caja separada con `0`: otro contador (por ejemplo veneno, u otro contador de partida).

Modelo de datos sugerido (encaja con la sección 54 y con `PlayerView` de XMage):

```ts
type PlayerResourcePanel = {
    manaPool: { total: number; byColor?: Record<string, number> };
    libraryCount: number;
    secondaryCounter: { label: string; value: number };
}
```

## 61.5 Corrección de la sección 19 (PlayerStatus)

El `PlayerStatus` real no es un bloque de texto suelto. Es una tarjeta con esquinas redondeadas,
con esta estructura:

```text
   ◇     ◇     ◇          ← 3 iconos de diamante vacíos, flotando ENCIMA de la tarjeta
┌───────────────────────┐
│ Player-1387            │  ← cabecera
├───────────┬────────────┤
│    40     │     0      │  ← dos cajas: vida | otro contador
└───────────┴────────────┘
```

Los tres diamantes no estaban en el documento original. Es probable que sean slots de
counters/emblemas vacíos (placeholders), no decoración fija — deben ser un array que puede estar
vacío o poblarse según el estado de partida (ej. emblemas, "the monarch", experience counters de
XMage).

```ts
type PlayerStatusPanel = {
    playerName: string;
    badgeSlots: Array<{ icon: string } | null>; // los diamantes, normalmente vacíos
    counters: Array<{ label?: string; value: number }>; // vida siempre primero
}
```

## 61.6 Indicador "listo" sobre algunas cartas

Varias cartas del tablero (mazo del rival, alguna zona vacía, esquina de la mano) muestran un
pequeño badge cuadrado con un check ✔ en la esquina superior. Es un indicador de estado por
zona/carta (p. ej. "acción resuelta", "prioridad pasada" o "zona confirmada"), no decoración.
Añadir al modelo de `CardInstance`/`ZoneState`:

```ts
readyBadge?: boolean;
```

## 61.7 Checklist adicional (extiende la sección 58)

- [ ] Sidebar tiene exactamente 15 elementos en el orden de 61.1, no una lista genérica.
- [ ] Existe `ChatInput` con icono de emoji + botón enviar.
- [ ] Existe `QuickReactionsBar` con 7-8 iconos fijos.
- [ ] Existe `PlayerResourcePanel` (mana pool / library count con dorso de carta / contador extra).
- [ ] `PlayerStatus` es una tarjeta con cabecera + cajas separadas, con 3 slots de diamante encima.
- [ ] Las cartas/zonas pueden mostrar un `readyBadge`.
- [ ] El estado de estas cinco piezas viene de campos reales de `GameView`/`PlayerView` de XMage
      (sección -1.b), no de datos inventados para que "se vea bien".

---

## Fuentes consultadas

- Página pública de TCG Arena: describe el producto como un simulador de TCG en navegador, con hasta 4 jugadores, áreas configurables y automatizaciones limitadas.
- Publicación del creador sobre el nuevo motor de cartas: menciona transiciones para robar, jugar, voltear y rotar cartas, además del sistema multiplayer.
