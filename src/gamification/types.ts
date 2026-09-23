/** EGEMED Opaca — oyunlaştırma veri katmanı tip tanımları.
 *  Sözleşme kaynakları: docs/GAMIFICATION-YOL-HARITASI.md §4.1, §5.1 ve
 *  docs/GAMIFICATION-TASARIM-PROMPT.md §5.1 (MonthlyReward — burada `requirePublicNickname`
 *  yerine `requirePublicName` kullanılır, bkz. docs/GAMIFICATION-HANDOFF.md "Kullanıcı kararları").
 *  Bu dosya saf tip tanımlarından ibarettir; çalışma zamanı mantığı içermez. */

import type { ScoringWeights } from '../core/types'

export type GamiMode = 'practice' | 'assessment'

/** Puanlama alanları (src/core/types.ts ScoringWeights ile aynı anahtarlar) — alan bazlı % performans. */
export type DomainKey = keyof ScoringWeights

/** Bir deneme (uygulama ya da değerlendirme) oturumunun özet kaydı.
 *  `id` idempotensi sağlar: mode + sessionSeed + caseIds birleşiminin karması (çağıran taraf üretir). */
export interface AttemptRecord {
  id: string
  mode: GamiMode
  finishedAt: string // ISO 8601
  score: number // 0–100, aggregateResults().total
  mastery: boolean
  caseCount: number
  hintsUsed: number
  durationMs: number
  domains: Partial<Record<DomainKey, number>> // yüzde 0–100
  /** vaka başına ana bulgu ve o vakanın bulgu tanıma sorusunun doğruluğu */
  findings: { finding: string; correct: boolean }[]
  localizationHits: number
  /** okuma sırası (ABCDE) tam izlenen vaka sayısı */
  abcdeComplete: number
  qualityCorrect: number
  interpretationCorrect: number
  /** süre sınırının yarısında ≥90 puan alındı mı */
  fastPerfect: boolean
}

/** Öğrenme modu etkinliği — konu/BT yığını başına yalnız bir kez sayılır (set semantiği). */
export interface LearnActivity {
  topics: string[] // src/data/library.json LibraryItem.key değerleri
  ctStacksCompleted: string[]
}

/** Dönem (kohort) — 1'den 6'ya kadar tüm sınıflar (kullanıcı kararı: ödül/kohort 6 sınıfın tamamı için geçerli). */
export type Cohort = 1 | 2 | 3 | 4 | 5 | 6

export interface GamiProfile {
  displayName: string | null
  public: boolean
  cohort: Cohort | null
}

export interface GamiStateV1 {
  v: 1
  attempts: AttemptRecord[]
  learn: LearnActivity
  earned: { id: string; at: string }[]
  profile: GamiProfile
}

/** Sıralama/dönem türleri. */
export type Period = 'today' | 'week' | 'month' | 'academic_year'
export type CohortFilter = 'all' | Cohort

/** Liderlik tablosu satırı — repo tarafından çözümlenmiş (ad/anonimlik dahil) görünüm modeli. */
export interface LeaderboardRow {
  id: string
  displayName: string // zaten çözümlenmiş; gizli profil için "Anonim öğrenci"
  isMe: boolean
  /** Adıyla mı görünüyor (false → "Anonim öğrenci"); ödül koşulu requirePublicName için. */
  isPublic: boolean
  cohort: Cohort | null
  periodScore: number | null
  attemptsCount: number
  /** Eşitlik kuralı ("önce ulaşan öne geçer") için — en iyi 3'ü tamamlayan son denemenin zamanı. */
  reachedAt: string | null
  totalXp: number
  level: number
  rank: number | null // asgari deneme sağlanmadıysa null
}

export interface LeaderboardView {
  period: Period
  cohort: CohortFilter
  generatedAt: string // ISO 8601
  isDemo: true // v1'de her zaman true (bkz. yol haritası §1)
  rows: LeaderboardRow[]
}

/** Aylık ödül yapılandırması (tasarım promptu §5.1). Kod içinde sabit DEĞİLDİR; rewards.ts'ten okunur. */
export interface MonthlyReward {
  month: string // '2026-09'
  title: string
  description: string
  sponsor: string
  winnersCount: number
  eligibility: {
    cohorts: Cohort[]
    minAssessments: number
    requirePublicName: boolean
  }
  terms: string[]
}

export interface RewardWinner {
  month: string
  rank: 1 | 2 | 3
  displayName: string
  score: number
  isMe: boolean
}

export type EligibilityReason = 'eligible' | 'min_assessments' | 'cohort' | 'private_profile'
