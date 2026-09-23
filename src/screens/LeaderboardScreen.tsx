import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../core/store'
import { poolFor } from '../data/pool'
import { sampleSession, SESSION_SIZE } from '../core/session'
import { Footer } from '../ui/chrome'
import { GamiDemoBanner } from '../ui/gami/GamiDemoBanner'
import { GamiPageTabs } from '../ui/gami/GamiPageTabs'
import { GamiSeg } from '../ui/gami/GamiSeg'
import {
  GamiLeaderboardTable, GamiPodium, GamiPrivacyCard, GamiRewardBanner, GamiRewardHistory, GamiRewardTerms,
} from '../ui/gami/GamiLeaderboard'
import { useGami, useLeaderboard } from '../gamification/useGami'
import { countdownText, meRewardStatus, periodLabel, previousPeriodNow, tableItems } from '../gamification/leaderboardView'
import { rewardStandings } from '../gamification/ranking'
import { monthKeyTr } from '../gamification/time'
import type { CohortFilter, MonthlyReward, Period, RewardWinner } from '../gamification/types'
import { IconArrowRight } from '../ui/icons'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Bugün' }, { id: 'week', label: 'Bu hafta' }, { id: 'month', label: 'Bu ay' }, { id: 'academic_year', label: 'Akademik yıl' },
]

/** Liderlik Tahtası + Ayın Ödülü (tasarım promptu §5, §5.1). Yalnız oyunlaştırma bayrağı açıkken erişilir. */
export function LeaderboardScreen() {
  const { dispatch } = useStore()
  const [version, setVersion] = useState(0)
  const view = useGami(version)
  const [period, setPeriod] = useState<Period>('week')
  const [cohort, setCohort] = useState<CohortFilter>('all')
  const [clock, setClock] = useState(view.now)
  const [terms, setTerms] = useState<HTMLElement | null | false>(false)
  const [reward, setReward] = useState<MonthlyReward | null>(null)
  const [winners, setWinners] = useState<RewardWinner[]>([])

  // geri sayım dakikada bir (aria-live kapalı)
  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  useEffect(() => {
    view.repo.getMonthlyReward(monthKeyTr(view.now)).then(setReward)
    view.repo.getRewardWinners(3).then(setWinners)
  }, [view.repo, view.now])

  const board = useLeaderboard(period, cohort, view.now, view.repo, version)
  const prevNow = useMemo(() => previousPeriodNow(period, view.now), [period, view.now])
  const prevBoard = useLeaderboard(period, cohort, prevNow, view.repo, version)
  const monthAll = useLeaderboard('month', 'all', view.now, view.repo, version)

  const standings = useMemo(() => {
    if (!reward || !monthAll) return null
    return rewardStandings(monthAll.rows.map((r) => ({
      id: r.id, cohort: r.cohort, public: r.isPublic, periodScore: r.periodScore, attemptsCount: r.attemptsCount, reachedAt: r.reachedAt,
    })), reward)
  }, [reward, monthAll])
  const candidates = period === 'month' && cohort === 'all' && standings ? new Set(standings.rows.filter((r) => r.candidate).map((r) => r.id)) : null
  const status = reward && standings ? meRewardStatus(standings, reward) : null

  const rows = board?.rows ?? []
  const ranked = rows.filter((r) => r.rank !== null)
  const withPodium = ranked.length >= 3
  const items = tableItems(rows, withPodium)
  const me = rows.find((r) => r.isMe)
  const prevMe = prevBoard?.rows.find((r) => r.isMe)
  const meDelta = me?.rank && prevMe?.rank ? prevMe.rank - me.rank : null
  const profile = view.state.profile

  const startAssessment = () => {
    const seed = (Date.now() % 2147483647) | 0
    dispatch({ type: 'startSession', practiceIds: sampleSession(poolFor('practice'), seed, SESSION_SIZE), assessmentIds: sampleSession(poolFor('assessment'), seed + 1, SESSION_SIZE), seed })
    dispatch({ type: 'startMode', mode: 'assessment' })
  }
  const statusAction = (a: 'privacy' | 'assess') => {
    if (a === 'assess') return startAssessment()
    const el = document.getElementById('gami-privacy')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.querySelector<HTMLElement>('[role="switch"]')?.focus({ preventScroll: true })
  }

  return (
    <>
      <div className="screen">
        <div className="results-wrap-v2 gami-page">
          <GamiDemoBanner />
          <GamiPageTabs active="leaderboard" />
          <div className="results-title-row">
            <div>
              <h1 className="results-title-v2">Liderlik Tahtası</h1>
              <p className="results-sub-v2">Değerlendirme modundaki en iyi 3 denemenin ortalamasıyla sıralanır (en az 2 deneme).</p>
            </div>
          </div>
          {reward && (
            <GamiRewardBanner
              reward={reward}
              compact={period !== 'month'}
              countdown={countdownText(clock)}
              status={status}
              onTerms={(el) => setTerms(el)}
              onMonthly={() => setPeriod('month')}
              onStatusAction={statusAction}
            />
          )}
          <div className="gami-period-row">
            <GamiSeg options={PERIODS} value={period} onChange={setPeriod} label="Dönem" variant="tabs" purple />
            <select className="gami-select" aria-label="Kohort" value={String(cohort)} onChange={(e) => setCohort(e.target.value === 'all' ? 'all' : (Number(e.target.value) as CohortFilter))}>
              <option value="all">Tüm dönemler</option>
              {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>Dönem {c}</option>)}
            </select>
            <span className="gami-range">{periodLabel(period, view.now)}</span>
          </div>
          {board && ranked.length === 0 && <div className="card"><p className="gami-note" style={{ margin: 0 }}>Bu dönemde henüz sıralamaya giren yok.</p></div>}
          {withPodium && <GamiPodium rows={rows} candidates={candidates} />}
          {items.length > 0 && (
            <div className="card">
              <GamiLeaderboardTable items={items} candidates={candidates} meDelta={meDelta} />
              <p className="gami-note">Puan: dönemdeki en iyi 3 değerlendirmenin ortalaması · sıralamaya girmek için en az 2 deneme.</p>
            </div>
          )}
          {me && me.rank === null && (
            <div className="gami-qualify">
              <span className="badge gray">Sıralamaya girmek için bu dönem {Math.max(1, 2 - me.attemptsCount)} değerlendirme daha tamamla</span>
              <button className="btn purple small" type="button" onClick={startAssessment}>Değerlendirmeye gir <IconArrowRight width={14} height={14} /></button>
            </div>
          )}
          <GamiPrivacyCard
            id="gami-privacy"
            name={profile.displayName ?? (me?.isPublic ? me.displayName : null)}
            isPublic={profile.public}
            cohort={profile.cohort}
            onChange={(patch) => { void view.repo.updateMe(patch).then(() => setVersion((v) => v + 1)) }}
          />
          <GamiRewardHistory winners={winners} />
        </div>
      </div>
      {terms !== false && reward && <GamiRewardTerms reward={reward} returnTo={terms} onClose={() => setTerms(false)} />}
      <Footer />
    </>
  )
}
