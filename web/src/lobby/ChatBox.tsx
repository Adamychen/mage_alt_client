import { useEffect, useRef, useState, useCallback } from 'react'
import * as cmds from '../net/commands'
import { useStore } from '../state/store'
import FormattedText from '../game/FormattedText'
import FloatingCardPreview from '../board/FloatingCardPreview'
import type { CardView } from '../net/types'
import './ChatBox.css'

export default function ChatBox() {
  const chatId = useStore((s) => s.roomChatId)
  const messages = useStore((s) => s.chatMessages)
  const [text, setText] = useState('')
  const [hoverCard, setHoverCard] = useState<CardView | null>(null)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const handleHover = useCallback((card: CardView | null, rect?: DOMRect) => {
    setHoverCard(card)
    setHoverRect(rect ?? null)
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatId || !text.trim()) return
    void cmds.sendChatMessage(chatId, text)
    setText('')
  }

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.username === 'server' ? 'system' : ''}`}>
            <span className="chat-from">{m.username}:</span> <FormattedText text={m.message} onHover={handleHover} />
          </div>
        ))}
        {messages.length === 0 && <p className="empty">Sin mensajes</p>}
      </div>

      <FloatingCardPreview
        card={hoverCard}
        anchorRect={hoverRect}
        fixedSide="left"
      />

      <form className="chat-input" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensaje…" />
        <button className="primary" disabled={!chatId} type="submit">
          Enviar
        </button>
      </form>
    </div>
  )
}
