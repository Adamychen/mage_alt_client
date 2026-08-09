import { useEffect, useRef, useState } from 'react'
import * as cmds from '../net/commands'
import { useStore } from '../state/store'
import './ChatBox.css'

export default function ChatBox() {
  const chatId = useStore((s) => s.roomChatId)
  const messages = useStore((s) => s.chatMessages)
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

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
            <span className="chat-from">{m.username}:</span> {m.message}
          </div>
        ))}
        {messages.length === 0 && <p className="empty">Sin mensajes</p>}
      </div>
      <form className="chat-input" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensaje…" />
        <button className="primary" disabled={!chatId} type="submit">
          Enviar
        </button>
      </form>
    </div>
  )
}
