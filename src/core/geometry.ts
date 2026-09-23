import type { Box, ImageRecord, ReadingZone } from './types'

/** Görüntü koordinat yardımcıları — tamamı normalize (0–1) uzayda çalışır, DOM'a bağımlı değildir. */

export interface Point {
  x: number
  y: number
}

export function inBox(p: Point, b: Box, margin = 0): boolean {
  return p.x >= b.x - margin && p.x <= b.x + b.w + margin && p.y >= b.y - margin && p.y <= b.y + b.h + margin
}

/** Kutunun görüntü alanına oranı (kutu zaten 0–1 normalize, alan doğrudan w*h). */
export function boxArea(b: Box): number {
  return b.w * b.h
}

/** V3: kutu alanı görüntünün bu oranından büyükse lokalizasyon sorusu üretilmez (bulgu tanıma sorulur). */
export const MAX_LOCALIZATION_BOX_AREA = 0.35

/** V3: sabit yarıçaplı işaret dairesi — görüntü kısa kenarının %8'i (piksel), normalize (0–1) yarıçapa çevrilir. */
export const MARK_RADIUS_SHORT_EDGE_FRACTION = 0.08

/** İşaret dairesinin görüntü koordinatındaki (normalize) x/y yarıçapları. Görüntü kare değilse
 *  eksen başına farklı normalize yarıçap gerekir ki ekranda gerçekten daire görünsün (bkz. FilmViewer). */
export function markRadiusNorm(image: Pick<ImageRecord, 'width' | 'height'> | undefined): { rx: number; ry: number } {
  const w = image?.width || 1
  const h = image?.height || 1
  const r = MARK_RADIUS_SHORT_EDGE_FRACTION * Math.min(w, h)
  return { rx: r / w, ry: r / h }
}

/** V3 isabet ölçütü: merkez kutunun içinde OLMALI ve merkezin kutu merkezine uzaklığı,
 *  kutunun yarı köşegeninin %60'ını AŞMAMALI. Büyük/geniş kutularda kenardan teğet geçen
 *  işaretlerin doğru sayılmasını engeller; eski %2 kenar toleransı (MARK_TOLERANCE) kaldırıldı. */
export const MARK_CENTER_DISTANCE_FRACTION = 0.6

export function markHitsBox(p: Point, b: Box): boolean {
  if (!inBox(p, b, 0)) return false
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const halfDiag = Math.hypot(b.w, b.h) / 2
  if (halfDiag <= 0) return true
  const dist = Math.hypot(p.x - cx, p.y - cy)
  return dist <= halfDiag * MARK_CENTER_DISTANCE_FRACTION
}

/** İşaretin, görüntüdeki hedef bulgunun uzman kutularından birine düşüp düşmediği. */
export function markHitsFinding(p: Point, image: ImageRecord | undefined, finding: string): boolean {
  if (!image) return false
  return image.annotations.some((a) => a.finding === finding && a.source !== 'report_nlp' && markHitsBox(p, a))
}

/** Görüntüdeki hedef bulgunun kutularından işarete en yakın olanının merkezi (yanlış işaretlerde
 *  geri bildirim çizgisi/oku için) — kutu yoksa null. */
export function nearestFindingBoxCenter(p: Point, image: ImageRecord | undefined, finding: string): Point | null {
  if (!image) return null
  const boxes = image.annotations.filter((a) => a.finding === finding && a.source !== 'report_nlp')
  if (!boxes.length) return null
  let best: Point | null = null
  let bestDist = Infinity
  for (const b of boxes) {
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    const d = Math.hypot(p.x - c.x, p.y - c.y)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best
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
