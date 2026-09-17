import type { ImageRecord, Question } from './types'
import { decodeMark, markHitsFinding } from './geometry'

/** Tek doğruluk kaynağı: bir yanıtın doğru olup olmadığı (seçmeli + lokalizasyon). */
export function isAnswerCorrect(q: Question, given: string[], image: ImageRecord | undefined): boolean {
  if (!given.length) return false
  if (q.type === 'localization') {
    if (!q.targetFinding) return false
    const p = decodeMark(given[0])
    return !!p && markHitsFinding(p, image, q.targetFinding)
  }
  return q.correct.length > 0 && q.correct.length === given.length && given.every((g) => q.correct.includes(g))
}
