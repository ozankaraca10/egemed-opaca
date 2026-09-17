/** EGEMED Ausculta — çekirdek tip tanımları (veri şeması sözleşmesi §17, §23, §24, §19). */

export type Mode = 'learn' | 'practice' | 'assessment'
export type Screen =
  | 'start'
  | 'modes'
  | 'tutorial'
  | 'learn'
  | 'simulation'
  | 'results'
  | 'sources'
export type PatientView = 'front' | 'back'
export type StethHead = 'bell' | 'diaphragm'
export type ValidationStatus = 'validated' | 'educational_mapping' | 'experimental'
export type SoundCategory = 'heart' | 'lung' | 'mixed'

/** sounds.json kaydı (import üretimi) */
export interface SoundRecord {
  id: string
  category: SoundCategory
  acousticFinding: string
  heartFinding?: string
  lungFinding?: string
  sourceDataset: string
  sourceFile: string
  durationSec: number
  sampleRate: number
  channels: number
  peak: number
  rms: number
  recordedLocation: string
  anatomicalLocation: string
  simulationLocation: string | null
  nativeFilter: 'digital_filtered' | 'bell' | 'diaphragm' | 'midrange' | 'unspecified'
  gender: string
  runtimeUrl: string
  validationStatus: 'validated' | 'missing_asset'
  issues: string[]
}

export interface SoundsManifest {
  generatedAt: string
  dataset: {
    id: string
    title: string
    doi: string
    articleDoi: string
    license: string
    authors: string[]
  }
  count: number
  records: SoundRecord[]
}

/** auscultation-points.json */
export interface AuscultationPoint {
  id: string
  view: PatientView
  group: 'cardiac' | 'lung'
  label: string
  fullLabel: string
  detail: string
  side: 'right' | 'left' | 'midline'
  x: number
  y: number
  color: string
  tagSide: 'left' | 'right'
}

/** Bir noktaya atanacak ses arama şartı (id verilmezse resolver deterministik seçer) */
export interface SoundAssignment {
  pointId: string
  category: SoundCategory
  acousticFinding: string
  recordedLocation?: string
  gender?: 'M' | 'F' | 'any'
  soundId?: string
}

/** Soru tipi (§23) */
export type QuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'sound_identify'
  | 'localization'
  | 'bell_diaphragm'
  | 'interpretation'
  | 'diagnosis'
  | 'sequence'

export type QuestionDomain = 'recognition' | 'localization' | 'interpretation' | 'diagnosis'

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
  correct: string[]
  feedbackCorrect: string
  feedbackIncorrect: string
  hint?: string
}

/** Teknik rubriği (telemetri kaynaklı) */
export interface TechniqueRubric {
  requiredPoints: string[]
  minPointsVisited: number
  minDwellMs: number
  minListenMsPerPoint: number
  systematicOrder?: boolean
}

export interface ScoringWeights {
  technique: number
  localization: number
  recognition: number
  interpretation: number
  diagnosis: number
  systematic: number
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  technique: 20,
  localization: 20,
  recognition: 25,
  interpretation: 20,
  diagnosis: 10,
  systematic: 5,
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
  patient: { age: number; sex: 'kadın' | 'erkek' }
  chiefComplaint: string
  history: string
  vitalSigns: VitalSigns
  objectives: string[]
  tasks: string[]
  views: PatientView[]
  allowedHeads: StethHead[]
  soundAssignments: SoundAssignment[]
  /** Akustik ana bulgu — tanıdan bağımsız (§6) */
  primaryAcousticFinding: string
  /** Klinik tanı ancak doğrulanmış eşlemeyle doldurulur (§6) */
  clinicalDiagnosis: string | null
  /** diagnosis alanı için eşleme doğrulama durumu (§19) */
  /** hekim onay durumu: 'beklemede' | 'onayli' */
  clinicalReview?: 'beklemede' | 'onayli'
  mappingValidation: ValidationStatus
  mappingNote?: string
  technique: TechniqueRubric
  questions: Question[]
  feedback: { summary: string; differential?: string; techniqueNotes?: string }
  references: string[]
  scoringWeights?: Partial<ScoringWeights>
  /** Öğrenme modu kütüphane bağlantısı */
  libraryKey?: string
  masteryThreshold?: number
}

/** vaka çalışması raporu (results) */
export interface CaseResult {
  caseId: string
  total: number
  max: number
  mastery: boolean
  domains: Record<keyof ScoringWeights, { earned: number; max: number }>
  answers: { qid: string; correct: boolean; given: string[] }[]
  hintsUsed: number
}

export interface PointVisit {
  dwellMs: number
  listenMs: number
  visits: number
  firstOrder: number
}

export interface Telemetry {
  visits: Record<string, PointVisit>
  order: string[]
  headChanges: number
  headUse: Record<StethHead, number>
  replayCount: number
}

/** suspend data (§27) — kompakt serileştirme */
export interface SuspendPayload {
  v: number
  mode: Mode
  caseIndex: number
  step: number
  answers: Record<string, string[]>
  hintsUsed: number
  caseResults: CaseResult[]
  tutorialDone: boolean
  visits: Record<string, PointVisit>
  order: string[]
  attempts: number
  /** oturum örneklemi (rastgele 10 vaka) — devam eden oturumda aynı kalır */
  sessionIds: string[]
  sessionSeed: number
}

/* ---------- internal analytics bus events (§28) ---------- */
export type SimEvent =
  | { type: 'simulation_started'; at: number }
  | { type: 'case_started'; caseId: string; mode: Mode; at: number }
  | { type: 'view_changed'; view: PatientView; at: number }
  | { type: 'point_visited'; pointId: string; at: number; dwellMs: number }
  | { type: 'auscultation_started'; pointId: string; at: number }
  | { type: 'auscultation_stopped'; pointId: string; listenMs: number; at: number }
  | { type: 'filter_changed'; head: StethHead; at: number }
  | { type: 'sound_replayed'; pointId: string; at: number }
  | { type: 'answer_selected'; qid: string; at: number }
  | { type: 'answer_submitted'; qid: string; correct: boolean; at: number }
  | { type: 'hint_used'; caseId: string; at: number }
  | { type: 'case_completed'; caseId: string; mode: Mode; at: number }
  | { type: 'assessment_completed'; total: number; at: number }

export interface RuntimeFlags {
  dev: boolean
  scormAvailable: boolean
  scormVersion: '2004' | '1.2' | 'mock'
}
