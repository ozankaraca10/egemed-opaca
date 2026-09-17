import type { Box, ImageRecord, ReadingZone } from './types'

/** Görüntü koordinat yardımcıları — tamamı normalize (0–1) uzayda çalışır, DOM'a bağımlı değildir. */

export interface Point {
  x: number
  y: number
}

export function inBox(p: Point, b: Box, margin = 0): boolean {
  return p.x >= b.x - margin && p.x <= b.x + b.w + margin && p.y >= b.y - margin && p.y <= b.y + b.h + margin
}

/** Lokalizasyon toleransı: kutu kenarından en fazla %2 dışarı taşan işaret de kabul edilir. */
export const MARK_TOLERANCE = 0.02

/** İşaretin, görüntüdeki hedef bulgunun uzman kutularından birine düşüp düşmediği. */
export function markHitsFinding(p: Point, image: ImageRecord | undefined, finding: string): boolean {
  if (!image) return false
  return image.annotations.some((a) => a.finding === finding && a.source !== 'report_nlp' && inBox(p, a, MARK_TOLERANCE))
}

/** Yanıt kodlaması: "pt:0.4312,0.5521" (suspend ve SCORM ile uyumlu düz metin). */
export function encodeMark(p: Point): string {
  return `pt:${p.x.toFixed(4)},${p.y.toFixed(4)}`
}

export function decodeMark(v: string | undefined): Point | null {
  if (!v || !v.startsWith('pt:')) return null
  const [xs, ys] = v.slice(3).split(',')
  const x = Number(xs)
  const y = Number(ys)
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null
  return { x, y }
}

/** SCORM 1.2 fill-in yanıtı için kısa biçim: "x43y55" (yüzde). */
export function markToScorm(v: string): string {
  const p = decodeMark(v)
  if (!p) return ''
  return `x${Math.round(p.x * 100)}y${Math.round(p.y * 100)}`
}

export function zonesAt(p: Point, zones: ReadingZone[]): string[] {
  return zones.filter((z) => z.rects.some((r) => inBox(p, r))).map((z) => z.id)
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Kardiyotorasik oran benzeri iki uzunluğun oranı (ölçüm aracı). */
export function ratio(a: number, b: number): number | null {
  if (!(b > 0)) return null
  return Math.round((a / b) * 100) / 100
}
