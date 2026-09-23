/** EGEMED Opaca — ilerleme grafiği verisi (tasarım promptu §4, K-A4). Saf; çizim bileşeni (GamiProgressChart)
 *  yalnız bu çıktıyı ölçülen genişliğe yerleştirir. */

import type { AttemptRecord } from './types'
import { attemptXp } from './xp'

export interface ChartPoint {
  at: string // ISO
  label: string // "8 Eyl"
  score: number
  cumulativeXp: number
}

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
/** TR kısa tarih ("8 Eyl"), UTC+3. */
export function trShortDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3_600_000)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** Dönem içindeki değerlendirme puanları + o ana kadarki toplam XP (tüm denemelerden, dönem öncesi dahil). */
export function buildChartSeries(attempts: AttemptRecord[], startIso: string, endIso: string): ChartPoint[] {
  const sorted = [...attempts].sort((a, b) => (a.finishedAt < b.finishedAt ? -1 : a.finishedAt > b.finishedAt ? 1 : 0))
  let xp = 0
  const out: ChartPoint[] = []
  for (const a of sorted) {
    xp += attemptXp(a)
    if (a.mode !== 'assessment' || a.finishedAt < startIso || a.finishedAt > endIso) continue
    out.push({ at: a.finishedAt, label: trShortDate(a.finishedAt), score: a.score, cumulativeXp: xp })
  }
  return out
}

/** XP ekseni için "yuvarlak" üst sınır (100, 200, 500, 1.000, 2.000, 5.000 …). */
export function niceMax(v: number): number {
  if (v <= 100) return 100
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 5, 10]) if (v <= m * p) return m * p
  return 10 * p
}

/** Genişliğe göre x etiket aralığı: etiketler arası en az ~64 px; son nokta her zaman etiketlenir. */
export function labelEvery(pointCount: number, plotWidth: number): number {
  if (pointCount <= 1) return 1
  const maxLabels = Math.max(2, Math.floor(plotWidth / 64))
  return Math.max(1, Math.ceil(pointCount / maxLabels))
}
