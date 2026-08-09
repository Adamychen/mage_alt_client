import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import './GameLog.css'

export default function GameLog() {
  const log = useStore((s) => s.log)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [log])

  return (
    <aside className="gamelog panel">
      <h2>Log</h2>
      <div className="gamelog-list" ref={ref}>
        {log.map((e) => (
          <div key={e.id} className="gamelog-entry">
            <span className="gamelog-from">{e.from}</span> {e.text}
          </div>
        ))}
      </div>
    </aside>
  )
}
