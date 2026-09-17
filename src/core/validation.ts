import type { CaseDef, ScoringWeights } from './types'
import { DEFAULT_WEIGHTS } from './types'

/** Vaka şeması doğrulaması (§19, §36). Malformed vaka build sırasında reddedilir. */

export interface ValidationIssue {
  caseId: string
  severity: 'error' | 'warning'
  message: string
}

const QUESTION_TYPES = new Set([
  'single_choice', 'multi_choice', 'sound_identify', 'localization', 'bell_diaphragm', 'interpretation', 'diagnosis', 'sequence',
])
const DOMAINS = new Set(['recognition', 'localization', 'interpretation', 'diagnosis'])
const MODES = new Set(['learn', 'practice', 'assessment'])
const STATUSES = new Set(['validated', 'educational_mapping', 'experimental'])

export function validateCase(c: CaseDef, pointIds: string[], soundKeys: Set<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const id = c.id ?? '<no-id>'

  if (!c.id || !/^[a-z0-9_]+$/.test(c.id)) issues.push({ caseId: id, severity: 'error', message: 'Geçersiz vaka id' })
  if (!c.title) issues.push({ caseId: id, severity: 'error', message: 'Başlık yok' })
  if (!Array.isArray(c.modes) || c.modes.length === 0)
    issues.push({ caseId: id, severity: 'error', message: 'modes boş olamaz' })
  for (const m of c.modes ?? [])
    if (!MODES.has(m)) issues.push({ caseId: id, severity: 'error', message: `Geçersiz mod: ${m}` })
  if (!STATUSES.has(c.mappingValidation))
    issues.push({ caseId: id, severity: 'error', message: `Geçersiz mappingValidation: ${c.mappingValidation}` })

  // sorular
  const seenQ = new Set<string>()
  for (const q of c.questions ?? []) {
    if (!QUESTION_TYPES.has(q.type))
      issues.push({ caseId: id, severity: 'error', message: `Soru ${q.id}: geçersiz tip ${q.type}` })
    if (!DOMAINS.has(q.domain))
      issues.push({ caseId: id, severity: 'error', message: `Soru ${q.id}: geçersiz domain ${q.domain}` })
    if (!q.correct?.length)
      issues.push({ caseId: id, severity: 'error', message: `Soru ${q.id}: doğru yanıt yok` })
    const optIds = new Set((q.options ?? []).map((o) => o.id))
    for (const cid of q.correct ?? [])
      if (!optIds.has(cid)) issues.push({ caseId: id, severity: 'error', message: `Soru ${q.id}: doğru yanıt ${cid} seçeneklerde yok` })
    if (q.type !== 'multi_choice' && (q.correct?.length ?? 0) > 1)
      issues.push({ caseId: id, severity: 'warning', message: `Soru ${q.id}: tek seçim sorusunda birden fazla doğru yanıt` })
    if (seenQ.has(q.id)) issues.push({ caseId: id, severity: 'error', message: `Soru id tekrar: ${q.id}` })
    seenQ.add(q.id)
  }
  if (!c.questions?.length) issues.push({ caseId: id, severity: 'error', message: 'Soru yok' })

  // tanı eşleme kuralı (§6, §19)
  const hasDiagnosisQ = (c.questions ?? []).some((q) => q.domain === 'diagnosis')
  if (hasDiagnosisQ) {
    if (!c.clinicalDiagnosis)
      issues.push({ caseId: id, severity: 'error', message: 'Tanı sorusu var ama clinicalDiagnosis tanımlı değil' })
    if (c.mappingValidation !== 'validated')
      issues.push({ caseId: id, severity: 'error', message: 'Doğrulanmamış tanı eşlemesi değerlendirme sorusu üretemez' })
  }

  // atamalar: nokta + ses anahtarı var mı
  for (const a of c.soundAssignments ?? []) {
    const key = `${a.category}.${a.acousticFinding}`
    if (!soundKeys.has(key))
      issues.push({ caseId: id, severity: 'warning', message: `Bilinmeyen ses anahtarı: ${key} (eksik kayıt olabilir)` })
  }
  for (const p of c.technique?.requiredPoints ?? [])
    if (!pointIdsHas(pointIds, p))
      issues.push({ caseId: id, severity: 'error', message: `Bilinmeyen oskültasyon noktası: ${p}` })

  // ağırlık toplamı
  const w: ScoringWeights = { ...DEFAULT_WEIGHTS, ...(c.scoringWeights ?? {}) }
  const total = Object.values(w).reduce((s, v) => s + v, 0)
  if (total !== 100) issues.push({ caseId: id, severity: 'warning', message: `Skor ağırlıkları toplamı ${total} ≠ 100` })

  // ulaşılamayan ağırlık (K2): domain ağırlığı > 0 ama o alanda soru yoksa uyarı
  const presentDomains = new Set((c.questions ?? []).map((q) => q.domain))
  for (const domain of DOMAINS) {
    const weight = w[domain as keyof ScoringWeights]
    if (weight > 0 && !presentDomains.has(domain as never))
      issues.push({ caseId: id, severity: 'warning', message: `${domain} ağırlığı ${weight} ama bu alanda soru yok (ulaşılamaz puan)` })
  }

  // deneysel içerik değerlendirmeye giremez
  if (c.mappingValidation === 'experimental' && c.modes.includes('assessment'))
    issues.push({ caseId: id, severity: 'error', message: 'Deneysel vaka değerlendirmeye giremez' })

  return issues
}

function pointIdsHas(ids: string[], p: string): boolean {
  return ids.includes(p)
}

export function filterAssessmentPool(cases: CaseDef[], allIssues: ValidationIssue[]): CaseDef[] {
  const fatalIds = new Set(allIssues.filter((i) => i.severity === 'error').map((i) => i.caseId))
  return cases.filter((c) => c.modes.includes('assessment') && c.mappingValidation === 'validated' && !fatalIds.has(c.id))
}
