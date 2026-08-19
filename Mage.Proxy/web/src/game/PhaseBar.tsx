import './PhaseBar.css'

interface StepDef {
  key: string
  label: string
  group: string
}

const STEPS: StepDef[] = [
  { key: 'UPKEEP',            label: 'Up',  group: 'b' },
  { key: 'DRAW',              label: 'Dr',  group: 'b' },
  { key: 'PRECOMBAT_MAIN',    label: '1',   group: 'm1' },
  { key: 'BEGIN_COMBAT',      label: 'C',   group: 'c' },
  { key: 'DECLARE_ATTACKERS', label: 'At',  group: 'c' },
  { key: 'DECLARE_BLOCKERS',  label: 'Bl',  group: 'c' },
  { key: 'END_COMBAT',        label: 'EC',  group: 'c' },
  { key: 'POSTCOMBAT_MAIN',   label: '2',   group: 'm2' },
  { key: 'END_TURN',          label: 'End', group: 'e' },
  { key: 'CLEANUP',           label: 'Cl',  group: 'e' },
]

const GROUPS = ['b', 'm1', 'c', 'm2', 'e']

export default function PhaseBar({ step }: { step: string }) {
  const currentIdx = STEPS.findIndex((s) => s.key === step)
  const activeIdx = currentIdx >= 0 ? currentIdx : 0

  return (
    <div className="phase-bar">
      {GROUPS.map((g, gi) => {
        const groupSteps = STEPS.map((s, i) => ({ ...s, idx: i })).filter((s) => s.group === g)
        return (
          <span key={g} className="phase-group">
            {gi > 0 && <span className="phase-sep">·</span>}
            {groupSteps.map((s) => {
              let cls = 'phase-badge'
              if (s.idx < activeIdx) cls += ' past'
              else if (s.idx === activeIdx) cls += ' active'
              return (
                <span key={s.key} className={cls} title={s.key}>
                  {s.label}
                </span>
              )
            })}
          </span>
        )
      })}
    </div>
  )
}
