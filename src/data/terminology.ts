import findingsData from './findings.json'
import libraryData from './library.json'

/** Bulgu ve kütüphane terminolojisi — tek kaynak: findings.json ve library.json. */

export interface FindingDef {
  label: string
  short: string
  group: string
  teaching: boolean
}

export const FINDINGS = findingsData.findings as Record<string, FindingDef>

export function findingLabel(id: string | null | undefined): string {
  if (!id) return '—'
  return FINDINGS[id]?.label ?? id
}

export function findingShort(id: string | null | undefined): string {
  if (!id) return '—'
  return FINDINGS[id]?.short ?? id
}

export interface InterpretationTemplate {
  prompt: string
  options: { id: string; label: string }[]
  correct: string[]
  feedbackCorrect: string
  feedbackIncorrect: string
  hint?: string
}

export interface UcepMapping {
  /** UÇEP-2020 çekirdek hastalık/konu adı */
  disease: string
  /** Önerilen öğrenim düzeyi: Ö (önemseme/farkındalık), T (tanı koyar), TT (tanı koyar ve tedavi planlar), A (acil tanır ve yönlendirir), İ (izlem) */
  level: 'Ö' | 'T' | 'TT' | 'A' | 'İ'
  /** UÇEP eşlemesi hekim onayı bekleyen bir öneridir, onaylanmış müfredat kararı değildir */
  status: 'öneri' | 'onaylı'
}

export interface LibraryItem {
  key: string
  finding: string | null
  title: string
  short: string
  sub: string
  description: string
  sign: string
  readingTip: string
  clinical: string
  bestZones: string[]
  badge: string
  /** V2: tekil şablon yerine VARYANT DİZİSİ (en az 3) — generate-cases.mjs vaka id'sinden türeyen
   *  deterministik bir round-robin ile her vakaya bir varyant atar (aynı bulgudaki ardışık vakalar
   *  farklı varyant alır, soru tekrarını azaltır). */
  interpretation?: InterpretationTemplate[]
  /** "Bir sonraki tetkik" bilgi sorusu — mevcut interpretation altyapısını kullanır, ayrı bir soru
   *  olarak eklenir. V2: bu da varyant dizisidir. */
  nextStepQuestion?: InterpretationTemplate[]
  /** Sık kaçırılan / yanlış yorumlanan noktalar (öğretim amaçlı) */
  pitfalls?: string[]
  /** Klinik olarak önerilen bir sonraki adım (serbest metin, ör. "PE → BTPA") */
  nextStep?: string
  ucep?: UcepMapping
  group: string
}

export interface LibraryGroup {
  id: string
  title: string
  items: LibraryItem[]
}

export const LIBRARY_GROUPS: LibraryGroup[] = (libraryData.groups as unknown as LibraryGroup[]).map((g) => ({
  ...g,
  items: g.items.map((it) => ({ ...it, group: g.id })),
}))

export const LIBRARY_ITEMS: LibraryItem[] = LIBRARY_GROUPS.flatMap((g) => g.items)

export function libraryItem(key: string | null | undefined): LibraryItem | undefined {
  return LIBRARY_ITEMS.find((it) => it.key === key)
}

export function libraryKeyForFinding(finding: string): string | null {
  return LIBRARY_ITEMS.find((it) => it.finding === finding)?.key ?? null
}

export const LABEL_SOURCE_TEXT: Record<string, string> = {
  expert_panel: 'Radyolog paneli',
  expert_bbox: 'Radyolog işaretlemesi',
  expert_mask: 'Radyolog maskesi',
  expert_reading: 'Radyolog okuması',
  ct_confirmed: 'BT ile doğrulanmış',
  report_nlp: 'Rapor metninden otomatik (doğrulanmamış)',
  author_caption: 'Yükleyen açıklaması (doğrulanmamış)',
}

export const VIEW_TEXT: Record<string, string> = {
  PA: 'PA (arka-ön)',
  AP: 'AP (ön-arka)',
  LAT: 'Lateral',
  NECK_AP: 'Boyun — AP',
  CT_AXIAL: 'BT — aksiyel kesit',
  unknown: 'Bilinmiyor',
}
