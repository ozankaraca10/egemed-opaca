import type { CaseDef, CaseResult, ImageRecord, QuestionDomain, ReadingZone, ScoringWeights, Telemetry } from './types'
import { DEFAULT_WEIGHTS } from './types'
import { isAnswerCorrect } from './answers'

/** Deterministik skor hesaplama (Ausculta §24). Tek hata için çifte ceza yok: her alan bağımsız ölçülür. */

export const MASTERY_THRESHOLD = 80
export const HINT_PENALTY_PRACTICE = 5
const STEP_ORDER = ['A', 'B', 'C', 'D', 'E']

export function scoreCase(
  caseDef: CaseDef,
  answers: Record<string, string[]>,
  telemetry: Telemetry,
  hintsUsed: number,
  image: ImageRecord | undefined,
  zones: ReadingZone[]
): CaseResult {
  const w: ScoringWeights = { ...DEFAULT_WEIGHTS, ...(caseDef.scoringWeights ?? {}) }
  const byDomain: Record<QuestionDomain, { qid: string; correct: boolean }[]> = {
    recognition: [],
    localization: [],
    quality: [],
    interpretation: [],
    diagnosis: [],
  }
  const perQ: CaseResult['answers'] = []
  for (const q of caseDef.questions) {
    const given = answers[q.id] ?? []
    const correct = isAnswerCorrect(q, given, image)
    byDomain[q.domain].push({ qid: q.id, correct })
    perQ.push({ qid: q.id, correct, given })
  }

  // K2: sorusu olmayan alan ulaşılamaz puan üretmez
  const fraction = (domain: QuestionDomain, weight: number) => {
    const qs = byDomain[domain]
    if (!qs.length || weight === 0) return { earned: 0, max: 0 }
    return { earned: (qs.filter((q) => q.correct).length / qs.length) * weight, max: weight }
  }

  const domains = {} as CaseResult['domains']
  domains.recognition = fraction('recognition', w.recognition)
  domains.localization = fraction('localization', w.localization)
  domains.quality = fraction('quality', w.quality)
  domains.interpretation = fraction('interpretation', w.interpretation)
  domains.diagnosis = fraction('diagnosis', w.diagnosis)

  // teknik: gerekli bölgelerde yeterli inceleme süresi
  const { requiredZones, minDwellMs = 800 } = caseDef.technique
  const qualifies = (id: string) => (telemetry.visits[id]?.dwellMs ?? 0) >= minDwellMs
  const qualifying = requiredZones.filter(qualifies)
  domains.technique =
    w.technique === 0 || requiredZones.length === 0
      ? { earned: 0, max: 0 }
      : { earned: (qualifying.length / requiredZones.length) * w.technique, max: w.technique }

  // sistematik okuma: ABCDE sırasına uyum
  let systematicEarned = 0
  if (w.systematic > 0 && requiredZones.length > 0) {
    const allDone = qualifying.length === requiredZones.length
    if (allDone) {
      if (caseDef.technique.systematicOrder) {
        const stepOf = new Map(zones.map((z) => [z.id, STEP_ORDER.indexOf(z.step)]))
        const seq = telemetry.order.filter((id) => requiredZones.includes(id)).map((id) => stepOf.get(id) ?? 0)
        const inOrder = seq.every((v, i) => i === 0 || v >= seq[i - 1])
        systematicEarned = inOrder ? w.systematic : w.systematic * 0.5
      } else {
        systematicEarned = w.systematic
      }
    }
  }
  domains.systematic = requiredZones.length === 0 ? { earned: 0, max: 0 } : { earned: systematicEarned, max: w.systematic }

  const earnedTotal = Object.values(domains).reduce((s, d) => s + d.earned, 0)
  const maxTotal = Object.values(domains).reduce((s, d) => s + d.max, 0)
  const total = maxTotal > 0 ? Math.round((earnedTotal / maxTotal) * 100) : 0
  const threshold = caseDef.masteryThreshold ?? MASTERY_THRESHOLD
  return { caseId: caseDef.id, total, max: 100, mastery: total >= threshold, domains, answers: perQ, hintsUsed }
}

export function practiceAdjusted(total: number, hintsUsed: number): number {
  return Math.max(0, total - HINT_PENALTY_PRACTICE * hintsUsed)
}

export function aggregateResults(results: CaseResult[]): {
  total: number
  mastery: boolean
  domains: Record<keyof ScoringWeights, { earned: number; max: number }>
} {
  const domains = {} as Record<keyof ScoringWeights, { earned: number; max: number }>
  for (const r of results) {
    for (const key of Object.keys(r.domains) as (keyof ScoringWeights)[]) {
      const d = r.domains[key]
      if (!d) continue
      const cur = domains[key] ?? { earned: 0, max: 0 }
      cur.earned += d.earned
      cur.max += d.max
      domains[key] = cur
    }
  }
  let earned = 0
  let max = 0
  for (const d of Object.values(domains)) {
    earned += d.earned
    max += d.max
  }
  const total = max > 0 ? Math.round((earned / max) * 100) : 0
  return { total, mastery: total >= MASTERY_THRESHOLD, domains }
}
