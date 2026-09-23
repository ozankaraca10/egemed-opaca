import { describe, expect, it } from 'vitest'
import { countdownText, daysLeft, meRewardStatus, periodLabel, previousPeriodNow, tableItems } from '../../src/gamification/leaderboardView'
import { rewardStandings } from '../../src/gamification/ranking'
import { monthlyRewardFor } from '../../src/gamification/rewards'
import type { LeaderboardRow } from '../../src/gamification/types'

const now = new Date('2026-09-23T10:00:00Z')
const row = (rank: number | null, isMe = false): LeaderboardRow => ({
  id: isMe ? 'me' : `p${rank}`, displayName: isMe ? 'Selin Çelik' : `Kişi ${rank}`, isMe, isPublic: true, cohort: 5,
  periodScore: rank === null ? null : 100 - rank, attemptsCount: rank === null ? 1 : 4, reachedAt: '2026-09-10T00:00:00Z', totalXp: 0, level: 1, rank,
})

describe('liderlik görünümü', () => {
  it('dönem etiketleri TR', () => {
    expect(periodLabel('today', now)).toBe('23 Eyl 2026')
    expect(periodLabel('week', now)).toBe('21–27 Eyl 2026')
    expect(periodLabel('month', now)).toBe('1–30 Eyl 2026')
    expect(periodLabel('academic_year', now)).toBe('1 Eyl 2026 – 31 Ağu 2027')
  })
  it('önceki dönemin son anı', () => {
    expect(previousPeriodNow('week', now).toISOString()).toBe('2026-09-20T20:59:59.999Z')
  })
  it('tablo: ben ilk 10\'da → 4–10', () => {
    const items = tableItems([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((r) => row(r, r === 7)), true)
    expect(items.map((i) => (i.kind === 'row' ? i.row.rank : 'gap'))).toEqual([4, 5, 6, 7, 8, 9, 10])
  })
  it('tablo: ben 12. → 4–10, ayırıcı, 11–13; ben 11. → ayırıcısız', () => {
    const rows = Array.from({ length: 15 }, (_, i) => row(i + 1, i + 1 === 12))
    expect(tableItems(rows, true).map((i) => (i.kind === 'row' ? i.row.rank : 'gap'))).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    const rows14 = Array.from({ length: 16 }, (_, i) => row(i + 1, i + 1 === 14))
    expect(tableItems(rows14, true).map((i) => (i.kind === 'row' ? i.row.rank : 'gap'))).toEqual([4, 5, 6, 7, 8, 9, 10, 'gap', 13, 14, 15])
  })
  it('tablo: ben sıralamaya girmemişsem listede yokum; <3 kişide tablo 1\'den başlar', () => {
    expect(tableItems([row(1), row(2), row(null, true)], false).map((i) => (i.kind === 'row' ? i.row.id : 'gap'))).toEqual(['p1', 'p2'])
  })
  it('geri sayım ve kalan gün', () => {
    expect(countdownText(now)).toBe('7 gün 11 saat') // TR 23 Eyl 13:00 → 1 Eki 00:00
    expect(countdownText(new Date('2026-09-30T18:00:00Z'))).toBe('3 saat 0 dk') // TR 21:00
    expect(daysLeft(now)).toBe(8)
  })
  it('"Senin durumun": aday / puan farkı / asgari deneme / anonim', () => {
    const reward = monthlyRewardFor('2026-09')!
    const base = { cohort: 5 as const, public: true, attemptsCount: 5, reachedAt: '2026-09-10T00:00:00Z' }
    const peers = [{ id: 'a', periodScore: 95, ...base }, { id: 'b', periodScore: 93, ...base }, { id: 'c', periodScore: 90.5, ...base }]
    expect(meRewardStatus(rewardStandings([...peers, { id: 'me', periodScore: 96, ...base }], reward), reward)).toMatchObject({ tone: 'green', text: 'Şu an ödül sırasındasın — 1.' })
    expect(meRewardStatus(rewardStandings([...peers, { id: 'me', periodScore: 82.4, ...base }], reward), reward)!.text).toBe('Ödül sırasına 8,1 puan')
    expect(meRewardStatus(rewardStandings([...peers, { id: 'me', periodScore: 99, ...base, attemptsCount: 3 }], reward), reward)).toMatchObject({ text: 'Uygunluk için bu ay 1 değerlendirme daha tamamla', action: 'assess' })
    expect(meRewardStatus(rewardStandings([...peers, { id: 'me', periodScore: 99, ...base, public: false }], reward), reward)).toMatchObject({ action: 'privacy' })
  })
})
