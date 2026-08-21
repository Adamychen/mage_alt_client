export type ActionFeedType =
  | 'turn'
  | 'phase'
  | 'cast'
  | 'land'
  | 'attack'
  | 'block'
  | 'damage'
  | 'life'
  | 'draw'
  | 'discard'
  | 'ability'
  | 'chat'
  | 'system'

export interface ActionFeedItem {
  id: string
  timestamp: number
  type: ActionFeedType
  playerName?: string
  isMe?: boolean
  cardName?: string
  targetName?: string
  amount?: number
  description: string
  rawText: string
}

/** Strip XML/HTML tags, object ID suffixes [abc], and normalize spaces */
export function cleanMageText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // remove HTML tags (<font...>)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s*\[[0-9a-fA-F]{3}\]/g, '') // remove XMage 3-hex object IDs like [a1b]
    .replace(/\s+/g, ' ')
    .trim()
}

/** Noise patterns that should not appear as visual action cards */
const NOISE_PATTERNS = [
  /^evento\s+/i,
  /^sorteo:/i,
  /^mulligan:/i,
  /^Te has unido/i,
  /^Espectador:/i,
  /^Sideboard:/i,
  /^\?[^?]+\?$/,
  /^¿[^?]+(?:\?)?$/,
  /watching the game/i,
  /has joined the game/i,
  /has left the game/i,
]

/**
 * Parses raw XMage chat / game log lines into structured ActionFeedItems.
 * Returns null for internal engine noise or unparseable debug lines.
 */
export function parseGameEvent(
  raw: string,
  myPlayerName?: string,
  idPrefix = 'act'
): ActionFeedItem | null {
  const text = cleanMageText(raw)
  if (!text) return null

  // Ignore internal technical debug noise
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(text)) return null
  }

  const isMe = (name?: string) => {
    if (!name || !myPlayerName) return false
    const n = name.trim().toLowerCase()
    const m = myPlayerName.trim().toLowerCase()
    return n === m || n === 'you' || n === 'tú'
  }

  const base: Omit<ActionFeedItem, 'type' | 'description'> = {
    id: `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    rawText: text,
  }

  // 1. Turn announcements: "Turn 1 Player (0 - 20)" or "Turn 2 (Alice)" or "Turn 3 Bob"
  const turnMatch = text.match(/^Turn\s+(\d+)\s*([^:(]+?)(?:\s*\([^)]*\))?$/i)
  if (turnMatch) {
    const turnNum = Number(turnMatch[1])
    const pName = turnMatch[2].trim()
    return {
      ...base,
      type: 'turn',
      playerName: pName || undefined,
      isMe: isMe(pName),
      amount: turnNum,
      description: `Turno ${turnNum}${pName ? ` · ${pName}` : ''}`,
    }
  }

  // 2. Cast spells: "Player casts CardName [target: TargetName] from Zone" or "Player casts CardName from Zone"
  const castMatch = text.match(
    /^([^:]+?)\s+(?:casts|plays\s+spell)\s+(?:a\s+copied\s+)?(.+?)(?:\s*\[target:\s*([^\]]+)\])?(?:\s+from\s+[A-Za-z ]+)?$/i
  )
  if (castMatch) {
    const pName = castMatch[1].trim()
    const card = castMatch[2].trim()
    const target = castMatch[3]?.trim()
    return {
      ...base,
      type: 'cast',
      playerName: pName,
      isMe: isMe(pName),
      cardName: card,
      targetName: target,
      description: `${pName} lanza ${card}${target ? ` ➔ ${target}` : ''}`,
    }
  }

  // 3. Play Lands: "Player plays LandName from Hand" or "Player plays LandName"
  const landMatch = text.match(/^([^:]+?)\s+plays\s+(.+?)(?:\s+from\s+[A-Za-z ]+)?$/i)
  if (landMatch && !landMatch[2].toLowerCase().includes('spell') && !landMatch[2].toLowerCase().includes('ability')) {
    const pName = landMatch[1].trim()
    const land = landMatch[2].trim()
    return {
      ...base,
      type: 'land',
      playerName: pName,
      isMe: isMe(pName),
      cardName: land,
      description: `${pName} juega ${land}`,
    }
  }

  // 4. Attacks: "Player attacks with Creature1, Creature2" or "Player attacks with Creature"
  const attackMatch = text.match(/^([^:]+?)\s+attacks(?:\s+with\s+(.+?))?(?:\s+targeting\s+(.+))?$/i)
  if (attackMatch) {
    const pName = attackMatch[1].trim()
    const creatures = attackMatch[2]?.trim() || 'criaturas'
    const target = attackMatch[3]?.trim()
    return {
      ...base,
      type: 'attack',
      playerName: pName,
      isMe: isMe(pName),
      cardName: creatures,
      targetName: target,
      description: `${pName} ataca con ${creatures}${target ? ` ➔ ${target}` : ''}`,
    }
  }

  // 5. Blocks: "Player blocks Attacker with Blocker"
  const blockMatch = text.match(/^([^:]+?)\s+blocks\s+(.+?)\s+with\s+(.+)$/i)
  if (blockMatch) {
    const pName = blockMatch[1].trim()
    const attacker = blockMatch[2].trim()
    const blocker = blockMatch[3].trim()
    return {
      ...base,
      type: 'block',
      playerName: pName,
      isMe: isMe(pName),
      cardName: blocker,
      targetName: attacker,
      description: `${pName} bloquea a ${attacker} con ${blocker}`,
    }
  }

  // 6. Damage: "Source deals N damage to Target" or "Target takes N damage from Source"
  const dmgMatch = text.match(/^(.+?)\s+deals?\s+(\d+)\s+damage\s+to\s+(.+)$/i)
  if (dmgMatch) {
    const src = dmgMatch[1].trim()
    const dmg = Number(dmgMatch[2])
    const tgt = dmgMatch[3].trim()
    return {
      ...base,
      type: 'damage',
      cardName: src,
      targetName: tgt,
      amount: dmg,
      isMe: isMe(tgt),
      description: `${src} inflige ${dmg} de daño a ${tgt}`,
    }
  }

  // 7. Life Changes: "Player loses N life" / "Player gains N life"
  const lifeLossMatch = text.match(/^([^:]+?)\s+loses\s+(\d+)\s+life/i)
  if (lifeLossMatch) {
    const pName = lifeLossMatch[1].trim()
    const amt = Number(lifeLossMatch[2])
    return {
      ...base,
      type: 'life',
      playerName: pName,
      isMe: isMe(pName),
      amount: -amt,
      description: `${pName} pierde ${amt} vidas (-${amt} ❤️)`,
    }
  }
  const lifeGainMatch = text.match(/^([^:]+?)\s+gains\s+(\d+)\s+life/i)
  if (lifeGainMatch) {
    const pName = lifeGainMatch[1].trim()
    const amt = Number(lifeGainMatch[2])
    return {
      ...base,
      type: 'life',
      playerName: pName,
      isMe: isMe(pName),
      amount: amt,
      description: `${pName} gana ${amt} vidas (+${amt} 💚)`,
    }
  }

  // 8. Abilities: "Ability triggers: CardName" or "Player activates ability of CardName" or "Player activates: ..."
  const abilityTriggerMatch = text.match(/^Ability\s+triggers:\s*([^-]+)(?:\s*-\s*(.+))?/i)
  if (abilityTriggerMatch) {
    const card = abilityTriggerMatch[1].trim()
    const desc = abilityTriggerMatch[2]?.trim()
    return {
      ...base,
      type: 'ability',
      cardName: card,
      description: `Habilidad disparada: ${card}${desc ? ` (${desc})` : ''}`,
    }
  }
  const abilityActMatch = text.match(/^([^:]+?)\s+activates\s+(?:an\s+ability\s+of|the\s+ability\s+of|ability\s+of)\s+([^-]+)/i)
  if (abilityActMatch) {
    const pName = abilityActMatch[1].trim()
    const card = abilityActMatch[2].trim()
    return {
      ...base,
      type: 'ability',
      playerName: pName,
      isMe: isMe(pName),
      cardName: card,
      description: `${pName} activa habilidad de ${card}`,
    }
  }

  // 9. Draws / Discards: "Player draws a card" / "Player discards CardName"
  const drawMatch = text.match(/^([^:]+?)\s+draws?\s+(?:a\s+card|(\d+)\s+cards?)/i)
  if (drawMatch) {
    const pName = drawMatch[1].trim()
    const count = drawMatch[2] ? Number(drawMatch[2]) : 1
    return {
      ...base,
      type: 'draw',
      playerName: pName,
      isMe: isMe(pName),
      amount: count,
      description: `${pName} roba ${count > 1 ? `${count} cartas` : '1 carta'}`,
    }
  }
  const discardMatch = text.match(/^([^:]+?)\s+discards?\s+(.+)$/i)
  if (discardMatch) {
    const pName = discardMatch[1].trim()
    const card = discardMatch[2].trim()
    return {
      ...base,
      type: 'discard',
      playerName: pName,
      isMe: isMe(pName),
      cardName: card,
      description: `${pName} descarta ${card}`,
    }
  }

  // 10. Meaningful game announcements: game start, game over, concession, win
  if (
    text.startsWith('¡Partida') ||
    text.toLowerCase().includes('ha ganado') ||
    text.toLowerCase().includes('won the match') ||
    text.toLowerCase().includes('won the game') ||
    text.toLowerCase().includes('has conceded') ||
    text.toLowerCase().includes('fin de partida')
  ) {
    return {
      ...base,
      type: 'system',
      description: text,
    }
  }

  return null
}
