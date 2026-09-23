import { describe, expect, it } from 'vitest'
import { periodScore, rankRows, rewardStandings, type RewardStandingRow } from '../../src/gamification/ranking'
import { monthlyRewardFor } from '../../src/gamification/rewards'
import { endOfMonthTr, monthKeyTr } from '../../src/gamification/time'
import type { MonthlyReward } from '../../src/gamification/types'
import { attempt } from './helpers'

describe('dönem puanı', () => {
  it('en iyi 3 değerlendirmenin ortalaması, 1 ondalık; uygulama sayılmaz', () => {
    const list = [90, 85, 70, 88].map((score, i) => attempt({ score, finishedAt: `2026-09-0${i + 1}T10:00:00Z` }))
    list.push(attempt({ mode: 'practice', score: 100 }))
    const r = periodScore(list)
    expect(r.score).toBe(87.7) // (90 + 88 + 85) / 3 = 87.666…
    expect(r.attemptsCount).toBe(4)
    expect(r.reachedAt).toBe('2026-09-04T10:00:00Z') // en iyi 3'ü tamamlayan son deneme
  })
  it('asgari 2 deneme: 1 deneme → sıralama dışı; 2 deneme → ikisinin ortalaması', () => {
    expect(periodScore([attempt({ score: 95 })]).score).toBeNull()
    expect(periodScore([attempt({ score: 90 }), attempt({ score: 80 })]).score).toBe(85)
  })
  it('eşit puanlarda önce tamamlanan deneme seçilir (reachedAt en erken)', () => {
    const list = [
      attempt({ score: 90, finishedAt: '2026-09-01T10:00:00Z' }),
      attempt({ score: 90, finishedAt: '2026-09-02T10:00:00Z' }),
      attempt({ score: 90, finishedAt: '2026-09-03T10:00:00Z' }),
      attempt({ score: 90, finishedAt: '2026-09-10T10:00:00Z' }),
    ]
    expect(periodScore(list).reachedAt).toBe('2026-09-03T10:00:00Z')
  })
  it('sıralama: puan azalan, eşitlikte önce ulaşan; yetersiz deneme rank=null ama listede kalır', () => {
    const rows = rankRows([
      { id: 'a', periodScore: 88, attemptsCount: 3, reachedAt: '2026-09-05T00:00:00Z' },
      { id: 'b', periodScore: 88, attemptsCount: 3, reachedAt: '2026-09-02T00:00:00Z' },
      { id: 'c', periodScore: 95, attemptsCount: 2, reachedAt: '2026-09-09T00:00:00Z' },
      { id: 'd', periodScore: null, attemptsCount: 1, reachedAt: null },
    ])
    expect(Object.fromEntries(rows.map((r) => [r.id, r.rank]))).toEqual({ a: 3, b: 2, c: 1, d: null })
  })
})

describe('ayın ödülü — uygunlar arasında ilk 3', () => {
  const reward = monthlyRewardFor('2026-09')!
  const row = (id: string, score: number, p: Partial<RewardStandingRow> = {}): RewardStandingRow =>
    ({ id, cohort: 5, public: true, periodScore: score, attemptsCount: 5, reachedAt: '2026-09-10T00:00:00Z', ...p })

  it('yapılandırma: tüm sınıflar (Dönem 1–6), adla görünme şartı', () => {
    expect(reward.eligibility.cohorts).toEqual([1, 2, 3, 4, 5, 6])
    expect(reward.eligibility.requirePublicName).toBe(true)
  })
  it('ilk 3 içinde uygun olmayan (asgari deneme / anonim) → adaylık sıradakine kayar; cutoff 3. uygun', () => {
    const { rows, cutoff } = rewardStandings([
      row('a', 95), row('b', 93, { attemptsCount: 3 }), row('c', 91, { public: false }), row('d', 90), row('e', 88), row('f', 80),
    ], reward)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId.b.reason).toBe('min_assessments')
    expect(byId.c.reason).toBe('private_profile')
    expect(rows.filter((r) => r.candidate).map((r) => r.id)).toEqual(['a', 'd', 'e'])
    expect(cutoff).toBe(88)
  })
  it('asgari deneme tam sınırda (4) uygundur, 3 değildir', () => {
    const { rows } = rewardStandings([row('x', 90, { attemptsCount: 4 }), row('y', 90, { attemptsCount: 3 })], reward)
    expect(rows.map((r) => r.reason)).toEqual(['eligible', 'min_assessments'])
  })
  it('kohort reddi: yalnız belirli dönemlere açık bir ödülde dışarıdaki kohort ve kohortu bilinmeyen elenir', () => {
    const narrow: MonthlyReward = { ...reward, eligibility: { ...reward.eligibility, cohorts: [4, 5, 6] } }
    const { rows } = rewardStandings([row('p', 99, { cohort: 3 }), row('q', 98, { cohort: null }), row('r', 90, { cohort: 6 })], narrow)
    expect(rows.map((r) => r.reason)).toEqual(['cohort', 'cohort', 'eligible'])
    expect(rows.find((r) => r.candidate)?.id).toBe('r')
  })
  it('eşitlikte önce ulaşan aday olur', () => {
    const three: MonthlyReward = { ...reward, winnersCount: 1 }
    const { rows } = rewardStandings([row('late', 90, { reachedAt: '2026-09-20T00:00:00Z' }), row('early', 90, { reachedAt: '2026-09-02T00:00:00Z' })], three)
    expect(rows.find((r) => r.candidate)?.id).toBe('early')
  })
  it('ayın son saniyesi TR: 30 Eyl 23:59:59 Eylül, 1 Eki 00:00 Ekim', () => {
    const lastSecond = new Date('2026-09-30T20:59:59.000Z')
    const nextMonth = new Date('2026-09-30T21:00:00.000Z')
    expect(monthKeyTr(lastSecond)).toBe('2026-09')
    expect(monthKeyTr(nextMonth)).toBe('2026-10')
    expect(endOfMonthTr(new Date('2026-09-15T12:00:00Z')).toISOString()).toBe('2026-09-30T20:59:59.999Z')
  })
})
