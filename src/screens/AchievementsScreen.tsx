import { useMemo, useState } from 'react'
import { useStore } from '../core/store'
import { poolFor } from '../data/pool'
import { sampleSession, SESSION_SIZE } from '../core/session'
import { Footer } from '../ui/chrome'
import { GamiDemoBanner } from '../ui/gami/GamiDemoBanner'
import { GamiPageTabs } from '../ui/gami/GamiPageTabs'
import { GamiProfileStrip } from '../ui/gami/GamiProfileStrip'
import { GamiEmptyCard } from '../ui/gami/GamiEmptyCard'
import { useGami, useLeaderboard } from '../gamification/useGami'
import { achievementsRangeTr, type AchievementsPeriod } from '../gamification/time'

const PERIODS: { id: AchievementsPeriod; label: string; short: string }[] = [
  { id: 'last30', label: 'Son 30 gün', short: 'son 30 gün' },
  { id: 'last12w', label: 'Son 12 hafta', short: 'son 12 hafta' },
  { id: 'academic', label: 'Akademik yıl', short: 'akademik yıl' },
]

/** Başarılarım (tasarım promptu §4). Yalnız oyunlaştırma bayrağı açıkken erişilir. */
export function AchievementsScreen() {
  const { dispatch } = useStore()
  const view = useGami()
  const [period, setPeriod] = useState<AchievementsPeriod>('last30')
  const week = useLeaderboard('week', 'all', view.now, view.repo)

  const inPeriod = useMemo(() => {
    const { start, end } = achievementsRangeTr(period, view.now)
    const s = start.toISOString(), e = end.toISOString()
    return view.state.attempts.filter((a) => a.finishedAt >= s && a.finishedAt <= e)
  }, [period, view])
  const assessments = inPeriod.filter((a) => a.mode === 'assessment')
  const practiceCases = inPeriod.filter((a) => a.mode === 'practice').reduce((n, a) => n + a.caseCount, 0)
  const avg = assessments.length ? assessments.reduce((n, a) => n + a.score, 0) / assessments.length : null

  const startAssessment = () => {
    const seed = (Date.now() % 2147483647) | 0
    dispatch({
      type: 'startSession',
      practiceIds: sampleSession(poolFor('practice'), seed, SESSION_SIZE),
      assessmentIds: sampleSession(poolFor('assessment'), seed + 1, SESSION_SIZE),
      seed,
    })
    dispatch({ type: 'startMode', mode: 'assessment' })
  }

  return (
    <>
      <div className="screen">
        <div className="results-wrap-v2 gami-page">
          <GamiDemoBanner />
          <GamiPageTabs active="achievements" />
          <div className="results-title-row">
            <div>
              <h1 className="results-title-v2">Başarılarım</h1>
              <p className="results-sub-v2">Değerlendirme ve uygulama oturumlarından kazandığın ilerleme.</p>
            </div>
            {view.hasAttempts && (
              <select className="gami-select" aria-label="Dönem" value={period} onChange={(e) => setPeriod(e.target.value as AchievementsPeriod)}>
                {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            )}
          </div>
          {view.hasAttempts ? (
            <GamiProfileStrip
              view={view}
              periodAssessments={assessments.length}
              periodPractice={practiceCases}
              periodAvg={avg}
              periodLabel={PERIODS.find((p) => p.id === period)!.short}
              week={week}
              onLeaderboard={() => dispatch({ type: 'goto', screen: 'leaderboard' })}
            />
          ) : (
            <GamiEmptyCard onAssessment={startAssessment} />
          )}
        </div>
      </div>
      <Footer />
    </>
  )
}
