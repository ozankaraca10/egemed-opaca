/** EGEMED Opaca — rozet görünüm modeli (K-A6). Saf: tanımlar + istatistik + kazanılmışlar → kart durumu. */

import { BADGES, type BadgeCategory, type BadgeDef } from './badges'
import type { Stats } from './stats'

export const CATEGORY_LABEL: Record<BadgeCategory, string> = {
  topic: 'Konu', skill: 'Beceri', streak: 'Seri', learn: 'Öğrenme', milestone: 'Kilometre taşı',
}
export const TIER_LABEL = { bronze: 'Bronz', silver: 'Gümüş', gold: 'Altın' } as const

/** Kilitli kartın alt satırı: kısa koşul. */
const RULE: Record<string, string> = {
  'sharp-eye-1': '10 isabet', 'sharp-eye-2': '25 isabet', 'sharp-eye-3': '50 isabet', systematic: '1 tam ABCDE',
  'film-quality': '10 doğru', 'fast-accurate': '90+ · yarı süre', interpreter: '10 doğru', pleura: '5 vaka', cardiac: '5 vaka',
  nodule: '10 vaka', tb: '10 vaka', pediatric: '5 vaka', diaphragm: '5 vaka', bone: '5 kırık', vascular: '3 vaka',
  'streak-3': '3 gün', 'streak-7': '7 gün', 'streak-30': '30 gün', marathon: '50 oturum', explorer: '10 konu',
  'ct-explorer': '1 BT serisi', 'practice-grit': '20 vaka', 'first-step': 'İlk değerlendirme', threshold: '80 puan',
  'no-hints': 'İpucusuz oturum', perfect: '100 puan', podium: 'Aylık ilk 3', 'all-topics': 'Tüm konular',
}

/** "Bu konuyu öğrenme modunda çalış" hedefi (library.json anahtarı). Konu dışı rozetlerde yok. */
export const STUDY_KEY: Record<string, string> = {
  'sharp-eye-1': 'technique.systematic', 'sharp-eye-2': 'technique.systematic', 'sharp-eye-3': 'technique.systematic',
  systematic: 'technique.systematic', 'film-quality': 'technique.projection', pleura: 'finding.pneumothorax',
  cardiac: 'finding.cardiomegaly', nodule: 'finding.nodule_mass', tb: 'finding.tuberculosis', pediatric: 'finding.steeple_sign',
  diaphragm: 'finding.hiatal_hernia', bone: 'finding.fracture', vascular: 'finding.westermark_sign', 'ct-explorer': 'ct.axial_anatomy',
}

export type BadgeState = 'earned' | 'progress' | 'locked'
export interface BadgeView {
  def: BadgeDef
  state: BadgeState
  value: number
  max: number
  earnedAt: string | null
  rule: string
  studyKey: string | null
}

export function badgeViews(stats: Stats, earned: { id: string; at: string }[]): BadgeView[] {
  const at = new Map(earned.map((e) => [e.id, e.at]))
  return BADGES.map((def) => {
    const { value, max } = def.progress(stats)
    const earnedAt = at.get(def.id) ?? null
    const state: BadgeState = earnedAt ? 'earned' : value > 0 && def.id !== 'podium' ? 'progress' : 'locked'
    return { def, state, value: Math.min(value, max), max, earnedAt, rule: RULE[def.id] ?? '', studyKey: STUDY_KEY[def.id] ?? null }
  })
}

/** Kazanılanlar en yeni önce, sonra devam edenler (ilerleme oranına göre), sonra kilitliler (tanım sırası). */
export function sortBadgeViews(views: BadgeView[]): BadgeView[] {
  const rank = { earned: 0, progress: 1, locked: 2 }
  return [...views].sort((a, b) =>
    rank[a.state] - rank[b.state]
    || (a.state === 'earned' ? (b.earnedAt ?? '').localeCompare(a.earnedAt ?? '') : 0)
    || (a.state === 'progress' ? b.value / b.max - a.value / a.max : 0))
}

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
/** "19 Eyl 2026" (TR, UTC+3). */
export function trDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3_600_000)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
