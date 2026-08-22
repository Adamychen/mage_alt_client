import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const KEYWORDS_DIR = path.join(ROOT, 'Mage/src/main/java/mage/abilities/keyword')
const ABILITYWORDS_DIR = path.join(ROOT, 'Mage/src/main/java/mage/abilities/abilityword')
const OUTPUT_FILE = path.join(ROOT, 'web/src/data/mtgKeywords.ts')

// Diccionario de traducciones, categorías e iconos para enriquecer los datos extraídos de XMage
const ENRICHMENT = {
  // Combate
  first_strike: { es: 'Dañar primero', cat: 'combat', icon: '⚡', esSummary: 'Esta criatura hace daño de combate antes que las criaturas que no tengan dañar primero.' },
  double_strike: { es: 'Doble golpe', cat: 'combat', icon: '⚔️', esSummary: 'Esta criatura hace daño de combate dos veces (en el paso de dañar primero y en el regular).' },
  deathtouch: { es: 'Toque mortal', cat: 'combat', icon: '🗡️', esSummary: 'Cualquier cantidad de daño que esta criatura inflija a otra criatura es suficiente para destruirla.' },
  trample: { es: 'Arrollar', cat: 'combat', icon: '🌀', esSummary: 'Puede asignar el daño sobrante al jugador o planeswalker defensor tras matar a los bloqueadores.' },
  vigilance: { es: 'Vigilancia', cat: 'combat', icon: '🛡️', esSummary: 'Atacar no hace que esta criatura se gire.' },
  lifelink: { es: 'Vínculo vital', cat: 'combat', icon: '💎', esSummary: 'El daño infligido por esta criatura también hace que ganes esa misma cantidad de vidas.' },
  haste: { es: 'Prisa', cat: 'combat', icon: '🔥', esSummary: 'Esta criatura puede atacar y girarse ({T}) para activar habilidades tan pronto como entra bajo tu control.' },
  defender: { es: 'Defensor', cat: 'combat', icon: '🏰', esSummary: 'Esta criatura no puede atacar.' },
  wither: { es: 'Marchitar (Wither)', cat: 'combat', icon: '🥀', esSummary: 'Esta fuente hace daño a criaturas en forma de contadores -1/-1.' },
  infect: { es: 'Infectar', cat: 'combat', icon: '☣️', esSummary: 'Hace daño a criaturas en contadores -1/-1 y a jugadores en contadores de veneno.' },
  toxic: { es: 'Tóxico', cat: 'combat', icon: '☣️', esSummary: 'Los jugadores que reciban daño de combate obtienen N contadores de veneno adicionales.' },
  annihilator: { es: 'Aniquilador', cat: 'combat', icon: '🪐', esSummary: 'Al atacar, el jugador defensor sacrifica N permanentes.' },
  bushido: { es: 'Bushido', cat: 'combat', icon: '🥋', esSummary: 'Al bloquear o ser bloqueada, obtiene +N/+N hasta el final del turno.' },
  battle_cry: { es: 'Grito de batalla', cat: 'combat', icon: '📯', esSummary: 'Al atacar, las otras criaturas atacantes obtienen +1/+0 hasta el final del turno.' },
  afflict: { es: 'Afligir', cat: 'combat', icon: '⚰️', esSummary: 'Al ser bloqueada, el jugador defensor pierde N vidas.' },
  flanking: { es: 'Flanqueo', cat: 'combat', icon: '🐎', esSummary: 'Los bloqueadores sin flanqueo obtienen -1/-1 hasta el final del turno.' },
  training: { es: 'Entrenamiento', cat: 'combat', icon: '🏋️', esSummary: 'Al atacar con una criatura de mayor fuerza, pon un contador +1/+1 sobre esta criatura.' },
  mentor: { es: 'Mentor', cat: 'combat', icon: '🧑‍🏫', esSummary: 'Al atacar, pon un contador +1/+1 sobre otra criatura atacante con menor fuerza.' },
  prowess: { es: 'Destreza', cat: 'combat', icon: '🥋', esSummary: 'Al lanzar un hechizo que no sea criatura, esta criatura obtiene +1/+1 hasta el final del turno.' },
  exalted: { es: 'Exaltado', cat: 'combat', icon: '👑', esSummary: 'Al atacar con exactamente una criatura sola, esa criatura obtiene +1/+1 hasta el final del turno.' },
  melee: { es: 'Melé', cat: 'combat', icon: '⚔️', esSummary: 'Al atacar, obtiene +1/+1 por cada oponente atacado en este combate.' },
  frenzy: { es: 'Frenesí', cat: 'combat', icon: '🩸', esSummary: 'Al atacar y no ser bloqueada, obtiene +N/+0 hasta el final del turno.' },
  rampage: { es: 'Furia (Rampage)', cat: 'combat', icon: '🦏', esSummary: 'Obtiene +N/+N por cada criatura bloqueadora adicional más allá de la primera.' },
  provoke: { es: 'Provocar', cat: 'combat', icon: '📢', esSummary: 'Al atacar, puedes obligar a una criatura objetivo a enderezarse y bloquear a esta criatura.' },
  bloodthirst: { es: 'Sed de sangre', cat: 'counters', icon: '🩸', esSummary: 'Entra con N contadores +1/+1 si un oponente recibió daño este turno.' },
  renown: { es: 'Renombre', cat: 'counters', icon: '⭐', esSummary: 'Cuando inflija daño de combate a un jugador, si no es renombrada, pon N contadores +1/+1 sobre ella.' },
  riot: { es: 'Alboroto (Riot)', cat: 'combat', icon: '🔥', esSummary: 'Esta criatura entra al campo de batalla con un contador +1/+1 o con prisa a tu elección.' },
  decayed: { es: 'Putrefacto (Decayed)', cat: 'combat', icon: '🧟', esSummary: 'Esta criatura no puede bloquear. Cuando ataca, sacrifícala al final del combate.' },

  // Evasión
  flying: { es: 'Volar', cat: 'evasion', icon: '🦅', esSummary: 'Solo puede ser bloqueada por criaturas que tengan volar o alcance.' },
  reach: { es: 'Alcance', cat: 'evasion', icon: '🏹', esSummary: 'Esta criatura puede bloquear criaturas con la habilidad de volar.' },
  menace: { es: 'Amenaza', cat: 'evasion', icon: '👥', esSummary: 'Esta criatura no puede ser bloqueada excepto por dos o más criaturas.' },
  shadow: { es: 'Sombra', cat: 'evasion', icon: '👤', esSummary: 'Solo puede bloquear o ser bloqueada por criaturas con sombra.' },
  horsemanship: { es: 'Equitación', cat: 'evasion', icon: '🐎', esSummary: 'Solo puede ser bloqueada por criaturas con la habilidad de equitación.' },
  skulk: { es: 'Sigilo', cat: 'evasion', icon: '👟', esSummary: 'No puede ser bloqueada por criaturas con mayor fuerza que ella.' },
  fear: { es: 'Miedo', cat: 'evasion', icon: '😱', esSummary: 'Solo puede ser bloqueada por criaturas artefacto y/o negras.' },
  intimidate: { es: 'Intimidar', cat: 'evasion', icon: '😈', esSummary: 'Solo puede ser bloqueada por criaturas artefacto y/o que compartan color con ella.' },
  islandwalk: { es: 'Cruzar islas', cat: 'evasion', icon: '🏝️', esSummary: 'No puede ser bloqueada mientras el defensor controle una isla.' },
  swampwalk: { es: 'Cruzar pantanos', cat: 'evasion', icon: '🌲', esSummary: 'No puede ser bloqueada mientras el defensor controle un pantano.' },
  mountainwalk: { es: 'Cruzar montañas', cat: 'evasion', icon: '⛰️', esSummary: 'No puede ser bloqueada mientras el defensor controle una montaña.' },
  forestwalk: { es: 'Cruzar bosques', cat: 'evasion', icon: '🌳', esSummary: 'No puede ser bloqueada mientras el defensor controle un bosque.' },
  plainswalk: { es: 'Cruzar llanuras', cat: 'evasion', icon: '🌾', esSummary: 'No puede ser bloqueada mientras el defensor controle una llanura.' },
  banding: { es: 'Agrupación (Banding)', cat: 'evasion', icon: '🛡️', esSummary: 'Permite formar bandas al atacar/bloquear y decidir cómo asignar el daño recibido.' },

  // Protección
  hexproof: { es: 'Antimaleficio', cat: 'protection', icon: '🔮', esSummary: 'No puede ser objetivo de hechizos o habilidades de tus oponentes.' },
  indestructible: { es: 'Indestructible', cat: 'protection', icon: '💠', esSummary: 'No puede ser destruido por daño ni por efectos de destrucción.' },
  ward: { es: 'Protección (Ward)', cat: 'protection', icon: '🛡️', esSummary: 'Contrarresta hechizos o habilidades enemigas que le hagan objetivo salvo que paguen el coste de Ward.' },
  protection: { es: 'Protección', cat: 'protection', icon: '🛡️', esSummary: 'No puede ser dañado, encantado, bloqueado ni hecho objetivo por la cualidad elegida.' },
  shroud: { es: 'Velo (Shroud)', cat: 'protection', icon: '🌫️', esSummary: 'No puede ser objetivo de hechizos ni habilidades de ningún jugador.' },
  phasing: { es: 'Desfasamiento', cat: 'protection', icon: '👻', esSummary: 'Entra y sale de existencia en el paso de enderezar sin cambiar de zona ni disparar ETB.' },
  totem_armor: { es: 'Armadura tótem', cat: 'protection', icon: '🐻', esSummary: 'Si la criatura fuera a ser destruida, destruye esta aura en su lugar.' },

  // Acciones y cartas
  scry: { es: 'Adivinar (Scry)', cat: 'cards', icon: '🔮', esSummary: 'Mira las primeras N cartas de la biblioteca. Ponlas arriba o abajo en cualquier orden.' },
  surveil: { es: 'Vigilar (Surveil)', cat: 'cards', icon: '👁️', esSummary: 'Mira las primeras N cartas de la biblioteca. Ponlas arriba o al cementerio.' },
  mill: { es: 'Moler (Mill)', cat: 'graveyard', icon: '☠️', esSummary: 'Pon las primeras N cartas de la biblioteca directamente en el cementerio.' },
  proliferate: { es: 'Proliferar', cat: 'counters', icon: '🧪', esSummary: 'Elige permanentes/jugadores con contadores y añade un contador adicional de cada tipo.' },
  populate: { es: 'Poblar', cat: 'mechanic', icon: '🌱', esSummary: 'Crea una copia de una ficha de criatura que ya controlas.' },
  investigate: { es: 'Investigar', cat: 'cards', icon: '🔍', esSummary: 'Crea una ficha de Pista con "{2}, sacrificar: Roba una carta".' },
  amass: { es: 'Enrolar (Amass)', cat: 'counters', icon: '🧟', esSummary: 'Crea o fortalece tu ficha de Ejército con N contadores +1/+1.' },
  incubate: { es: 'Incubar', cat: 'counters', icon: '🥚', esSummary: 'Crea una ficha de Incubadora con N contadores +1/+1 que se transforma por {2}.' },
  connive: { es: 'Conspirar', cat: 'cards', icon: '🕵️', esSummary: 'Roba una carta y descarta una. Si descartas una no-tierra, pon un contador +1/+1.' },
  learn: { es: 'Aprender', cat: 'cards', icon: '📜', esSummary: 'Trae una carta de Lección de fuera del juego o descarta para robar.' },
  explore: { es: 'Explorar', cat: 'cards', icon: '🧭', esSummary: 'Revela la primera carta de tu mazo: a la mano si es tierra, o contador +1/+1 y filtrado si no.' },
  adapt: { es: 'Adaptar', cat: 'counters', icon: '🧬', esSummary: 'Si no tiene contadores +1/+1, pon N contadores +1/+1 sobre ella.' },
  discover: { es: 'Descubrir', cat: 'mechanic', icon: '💎', esSummary: 'Exilia hasta encontrar una carta de coste N o menor. Lánzala gratis o ponla en mano.' },
  cascade: { es: 'Cascada', cat: 'mechanic', icon: '💥', esSummary: 'Exilia hasta encontrar una carta de menor coste y lánzala sin pagar su coste de maná.' },
  goad: { es: 'Incitar (Goad)', cat: 'mechanic', icon: '🎯', esSummary: 'Fuerza a la criatura a atacar en cada combate y a otro jugador si es posible.' },
  fight: { es: 'Luchar (Fight)', cat: 'combat', icon: '🥊', esSummary: 'Ambas criaturas se infligen daño mutuo igual a sus respectivas fuerzas.' },

  // Maná y Costes
  flash: { es: 'Destello', cat: 'mechanic', icon: '✨', esSummary: 'Puedes lanzar este hechizo en cualquier momento en que pudieras lanzar un instantáneo.' },
  convoke: { es: 'Convocar', cat: 'mana', icon: '🤝', esSummary: 'Gira criaturas para pagar {1} o un maná de su color del coste del hechizo.' },
  improvise: { es: 'Improvisar', cat: 'mana', icon: '🔧', esSummary: 'Gira artefactos para pagar {1} de maná genérico del coste del hechizo.' },
  delve: { es: 'Excavar (Delve)', cat: 'graveyard', icon: '⛏️', esSummary: 'Exilia cartas de tu cementerio para pagar {1} de maná genérico por cada una.' },
  affinity: { es: 'Afinidad', cat: 'mana', icon: '⚙️', esSummary: 'Cuesta {1} menos por cada permanente del tipo especificado que controlas.' },
  kicker: { es: 'Estímulo (Kicker)', cat: 'mana', icon: '⚡', esSummary: 'Paga un coste opcional adicional al lanzar el hechizo para potenciar sus efectos.' },
  multikicker: { es: 'Multiestímulo', cat: 'mana', icon: '⚡', esSummary: 'Paga el coste de estímulo tantas veces como desees para multiplicar sus efectos.' },
  buyback: { es: 'Recuperar (Buyback)', cat: 'mana', icon: '↩️', esSummary: 'Paga un coste extra para devolver este hechizo a tu mano al resolverse.' },
  storm: { es: 'Tormenta (Storm)', cat: 'mechanic', icon: '⛈️', esSummary: 'Copia este hechizo por cada otro hechizo lanzado antes en este turno.' },
  madness: { es: 'Demencia (Madness)', cat: 'graveyard', icon: '🤪', esSummary: 'Al descartar esta carta, puedes lanzarla por su coste de demencia.' },
  miracle: { es: 'Milagro', cat: 'cards', icon: '✨', esSummary: 'Lánzala por un coste reducido si es la primera carta que robas este turno.' },
  suspend: { es: 'Suspender', cat: 'mana', icon: '⏳', esSummary: 'Exíliala con contadores de tiempo pagando su coste; se lanza gratis al agotarse.' },
  foretell: { es: 'Predecir (Foretell)', cat: 'mana', icon: '🔮', esSummary: 'Exíliala boca abajo por {2} y lánzala en un turno posterior por su coste de predicción.' },
  plot: { es: 'Tramar (Plot)', cat: 'mana', icon: '🗺️', esSummary: 'Paga su coste de trama en el exilio para castearla gratis en un turno posterior.' },
  dash: { es: 'Arremeter (Dash)', cat: 'mana', icon: '💨', esSummary: 'Lánzala con prisa por su coste de arremeter; regresa a la mano al final del turno.' },
  blitz: { es: 'Bombardeo (Blitz)', cat: 'mana', icon: '💣', esSummary: 'Lánzala con prisa y robo al morir; se sacrifica al final del turno.' },
  spectacle: { es: 'Espectáculo', cat: 'mana', icon: '🎪', esSummary: 'Coste alternativo disponible si un oponente perdió vidas este turno.' },
  surge: { es: 'Oleada (Surge)', cat: 'mana', icon: '🌊', esSummary: 'Coste reducido si ya lanzaste otro hechizo en este turno.' },
  emerge: { es: 'Emerger', cat: 'mana', icon: '🐙', esSummary: 'Sacrifica una criatura para descontar su coste de maná al lanzar este hechizo.' },
  evoke: { es: 'Evocar (Evoke)', cat: 'mana', icon: '👻', esSummary: 'Lánzala por menos maná para activar sus disparadas ETB y sacrifícala al entrar.' },
  overload: { es: 'Sobrecarga', cat: 'mana', icon: '💥', esSummary: 'Cambia "el permanente objetivo" por "cada permanente" por un coste mayor.' },
  bargain: { es: 'Negociar', cat: 'mana', icon: '🤝', esSummary: 'Sacrifica un artefacto, encantamiento o ficha al lanzar para obtener efectos extras.' },
  casualty: { es: 'Baja (Casualty)', cat: 'mana', icon: '🩸', esSummary: 'Sacrifica una criatura de fuerza N+ para duplicar este hechizo en la pila.' },

  // Cementerio
  dredge: { es: 'Dragar (Dredge)', cat: 'graveyard', icon: '🪦', esSummary: 'En vez de robar carta, pon N cartas de tu mazo al cementerio y recupera esta carta a tu mano.' },
  unearth: { es: 'Desenterrar', cat: 'graveyard', icon: '⛏️', esSummary: 'Reanima esta carta por un turno con prisa. Se exilia al final del turno.' },
  escape: { es: 'Escapar (Escape)', cat: 'graveyard', icon: '🔥', esSummary: 'Lánzala desde tu cementerio pagando maná y exiliando otras cartas del cementerio.' },
  flashback: { es: 'Retrospectiva', cat: 'graveyard', icon: '🔄', esSummary: 'Lanza este hechizo desde tu cementerio pagando su coste de retrospectiva.' },
  retrace: { es: 'Rastrear (Retrace)', cat: 'graveyard', icon: '🐾', esSummary: 'Lanza este hechizo desde tu cementerio descartando una tierra además de su coste.' },
  undying: { es: 'Inmortal (Undying)', cat: 'graveyard', icon: '🧟', esSummary: 'Al morir sin contadores +1/+1, regresa al campo de batalla con un contador +1/+1.' },
  persist: { es: 'Persistir (Persist)', cat: 'graveyard', icon: '👻', esSummary: 'Al morir sin contadores -1/-1, regresa al campo de batalla con un contador -1/-1.' },
  scavenge: { es: 'Carroñar', cat: 'graveyard', icon: '🦴', esSummary: 'Exilia desde el cementerio para poner contadores +1/+1 iguales a su fuerza en una criatura.' },
  embalm: { es: 'Embalsamar', cat: 'graveyard', icon: '🏺', esSummary: 'Exilia desde el cementerio para crear una ficha copia que es un Zombi blanco.' },
  eternalize: { es: 'Eternizar', cat: 'graveyard', icon: '🏺', esSummary: 'Exilia desde el cementerio para crear una ficha copia que es un Zombi 4/4 negro.' },
  encore: { es: 'Bis (Encore)', cat: 'graveyard', icon: '🎭', esSummary: 'Exilia para crear copias atacando a cada oponente este turno.' },

  // Mecánicas de Mesa
  morph: { es: 'Metamorfosis', cat: 'mechanic', icon: '❓', esSummary: 'Lánzala boca abajo como una criatura 2/2 por {3}. Ponla boca arriba pagando su coste.' },
  megamorph: { es: 'Megamorfosis', cat: 'mechanic', icon: '❓', esSummary: 'Lánzala boca abajo por {3}. Al ponerla boca arriba, pon un contador +1/+1 sobre ella.' },
  disguise: { es: 'Disfraz (Disguise)', cat: 'mechanic', icon: '🥸', esSummary: 'Lánzala boca abajo por {3} como 2/2 con Ward {2}. Ponla boca arriba pagando su coste.' },
  manifest: { es: 'Manifestar', cat: 'mechanic', icon: '🌀', esSummary: 'Pon la primera carta del mazo boca abajo como 2/2. Voltéala si es criatura por su maná.' },
  mutate: { es: 'Mutar (Mutate)', cat: 'mechanic', icon: '🧬', esSummary: 'Lánzala sobre/debajo de una criatura no-humana para fusionar todas sus habilidades.' },
  ninjutsu: { es: 'Ninjutsu', cat: 'mechanic', icon: '🥷', esSummary: 'Regresa un atacante no bloqueado a la mano para poner esta carta girada y atacando.' },
  commander_ninjutsu: { es: 'Ninjutsu de comandante', cat: 'mechanic', icon: '🥷', esSummary: 'Activa ninjutsu directamente desde la zona de comando o tu mano.' },
  monarch: { es: 'El Monarca', cat: 'mechanic', icon: '👑', esSummary: 'Roba una carta al final de tu turno. Se roba haciendo daño de combate al jugador.' },
  initiative: { es: 'La Iniciativa', cat: 'mechanic', icon: '⚔️', esSummary: 'Adéntrate en la mazmorra Undercity al tomarla y en cada mantenimiento.' },
  companion: { es: 'Compañero', cat: 'mechanic', icon: '🦄', esSummary: 'Si tu mazo cumple la restricción, paga {3} en fase principal para ponerla en mano.' },
  partner: { es: 'Camarada (Partner)', cat: 'mechanic', icon: '🤝', esSummary: 'Permite tener dos comandantes si ambos tienen la habilidad de camarada.' },
  modular: { es: 'Modular', cat: 'counters', icon: '🤖', esSummary: 'Entra con N contadores +1/+1. Al morir, puedes poner sus contadores en una criatura artefacto.' },
  graft: { es: 'Injerto (Graft)', cat: 'counters', icon: '🌳', esSummary: 'Entra con N contadores +1/+1. Cuando otra criatura entre, puedes moverle un contador.' },
  evolve: { es: 'Evolucionar (Evolve)', cat: 'counters', icon: '🧬', esSummary: 'Cuando entre una criatura con mayor fuerza o resistencia, pon un contador +1/+1.' },
  soulbond: { es: 'Unión de almas', cat: 'mechanic', icon: '🔗', esSummary: 'Empareja esta criatura con otra al entrar; comparten habilidades mientras estén unidas.' },
  fabricate: { es: 'Fabricar (Fabricate)', cat: 'counters', icon: '🏭', esSummary: 'Al entrar, pon N contadores +1/+1 o crea N fichas de Servofuelle 1/1.' },
  backup: { es: 'Refuerzo (Backup)', cat: 'counters', icon: '🛡️', esSummary: 'Al entrar, pon N contadores +1/+1 en la criatura objetivo y dale sus habilidades este turno.' },

  // Palabras de Habilidad (Ability Words)
  landfall: { es: 'Aterrizaje (Landfall)', cat: 'mechanic', icon: '🏔️', esSummary: 'Se dispara siempre que una tierra entra al campo de batalla bajo tu control.' },
  constellation: { es: 'Constelación', cat: 'mechanic', icon: '✨', esSummary: 'Se dispara siempre que un encantamiento entra al campo de batalla bajo tu control.' },
  magecraft: { es: 'Magiaescuela', cat: 'mechanic', icon: '🪄', esSummary: 'Se dispara siempre que lances o copies un hechizo instantáneo o conjuro.' },
  delirium: { es: 'Delirio', cat: 'graveyard', icon: '🌀', esSummary: 'Efectos mejorados si hay cuatro o más tipos de cartas diferentes en tu cementerio.' },
  threshold: { es: 'Umbral (Threshold)', cat: 'graveyard', icon: '🪦', esSummary: 'Efectos activos mientras tengas siete o más cartas en tu cementerio.' },
  coven: { es: 'Aquelarre (Coven)', cat: 'mechanic', icon: '🕯️', esSummary: 'Se activa si controlas tres o más criaturas con diferentes fuerzas.' },
  morbid: { es: 'Necrario (Morbid)', cat: 'graveyard', icon: '💀', esSummary: 'Efectos potenciados si alguna criatura murió en este turno.' },
  revolt: { es: 'Revuelta (Revolt)', cat: 'mechanic', icon: '✊', esSummary: 'Efectos extras si un permanente que controlabas dejó el campo de batalla este turno.' },
  raid: { es: 'Incursión (Raid)', cat: 'combat', icon: '🏴‍☠️', esSummary: 'Efectos extras si atacaste con alguna criatura en este turno.' },
  battalion: { es: 'Batallón', cat: 'combat', icon: '⚔️', esSummary: 'Se dispara al atacar con esta criatura y al menos otras dos criaturas.' },
  bloodrush: { es: 'Acometida (Bloodrush)', cat: 'combat', icon: '💥', esSummary: 'Descarta esta carta pagando maná para inflar a una criatura atacante objetivo.' },
  channel: { es: 'Canalizar (Channel)', cat: 'mana', icon: '⚡', esSummary: 'Descarta esta carta pagando su coste de canalizar para activar un efecto instantáneo.' },
  ferocious: { es: 'Feroz (Ferocious)', cat: 'combat', icon: '🦁', esSummary: 'Efectos potenciados si controlas una criatura con fuerza 4 o mayor.' },
  formidable: { es: 'Formidable', cat: 'combat', icon: '🛡️', esSummary: 'Efectos activos si tus criaturas tienen una fuerza total combinada de 8 o más.' },
  hellbent: { es: 'Irreflexivo (Hellbent)', cat: 'cards', icon: '🔥', esSummary: 'Habilidades activas mientras no tengas cartas en la mano.' },
  heroic: { es: 'Heroico (Heroic)', cat: 'protection', icon: '🛡️', esSummary: 'Se dispara cuando lanzas un hechizo que hace objetivo a esta criatura.' },
  imprint: { es: 'Estampar (Imprint)', cat: 'mechanic', icon: '📜', esSummary: 'Exilia una o más cartas para que este permanente copie o use sus características.' },
  inspired: { es: 'Inspiración', cat: 'mechanic', icon: '💡', esSummary: 'Se dispara siempre que este permanente se endereza.' },
  metalcraft: { es: 'Hispánico (Metalcraft)', cat: 'mechanic', icon: '⚙️', esSummary: 'Efectos activos mientras controles tres o más artefactos.' },
  pack_tactics: { es: 'Tácticas de manada', cat: 'combat', icon: '🐺', esSummary: 'Se dispara al atacar si la fuerza total de tus atacantes es 6 o más.' },
  spell_mastery: { es: 'Dominio de hechizos', cat: 'graveyard', icon: '📖', esSummary: 'Efectos adicionales si hay dos o más cartas de instantáneo/conjuro en tu cementerio.' },
  undergrowth: { es: 'Sotobosque (Undergrowth)', cat: 'graveyard', icon: '🍄', esSummary: 'Escala su potencia según la cantidad de cartas de criatura en tu cementerio.' },
  celebration: { es: 'Celebración', cat: 'mechanic', icon: '🎉', esSummary: 'Se dispara si dos o más permanentes que no sean tierras entraron bajo tu control este turno.' },
  corrupted: { es: 'Corrompido (Corrupted)', cat: 'counters', icon: '☣️', esSummary: 'Efectos activos mientras un oponente tenga 3 o más contadores de veneno.' },
  fateful_hour: { es: 'Hora fatídica', cat: 'protection', icon: '⏳', esSummary: 'Efectos de gran poder activos mientras tengas 5 vidas o menos.' },
  domain: { es: 'Dominio (Domain)', cat: 'mana', icon: '🌍', esSummary: 'Escala sus efectos según la cantidad de tipos de tierras básicas que controlas (0 a 5).' },
}

function camelToSnake(str) {
  return str
    .replace(/Ability$/, '')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
}

function formatName(rawName) {
  // e.g. "FirstStrikeAbility" -> "First strike"
  const cleaned = rawName.replace(/Ability$/, '')
  return cleaned.replace(/([A-Z])/g, ' $1').trim().replace(/^./, (c) => c.toUpperCase())
}

function extractFromJava(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const fileName = path.basename(filePath, '.java')

  if (fileName.includes('Test') || fileName.includes('Condition') || fileName.startsWith('Can')) {
    return null
  }

  // 1. Comprehensive rules Javadoc: e.g. "702.77. Wither" or "702.77a"
  const crMatch = content.match(/(?:CR\s*)?(\d{3}\.\d+[a-z]?)\.?\s*([^\n\r*]+)/i)
  const ruleSnippet = crMatch ? `CR ${crMatch[1].trim()}: ${crMatch[2].trim()}` : undefined

  // 2. Reminder text from getRule() or String constants:
  // e.g. return "wither <i>(This deals damage to creatures in the form of -1/-1 counters.)</i>";
  let summary = ''
  const ruleMatch = content.match(/getRule\(\)\s*\{[^}]*return\s+["']([^"']+)["']/s) ||
                    content.match(/(?:rule|RULE|reminderText|REMINDER_TEXT)\s*=\s*["']([^"']+)["']/) ||
                    content.match(/<i>\(([^)]+)\)<\/i>/)

  if (ruleMatch) {
    const raw = ruleMatch[1].replace(/<[^>]+>/g, '').trim()
    summary = raw
  }

  // 3. Javadoc description if summary is empty
  if (!summary) {
    const javadocMatch = content.match(/\/\*\*\s*([\s\S]*?)\*\//)
    if (javadocMatch) {
      const lines = javadocMatch[1]
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, '').trim())
        .filter((l) => l && !l.startsWith('@') && !l.startsWith('http') && !l.match(/^\d{3}\./))
      if (lines.length > 0) {
        summary = lines.join(' ')
      }
    }
  }

  const id = camelToSnake(fileName)
  const name = formatName(fileName)

  return {
    id,
    fileName,
    name,
    ruleSnippet,
    summary,
  }
}

export function generateAllKeywords() {
  console.log('Extracting XMage keywords from Java rules engine...')

  const files = [
    ...fs.readdirSync(KEYWORDS_DIR).map((f) => path.join(KEYWORDS_DIR, f)),
    ...fs.readdirSync(ABILITYWORDS_DIR).map((f) => path.join(ABILITYWORDS_DIR, f)),
  ].filter((f) => f.endsWith('.java'))

  const extractedList = []
  const seenIds = new Set()

  for (const file of files) {
    const parsed = extractFromJava(file)
    if (!parsed) continue

    const id = parsed.id
    if (seenIds.has(id)) continue
    seenIds.add(id)

    const enrich = ENRICHMENT[id] || {}

    const isAbilityWord = file.includes('abilityword')
    const type = isAbilityWord ? 'ability_word' : 'ability'
    const category = enrich.cat || (isAbilityWord ? 'mechanic' : 'mechanic')
    const icon = enrich.icon || (isAbilityWord ? '✨' : '📜')
    const nameEs = enrich.es || `${parsed.name} (${enrich.esSummary ? 'Especial' : 'Mecánica'})`
    const summary = enrich.esSummary || parsed.summary || `${parsed.name} - Habilidad de Magic: The Gathering.`
    const ruleSnippet = parsed.ruleSnippet || enrich.ruleSnippet || (isAbilityWord ? 'Palabra de Habilidad oficial de MTG.' : 'Regla oficial de MTG.')

    // Check for parametrized keywords (e.g. Ward {N}, Toxic N, Annihilator N, Scry N)
    let parameterRegexStr = ''
    if (id === 'affinity') parameterRegexStr = `parameterRegex: /Affinity\\s+for\\s+([^\\n,.]+)/i,`
    else if (id === 'protection') parameterRegexStr = `parameterRegex: /Protection\\s+from\\s+([^\\n,.]+)/i,`
    else if (id === 'ward') parameterRegexStr = `parameterRegex: /Ward(?:\\s+([^\\n,.]+))?/i,`
    else if (id === 'scry') parameterRegexStr = `parameterRegex: /Scry\\s+(\\d+)/i,`
    else if (id === 'surveil') parameterRegexStr = `parameterRegex: /Surveil\\s+(\\d+)/i,`
    else if (id === 'mill') parameterRegexStr = `parameterRegex: /Mill\\s+(\\d+)/i,`
    else if (id === 'toxic') parameterRegexStr = `parameterRegex: /Toxic\\s+(\\d+)/i,`
    else if (id === 'annihilator') parameterRegexStr = `parameterRegex: /Annihilator\\s+(\\d+)/i,`
    else if (['bushido', 'afflict', 'frenzy', 'amass', 'incubate', 'adapt', 'discover', 'kicker', 'buyback', 'madness', 'miracle', 'suspend', 'foretell', 'plot', 'dash', 'blitz', 'spectacle', 'surge', 'emerge', 'evoke', 'overload', 'casualty', 'dredge', 'unearth', 'scavenge', 'embalm', 'eternalize', 'encore', 'morph', 'megamorph', 'disguise', 'mutate', 'ninjutsu'].includes(id)) {
      parameterRegexStr = `parameterRegex: /${parsed.name}(?:\\s+([^\\n,.]+))?/i,`
    }

    extractedList.push({
      id,
      name: parsed.name,
      nameEs,
      type,
      category,
      icon,
      summary,
      ruleSnippet,
      parameterRegexStr,
    })
  }

  // Asegurar la presencia de Keyword Actions canónicas de MTG
  const canonicalActions = [
    { id: 'scry', name: 'Scry', nameEs: 'Adivinar', cat: 'cards', icon: '🔮', regex: `parameterRegex: /Scry\\s+(\\d+)/i,`, summary: 'Mira las primeras N cartas de tu biblioteca. Pon cualquier cantidad en el fondo y el resto arriba.', rule: 'CR 701.18: Adivinar (Scry)' },
    { id: 'surveil', name: 'Surveil', nameEs: 'Vigilar', cat: 'cards', icon: '👁️', regex: `parameterRegex: /Surveil\\s+(\\d+)/i,`, summary: 'Mira las primeras N cartas de tu biblioteca. Pon cualquier cantidad en tu cementerio y el resto arriba.', rule: 'CR 701.42: Vigilar (Surveil)' },
    { id: 'mill', name: 'Mill', nameEs: 'Moler', cat: 'graveyard', icon: '☠️', regex: `parameterRegex: /Mill\\s+(\\d+)/i,`, summary: 'Pon las primeras N cartas de la biblioteca directamente en el cementerio.', rule: 'CR 701.13: Moler (Mill)' },
    { id: 'proliferate', name: 'Proliferate', nameEs: 'Proliferar', cat: 'counters', icon: '🧪', regex: '', summary: 'Elige permanentes o jugadores con contadores y pon un contador adicional de cada tipo que tengan.', rule: 'CR 701.27: Proliferar (Proliferate)' },
    { id: 'populate', name: 'Populate', nameEs: 'Poblar', cat: 'mechanic', icon: '🌱', regex: '', summary: 'Crea una ficha que es una copia de una ficha de criatura que ya controlas.', rule: 'CR 701.30: Poblar (Populate)' },
    { id: 'investigate', name: 'Investigate', nameEs: 'Investigar', cat: 'cards', icon: '🔍', regex: '', summary: 'Crea una ficha de Pista con "{2}, sacrificar: Roba una carta".', rule: 'CR 701.36: Investigar (Investigate)' },
    { id: 'connive', name: 'Connive', nameEs: 'Conspirar', cat: 'cards', icon: '🕵️', regex: '', summary: 'Roba una carta, luego descarta. Si descartas no-tierra, pon un contador +1/+1.', rule: 'CR 701.47: Conspirar (Connive)' },
    { id: 'amass', name: 'Amass', nameEs: 'Enrolar', cat: 'counters', icon: '🧟', regex: `parameterRegex: /Amass\\s+([^\\n,.]+)/i,`, summary: 'Crea una ficha de Ejército 0/0 si no tienes una, y pon N contadores +1/+1 sobre ella.', rule: 'CR 701.44: Enrolar (Amass)' },
    { id: 'incubate', name: 'Incubate', nameEs: 'Incubar', cat: 'counters', icon: '🥚', regex: `parameterRegex: /Incubate\\s+(\\d+)/i,`, summary: 'Crea una ficha de Incubadora con N contadores +1/+1 que se transforma por {2}.', rule: 'CR 701.51: Incubar (Incubate)' },
    { id: 'learn', name: 'Learn', nameEs: 'Aprender', cat: 'cards', icon: '📜', regex: '', summary: 'Trae una carta de Lección de fuera del juego a tu mano o descarta para robar.', rule: 'CR 701.45: Aprender (Learn)' },
    { id: 'explore', name: 'Explore', nameEs: 'Explorar', cat: 'cards', icon: '🧭', regex: '', summary: 'Revela la primera carta de la biblioteca: a la mano si es tierra, o contador +1/+1 y filtrado.', rule: 'CR 701.40: Explorar (Explore)' },
    { id: 'fight', name: 'Fight', nameEs: 'Luchar', cat: 'combat', icon: '🥊', regex: '', summary: 'Cada criatura se inflige mutuamente daño igual a su fuerza.', rule: 'CR 701.12: Luchar (Fight)' },
    { id: 'goad', name: 'Goad', nameEs: 'Incitar', cat: 'mechanic', icon: '🎯', regex: '', summary: 'Fuerza a la criatura a atacar en cada combate y a otro jugador si es posible.', rule: 'CR 701.38: Incitar (Goad)' },
  ]

  for (const act of canonicalActions) {
    if (!seenIds.has(act.id)) {
      seenIds.add(act.id)
      extractedList.push({
        id: act.id,
        name: act.name,
        nameEs: act.nameEs,
        type: 'action',
        category: act.cat,
        icon: act.icon,
        summary: act.summary,
        ruleSnippet: act.rule,
        parameterRegexStr: act.regex,
      })
    }
  }

  // Ordenar alfabéticamente por nombre
  extractedList.sort((a, b) => a.name.localeCompare(b.name))

  console.log(`Successfully parsed ${extractedList.length} unique MTG keywords from XMage engine!`)

  // Construir el código TypeScript
  const tsContent = `export interface MtgKeyword {
  id: string
  name: string
  nameEs: string
  type: 'ability' | 'action' | 'ability_word' | 'game_rule'
  category: 'combat' | 'evasion' | 'protection' | 'mana' | 'graveyard' | 'counters' | 'cards' | 'mechanic'
  icon: string
  summary: string
  ruleSnippet?: string
  parameterRegex?: RegExp
}

export const MTG_KEYWORDS: MtgKeyword[] = [
${extractedList
  .map(
    (k) => `  {
    id: ${JSON.stringify(k.id)},
    name: ${JSON.stringify(k.name)},
    nameEs: ${JSON.stringify(k.nameEs)},
    type: ${JSON.stringify(k.type)},
    category: ${JSON.stringify(k.category)},
    icon: ${JSON.stringify(k.icon)},
    summary: ${JSON.stringify(k.summary)},
    ruleSnippet: ${JSON.stringify(k.ruleSnippet)},
    ${k.parameterRegexStr}
  },`
  )
  .join('\n')}
]
`

  fs.writeFileSync(OUTPUT_FILE, tsContent, 'utf-8')
  console.log(`Written ${extractedList.length} keywords to ${OUTPUT_FILE}`)
}

generateAllKeywords()
