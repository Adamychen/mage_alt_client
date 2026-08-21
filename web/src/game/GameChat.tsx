import { useState, useRef, useEffect, useMemo } from 'react'
import * as cmds from '../net/commands'
import { useStore } from '../state/store'
import QuickReactions from './QuickReactions'
import FormattedText from './FormattedText'
import './GameChat.css'

// Set corto para el selector de emoji del chat (icono 😊 a la izquierda del input,
// spec sección 61.3). No es un picker completo: basta con los más usados en partida.
const EMOJI_PICKS = ['😊', '😂', '😮', '👀', '🙏', '😅', '🤔', '🔥']

export default function GameChat() {
  const gameChatId = useStore((s) => s.gameChatId)
  const roomChatId = useStore((s) => s.roomChatId)
  const log = useStore((s) => s.log)
  const [input, setInput] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const chatId = gameChatId || roomChatId

  // Only show real player/user chat messages in the Chat tab (not engine inform lines like "Upkeep - Waiting for...")
  const chatEntries = useMemo(() => {
    return log.filter((e) => {
      if (!e.from || e.from === 'partida' || e.from === 'servidor' || e.from === 'error') {
        return false
      }
      return true
    })
  }, [log])

  useEffect(() => {
    if (endRef.current && typeof endRef.current.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatEntries.length])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || !chatId) return
    await cmds.sendChatMessage(chatId, text)
    setInput('')
  }

  const insertEmoji = (emoji: string) => {
    setInput((v) => `${v}${emoji} `)
    setPickerOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="game-chat">
      <div className="game-chat-messages">
        {chatEntries.length === 0 ? (
          <div className="game-chat-empty">
            💬 No hay mensajes en el chat aún. ¡Escribe o envía una reacción abajo!
          </div>
        ) : (
          chatEntries.map((entry) => (
            <div key={entry.id} className="game-chat-entry">
              {entry.from && <span className="game-chat-player">{entry.from}:</span>}
              <span className="game-chat-text">
                <FormattedText text={entry.text} />
              </span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form className="game-chat-input" onSubmit={send}>
        <div className="game-chat-emoji-wrap">
          <button
            type="button"
            className="game-chat-emoji-btn"
            title="Insertar emoji"
            onClick={() => setPickerOpen((v) => !v)}
          >
            😊
          </button>
          {pickerOpen && (
            <div className="game-chat-emoji-picker">
              {EMOJI_PICKS.map((emoji) => (
                <button type="button" key={emoji} onClick={() => insertEmoji(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe un mensaje en el chat..."
          maxLength={500}
        />
        <button type="submit" className="game-chat-send" disabled={!input.trim() || !chatId}>▸</button>
      </form>

      <QuickReactions />
    </div>
  )
}
