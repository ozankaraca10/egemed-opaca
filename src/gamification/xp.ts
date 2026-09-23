/** EGEMED Opaca — deneme → XP, toplam XP → seviye/ilerleme (yol haritası §4.2).
 *  Saf fonksiyonlar; zaman kullanılmaz. */

import type { AttemptRecord, LearnActivity } from './types'
import { RULES } from './rules'

/** Uygulama oturumu XP'si: vaka başına temel + (ustalıksa) ustalık bonusu − ipucu cezası,
 *  vaka başına en az 0'a kadar. AttemptRecord oturum düzeyinde toplu tutulduğundan (vaka başına
 *  ayrı ipucu sayısı yok) ipucu cezası vaka başına ORTALAMA olarak uygulanır ve oturum toplamı
 *  bu vaka başına değerin caseCount ile çarpılıp yuvarlanmasıyla bulunur. */
export function practiceXp(attempt: Pick<AttemptRecord, 'caseCount' | 'hintsUsed' | 'mastery'>): number {
  if (attempt.caseCount <= 0) return 0
  const perCaseBase = RULES.xp.practiceCase + (attempt.mastery ? RULES.xp.practiceMasteryBonus : 0)
  const avgHintsPerCase = attempt.hintsUsed / attempt.caseCount
  const perCaseXp = Math.max(0, perCaseBase - RULES.xp.practiceHintPenalty * avgHintsPerCase)
  return Math.round(perCaseXp * attempt.caseCount)
}

/** Değerlendirme oturumu XP'si: vaka başına sabit + (oturum puanı eşiği geçtiyse) başarı bonusu. */
export function assessmentXp(attempt: Pick<AttemptRecord, 'caseCount' | 'score'>): number {
  const base = RULES.xp.assessmentCase * Math.max(0, attempt.caseCount)
  const bonus = attempt.score >= RULES.xp.assessmentBonusThreshold ? RULES.xp.assessmentBonus : 0
  return base + bonus
}

/** Bir denemenin modu neyse ona göre XP hesaplar. */
export function attemptXp(attempt: AttemptRecord): number {
  return attempt.mode === 'assessment' ? assessmentXp(attempt) : practiceXp(attempt)
}

/** Öğrenme etkinliğinden XP: `topics` bir küme (set) olduğundan her konu yalnız bir kez sayılır —
 *  bu doğal biçimde "konu başına bir kez" kuralını karşılar. */
export function learnXp(learn: LearnActivity): number {
  return learn.topics.length * RULES.xp.learnTopicFirstView
}

/** Tüm denemeler + öğrenme etkinliğinden toplam XP. */
export function totalXpFor(attempts: AttemptRecord[], learn: LearnActivity): number {
  return attempts.reduce((sum, a) => sum + attemptXp(a), 0) + learnXp(learn)
}

export interface LevelInfo {
  level: number
  levelStartXp: number
  levelEndXp: number
  xpIntoLevel: number
  xpToNext: number
}

/** n. seviyenin başlangıç XP'si: toplam(100×1 … 100×(n−1)) = unitXp × (n−1) × n / 2. */
export function levelStartXp(level: number): number {
  return (RULES.level.unitXp * (level - 1) * level) / 2
}

/** Toplam XP'den seviye ve o seviye içindeki ilerleme bilgisini üretir. */
export function levelForXp(totalXp: number): LevelInfo {
  let level = 1
  while (levelStartXp(level + 1) <= totalXp) level++
  const start = levelStartXp(level)
  const end = levelStartXp(level + 1)
  return { level, levelStartXp: start, levelEndXp: end, xpIntoLevel: totalXp - start, xpToNext: end - totalXp }
}
