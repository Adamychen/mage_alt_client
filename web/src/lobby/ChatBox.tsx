import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as cmds from '../net/commands'
import { useStore } from '../state/store'
import FormattedText from '../game/FormattedText'
import FloatingCardPreview from '../board/FloatingCardPreview'
import type { CardView, ChatMessageEvent } from '../net/types'
import './ChatBox.css'

function parseSystemEvent(text: string): { icon: string; text: string } {
  if (text.includes('has joined')) {
    const user = text.replace(/\s+has joined.*$/i, '').trim()
    return { icon: '🟢', text: `${user} se ha conectado` }
  }
  if (text.includes('has lost connection')) {
    const user = text.replace(/\s+has lost connection.*$/i, '').trim()
    return { icon: '🔌', text: `${user} ha perdido la conexión` }
  }
  if (text.includes('has disconnected')) {
    const user = text.replace(/\s+has disconnected.*$/i, '').trim()
    return { icon: '🚪', text: `${user} se ha desconectado` }
  }
  if (text.includes('has left')) {
    const user = text.replace(/\s+has left.*$/i, '').trim()
    return { icon: '🚪', text: `${user} ha salido` }
  }
  return { icon: 'ℹ️', text }
}

function isSystemMessage(m: ChatMessageEvent): boolean {
  if (!m.username || m.username === 'server' || m.messageType === 'SYSTEM') return true
  return (
    m.message.includes('has joined') ||
    m.message.includes('has lost connection') ||
    m.message.includes('has disconnected') ||
    m.message.includes('has left')
  )
}

function isConnectionEvent(text: string): boolean {
  return (
    text.includes('has joined') ||
    text.includes('has lost connection') ||
    text.includes('has disconnected') ||
    text.includes('has left')
  )
}

export default function ChatBox() {
  const chatId = useStore((s) => s.roomChatId)
  const messages = useStore((s) => s.chatMessages)
  const [text, setText] = useState('')
  const [hideConnections, setHideConnections] = useState(false)
  const [hoverCard, setHoverCard] = useState<CardView | null>(null)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const handleHover = useCallback((card: CardView | null, rect?: DOMRect) => {
    setHoverCard(card)
    setHoverRect(rect ?? null)
  }, [])

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      // If message specifies a chatId that doesn't match this room chat, exclude it
      if (m.chatId && chatId && m.chatId !== chatId) return false
      if (hideConnections && isConnectionEvent(m.message)) return false
      return true
    })
  }, [messages, chatId, hideConnections])

  useEffect(() => {
    if (listRef.current && typeof listRef.current.scrollTo === 'function') {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight })
    }
  }, [filteredMessages])

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatId || !text.trim()) return
    void cmds.sendChatMessage(chatId, text)
    setText('')
  }

  return (
    <div className="chat">
      <div className="chat-toolbar">
        <button
          type="button"
          className={`chat-toggle-btn ${hideConnections ? 'active' : ''}`}
          onClick={() => setHideConnections(!hideConnections)}
          title={hideConnections ? 'Mostrar avisos de conexión/desconexión' : 'Ocultar avisos de conexión/desconexión'}
        >
          {hideConnections ? '🔇 Avisos ocultos' : '👁️ Avisos visibles'}
        </button>
      </div>

      <div className="chat-list" ref={listRef}>
        {filteredMessages.map((m, i) => {
          const sys = isSystemMessage(m)
          if (sys) {
            const parsed = parseSystemEvent(m.message)
            return (
              <div key={i} className="chat-msg system-msg">
                <span className="sys-icon">{parsed.icon}</span>
                <span className="sys-text">
                  <FormattedText text={parsed.text} onHover={handleHover} />
                </span>
              </div>
            )
          }
          return (
            <div key={i} className="chat-msg user-msg">
              <span className="chat-from">{m.username}:</span>{' '}
              <FormattedText text={m.message} onHover={handleHover} />
            </div>
          )
        })}
        {filteredMessages.length === 0 && <p className="empty">Sin mensajes</p>}
      </div>

      <FloatingCardPreview
        card={hoverCard}
        anchorRect={hoverRect}
        fixedSide="left"
      />

      <form className="chat-input" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensaje al chat global…" />
        <button className="primary" disabled={!chatId} type="submit">
          Enviar
        </button>
      </form>
    </div>
  )
}
