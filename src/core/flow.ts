import type { Mode, PatientView, PointVisit } from './types'

/** Madde 1: uygulama (practice) modunda submit sonrası advance ÇAĞRILMAZ — kullanıcı
 *  geri bildirimi okuyup "Devam Et"/"Vakayı tamamla"ya basmalı. Değerlendirmede (assessment)
 *  geri bildirim yoktur; submit hemen ilerler. Saf fonksiyon: SimulationScreen'in primaryAction'ı
 *  bu karara göre hangi dispatch'leri yapacağına karar verir (bkz. tests/core.test.ts). */
export type SubmitAction = 'submit' | 'advance' | 'finish' | 'submit-then-advance' | 'submit-then-finish'

/**
 * @param mode aktif mod
 * @param revealed tıklamadan ÖNCEKİ reveal durumu (submitAnswer henüz çalışmadıysa false)
 * @param isLastQuestion tıklanan sorunun vakadaki son soru olup olmadığı
 */
export function nextActionForSubmit(mode: Mode, revealed: boolean, isLastQuestion: boolean): SubmitAction {
  if (mode === 'practice') {
    if (!revealed) return 'submit' // ilk tık: yanıtı gönder + geri bildirimi göster, İLERLEME YOK
    return isLastQuestion ? 'finish' : 'advance' // ikinci tık ("Devam Et"/"Vakayı tamamla")
  }
  // assessment: geri bildirim yok — submit hemen ilerler
  return isLastQuestion ? 'submit-then-finish' : 'submit-then-advance'
}

/* ---------------- Bölge chip'leri (madde 1, wave 2) ----------------
 * "Bölge listesi" artık gerçek bir gezinme ögesi: aktif nokta (stetoskop üstünde),
 * bu oturumda en az bir kez dinlenmiş nokta ve varsayılan durum ayrı stillerle
 * gösterilir. Saf fonksiyonlar — DOM/React'a bağımlı değildir, testlerle doğrulanır. */
export type RegionChipVisualState = 'active' | 'listened' | 'default'

export function regionChipState(
  pointId: string,
  activePointId: string | null,
  visits: Record<string, Pick<PointVisit, 'listenMs'> | undefined>
): RegionChipVisualState {
  if (pointId === activePointId) return 'active'
  if ((visits[pointId]?.listenMs ?? 0) > 0) return 'listened'
  return 'default'
}

/** Aktif görünümde olmayan (öbür görünümdeki) ve bu oturumda hiç dinlenmemiş nokta sayısı. */
export function countUnlistenedInOtherView(
  points: { id: string; view: PatientView }[],
  pointIds: string[] | undefined,
  currentView: PatientView,
  visits: Record<string, Pick<PointVisit, 'listenMs'> | undefined>
): number {
  return points.filter(
    (p) => p.view !== currentView && (!pointIds || pointIds.includes(p.id)) && (visits[p.id]?.listenMs ?? 0) <= 0
  ).length
}

/** "Arka görünümde 3 bölge daha" gibi soluk ipucu metni — sayı 0 ise gösterilmez. */
export function otherViewHintText(currentView: PatientView, unlistenedCount: number): string | null {
  if (unlistenedCount <= 0) return null
  const otherLabel = currentView === 'front' ? 'Arka' : 'Ön'
  return `${otherLabel} görünümde ${unlistenedCount} bölge daha`
}

/* ---------------- Zayıf alan → Öğrenme odağı (madde 5, wave 2) ---------------- */

/** Vaka sonucundan öğrenme kütüphanesi anahtarını bulur: önce vakanın kendi
 *  libraryKey'i, yoksa (kategori + akustik bulgu) eşleşmesiyle library.json içinden. */
export function libraryKeyForCase(
  caseDef: { libraryKey?: string; primaryAcousticFinding: string; soundAssignments: { category: string }[] } | undefined,
  libraryItems: { key: string; category: string; acousticFinding: string }[]
): string | null {
  if (!caseDef) return null
  if (caseDef.libraryKey) return caseDef.libraryKey
  const category = caseDef.soundAssignments[0]?.category
  const found = libraryItems.find((it) => it.category === category && it.acousticFinding === caseDef.primaryAcousticFinding)
  return found?.key ?? null
}

/** Yanlış yanıtlanan ilk vakanın öğrenme kütüphanesi anahtarını döndürür (oturum sırasına göre);
 *  hiç yanlış yoksa veya eşleşen kütüphane kalemi yoksa null. `resolveLibraryKey` bağımlılık
 *  enjeksiyonudur (test edilebilirlik için) — gerçek kullanımda libraryKeyForCase ile beslenir. */
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

/** %60 eşiğinin altında kalan (ve o vakalarda hiç sorulmamış olmayan, max>0) alan anahtarları. */
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

/* ---------------- İnteraktif öğretici (madde 5, wave 3) ----------------
 * TutorialScreen artık gerçek PatientStage'i kullanır; 3 rehberli adım gerçek kullanıcı
 * etkileşimleriyle tamamlanır. Saf adım-makinesi — DOM/React'a bağımlı değildir, olay
 * listesinden ilerlemeyi hesaplar (sıra bağımsız: alternatif giriş yöntemleri — örn.
 * klavye ile doğrudan yerleştirme — de ilgili adımı tamamlar). */
export type TutorialEvent = 'drag' | 'snap' | 'head'

export interface TutorialProgress {
  /** [stetoskobu sürükle, odağa bırak, bell/diyafram değiştir] */
  steps: [boolean, boolean, boolean]
  /** ilk tamamlanmamış adımın indeksi (0-2); hepsi bittiyse 3 */
  currentStep: number
  allDone: boolean
}

export function tutorialProgress(events: readonly TutorialEvent[]): TutorialProgress {
  const steps: [boolean, boolean, boolean] = [
    events.includes('drag'),
    events.includes('snap'),
    events.includes('head'),
  ]
  const firstUndone = steps.findIndex((s) => !s)
  const allDone = firstUndone === -1
  return { steps, currentStep: allDone ? 3 : firstUndone, allDone }
}
