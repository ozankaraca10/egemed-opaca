import type { CaseDef, CaseResult, PointVisit, ScoringWeights, Telemetry } from './types'
import { DEFAULT_WEIGHTS } from './types'

/** Deterministik skor hesaplama (§24). Tek hata için çifte ceza yok: her alan bağımsız ölçülür. */

export const MASTERY_THRESHOLD = 80
export const HINT_PENALTY_PRACTICE = 5

/** Tek bir vakanın sonucunu hesaplar. */
export function scoreCase(
  caseDef: CaseDef,
  answers: Record<string, string[]>,
  telemetry: Telemetry,
  hintsUsed: number
): CaseResult {
  const w: ScoringWeights = { ...DEFAULT_WEIGHTS, ...(caseDef.scoringWeights ?? {}) }
  const domains = {} as CaseResult['domains']
  const domainQuestions: Record<string, { qid: string; correct: boolean; given: string[] }[]> = {
    localization: [],
    recognition: [],
    interpretation: [],
    diagnosis: [],
  }

  for (const q of caseDef.questions) {
    const given = answers[q.id] ?? []
    const correct = q.correct.length > 0 && given.length > 0 && q.correct.length === given.length
      ? given.every((g) => q.correct.includes(g))
      : false
    domainQuestions[q.domain].push({ qid: q.id, correct, given })
  }

  const fraction = (domain: string, weight: number) => {
    const qs = domainQuestions[domain] ?? []
    // vakada bu alana ait soru yoksa ağırlık erişilemez hale gelmez (K2): max de 0 olur,
    // toplam maxTotal üzerinden normalize edildiği için puan diğer alanlara kayar.
    if (!qs.length || weight === 0) return { earned: 0, max: 0 }
    const correctCount = qs.filter((q) => q.correct).length
    return { earned: (correctCount / qs.length) * weight, max: weight }
  }

  domains.localization = fraction('localization', w.localization)
  domains.recognition = fraction('recognition', w.recognition)
  domains.interpretation = fraction('interpretation', w.interpretation)
  domains.diagnosis = fraction('diagnosis', w.diagnosis)

  // teknik: nitelikli nokta oranı (dwell + dinleme eşiği)
  const { requiredPoints, minDwellMs = 1500, minListenMsPerPoint = 2000 } = caseDef.technique
  const qualifies = (id: string) => {
    const v: PointVisit | undefined = telemetry.visits[id]
    return !!v && v.dwellMs >= minDwellMs && v.listenMs >= minListenMsPerPoint
  }
  const qualifying = requiredPoints.filter(qualifies).length
  domains.technique = {
    earned: requiredPoints.length ? (qualifying / requiredPoints.length) * w.technique : w.technique,
    max: w.technique,
  }

  // sistematik muayene: sıra + tamamlama
  let systematicEarned = 0
  if (caseDef.technique.systematicOrder && requiredPoints.length > 1) {
    const firstIdx = requiredPoints.map((id) => telemetry.order.indexOf(id))
    const visitedAll = firstIdx.every((i) => i >= 0)
    if (visitedAll) {
      const inOrder = firstIdx.every((v, i) => i === 0 || v > firstIdx[i - 1])
      systematicEarned = inOrder ? w.systematic : w.systematic * 0.5
    }
  } else {
    systematicEarned = qualifying === requiredPoints.length ? w.systematic : 0
  }
  domains.systematic = { earned: systematicEarned, max: w.systematic }

  const earnedTotal = Object.values(domains).reduce((s, d) => s + d.earned, 0)
  const maxTotal = Object.values(domains).reduce((s, d) => s + d.max, 0) || 100
  const total = Math.round((earnedTotal / maxTotal) * 100)
  const threshold = caseDef.masteryThreshold ?? MASTERY_THRESHOLD

  return {
    caseId: caseDef.id,
    total,
    max: 100,
    mastery: total >= threshold,
    domains,
    answers: caseDef.questions.map((q) => ({
      qid: q.id,
      correct: !!domainQuestions[q.domain].find((x) => x.qid === q.id)?.correct,
      given: answers[q.id] ?? [],
    })),
    hintsUsed,
  }
}

/** Uygulama modunda ipucu cezası uygulanmış görünür puan. */
export function practiceAdjusted(total: number, hintsUsed: number): number {
  return Math.max(0, total - HINT_PENALTY_PRACTICE * hintsUsed)
}

/** Çoklu vaka toplamı (değerlendirme modu). Her vakanın ağırlık toplamı kendi domains.max'ında taşınır. */
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
