/** EGEMED Opaca — haftalık 3 sistem hedefi (yol haritası §4.3), Pazartesi 00:00 TR'de sıfırlanır.
 *  Saf fonksiyon; zaman parametre (`now`). */

import type { AttemptRecord } from './types'
import { RULES } from './rules'
import { startOfWeekTr } from './time'

export interface WeeklyGoal {
  id: 'weekly-assessments' | 'weekly-avg-score' | 'weekly-new-badges'
  label: string
  value: number
  max: number
  done: boolean
}

export interface WeeklyGoalsResult {
  weekStartTr: Date
  goals: WeeklyGoal[]
}

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t <= end.getTime()
}

/** Haftalık hedefleri, mevcut haftaya (Pazartesi 00:00 TR → now) ait denemeler ve kazanılan
 *  rozetlerden hesaplar. `earned[].at` haftaya düşenler "bu hafta kazanılan yeni rozet" sayılır. */
export function computeWeeklyGoals(
  attempts: AttemptRecord[],
  earned: { id: string; at: string }[],
  now: Date
): WeeklyGoalsResult {
  const weekStart = startOfWeekTr(now)
  const weekAssessments = attempts.filter((a) => a.mode === 'assessment' && inRange(a.finishedAt, weekStart, now))

  const sessionsCount = weekAssessments.length
  const sessionsGoal: WeeklyGoal = {
    id: 'weekly-assessments',
    label: `${RULES.week.assessmentSessionsGoal} değerlendirme oturumu`,
    value: Math.min(sessionsCount, RULES.week.assessmentSessionsGoal),
    max: RULES.week.assessmentSessionsGoal,
    done: sessionsCount >= RULES.week.assessmentSessionsGoal,
  }

  const avg = sessionsCount > 0 ? weekAssessments.reduce((s, a) => s + a.score, 0) / sessionsCount : 0
  const avgGoal: WeeklyGoal = {
    id: 'weekly-avg-score',
    label: `Ortalama başarı ≥ %${RULES.week.avgScoreGoal}`,
    value: sessionsCount > 0 && avg >= RULES.week.avgScoreGoal ? 1 : 0,
    max: 1,
    done: sessionsCount > 0 && avg >= RULES.week.avgScoreGoal,
  }

  const newBadgesCount = earned.filter((e) => inRange(e.at, weekStart, now)).length
  const badgesGoal: WeeklyGoal = {
    id: 'weekly-new-badges',
    label: `${RULES.week.newBadgesGoal} yeni rozet kazan`,
    value: Math.min(newBadgesCount, RULES.week.newBadgesGoal),
    max: RULES.week.newBadgesGoal,
    done: newBadgesCount >= RULES.week.newBadgesGoal,
  }

  return { weekStartTr: weekStart, goals: [sessionsGoal, avgGoal, badgesGoal] }
}
