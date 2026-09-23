import { IconAward, IconChart, IconCheck, IconCheckCircle } from '../icons'
import type { WeeklyGoalsResult } from '../../gamification/goals'

const ICON = { 'weekly-assessments': <IconChart />, 'weekly-avg-score': <IconCheckCircle width={16} height={16} />, 'weekly-new-badges': <IconAward width={16} height={16} /> }

/** Haftalık 3 sistem hedefi (tasarım promptu §4, goals.ts). Pazartesi 00:00 TR yenilenir. */
export function GamiWeeklyGoals({ goals }: { goals: WeeklyGoalsResult }) {
  return (
    <>
      <div className="gami-goals">
        {goals.goals.map((g) => (
          <div key={g.id} className={`gami-goal${g.done ? ' done' : ''}`}>
            <span className="dr-ic">{g.done ? <IconCheck width={16} height={16} /> : ICON[g.id]}</span>
            <span className="dr-lbl">{g.label}</span>
            {g.done ? <span className="badge green dr-pct">Tamamlandı</span> : <span className="dr-pct">{g.value} / {g.max}</span>}
            <span className="domain-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (g.value / g.max) * 100)}%` }} /></span>
          </div>
        ))}
      </div>
      <p className="gami-note">Hedefler her Pazartesi 00:00'da (TSİ) yenilenir.</p>
    </>
  )
}
