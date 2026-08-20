import { useCallback } from 'react'
import * as cmds from '../net/commands'
import { useStore } from '../state/store'
import { setState } from '../state/state'
import './PhaseStopSelector.css'

interface PhaseDef {
  key: string
  label: string
  short: string
}

const PHASES: PhaseDef[] = [
  { key: 'upkeep', label: 'Upkeep', short: 'UP' },
  { key: 'draw', label: 'Draw', short: 'DR' },
  { key: 'main1', label: 'Main 1', short: 'M1' },
  { key: 'beginCombat', label: 'Begin Combat', short: 'BC' },
  { key: 'endCombat', label: 'End Combat', short: 'EC' },
  { key: 'main2', label: 'Main 2', short: 'M2' },
  { key: 'endStep', label: 'End Step', short: 'ET' },
]

const DEFAULT_PHASES: cmds.PhaseStops = {
  yourTurn: { upkeep: true, draw: true, main1: false, beginCombat: true, endCombat: false, main2: false, endStep: true },
  opponentTurn: { upkeep: true, draw: true, main1: false, beginCombat: true, endCombat: false, main2: false, endStep: true },
}

export function getPhaseStops(): cmds.PhaseStops {
  return DEFAULT_PHASES
}

export default function PhaseStopSelector() {
  const phaseStops = useStore((s) => s.phaseStops)

  const toggle = useCallback((turn: 'yourTurn' | 'opponentTurn', key: string) => {
    const current = phaseStops[turn][key]
    const next = { ...phaseStops, [turn]: { ...phaseStops[turn], [key]: !current } }
    setState({ phaseStops: next })
    void cmds.updatePreferences(next)
  }, [phaseStops])

  return (
    <div className="phase-stop-selector">
      <span className="phase-stop-label">Stops:</span>
      <div className="phase-stop-row">
        <span className="phase-stop-turn-label">You</span>
        {PHASES.map((phase) => (
          <button
            key={`your-${phase.key}`}
            className={`phase-stop-btn ${phaseStops.yourTurn[phase.key] ? 'active' : ''}`}
            title={`${phase.label} (your turn)`}
            onClick={() => toggle('yourTurn', phase.key)}
          >
            {phase.short}
          </button>
        ))}
      </div>
      <div className="phase-stop-row">
        <span className="phase-stop-turn-label">Opp</span>
        {PHASES.map((phase) => (
          <button
            key={`opp-${phase.key}`}
            className={`phase-stop-btn ${phaseStops.opponentTurn[phase.key] ? 'active' : ''}`}
            title={`${phase.label} (opponent turn)`}
            onClick={() => toggle('opponentTurn', phase.key)}
          >
            {phase.short}
          </button>
        ))}
      </div>
    </div>
  )
}
