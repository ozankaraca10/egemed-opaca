import { describe, expect, it } from 'vitest'
import { computeStreak } from '../../src/gamification/streak'
import { computeWeeklyGoals } from '../../src/gamification/goals'
import { attempt } from './helpers'

const at = (iso: string, p = {}) => attempt({ finishedAt: iso, ...p })

describe('günlük seri (TR takvimi)', () => {
  it('boş geçmiş → 0/0', () => {
    expect(computeStreak([], new Date('2026-09-23T10:00:00Z'))).toEqual({ current: 0, longest: 0 })
  })
  it('bugün + dün + önceki gün → 3; aynı gün iki oturum tek gün sayılır', () => {
    const list = [at('2026-09-21T09:00:00Z'), at('2026-09-22T09:00:00Z'), at('2026-09-23T08:00:00Z'), at('2026-09-23T09:00:00Z')]
    expect(computeStreak(list, new Date('2026-09-23T12:00:00Z'))).toEqual({ current: 3, longest: 3 })
  })
  it('bugün oturum yoksa dünden sayılır; iki gün boşluk seriyi bitirir', () => {
    const list = [at('2026-09-21T09:00:00Z'), at('2026-09-22T09:00:00Z')]
    expect(computeStreak(list, new Date('2026-09-23T12:00:00Z')).current).toBe(2)
    expect(computeStreak(list, new Date('2026-09-24T12:00:00Z')).current).toBe(0)
    expect(computeStreak(list, new Date('2026-09-24T12:00:00Z')).longest).toBe(2)
  })
  it('TR gece yarısı: UTC 20:59 ve 21:00 farklı günlerdir', () => {
    const list = [at('2026-09-22T20:59:00Z'), at('2026-09-22T21:00:00Z')] // TR 22 Eyl 23:59 ve 23 Eyl 00:00
    expect(computeStreak(list, new Date('2026-09-23T10:00:00Z'))).toEqual({ current: 2, longest: 2 })
  })
})

describe('haftalık hedefler (Pazartesi 00:00 TR)', () => {
  // 21 Eyl 2026 Pazartesi. TR Pzt 00:00 = UTC Paz 20 Eyl 21:00.
  const now = new Date('2026-09-23T10:00:00Z')
  it('hafta sınırı: Pazar TR 23:59 önceki haftaya, Pazartesi TR 00:00 bu haftaya sayılır', () => {
    const before = at('2026-09-20T20:59:59Z')
    const after = at('2026-09-20T21:00:00Z')
    const g = computeWeeklyGoals([before, after], [], now).goals[0]
    expect(g.value).toBe(1)
  })
  it('5 oturum, ortalama ≥ 80, 2 yeni rozet → üçü de tamam', () => {
    const list = [85, 80, 90, 75, 82].map((score, i) => at(`2026-09-2${1 + (i % 3)}T09:00:00Z`, { score }))
    const earned = [{ id: 'x', at: '2026-09-22T10:00:00Z' }, { id: 'y', at: '2026-09-23T09:00:00Z' }, { id: 'old', at: '2026-09-10T10:00:00Z' }]
    const { goals } = computeWeeklyGoals(list, earned, now)
    expect(goals.map((g) => g.done)).toEqual([true, true, true])
    expect(goals[2].value).toBe(2)
  })
  it('uygulama oturumları değerlendirme hedefine sayılmaz; oturum yoksa ortalama hedefi tamam değil', () => {
    const { goals } = computeWeeklyGoals([at('2026-09-22T09:00:00Z', { mode: 'practice', score: 100 })], [], now)
    expect(goals[0].value).toBe(0)
    expect(goals[1].done).toBe(false)
  })
})
