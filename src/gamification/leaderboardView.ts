/** EGEMED Opaca — Liderlik Tahtası görünüm yardımcıları (K-B1…K-B6). Saf; zaman parametre. */

import type { LeaderboardRow, MonthlyReward, Period } from './types'
import type { RewardStandingResult } from './ranking'
import { endOfMonthTr, periodRangeTr, startOfWeekTr } from './time'

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const parts = (d: Date) => { const w = new Date(d.getTime() + 3 * 3_600_000); return { d: w.getUTCDate(), m: w.getUTCMonth(), y: w.getUTCFullYear() } }

/** Dönemin takvim aralığı etiketi: "23 Eyl 2026" · "21–27 Eyl 2026" · "1–30 Eyl 2026" · "1 Eyl 2026 – 31 Ağu 2027". */
export function periodLabel(period: Period, now: Date): string {
  const s = parts(periodRangeTr(period, now).start)
  const endDate = period === 'today' ? now
    : period === 'week' ? new Date(startOfWeekTr(now).getTime() + 6 * 86_400_000)
    : period === 'month' ? endOfMonthTr(now)
    : new Date(Date.UTC(s.y + 1, 7, 31, 12))
  const e = parts(endDate)
  if (period === 'today') return `${s.d} ${MONTHS[s.m]} ${s.y}`
  if (s.y === e.y && s.m === e.m) return `${s.d}–${e.d} ${MONTHS[s.m]} ${s.y}`
  if (s.y === e.y) return `${s.d} ${MONTHS[s.m]} – ${e.d} ${MONTHS[e.m]} ${s.y}`
  return `${s.d} ${MONTHS[s.m]} ${s.y} – ${e.d} ${MONTHS[e.m]} ${e.y}`
}

/** Önceki dönemin son anı (değişim oku için: o anda görünen sıralama önceki dönemin tamamıdır). */
export function previousPeriodNow(period: Period, now: Date): Date {
  return new Date(periodRangeTr(period, now).start.getTime() - 1)
}

export type TableItem = { kind: 'row'; row: LeaderboardRow } | { kind: 'gap' }
/** Tablo: 4–10. sıralar; "ben" 10'dan sonraysa ayırıcı + bir üstü, ben, bir altı. İlk 3 podyumda.
 *  `withPodium=false` (<3 sıralı kişi) → tablo 1'den başlar. */
export function tableItems(rows: LeaderboardRow[], withPodium: boolean): TableItem[] {
  const ranked = rows.filter((r) => r.rank !== null).sort((a, b) => a.rank! - b.rank!)
  const from = withPodium ? 4 : 1
  const head = ranked.filter((r) => r.rank! >= from && r.rank! <= 10)
  const out: TableItem[] = head.map((row) => ({ kind: 'row', row }))
  const me = ranked.find((r) => r.isMe)
  if (me && me.rank! > 10) {
    const near = ranked.filter((r) => r.rank! >= Math.max(11, me.rank! - 1) && r.rank! <= me.rank! + 1)
    // 11. sıra doğrudan 10'un devamıdır; arada atlanan sıra varsa ayırıcı
    if (near[0].rank! > 11) out.push({ kind: 'gap' })
    near.forEach((row) => out.push({ kind: 'row', row }))
  }
  return out
}

/** Ay sonuna kalan süre: "8 gün 4 saat" · "4 saat 12 dk" · "12 dk". */
export function countdownText(now: Date): string {
  const ms = Math.max(0, endOfMonthTr(now).getTime() + 1 - now.getTime())
  const mins = Math.floor(ms / 60_000)
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60
  if (d > 0) return `${d} gün ${h} saat`
  if (h > 0) return `${h} saat ${m} dk`
  return `${m} dk`
}
export function daysLeft(now: Date): number {
  return Math.ceil((endOfMonthTr(now).getTime() + 1 - now.getTime()) / 86_400_000)
}

export interface MeStatus { tone: 'green' | 'purple' | 'gray'; text: string; action?: 'privacy' | 'assess' }
/** "Senin durumun" çipi (tasarım promptu §5.1). */
export function meRewardStatus(standings: { rows: RewardStandingResult[]; cutoff: number }, reward: MonthlyReward): MeStatus | null {
  const me = standings.rows.find((r) => r.id === 'me')
  if (!me) return null
  const eligibleRanked = standings.rows.filter((r) => r.reason === 'eligible' && r.periodScore !== null)
    .sort((a, b) => b.periodScore! - a.periodScore!)
  if (me.candidate) return { tone: 'green', text: `Şu an ödül sırasındasın — ${eligibleRanked.findIndex((r) => r.id === 'me') + 1}.` }
  if (me.reason === 'min_assessments') {
    const left = reward.eligibility.minAssessments - me.attemptsCount
    return { tone: 'gray', text: `Uygunluk için bu ay ${left} değerlendirme daha tamamla`, action: 'assess' }
  }
  if (me.reason === 'private_profile') return { tone: 'gray', text: 'Ödüle aday olmak için sıralamada adınla görünmelisin', action: 'privacy' }
  if (me.reason === 'cohort') {
    const c = reward.eligibility.cohorts
    return { tone: 'gray', text: `Bu ödül Dönem ${Math.min(...c)}–${Math.max(...c)} öğrencilerine açıktır` }
  }
  if (me.periodScore === null) return { tone: 'gray', text: 'Bu ay henüz sıralamada değilsin', action: 'assess' }
  const gap = Math.max(0, Math.round((standings.cutoff - me.periodScore) * 10) / 10)
  return { tone: 'purple', text: `Ödül sırasına ${gap.toLocaleString('tr-TR')} puan` }
}
