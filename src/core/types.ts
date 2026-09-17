/** EGEMED Opaca — çekirdek tip tanımları (veri şeması sözleşmesi).
 *  Ausculta şemasından türetildi: ses kaydı → görüntü kaydı, oskültasyon noktası → okuma bölgesi. */

export type Mode = 'learn' | 'practice' | 'assessment'
export type Screen = 'start' | 'modes' | 'tutorial' | 'learn' | 'simulation' | 'results' | 'sources'
export type ValidationStatus = 'validated' | 'educational_mapping' | 'experimental'
export type Population = 'yetiskin' | 'pediatrik'
export type ViewPosition = 'PA' | 'AP' | 'LAT' | 'unknown'

/** Bir bulgu etiketinin nereden geldiği. Değerlendirmeye yalnız EXPERT_SOURCES girer (Ausculta §6 karşılığı). */
export type LabelSource =
  | 'expert_panel' // birden çok radyoloğun panel kararı (Google adjudicated)
  | 'expert_bbox' // radyoloğun çizdiği sınırlayıcı kutu (NIH BBox, RSNA)
  | 'expert_mask' // radyoloğun piksel maskesi (SIIM-ACR)
  | 'expert_reading' // radyoloğun görüntü düzeyinde okuması (RSNA "Normal" sınıfı)
  | 'ct_confirmed' // BT ile doğrulanmış (JSRT)
  | 'report_nlp' // rapor metninden otomatik çıkarım — değerlendirmeye GİRMEZ

export const EXPERT_SOURCES: readonly LabelSource[] = ['expert_panel', 'expert_bbox', 'expert_mask', 'expert_reading', 'ct_confirmed']

/** Normalize (0–1) sınırlayıcı kutu — görüntü genişlik/yüksekliğine göre. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Annotation extends Box {
  finding: string
  source: LabelSource
}

/** images.json kaydı (import üretimi) */
export interface ImageRecord {
  id: string
  sourceDataset: string
  sourceFile: string
  viewPosition: ViewPosition
  ageYears: number | null
  sex: 'M' | 'F' | null
  population: Population
  width: number
  height: number
  originalWidth: number | null
  originalHeight: number | null
  /** pozitif bulgular → etiket kaynağı */
  findings: Record<string, LabelSource>
  /** uzmanın açıkça "yok" dediği bulgular (çeldirici güvenliği için) */
  negatives: Record<string, LabelSource>
  annotations: Annotation[]
  /** film kalitesi yalnız radyolog gözden geçirmesiyle doldurulur; veri setlerinde yoktur */
  quality: { rotation?: 'yok' | 'var'; inspiration?: 'yeterli' | 'yetersiz' } | null
  runtimeUrl: string
  bytes: number
  validationStatus: 'validated' | 'missing_asset'
  clinicalReview: 'beklemede' | 'onayli'
  issues: string[]
}

export interface ImagesManifest {
  generatedAt: string
  count: number
  records: ImageRecord[]
}

/** reading-zones.json — ABCDE sistematik okuma bölgeleri (şematik; PA film üzerinde yaklaşık) */
export type AbcdeStep = 'A' | 'B' | 'C' | 'D' | 'E'
export interface ReadingZone {
  id: string
  step: AbcdeStep
  label: string
  fullLabel: string
  detail: string
  rects: Box[]
}

export type QuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'finding_identify'
  | 'localization'
  | 'film_quality'
  | 'interpretation'
  | 'diagnosis'
  | 'sequence'

export type QuestionDomain = 'recognition' | 'localization' | 'quality' | 'interpretation' | 'diagnosis'

export interface QuestionOption {
  id: string
  label: string
}

export interface Question {
  id: string
  type: QuestionType
  domain: QuestionDomain
  prompt: string
  help?: string
  options: QuestionOption[]
  /** seçmeli sorularda doğru seçenek id'leri; lokalizasyon sorusunda boş */
  correct: string[]
  /** lokalizasyon: işaretin düşmesi gereken bulgu (vakanın görüntüsündeki uzman kutuları) */
  targetFinding?: string
  feedbackCorrect: string
  feedbackIncorrect: string
  hint?: string
}

export interface TechniqueRubric {
  requiredZones: string[]
  minDwellMs: number
  /** ABCDE sırasına uyum ölçülsün mü */
  systematicOrder?: boolean
}

export interface ScoringWeights {
  technique: number
  systematic: number
  quality: number
  localization: number
  recognition: number
  interpretation: number
  diagnosis: number
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  technique: 10,
  systematic: 5,
  quality: 10,
  localization: 25,
  recognition: 25,
  interpretation: 15,
  diagnosis: 10,
}

export interface VitalSigns {
  hr?: number
  rr?: number
  bp?: string
  spo2?: number
  temp?: string
}

export interface CaseDef {
  id: string
  title: string
  modes: Mode[]
  population: Population
  patient: { age: number | null; sex: 'kadın' | 'erkek' | null }
  chiefComplaint: string
  history: string
  vitalSigns: VitalSigns
  objectives: string[]
  imageId: string
  /** Radyografik ana bulgu — tanıdan bağımsız */
  primaryFinding: string
  /** Klinik tanı yalnız doğrulanmış eşlemeyle doldurulur */
  clinicalDiagnosis: string | null
  mappingValidation: ValidationStatus
  mappingNote?: string
  clinicalReview?: 'beklemede' | 'onayli'
  technique: TechniqueRubric
  questions: Question[]
  feedback: { summary: string; differential?: string; techniqueNotes?: string }
  references: string[]
  scoringWeights?: Partial<ScoringWeights>
  libraryKey?: string
  masteryThreshold?: number
  /** değerlendirmede vaka başına süre sınırı (sn) */
  timeLimitSec?: number
}

export interface CaseResult {
  caseId: string
  total: number
  max: number
  mastery: boolean
  domains: Record<keyof ScoringWeights, { earned: number; max: number }>
  answers: { qid: string; correct: boolean; given: string[] }[]
  hintsUsed: number
}

export interface ZoneVisit {
  dwellMs: number
  visits: number
  firstOrder: number
}

export type ViewerTool = 'zoom' | 'window' | 'invert' | 'overlay' | 'measure'

export interface Telemetry {
  visits: Record<string, ZoneVisit>
  order: string[]
  toolUse: Record<ViewerTool, number>
}

export interface SuspendPayload {
  v: number
  mode: Mode
  caseIndex: number
  step: number
  answers: Record<string, string[]>
  hintsUsed: number
  caseResults: CaseResult[]
  tutorialDone: boolean
  visits: Record<string, ZoneVisit>
  order: string[]
  attempts: number
  sessionIds: string[]
  sessionSeed: number
}

export type SimEvent =
  | { type: 'simulation_started'; at: number }
  | { type: 'case_started'; caseId: string; mode: Mode; at: number }
  | { type: 'zone_visited'; zoneId: string; at: number }
  | { type: 'tool_used'; tool: ViewerTool; at: number }
  | { type: 'mark_placed'; qid: string; at: number }
  | { type: 'answer_selected'; qid: string; at: number }
  | { type: 'answer_submitted'; qid: string; correct: boolean; at: number }
  | { type: 'hint_used'; caseId: string; at: number }
  | { type: 'case_timeout'; caseId: string; at: number }
  | { type: 'case_completed'; caseId: string; mode: Mode; at: number }
  | { type: 'assessment_completed'; total: number; at: number }

export interface RuntimeFlags {
  dev: boolean
  scormAvailable: boolean
  scormVersion: '2004' | '1.2' | 'mock'
}
