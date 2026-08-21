import React from 'react'
import './FormattedText.css'

interface FormattedTextProps {
  text: string | null | undefined
  className?: string
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
 * Limpia tags HTML de XMage y hashes de objeto como [373]
 */
export function cleanMageHtml(raw: string): string {
  if (!raw) return ''
  let str = decodeHtmlEntities(raw)

  // Elimina hashes de objeto de XMage: ej. [373] o [a4f]
  str = str.replace(/\s*\[[0-9a-fA-F]{2,6}\]/g, '')

  // Elimina tags de estilo o formato envolventes como <div...>, </div>, <br/>
  str = str.replace(/<\/?div[^>]*>/gi, ' ')
  str = str.replace(/<br\s*\/?>/gi, ' ')

  // Convierte <font color='...'> en texto limpio o estructurado
  str = str.replace(/<font[^>]*>(.*?)<\/font>/gi, '$1')
  str = str.replace(/<\/?[a-z][^>]*>/gi, '')

  // Limpia espacios duplicados
  return str.replace(/\s+/g, ' ').trim()
}

interface TextToken {
  type: 'text' | 'colored' | 'mana'
  content: string
  color?: string
}

/**
 * Parsea el texto de XMage extrayendo colores de fuente y símbolos de maná {R}, {1}, etc.
 */
export function parseMageTextTokens(raw: string): TextToken[] {
  if (!raw) return []
  const decoded = decodeHtmlEntities(raw)
    // Limpia hashes de objeto de XMage
    .replace(/\s*\[[0-9a-fA-F]{2,6}\]/g, '')
    // Reemplaza divs y brs por espacios
    .replace(/<\/?div[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')

  const tokens: TextToken[] = []

  // Divide por tags <font color='...'>...</font>
  const fontRegex = /<font(?:\s+color=['"]([^'"]+)['"])?[^>]*>(.*?)<\/font>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fontRegex.exec(decoded)) !== null) {
    if (match.index > lastIndex) {
      const beforeText = decoded.substring(lastIndex, match.index)
      tokens.push(...parseManaTokens(beforeText))
    }
    const color = match[1]
    const content = match[2].replace(/<\/?[a-z][^>]*>/gi, '')
    tokens.push({ type: 'colored', content, color })
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

export default function FormattedText({ text, className = '' }: FormattedTextProps) {
  if (!text) return null

  const tokens = parseMageTextTokens(text)

  return (
    <span className={`formatted-text ${className}`.trim()}>
      {tokens.map((token, idx) => {
        if (token.type === 'mana') {
          return <ManaBadge key={idx} symbol={token.content} />
        }
        if (token.type === 'colored') {
          return (
            <span
              key={idx}
              className="formatted-colored"
              style={token.color ? { color: token.color } : undefined}
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
