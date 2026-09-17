import type { CaseDef, ImageRecord, ScoringWeights } from './types'
import { DEFAULT_WEIGHTS, EXPERT_SOURCES } from './types'

/** Vaka şeması doğrulaması (Ausculta §19, §36 karşılığı). Malformed vaka build'i keser. */

export interface ValidationIssue {
  caseId: string
  severity: 'error' | 'warning'
  message: string
}

const QUESTION_TYPES = new Set([
  'single_choice', 'multi_choice', 'finding_identify', 'localization', 'film_quality', 'interpretation', 'diagnosis', 'sequence',
])
const DOMAINS = ['recognition', 'localization', 'quality', 'interpretation', 'diagnosis'] as const
const MODES = new Set(['learn', 'practice', 'assessment'])
const STATUSES = new Set(['validated', 'educational_mapping', 'experimental'])
const isExpert = (s: string | undefined) => !!s && (EXPERT_SOURCES as readonly string[]).includes(s)

export function validateCase(
  c: CaseDef,
  zoneIds: string[],
  getImage: (id: string) => ImageRecord | undefined,
  findingIds: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const id = c.id ?? '<no-id>'
  const err = (message: string) => issues.push({ caseId: id, severity: 'error', message })
  const warn = (message: string) => issues.push({ caseId: id, severity: 'warning', message })

  if (!c.id || !/^[a-z0-9_]+$/.test(c.id)) err('Geçersiz vaka id')
  if (!c.title) err('Başlık yok')
  if (!Array.isArray(c.modes) || c.modes.length === 0) err('modes boş olamaz')
  for (const m of c.modes ?? []) if (!MODES.has(m)) err(`Geçersiz mod: ${m}`)
  if (!STATUSES.has(c.mappingValidation)) err(`Geçersiz mappingValidation: ${c.mappingValidation}`)
  if (!findingIds.has(c.primaryFinding)) err(`Bilinmeyen bulgu: ${c.primaryFinding}`)

  const img = getImage(c.imageId)
  if (!img) err(`Görüntü kaydı yok: ${c.imageId}`)
  const inAssessment = (c.modes ?? []).includes('assessment')

  // değerlendirme kuralı: ana bulgu uzman kaynaklı olmalı (NLP etiketi ölçme aracı olamaz)
  if (img && inAssessment) {
    if (!isExpert(img.findings[c.primaryFinding]))
      err(`Değerlendirme vakasının ana bulgusu (${c.primaryFinding}) uzman kaynaklı değil`)
    if (img.validationStatus !== 'validated') err('Değerlendirme vakasının görüntü dosyası eksik')
    if (img.population !== 'yetiskin') err('Mezuniyet öncesi değerlendirme havuzu yalnız yetişkin filmlerini içerir')
  }

  const seenQ = new Set<string>()
  for (const q of c.questions ?? []) {
    if (!QUESTION_TYPES.has(q.type)) err(`Soru ${q.id}: geçersiz tip ${q.type}`)
    if (!(DOMAINS as readonly string[]).includes(q.domain)) err(`Soru ${q.id}: geçersiz domain ${q.domain}`)
    if (seenQ.has(q.id)) err(`Soru id tekrar: ${q.id}`)
    seenQ.add(q.id)
    if (q.type === 'localization') {
      if (!q.targetFinding) err(`Soru ${q.id}: lokalizasyon hedefi yok`)
      else if (img && !img.annotations.some((a) => a.finding === q.targetFinding && isExpert(a.source)))
        err(`Soru ${q.id}: görüntüde '${q.targetFinding}' için uzman kutusu yok — işaret puanlanamaz`)
      if (q.domain !== 'localization') warn(`Soru ${q.id}: lokalizasyon sorusu localization alanında olmalı`)
      continue
    }
    if (!q.correct?.length) err(`Soru ${q.id}: doğru yanıt yok`)
    const optIds = new Set((q.options ?? []).map((o) => o.id))
    for (const cid of q.correct ?? []) if (!optIds.has(cid)) err(`Soru ${q.id}: doğru yanıt ${cid} seçeneklerde yok`)
    if (q.type !== 'multi_choice' && (q.correct?.length ?? 0) > 1) warn(`Soru ${q.id}: tek seçim sorusunda birden fazla doğru yanıt`)
    if ((q.options ?? []).length < 2) err(`Soru ${q.id}: en az iki seçenek gerekir`)
  }
  if (!c.questions?.length) err('Soru yok')

  // tanı eşleme kuralı
  if ((c.questions ?? []).some((q) => q.domain === 'diagnosis')) {
    if (!c.clinicalDiagnosis) err('Tanı sorusu var ama clinicalDiagnosis tanımlı değil')
    if (c.mappingValidation !== 'validated') err('Doğrulanmamış tanı eşlemesi tanı sorusu üretemez')
  }

  for (const z of c.technique?.requiredZones ?? []) if (!zoneIds.includes(z)) err(`Bilinmeyen okuma bölgesi: ${z}`)

  const w: ScoringWeights = { ...DEFAULT_WEIGHTS, ...(c.scoringWeights ?? {}) }
  const total = Object.values(w).reduce((s, v) => s + v, 0)
  if (total !== 100) warn(`Skor ağırlıkları toplamı ${total} ≠ 100`)
  const present = new Set((c.questions ?? []).map((q) => q.domain))
  for (const d of DOMAINS) if (w[d] > 0 && !present.has(d)) warn(`${d} ağırlığı ${w[d]} ama bu alanda soru yok (ulaşılamaz puan)`)

  if (c.mappingValidation === 'experimental' && inAssessment) err('Deneysel vaka değerlendirmeye giremez')
  return issues
}

export function filterAssessmentPool(cases: CaseDef[], allIssues: ValidationIssue[]): CaseDef[] {
  const fatal = new Set(allIssues.filter((i) => i.severity === 'error').map((i) => i.caseId))
  return cases.filter((c) => c.modes.includes('assessment') && c.mappingValidation === 'validated' && !fatal.has(c.id))
}
