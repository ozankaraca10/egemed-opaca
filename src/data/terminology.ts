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
  interpretation?: InterpretationTemplate
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
}

export const VIEW_TEXT: Record<string, string> = {
  PA: 'PA (arka-ön)',
  AP: 'AP (ön-arka)',
  LAT: 'Lateral',
  unknown: 'Bilinmiyor',
}
