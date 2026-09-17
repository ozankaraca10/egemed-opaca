import libraryData from './library.json'
import sourcesData from './sources.json'
import pointsData from './auscultation-points.json'
import { ALL_CASES, poolFor } from './pool'
import { RECORDS, EXTERNAL_RECORDS } from '../core/resolver'

/** Envanter zenginliği metrikleri — landing sayfasında gösterilir (tamamen veri odaklı). */

export interface InventoryMetrics {
  datasets: number
  datasetsVerified: number
  datasetsPediatric: number
  bundledRecordings: number
  externalRecordings: number
  soundClasses: number
  auscultationPoints: number
  totalCases: number
  practicePoolSize: number
  assessmentPoolSize: number
  assessmentQuestions: number
  pediatricCases: number
  mixedCases: number
}

export function computeMetrics(): InventoryMetrics {
  const inv = (sourcesData as unknown as { inventory: { population: string; title: string; notes: string; licenseVerified: boolean; status: string }[] }).inventory ?? []
  const libraryCount = libraryData.groups.reduce((s, g) => s + g.items.length, 0)
  const assessmentPool = poolFor('assessment')
  const practicePool = poolFor('practice')
  const bundled = RECORDS.filter((r) => r.sourceDataset === 'hls-cmds-v3').length
  return {
    datasets: inv.length,
    datasetsVerified: inv.filter((x) => x.licenseVerified).length,
    datasetsPediatric: inv.filter((x) => /pediatrik|pediatric|çocuk|fetal/i.test(`${x.population} ${x.title} ${x.notes}`)).length,
    bundledRecordings: bundled,
    externalRecordings: EXTERNAL_RECORDS.length,
    soundClasses: libraryCount,
    auscultationPoints: (pointsData.points as unknown[]).length,
    totalCases: ALL_CASES.length,
    practicePoolSize: practicePool.length,
    assessmentPoolSize: assessmentPool.length,
    assessmentQuestions: assessmentPool.reduce((s, c) => s + c.questions.length, 0),
    pediatricCases: ALL_CASES.filter((c) => (c as { population?: string }).population === 'pediatrik').length,
    mixedCases: ALL_CASES.filter((c) => c.primaryAcousticFinding.includes('+')).length,
  }
}
