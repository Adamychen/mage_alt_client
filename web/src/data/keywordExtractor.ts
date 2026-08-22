import type { CardView, PermanentView } from '../net/types'
import { MTG_KEYWORDS, type MtgKeyword } from './mtgKeywords'

export interface DetectedKeyword {
  id: string
  name: string
  nameEs: string
  icon: string
  category: MtgKeyword['category']
  summary: string
  ruleSnippet?: string
  parameter?: string
}

/**
 * Normalizes rule text and extracts matching MTG keywords from a card's rules,
 * abilities, and sub-abilities.
 */
export function extractKeywordsFromCard(card: CardView | PermanentView | null): DetectedKeyword[] {
  if (!card) return []

  const textLines: string[] = []

  // Collect text lines from rules
  if (Array.isArray(card.rules)) {
    textLines.push(...card.rules)
  }

  // Collect text from abilities if present
  if (Array.isArray((card as any).abilities)) {
    for (const ab of (card as any).abilities) {
      if (typeof ab === 'string') textLines.push(ab)
      else if (ab && typeof ab.rule === 'string') textLines.push(ab.rule)
    }
  }

  if (textLines.length === 0) return []

  const combinedText = textLines.join('\n')
  const detected: DetectedKeyword[] = []
  const seenIds = new Set<string>()

  for (const kw of MTG_KEYWORDS) {
    if (kw.parameterRegex) {
      const match = combinedText.match(kw.parameterRegex)
      if (match) {
        const param = match[1]?.trim()
        let customSummary = kw.summary
        let customName = kw.name
        let customNameEs = kw.nameEs

        if (param) {
          if (kw.id === 'ward') {
            customName = `Ward ${param}`
            customNameEs = `Protección (Ward ${param})`
            customSummary = `Siempre que sea objetivo de un hechizo o habilidad que controle un oponente, contrarréstalo a menos que pague ${param}.`
          } else if (kw.id === 'protection') {
            customName = `Protection from ${param}`
            customNameEs = `Protección contra ${param}`
            customSummary = `No puede ser dañado, encantado/equipado, bloqueado ni hecho objetivo por fuentes de tipo ${param}.`
          } else if (kw.id === 'scry') {
            customName = `Scry ${param}`
            customNameEs = `Adivinar ${param}`
            customSummary = `Mira las primeras ${param} cartas de tu biblioteca. Pon cualquier cantidad en el fondo y el resto arriba en cualquier orden.`
          } else if (kw.id === 'surveil') {
            customName = `Surveil ${param}`
            customNameEs = `Vigilar ${param}`
            customSummary = `Mira las primeras ${param} cartas de tu biblioteca. Pon cualquier cantidad en tu cementerio y el resto arriba en cualquier orden.`
          } else if (kw.id === 'mill') {
            customName = `Mill ${param}`
            customNameEs = `Moler ${param}`
            customSummary = `Pon las primeras ${param} cartas de la parte superior de tu biblioteca en tu cementerio.`
          } else if (kw.id === 'toxic') {
            customName = `Toxic ${param}`
            customNameEs = `Tóxico ${param}`
            customSummary = `Los jugadores que reciban daño de combate de esta criatura también obtienen ${param} contadores de veneno.`
          } else if (kw.id === 'dredge') {
            customName = `Dredge ${param}`
            customNameEs = `Dragar ${param}`
            customSummary = `Si fueras a robar una carta, puedes poner ${param} cartas de tu biblioteca en tu cementerio y regresar esta carta a tu mano.`
          }
        }

        if (!seenIds.has(kw.id)) {
          seenIds.add(kw.id)
          detected.push({
            id: kw.id,
            name: customName,
            nameEs: customNameEs,
            icon: kw.icon,
            category: kw.category,
            summary: customSummary,
            ruleSnippet: kw.ruleSnippet,
            parameter: param,
          })
        }
        continue
      }
    }

    // Exact word boundary matching (e.g. \bFlying\b, \bTrample\b, \bVigilance\b)
    const escapedName = kw.name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const regex = new RegExp(`\\b${escapedName}\\b`, 'i')

    if (regex.test(combinedText) && !seenIds.has(kw.id)) {
      seenIds.add(kw.id)
      detected.push({
        id: kw.id,
        name: kw.name,
        nameEs: kw.nameEs,
        icon: kw.icon,
        category: kw.category,
        summary: kw.summary,
        ruleSnippet: kw.ruleSnippet,
      })
    }
  }

  return detected
}
