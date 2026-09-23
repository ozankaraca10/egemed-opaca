/** EGEMED Opaca — deneme geçmişinden toplu istatistik (rozet/hedef girdisi, yol haritası §4).
 *  Saf fonksiyon; zaman parametre (`now`). */

import type { AttemptRecord, LearnActivity } from './types'
import { RULES } from './rules'
import { computeStreak } from './streak'
import { totalXpFor, levelForXp } from './xp'
import { LIBRARY_ITEMS } from '../data/terminology'
import { FINDINGS } from '../data/terminology'

/** Rozet konu (topic) eşlemesi — src/data/findings.json gruplarından TÜRETİLİR (sabit liste değil).
 *  "nodule" yalnız tek bir bulguyu hedefler (parenchyma grubunun geri kalanını değil); diğerleri
 *  bütün bir bulgu grubunu hedefler. findings.json'da bulunmayan/eşleşmeyen bulgu kimlikleri
 *  `FINDINGS[id]` undefined döner ve sessizce hiçbir konuya sayılmaz (çökme yok). */
export const TOPIC_BADGE_MATCH: Record<string, (findingId: string) => boolean> = {
  pleura: (id) => FINDINGS[id]?.group === 'pleura',
  cardiac: (id) => FINDINGS[id]?.group === 'cardiac',
  nodule: (id) => id === 'nodule_mass',
  tb: (id) => FINDINGS[id]?.group === 'infection',
  pediatric: (id) => FINDINGS[id]?.group === 'pediatric',
  diaphragm: (id) => FINDINGS[id]?.group === 'diaphragm',
  // "Kemik Gözü" kırık rozetidir: kemik grubundaki kırık bulguları (skolyoz sayılmaz).
  bone: (id) => FINDINGS[id]?.group === 'bone' && id.endsWith('fracture'),
  vascular: (id) => FINDINGS[id]?.group === 'vascular',
}

export interface Stats {
  totalXp: number
  level: number
  streakCurrent: number
  streakLongest: number
  assessmentCount: number
  practiceCaseTotal: number
  /** Aşağıdaki dört alan yalnız DEĞERLENDİRME modundaki denemelerden beslenir (yol haritası §5). */
  localizationHits: number
  abcdeCompleteCount: number
  qualityCorrect: number
  interpretationCorrect: number
  fastPerfectCount: number
  bestAssessmentScore: number
  perfectSessionCount: number
  noHintPracticeSessionCount: number
  /** Konu rozetleri için doğru sayaçları (bkz. TOPIC_BADGE_MATCH anahtarları). */
  topicCorrect: Record<string, number>
  learnTopicsCount: number
  ctStacksCompletedCount: number
  /** "Tüm Konular" rozeti: kütüphanedeki (src/data/library.json) konulardan kaçında en az bir doğru var. */
  allTopicsCoveredCount: number
  allTopicsTotal: number
  earnedBadgeCount: number
}

export function computeStats(
  attempts: AttemptRecord[],
  learn: LearnActivity,
  earned: { id: string; at: string }[],
  now: Date
): Stats {
  const assessments = attempts.filter((a) => a.mode === 'assessment')
  const practices = attempts.filter((a) => a.mode === 'practice')

  const totalXp = totalXpFor(attempts, learn)
  const { level } = levelForXp(totalXp)
  const { current: streakCurrent, longest: streakLongest } = computeStreak(attempts, now)

  const localizationHits = assessments.reduce((s, a) => s + a.localizationHits, 0)
  const abcdeCompleteCount = assessments.reduce((s, a) => s + a.abcdeComplete, 0)
  const qualityCorrect = assessments.reduce((s, a) => s + a.qualityCorrect, 0)
  const interpretationCorrect = assessments.reduce((s, a) => s + a.interpretationCorrect, 0)
  const fastPerfectCount = assessments.filter((a) => a.fastPerfect).length
  const bestAssessmentScore = assessments.reduce((max, a) => Math.max(max, a.score), 0)
  const perfectSessionCount = assessments.filter((a) => a.score === 100).length
  const noHintPracticeSessionCount = practices.filter(
    (a) => a.hintsUsed === 0 && a.caseCount >= RULES.badges.noHintsCaseMin
  ).length
  const practiceCaseTotal = practices.reduce((s, a) => s + a.caseCount, 0)

  const topicCorrect: Record<string, number> = {}
  for (const key of Object.keys(TOPIC_BADGE_MATCH)) topicCorrect[key] = 0
  const correctFindingsByTopic = new Set<string>() // topicId'ye göre değil, genel "kapsam" için ayrı hesaplanır
  for (const a of assessments) {
    for (const f of a.findings) {
      if (!f.correct) continue
      for (const [topicId, match] of Object.entries(TOPIC_BADGE_MATCH)) {
        if (match(f.finding)) topicCorrect[topicId] = (topicCorrect[topicId] ?? 0) + 1
      }
    }
  }
  // "Tüm Konular" — bulguya bağlı kütüphane maddeleri: en az bir doğru cevap görülmüş mü.
  for (const a of assessments) {
    for (const f of a.findings) {
      if (f.correct) correctFindingsByTopic.add(f.finding)
    }
  }

  const learnTopicsCount = new Set(learn.topics).size
  const ctStacksCompletedCount = new Set(learn.ctStacksCompleted).size
  const learnTopicSet = new Set(learn.topics)

  // Kütüphanede bulguya bağlı olmayan konular (technique.*, ct.*) için "doğru" kavramı yok;
  // bu konularda kapsam şartı öğrenme modunda incelenmiş olmaktır (bkz. rapor: belirsiz nokta).
  let allTopicsCoveredCount = 0
  for (const item of LIBRARY_ITEMS) {
    if (item.finding) {
      if (correctFindingsByTopic.has(item.finding)) allTopicsCoveredCount++
    } else if (learnTopicSet.has(item.key)) {
      allTopicsCoveredCount++
    }
  }

  return {
    totalXp,
    level,
    streakCurrent,
    streakLongest,
    assessmentCount: assessments.length,
    practiceCaseTotal,
    localizationHits,
    abcdeCompleteCount,
    qualityCorrect,
    interpretationCorrect,
    fastPerfectCount,
    bestAssessmentScore,
    perfectSessionCount,
    noHintPracticeSessionCount,
    topicCorrect,
    learnTopicsCount,
    ctStacksCompletedCount,
    allTopicsCoveredCount,
    allTopicsTotal: LIBRARY_ITEMS.length,
    earnedBadgeCount: earned.length,
  }
}
