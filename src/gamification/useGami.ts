/** EGEMED Opaca — oyunlaştırma React köprüsü. Tek `LocalRepo` örneği (modül düzeyinde) ve saf hesapların
 *  UI'ye uygun özeti. UI sınırı olduğundan burada `new Date()` kullanılır; kurallar saf kalır. */

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../core/store'
import { GAMI_DEMO } from './flag'
import { demoStateFor } from './demo'
import { LocalRepo } from './repo'
import { computeStats, type Stats } from './stats'
import { computeStreak, type StreakInfo } from './streak'
import { computeWeeklyGoals, type WeeklyGoalsResult } from './goals'
import { levelForXp, type LevelInfo } from './xp'
import type { GamiStateV1, LeaderboardView } from './types'

let repo: LocalRepo | null = null
/** Uygulama boyunca tek depo. `?demo=` verilmişse bellek içi demo durumu kullanılır (gerçek veri korunur). */
export function getGamiRepo(lmsName?: string | null): LocalRepo {
  if (!repo) {
    repo = new LocalRepo({
      lmsStudentName: lmsName ?? null,
      stateOverride: GAMI_DEMO ? demoStateFor(GAMI_DEMO, new Date()) : undefined,
    })
  }
  repo.setLmsStudentName(lmsName)
  return repo
}

export interface GamiView {
  state: GamiStateV1
  stats: Stats
  level: LevelInfo
  streak: StreakInfo
  goals: WeeklyGoalsResult
  now: Date
  hasAttempts: boolean
  repo: LocalRepo
}

/** `version` artınca (ör. gizlilik ayarı değişti) durum yeniden okunur. */
export function useGami(version = 0): GamiView {
  const { runtime } = useStore()
  const lmsName = runtime?.api.get('cmi.learner_name') ?? null
  const r = getGamiRepo(lmsName)
  const [now] = useState(() => new Date())
  return useMemo(() => {
    const state = r.snapshot()
    const stats = computeStats(state.attempts, state.learn, state.earned, now)
    return {
      state,
      stats,
      level: levelForXp(stats.totalXp),
      streak: computeStreak(state.attempts, now),
      goals: computeWeeklyGoals(state.attempts, state.earned, now),
      now,
      hasAttempts: state.attempts.length > 0,
      repo: r,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, now, version])
}

/** Haftalık/aylık sıralama görünümü (asenkron repo çağrısı). */
export function useLeaderboard(period: LeaderboardView['period'], cohort: LeaderboardView['cohort'], now: Date, repoArg: LocalRepo, version = 0) {
  const [view, setView] = useState<LeaderboardView | null>(null)
  useEffect(() => {
    let alive = true
    repoArg.getLeaderboard(period, cohort, now).then((v) => { if (alive) setView(v) })
    return () => { alive = false }
  }, [period, cohort, now, repoArg, version])
  return view
}
