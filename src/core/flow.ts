import type { Mode, ZoneVisit } from './types'

/** Saf akış fonksiyonları — DOM/React'a bağımlı değildir, testlerle doğrulanır. */

export type SubmitAction = 'submit' | 'advance' | 'finish' | 'submit-then-advance' | 'submit-then-finish'

/** Uygulamada submit sonrası ilerleme yok (geri bildirim okunur); değerlendirmede submit hemen ilerler. */
export function nextActionForSubmit(mode: Mode, revealed: boolean, isLastQuestion: boolean): SubmitAction {
  if (mode === 'practice') {
    if (!revealed) return 'submit'
    return isLastQuestion ? 'finish' : 'advance'
  }
  return isLastQuestion ? 'submit-then-finish' : 'submit-then-advance'
}

export type ZoneChipVisualState = 'active' | 'inspected' | 'default'

/** Okuma bölgesi çipi: imleç üstünde (active), eşik süresince incelenmiş (inspected), varsayılan. */
export function zoneChipState(
  zoneId: string,
  activeZones: string[],
  visits: Record<string, Pick<ZoneVisit, 'dwellMs'> | undefined>,
  minDwellMs: number
): ZoneChipVisualState {
  if (activeZones.includes(zoneId)) return 'active'
  if ((visits[zoneId]?.dwellMs ?? 0) >= minDwellMs) return 'inspected'
  return 'default'
}

/** ABCDE adımı başına incelenmiş bölge oranı (sistematik okuma göstergesi). */
export function stepProgress(
  zones: { id: string; step: string }[],
  visits: Record<string, Pick<ZoneVisit, 'dwellMs'> | undefined>,
  minDwellMs: number
): Record<string, { done: number; total: number }> {
  const out: Record<string, { done: number; total: number }> = {}
  for (const z of zones) {
    const cur = out[z.step] ?? { done: 0, total: 0 }
    cur.total++
    if ((visits[z.id]?.dwellMs ?? 0) >= minDwellMs) cur.done++
    out[z.step] = cur
  }
  return out
}

/** Yanlış yanıtlanan ilk vakanın öğrenme kütüphanesi anahtarı. */
export function firstWeakLibraryKey(
  results: { caseId: string; answers: { correct: boolean }[] }[],
  resolveLibraryKey: (caseId: string) => string | null
): string | null {
  for (const r of results) {
    if (r.answers.some((a) => !a.correct)) {
      const key = resolveLibraryKey(r.caseId)
      if (key) return key
    }
  }
  return null
}

export function weakDomainKeys<K extends string>(
  domains: Record<K, { earned: number; max: number }> | null | undefined,
  thresholdPct = 60
): K[] {
  if (!domains) return []
  return (Object.keys(domains) as K[]).filter((k) => {
    const v = domains[k]
    return v && v.max > 0 && (v.earned / v.max) * 100 < thresholdPct
  })
}

/** İnteraktif öğretici: [yakınlaştır, pencere/kontrast değiştir, görüntü üzerine işaret koy] */
export type TutorialEvent = 'zoom' | 'window' | 'mark'

export interface TutorialProgress {
  steps: [boolean, boolean, boolean]
  currentStep: number
  allDone: boolean
}

export function tutorialProgress(events: readonly TutorialEvent[]): TutorialProgress {
  const steps: [boolean, boolean, boolean] = [events.includes('zoom'), events.includes('window'), events.includes('mark')]
  const firstUndone = steps.findIndex((s) => !s)
  const allDone = firstUndone === -1
  return { steps, currentStep: allDone ? 3 : firstUndone, allDone }
}

/** Değerlendirmede vaka süresi doldu mu? */
export function isTimedOut(elapsedMs: number, limitSec: number | undefined): boolean {
  return !!limitSec && limitSec > 0 && elapsedMs >= limitSec * 1000
}

export function remainingSec(elapsedMs: number, limitSec: number | undefined): number | null {
  if (!limitSec) return null
  return Math.max(0, Math.ceil(limitSec - elapsedMs / 1000))
}
