import { useState, useRef, useEffect } from 'react'
import * as cmds from '../net/commands'
import { useStore } from '../state/store'
import QuickReactions from './QuickReactions'
import './GameChat.css'

// Set corto para el selector de emoji del chat (icono 😊 a la izquierda del input,
// spec sección 61.3). No es un picker completo: basta con los más usados en partida.
const EMOJI_PICKS = ['😊', '😂', '😮', '👀', '🙏', '😅', '🤔', '🔥']

export default function GameChat() {
  const gameId = useStore((s) => s.gameId)
  const log = useStore((s) => s.log)
  const [input, setInput] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const gameLog = log.filter((e) => e.gameId === gameId)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [gameLog.length])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || !gameId) return
    await cmds.sendChatMessage(gameId, text)
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
        {gameLog.map((entry) => (
          <div key={entry.id} className="game-chat-entry">
            {entry.from && <span className="game-chat-player">{entry.from}</span>}
            <span className="game-chat-text">{entry.text}</span>
          </div>
        ))}
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
          placeholder="Chat..."
          maxLength={500}
        />
        <button type="submit" className="game-chat-send" disabled={!input.trim() || !gameId}>▸</button>
      </form>

      <QuickReactions />
    </div>
  )
}
