import React from 'react'
import type { CardView } from '../net/types'
import './FormattedText.css'

interface FormattedTextProps {
  text: string | null | undefined
  className?: string
  onHover?: (card: CardView | null, rect?: DOMRect) => void
}

/**
 * Decodifica entidades HTML como &iexcl;, &iquest;, &quot;, &amp;, etc.
 */
export function decodeHtmlEntities(raw: string): string {
  if (!raw) return ''
  const entities: Record<string, string> = {
    '&iexcl;': '¡',
    '&iquest;': '¿',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&copy;': '©',
    '&reg;': '®',
  }

  let str = raw
  for (const [entity, char] of Object.entries(entities)) {
    str = str.replaceAll(entity, char)
  }

  // Decodifica entidades numéricas &#123; o &#x1f;
  str = str.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
  str = str.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  return str
}

/**
 * Limpia tags HTML de XMage y hashes de objeto como [373] o [dcf]
 */
export function cleanMageHtml(raw: string): string {
  if (!raw) return ''
  let str = decodeHtmlEntities(raw)

  // Elimina hashes de objeto de XMage: ej. [373], [dcf] o [9b4]
  str = str.replace(/\s*\[[0-9a-fA-F]{2,8}\]/g, '')

  // Elimina tags de estilo o formato envolventes como <div...>, </div>, <br/>
  str = str.replace(/<\/?div[^>]*>/gi, ' ')
  str = str.replace(/<br\s*\/?>/gi, ' ')

  // Convierte <font ...>...</font> en su contenido textual limpio
  str = str.replace(/<font\b[^>]*>(.*?)<\/font>/gi, '$1')
  // Elimina cualquier otro tag HTML remanente
  str = str.replace(/<\/?[a-z][^>]*>/gi, '')

  // Limpia espacios duplicados
  return str.replace(/\s+/g, ' ').trim()
}

export interface TextToken {
  type: 'text' | 'colored' | 'mana'
  content: string
  color?: string
  isCard?: boolean
  isPlayer?: boolean
}

/**
 * Parsea el texto de XMage extrayendo colores de fuente y símbolos de maná {R}, {1}, etc.
 */
export function parseMageTextTokens(raw: string): TextToken[] {
  if (!raw) return []
  const decoded = decodeHtmlEntities(raw)
    // Limpia hashes de objeto de XMage
    .replace(/\s*\[[0-9a-fA-F]{2,8}\]/g, '')
    // Reemplaza divs y brs por espacios
    .replace(/<\/?div[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')

  const tokens: TextToken[] = []

  // Divide por tags <font ...>...</font> soportando atributos en cualquier orden (color, object_id, etc.)
  const fontRegex = /<font\b([^>]*)>(.*?)<\/font>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fontRegex.exec(decoded)) !== null) {
    if (match.index > lastIndex) {
      const beforeText = decoded.substring(lastIndex, match.index).replace(/<\/?[a-z][^>]*>/gi, '')
      tokens.push(...parseManaTokens(beforeText))
    }
    const attrString = match[1] || ''
    const colorMatch = /color=['"]?([^'"\s>]+)/i.exec(attrString)
    const color = colorMatch ? colorMatch[1] : undefined
    const hasObjectId = /object_id=/i.test(attrString)
    const content = match[2].replace(/<\/?[a-z][^>]*>/gi, '')
    
    // Clasifica si es un jugador o una carta
    const isPlayerColor = !!color && /^#(?:20b2aa|00ffff|00ff00|ff0000|ff69b4)$/i.test(color)
    const isPlayer = !hasObjectId && isPlayerColor
    const isCard = hasObjectId || !isPlayer

    if (content) {
      tokens.push({
        type: 'colored',
        content,
        color,
        isCard,
        isPlayer,
      })
    }
    lastIndex = fontRegex.lastIndex
  }

  if (lastIndex < decoded.length) {
    const remaining = decoded.substring(lastIndex).replace(/<\/?[a-z][^>]*>/gi, '')
    tokens.push(...parseManaTokens(remaining))
  }

  return tokens
}

function parseManaTokens(text: string): TextToken[] {
  const parts = text.split(/(\{[\w/]+\})/g)
  const result: TextToken[] = []
  for (const part of parts) {
    if (!part) continue
    if (/^\{[\w/]+\}$/.test(part)) {
      result.push({ type: 'mana', content: part.slice(1, -1).toUpperCase() })
    } else {
      result.push({ type: 'text', content: part })
    }
  }
  return result
}

export function ManaBadge({ symbol }: { symbol: string }) {
  const sym = symbol.toUpperCase()
  let className = 'mana-badge'
  let label = sym

  if (sym === 'R') className += ' mana-r'
  else if (sym === 'U') className += ' mana-u'
  else if (sym === 'W') className += ' mana-w'
  else if (sym === 'B') className += ' mana-b'
  else if (sym === 'G') className += ' mana-g'
  else if (sym === 'C') className += ' mana-c'
  else if (sym === 'T') {
    className += ' mana-tap'
    label = '⟳'
  } else {
    className += ' mana-generic'
  }

  return (
    <span className={className} title={`Maná ${sym}`}>
      {label}
    </span>
  )
}

export default function FormattedText({ text, className = '', onHover }: FormattedTextProps) {
  if (!text) return null

  const tokens = parseMageTextTokens(text)

  return (
    <span className={`formatted-text ${className}`.trim()}>
      {tokens.map((token, idx) => {
        if (token.type === 'mana') {
          return <ManaBadge key={idx} symbol={token.content} />
        }
        if (token.type === 'colored') {
          const isCard = token.isCard !== false
          const isPlayer = token.isPlayer === true

          return (
            <span
              key={idx}
              className={`formatted-colored ${isCard ? 'is-card' : ''} ${isPlayer ? 'is-player' : ''}`.trim()}
              style={token.color ? { color: token.color } : undefined}
              title={isPlayer ? `👤 Jugador: ${token.content}` : `🃏 Carta: ${token.content}`}
              onMouseEnter={(e) => {
                if (isCard && onHover) {
                  onHover(
                    {
                      name: token.content,
                      manaValue: 0,
                      expansionSetCode: '',
                      cardNumber: '0',
                    } as CardView,
                    e.currentTarget.getBoundingClientRect()
                  )
                }
              }}
              onMouseLeave={() => {
                if (isCard && onHover) {
                  onHover(null)
                }
              }}
            >
              {token.content}
            </span>
          )
        }
        return <React.Fragment key={idx}>{token.content}</React.Fragment>
      })}
    </span>
  )
}
