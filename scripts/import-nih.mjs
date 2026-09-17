#!/usr/bin/env node
/**
 * NIH ChestX-ray14 içe aktarıcı.
 *
 *   npm run import:nih -- <nih-klasörü> [--google four_findings.csv ...] [--cap 40] [--include-nlp] [--replace]
 *
 * Klasörde aranan dosyalar (alt klasörler dahil):
 *   Data_Entry_2017*.csv(.gz)   — hasta yaşı/cinsiyeti, projeksiyon, rapor tabanlı (NLP) etiketler
 *   BBox_List_2017.csv(.gz)     — radyolog tarafından çizilmiş kutular (1024×1024 uzayında)
 *   images_001 … images_012 klasörlerindeki PNG görüntüler
 * --google: Google Health panel etiketleri (Image Index + Fracture/Pneumothorax/Airspace opacity/Nodule or mass: YES/NO)
 *
 * Seçim kuralı: yalnız radyolog bilgisi olan görüntüler (kutu ya da panel) alınır. --include-nlp ile
 * yalnız rapor etiketli görüntüler de eklenir; bunlar yalnız uygulama/öğrenme içindir, değerlendirmeye girmez.
 * Bulgu başına en fazla --cap görüntü alınır (paket boyutu).
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { csvObjects } from './lib/csv.mjs'
import {
  REPORTS_DIR, FINDINGS_DATA, readTextAny, indexFiles, parseArgs, list, writeRuntimeImage, normBox, safeId,
  setFinding, setNegative, emptyRecord, populationFor, mergeImages, capPerFinding, summarize,
} from './lib/cxr-common.mjs'

const DATASET = 'nih-cxr14'
const { pos, opts } = parseArgs(process.argv.slice(2))
const dir = pos[0]
if (!dir || !fs.existsSync(dir)) {
  console.error('Kullanım: npm run import:nih -- <nih-klasörü> [--google <csv>] [--cap 40] [--include-nlp] [--replace]')
  process.exit(1)
}
const cap = Number(opts.cap ?? 40)
const includeNlp = !!opts['include-nlp']

const csvs = indexFiles(dir, /\.(csv|csv\.gz|zip)$/i)
const pick = (explicit, re) => (explicit ? String(explicit) : [...csvs.entries()].find(([n]) => re.test(n))?.[1])
const dataEntryPath = pick(opts['data-entry'], /^Data_Entry_2017.*\.csv(\.gz)?$/i)
const bboxPath = pick(opts.bbox, /^BBox_List_2017\.csv(\.gz)?$/i)
if (!dataEntryPath) {
  console.error('Data_Entry_2017*.csv bulunamadı (--data-entry ile verin).')
  process.exit(1)
}

const labelMap = FINDINGS_DATA.nihLabelMap
const googleCols = FINDINGS_DATA.googleFourFindingsColumns
const report = { dataset: DATASET, dataEntry: dataEntryPath, bbox: bboxPath ?? null, google: list(opts.google), warnings: [] }

/* 1) meta veri + NLP etiketleri */
const meta = new Map()
{
  const { records } = csvObjects(await readTextAny(dataEntryPath))
  for (const r of records) {
    const file = r['Image Index']
    if (!file) continue
    const ageRaw = String(r['Patient Age'] ?? '')
    const age = /^\d+$/.test(ageRaw) ? Number(ageRaw) : /^(\d{1,3})Y$/i.test(ageRaw) ? Number(ageRaw.slice(0, -1)) : null
    const labels = String(r['Finding Labels'] ?? '').split('|').map((s) => s.trim()).filter(Boolean)
    meta.set(file, {
      age: age != null && age > 0 && age < 110 ? age : null,
      sex: r['Patient Gender'] === 'F' ? 'F' : r['Patient Gender'] === 'M' ? 'M' : null,
      view: ['PA', 'AP'].includes(r['View Position']) ? r['View Position'] : 'unknown',
      labels,
    })
  }
}

/* 2) radyolog kutuları */
const boxes = new Map()
if (bboxPath) {
  const { records } = csvObjects(await readTextAny(bboxPath))
  for (const r of records) {
    const file = r['Image Index']
    const finding = labelMap[r['Finding Label']]
    // başlık "Bbox [x,y,w,h]" dört hücreye yayılır: konumla oku
    const cells = r._cells
    const [x, y, w, h] = cells.slice(2, 6).map(Number)
    if (!file || !finding || ![x, y, w, h].every(Number.isFinite)) {
      report.warnings.push(`BBox satırı atlandı: ${cells.join(',')}`)
      continue
    }
    if (!boxes.has(file)) boxes.set(file, [])
    boxes.get(file).push({ finding, x, y, w, h })
  }
}

/* 3) Google panel etiketleri */
const panel = new Map()
for (const g of list(opts.google)) {
  const { header, records } = csvObjects(await readTextAny(g))
  const cols = Object.keys(googleCols).filter((c) => header.includes(c))
  if (!header.includes('Image Index') || !cols.length) {
    report.warnings.push(`${g}: beklenen sütunlar yok (Image Index + ${Object.keys(googleCols).join('/')}); atlandı`)
    continue
  }
  for (const r of records) {
    const cur = panel.get(r['Image Index']) ?? {}
    for (const c of cols) {
      const v = String(r[c]).trim().toUpperCase()
      if (v === 'YES') cur[googleCols[c]] = true
      else if (v === 'NO') cur[googleCols[c]] = false
    }
    panel.set(r['Image Index'], cur)
  }
}

/* 4) aday kümesi */
const candidates = new Set([...boxes.keys(), ...panel.keys()])
if (includeNlp) for (const k of meta.keys()) candidates.add(k)
const pngs = indexFiles(opts.images ? String(opts.images) : dir, /\.png$/i)

const drafts = []
let missing = 0
for (const file of candidates) {
  const m = meta.get(file)
  if (!m) {
    report.warnings.push(`${file}: Data_Entry içinde yok`)
    continue
  }
  if (!pngs.has(file)) {
    missing++
    continue
  }
  const rec = emptyRecord(`nih_${safeId(file)}`, DATASET, file)
  rec.viewPosition = m.view
  rec.ageYears = m.age
  rec.sex = m.sex
  rec.population = populationFor(m.age)
  for (const l of m.labels) {
    const f = labelMap[l]
    if (f) setFinding(rec, f, 'report_nlp')
    else report.warnings.push(`${file}: bilinmeyen NIH etiketi ${l}`)
  }
  for (const [f, yes] of Object.entries(panel.get(file) ?? {})) {
    if (yes) setFinding(rec, f, 'expert_panel')
    else setNegative(rec, f, 'expert_panel')
  }
  rec._boxes = boxes.get(file) ?? []
  for (const b of rec._boxes) setFinding(rec, b.finding, 'expert_bbox')
  rec._path = pngs.get(file)
  drafts.push(rec)
}

const selected = capPerFinding(drafts, cap)
const out = []
for (const rec of selected) {
  const src = fs.readFileSync(rec._path)
  const md = await sharp(src).metadata()
  const img = await writeRuntimeImage(src, rec.id)
  Object.assign(rec, {
    width: img.width,
    height: img.height,
    originalWidth: img.sourceWidth,
    originalHeight: img.sourceHeight,
    runtimeUrl: img.runtimeUrl,
    bytes: img.bytes,
  })
  // NIH kutuları 1024×1024 PNG uzayındadır; kaynak PNG boyutu farklıysa ölçek o boyuta göre alınır
  const W = md.width
  const H = md.height
  const scale = W === 1024 ? 1 : W / 1024
  for (const b of rec._boxes) {
    rec.annotations.push({ finding: b.finding, source: 'expert_bbox', ...normBox(b.x * scale, b.y * scale, b.w * scale, b.h * scale, W, H) })
  }
  if (rec.population === 'pediatrik') rec.issues.push('pediatrik: mezuniyet öncesi değerlendirme havuzu dışında')
  delete rec._boxes
  delete rec._path
  out.push(rec)
}

if (opts['dry-run']) {
  console.log(`[dry-run] ${out.length} görüntü seçilecekti`)
} else {
  const merged = mergeImages(out, { dataset: DATASET, replace: !!opts.replace })
  console.log(`images.json: toplam ${merged.count} kayıt`)
}
report.selected = out.length
report.candidates = candidates.size
report.missingFiles = missing
report.byFinding = summarize(out)
fs.mkdirSync(REPORTS_DIR, { recursive: true })
fs.writeFileSync(path.join(REPORTS_DIR, 'import-nih.json'), JSON.stringify(report, null, 2))
console.log(`NIH: ${out.length} görüntü içe aktarıldı (aday ${candidates.size}, dosyası bulunmayan ${missing}, uyarı ${report.warnings.length})`)
console.log(report.byFinding)
