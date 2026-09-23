import { useEffect, useState } from 'react'
import { IconArrowRight, IconChart, IconStar } from '../icons'
import { GamiBadgeIc } from './GamiBadge'
import { GamiDelta } from './GamiLeaderboard'
import type { CaseDef, CaseResult } from '../../core/types'
import { buildAttemptRecord } from '../../gamification/attempt'
import { badgeViews, TIER_LABEL, type BadgeView } from '../../gamification/badgeView'
import { computeStats } from '../../gamification/stats'
import { levelForXp, attemptXp } from '../../gamification/xp'
import { RULES } from '../../gamification/rules'
import { daysLeft } from '../../gamification/leaderboardView'
import type { LocalRepo } from '../../gamification/repo'
import type { GamiMode, Period } from '../../gamification/types'

interface Gains {
  newBadge: BadgeView | null
  nextBadge: BadgeView | null
  xp: number
  bonus: number
  level: ReturnType<typeof levelForXp>
  rank: { period: Period; rank: number | null; delta: number | null; of: number } | null
  confetti: boolean
}

async function rankOf(repo: LocalRepo, period: Period, now: Date) {
  const v = await repo.getLeaderboard(period, 'all', now)
  const me = v.rows.find((r) => r.isMe)
  return { rank: me?.rank ?? null, of: v.rows.filter((r) => r.rank !== null).length }
}

/** Sonuç ekranı "Bu oturumda kazandıkların" (tasarım promptu §6). Oturumu bir kez kaydeder (idempotent kimlik). */
export function GamiGains({ repo, mode, results, caseById, seed, durationMs, onAchievements, onLeaderboard }: {
  repo: LocalRepo; mode: GamiMode; results: CaseResult[]; caseById: (id: string) => CaseDef | undefined
  seed: number; durationMs: number; onAchievements: () => void; onLeaderboard: () => void
}) {
  const [gains, setGains] = useState<Gains | null>(null)
  useEffect(() => {
    let alive = true
    const now = new Date()
    const attempt = buildAttemptRecord({ mode, results, caseById, sessionSeed: seed, durationMs, finishedAt: now })
    if (!attempt) return
    const period: Period = daysLeft(now) < 7 ? 'month' : 'week'
    ;(async () => {
      const already = repo.snapshot().attempts.some((a) => a.id === attempt.id)
      const beforeEarned = new Set(repo.snapshot().earned.map((e) => e.id))
      const before = mode === 'assessment' ? await rankOf(repo, period, now) : null
      await repo.recordAttempt(attempt)
      const s = repo.snapshot()
      const stats = computeStats(s.attempts, s.learn, s.earned, now)
      const views = badgeViews(stats, s.earned)
      const fresh = already ? [] : views.filter((v) => v.state === 'earned' && !beforeEarned.has(v.def.id))
      const next = views.filter((v) => v.state === 'progress').sort((a, b) => b.value / b.max - a.value / a.max)[0] ?? null
      const after = mode === 'assessment' ? await rankOf(repo, period, now) : null
      const bonus = mode === 'assessment' && attempt.score >= RULES.xp.assessmentBonusThreshold ? RULES.xp.assessmentBonus : 0
      if (!alive) return
      setGains({
        newBadge: fresh[0] ?? null,
        nextBadge: next,
        xp: attemptXp(attempt),
        bonus,
        level: levelForXp(stats.totalXp),
        rank: after ? { period, rank: after.rank, of: after.of, delta: before?.rank && after.rank ? before.rank - after.rank : null } : null,
        confetti: fresh.length > 0 && attempt.mastery,
      })
    })()
    return () => { alive = false }
    // yalnız sonuç ekranı açılışında bir kez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!gains) return null
  const span = gains.level.levelEndXp - gains.level.levelStartXp
  const b = gains.newBadge ?? gains.nextBadge
  return (
    <section className="card gami-gains" aria-labelledby="gami-gains-t">
      <div className="gami-card-head">
        <h3 id="gami-gains-t">Bu oturumda kazandıkların</h3>
        <span className="badge orange">Demo verisi</span>
      </div>
      {gains.confetti && <div className="gami-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>}
      <div className="gami-gains-row">
        <div className="gami-gain">
          {b ? <GamiBadgeIc v={b} size="sm" /> : null}
          <div>
            {gains.newBadge ? (
              <><b>{gains.newBadge.def.name}</b><span>Yeni rozet{gains.newBadge.def.tier ? ` · ${TIER_LABEL[gains.newBadge.def.tier]}` : ''}</span></>
            ) : b ? (
              <><b>{b.def.name}</b><span>Sıradaki rozet · {b.value}/{b.max}</span></>
            ) : (
              <><b>Rozet</b><span>Tüm erişilebilir rozetler kazanıldı</span></>
            )}
          </div>
        </div>
        <div className="gami-gain">
          <span className="gami-badge-ic sm gami-cat-topic progress" aria-hidden="true"><IconStar width={22} height={22} /></span>
          <div><b className="xp">+{gains.xp} XP</b><span>{gains.bonus ? `+${gains.bonus} başarı bonusu dahil` : 'Oturum XP\'si'}</span></div>
        </div>
        <div className="gami-gain">
          <div className="grow">
            <b>Seviye {gains.level.level}</b>
            <span>{gains.level.xpIntoLevel.toLocaleString('tr-TR')} / {span.toLocaleString('tr-TR')} XP · sonrakine {gains.level.xpToNext.toLocaleString('tr-TR')}</span>
            <span className="domain-bar" aria-hidden="true"><i style={{ width: `${(gains.level.xpIntoLevel / span) * 100}%` }} /></span>
          </div>
        </div>
        {gains.rank && (
          <div className="gami-gain">
            <span className="gami-badge-ic sm gami-cat-skill progress" aria-hidden="true"><IconChart /></span>
            <div>
              {gains.rank.rank ? (
                <><b className="rank">{gains.rank.period === 'month' ? 'Ödül sırası' : 'Bu hafta'} {gains.rank.rank}. <GamiDelta delta={gains.rank.delta} /></b><span>{gains.rank.of} kişi arasında</span></>
              ) : (
                <><b className="rank">Sıralamada değilsin</b><span>En az 2 değerlendirme gerekir</span></>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="gami-gains-actions">
        <button className="btn outline small" type="button" onClick={onLeaderboard}>Sıralamaya bak</button>
        <button className="btn primary small" type="button" onClick={onAchievements}>Başarılarımı gör <IconArrowRight width={14} height={14} /></button>
      </div>
    </section>
  )
}
