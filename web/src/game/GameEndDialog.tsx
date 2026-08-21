import { returnToLobby, useStore } from '../state/store'
import './GameEndDialog.css'

/** Resumen del fin de partida/match (END_GAME_INFO del servidor). En un match
 *  best-of-N se muestra entre partidas (el SIDEBOARD continúa solo); cuando el
 *  match terminó (matchView.endTime) el botón vuelve al lobby. */
export default function GameEndDialog() {
  const end = useStore((s) => s.gameEnd)
  if (!end) return null

  const matchOver = end.matchView?.endTime != null || /won the match/i.test(end.matchInfo ?? '')

  return (
    <div className="end-backdrop" role="presentation">
      <section className="end-dialog panel" role="dialog" aria-modal="true" aria-labelledby="end-title">
        <h2 id="end-title">Fin de partida</h2>
        {end.gameInfo && <p className="end-info">{end.gameInfo}</p>}
        {end.matchInfo && <p className="end-match">{end.matchInfo}</p>}
        {(end.wins != null || end.winsNeeded != null) && (
          <p className="end-score">
            Marcador: {end.wins ?? 0}–{end.loses ?? 0} (necesitas {end.winsNeeded ?? 1} victorias)
          </p>
        )}
        {matchOver ? (
          <button className="primary" onClick={returnToLobby}>
            Volver al lobby
          </button>
        ) : (
          <p className="end-hint">El match continúa — esperando la siguiente partida…</p>
        )}
      </section>
    </div>
  )
}
