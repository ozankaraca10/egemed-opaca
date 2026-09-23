/** EGEMED Opaca — oyunlaştırma TR takvimi (Europe/Istanbul, 2016'dan beri sabit UTC+3, DST yok).
 *  Yol haritası §2.5: kurallar saf fonksiyondur, zaman parametre (`now: Date`) olarak verilir;
 *  bu dosya içinde Date.now()/new Date() ÇAĞRILMAZ (yalnız verilen `now`'dan türetim yapılır). */

import type { Period } from './types'

/** Türkiye sabit ofseti: UTC+3. */
export const TR_OFFSET_MS = 3 * 60 * 60 * 1000

/** `now` (UTC anı) → TR duvar saati alanlarını taşıyan bir Date; yalnız `getUTC*` ile okunmalıdır. */
function trWallClock(now: Date): Date {
  return new Date(now.getTime() + TR_OFFSET_MS)
}

/** Verilen TR duvar saati (yıl/ay(0 tabanlı)/gün/saat/dk/sn/ms) alanlarının karşılık geldiği UTC anı. */
function fromTrWallClock(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0): Date {
  return new Date(Date.UTC(y, mo, d, h, mi, s, ms) - TR_OFFSET_MS)
}

/** TR takvim günü anahtarı, 'YYYY-MM-DD'. */
export function dayKeyTr(now: Date): string {
  const d = trWallClock(now)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** TR ay anahtarı, 'YYYY-MM'. */
export function monthKeyTr(now: Date): string {
  const d = trWallClock(now)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** `now`'un içinde bulunduğu TR takvim gününün başlangıcı (00:00:00.000 TR), UTC anı olarak. */
export function startOfDayTr(now: Date): Date {
  const w = trWallClock(now)
  return fromTrWallClock(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate())
}

/** `now`'un içinde bulunduğu haftanın Pazartesi 00:00 TR başlangıcı. */
export function startOfWeekTr(now: Date): Date {
  const w = trWallClock(now)
  const dow = w.getUTCDay() // 0=Pazar..6=Cumartesi
  const deltaToMonday = (dow + 6) % 7 // Pazartesi=0
  const monday = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() - deltaToMonday))
  return fromTrWallClock(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate())
}

/** `now`'un içinde bulunduğu ayın 1'i, 00:00 TR. */
export function startOfMonthTr(now: Date): Date {
  const w = trWallClock(now)
  return fromTrWallClock(w.getUTCFullYear(), w.getUTCMonth(), 1)
}

/** `now`'un içinde bulunduğu ayın son anı (TR 23:59:59.999) — sonraki ayın 00:00 TR'sinden 1 ms önce. */
export function endOfMonthTr(now: Date): Date {
  const w = trWallClock(now)
  const nextMonthFirst = fromTrWallClock(w.getUTCFullYear(), w.getUTCMonth() + 1, 1)
  return new Date(nextMonthFirst.getTime() - 1)
}

/** `now`'un içinde bulunduğu akademik yılın başlangıcı: 1 Eylül, 00:00 TR
 *  (Eylül–Aralık → aynı yılın 1 Eylül'ü; Ocak–Ağustos → önceki yılın 1 Eylül'ü). */
export function startOfAcademicYearTr(now: Date): Date {
  const w = trWallClock(now)
  const septemberIndex = 8 // 0 tabanlı: Ocak=0 … Eylül=8
  const year = w.getUTCMonth() >= septemberIndex ? w.getUTCFullYear() : w.getUTCFullYear() - 1
  return fromTrWallClock(year, septemberIndex, 1)
}

/** İki anın arasındaki TR takvim günü farkı (a − b), tam gün. DST olmadığından güvenle 86.400.000 ms/gün varsayılır. */
export function diffDaysTr(a: Date, b: Date): number {
  return Math.round((startOfDayTr(a).getTime() - startOfDayTr(b).getTime()) / 86_400_000)
}

/** Verilen dönem türü için [başlangıç, `now`] TR aralığı. */
export function periodRangeTr(period: Period, now: Date): { start: Date; end: Date } {
  switch (period) {
    case 'today':
      return { start: startOfDayTr(now), end: now }
    case 'week':
      return { start: startOfWeekTr(now), end: now }
    case 'month':
      return { start: startOfMonthTr(now), end: now }
    case 'academic_year':
      return { start: startOfAcademicYearTr(now), end: now }
  }
}

/** Başarılarım dönem seçici (tasarım promptu §4): son 30 gün · son 12 hafta · akademik yıl. */
export type AchievementsPeriod = 'last30' | 'last12w' | 'academic'
export function achievementsRangeTr(period: AchievementsPeriod, now: Date): { start: Date; end: Date } {
  if (period === 'academic') return { start: startOfAcademicYearTr(now), end: now }
  const days = period === 'last30' ? 30 : 84
  return { start: new Date(startOfDayTr(now).getTime() - (days - 1) * 86_400_000), end: now }
}
