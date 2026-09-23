import imagesData from '../data/images.json'
import type { ImageRecord, ImagesManifest } from './types'
import { EXPERT_SOURCES } from './types'

/** Görüntü kaydı çözümleyici (Ausculta resolver.ts karşılığı). */

const manifest = imagesData as unknown as ImagesManifest
export const IMAGES: ImageRecord[] = manifest.records ?? []
const byId = new Map(IMAGES.map((r) => [r.id, r]))

export function getImage(id: string | null | undefined): ImageRecord | undefined {
  return id ? byId.get(id) : undefined
}

export function isExpertSource(s: string | undefined): boolean {
  return !!s && (EXPERT_SOURCES as readonly string[]).includes(s)
}

/** Bulgunun bu görüntüde uzman kaynaklı olarak pozitif olup olmadığı. */
export function expertPositive(img: ImageRecord | undefined, finding: string): boolean {
  return !!img && isExpertSource(img.findings[finding])
}

/** Öğrenme modu örnekleri: önce uzman kaynaklı ve kutulu, sonra uzman kaynaklı, en son NLP/yazar açıklaması.
 *  `includePediatric`: pediatrik konular (krup, yabancı cisim, epiglottit) için pediatrik filmler de gösterilir —
 *  yalnız öğrenme kütüphanesi içindir, uygulama/değerlendirme vaka havuzunu etkilemez.
 *  `modality`: Toraks BT'ye giriş grubu (finding: null) yalnız BT görüntülerini göstermek için kullanır;
 *  aksi halde finding: null tüm havuzu döndürür (ör. teknik/ABCDE konuları için istenen davranış budur). */
export function examplesFor(finding: string | null, view?: string, opts?: { includePediatric?: boolean; modality?: string }): ImageRecord[] {
  const pool = IMAGES.filter((r) => r.validationStatus === 'validated' && (r.population === 'yetiskin' || opts?.includePediatric))
  const scoped = finding ? pool.filter((r) => r.findings[finding]) : pool
  // Varsayılan yöntem grafi (XR): BT yığınları yalnız 'Toraks BT' grubunda, açıkça modality: 'CT' istenince gelir.
  const modScoped = scoped.filter((r) => (r.modality ?? 'XR') === (opts?.modality ?? 'XR'))
  const viewScoped = view ? modScoped.filter((r) => r.viewPosition === view) : modScoped
  const rank = (r: ImageRecord) => {
    if (!finding) return 0
    const src = r.findings[finding]
    const hasBox = r.annotations.some((a) => a.finding === finding)
    if (isExpertSource(src) && hasBox) return 0
    if (isExpertSource(src)) return 1
    return 2
  }
  return [...viewScoped].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
}

export function datasetCounts(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of IMAGES) out[r.sourceDataset] = (out[r.sourceDataset] ?? 0) + 1
  return out
}
