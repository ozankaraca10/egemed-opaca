#!/usr/bin/env node
/**
 * NIH ChestX-ray14 — Hugging Face aynasından UZAKTAN içe aktarım (indirmeden, HTTP Range ile).
 *
 *   npm run import:nih-remote [-- --limit 5 --dry-run --skip-index-cache]
 *
 * Kaynak: https://huggingface.co/datasets/alkzar90/NIH-Chest-X-ray-dataset (resolve/main/data/…)
 *   - Data_Entry_2017_v2020.csv  (hasta yaşı/cinsiyeti, ViewPosition, rapor tabanlı 14 etiket)
 *   - BBox_List_2017.csv         (radyolog kutuları — 8 bulgu sınıfı)
 *   - images/images_001.zip … images_012.zip (PNG'ler; ~2 GB'lık zip'ler, yalnız seçilen dosyalar
 *     merkezî dizin + Range ile çekilir, zip hiç indirilmez)
 *   - Google panel etiketleri (torchxrayvision aynası): google2019_nih-chest-xray-labels.csv.gz
 *
 * Seçim (OPACA-V2-ICERIK-PLANI.md §2):
 *   - BBox'lı 8 bulgudan her biri için en fazla 25 film (Pneumonia 40) — expert_bbox, teaching
 *     bulguya eşlenir (Infiltrate/Pneumonia → airspace_opacity; radyografik bulgu ≠ tanı ilkesi).
 *   - Google panelinde 4 kategorinin de "NO" olduğu VE NIH raporunun "No Finding" dediği 40 film → normal
 *     (expert_panel), 4 kategoriyle sınırlı olduğu issues alanına not düşülür.
 *   - Yalnız rapor (NLP) etiketli Emphysema 15, Hernia 10 — öğrenme/uygulama, değerlendirmeye girmez.
 *
 * 12 zip'in merkezî dizini bir kez okunup reports/nih-zip-index.json'a önbelleklenir (--skip-index-cache
 * ile yok sayılır / yeniden okunur).
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { csvObjects } from './lib/csv.mjs'
import { readCentralDirectory, fetchEntryData, pMap } from './lib/remote-zip.mjs'
import {
  REPORTS_DIR, parseArgs, writeRuntimeImage, normBox, safeId,
  setFinding, setNegative, emptyRecord, populationFor, mergeImages, summarize,
} from './lib/cxr-common.mjs'

const HF_BASE = 'https://huggingface.co/datasets/alkzar90/NIH-Chest-X-ray-dataset/resolve/main/data/'
const GOOGLE_URL = 'https://raw.githubusercontent.com/mlmed/torchxrayvision/master/torchxrayvision/data/google2019_nih-chest-xray-labels.csv.gz'
const ZIP_COUNT = 12
const DATASET = 'nih-cxr14'
const CONCURRENCY = 6

const { opts } = parseArgs(process.argv.slice(2))
const dryRun = !!opts['dry-run']
const limitOverride = opts.limit ? Number(opts.limit) : null
const cap = (n) => (limitOverride ? Math.min(n, limitOverride) : n)

// Radyografik bulgu ≠ tanı: BBox'taki Infiltrate/Pneumonia da "havalı alan opasitesi" olarak öğretilir.
const BBOX_LABEL_MAP = {
  Atelectasis: 'atelectasis', Cardiomegaly: 'cardiomegaly', Effusion: 'pleural_effusion',
  Infiltrate: 'airspace_opacity', Mass: 'nodule_mass', Nodule: 'nodule_mass',
  Pneumonia: 'airspace_opacity', Pneumothorax: 'pneumothorax',
}
const BBOX_CAPS = { Atelectasis: 25, Cardiomegaly: 25, Effusion: 25, Infiltrate: 25, Mass: 25, Nodule: 25, Pneumonia: 40, Pneumothorax: 25 }
const NORMAL_CAP = cap(40)
const NLP_CAPS = { Emphysema: cap(15), Hernia: cap(10) }

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.text()
}

console.log('NIH uzaktan içe aktarım: meta veriler indiriliyor…')
const [dataEntryCsv, bboxCsv, googleGz] = await Promise.all([
  fetchText(HF_BASE + 'Data_Entry_2017_v2020.csv'),
  fetchText(HF_BASE + 'BBox_List_2017.csv'),
  fetch(GOOGLE_URL).then((r) => r.arrayBuffer()),
])

/* 1) hasta/rapor meta verisi */
const meta = new Map()
for (const r of csvObjects(dataEntryCsv).records) {
  const file = r['Image Index']
  if (!file) continue
  const ageRaw = String(r['Patient Age'] ?? '')
  const age = /^\d+$/.test(ageRaw) ? Number(ageRaw) : /^(\d{1,3})Y$/i.test(ageRaw) ? Number(ageRaw.slice(0, -1)) : null
  meta.set(file, {
    age: age != null && age > 0 && age < 110 ? age : null,
    sex: r['Patient Gender'] === 'F' ? 'F' : r['Patient Gender'] === 'M' ? 'M' : null,
    view: ['PA', 'AP'].includes(r['View Position']) ? r['View Position'] : 'unknown',
    labels: String(r['Finding Labels'] ?? '').split('|').map((s) => s.trim()).filter(Boolean),
  })
}

/* 2) BBox — 8 bulgu sınıfı, sınıf başına ayrı kap */
const bboxByFile = new Map()
const bboxCounts = {}
for (const r of csvObjects(bboxCsv).records) {
  const file = r['Image Index']
  const label = r['Finding Label']
  const cells = r._cells
  const [x, y, w, h] = cells.slice(2, 6).map(Number)
  if (!file || !BBOX_LABEL_MAP[label] || ![x, y, w, h].every(Number.isFinite)) continue
  const capN = BBOX_CAPS[label] ?? 0
  bboxCounts[label] = bboxCounts[label] ?? 0
  if (bboxCounts[label] >= cap(capN)) continue
  bboxCounts[label]++
  if (!bboxByFile.has(file)) bboxByFile.set(file, [])
  bboxByFile.get(file).push({ label, finding: BBOX_LABEL_MAP[label], x, y, w, h })
}

/* 3) Google panel — 4 kategori (Fracture/Pneumothorax/Airspace opacity/Nodule or mass) */
const googleCsv = zlib.gunzipSync(Buffer.from(googleGz)).toString('utf8')
const { header: gHeader, records: gRecords } = csvObjects(googleCsv)
const GOOGLE_COLS = ['Fracture', 'Pneumothorax', 'Airspace opacity', 'Nodule or mass']
const GOOGLE_FINDING = { Fracture: 'fracture', Pneumothorax: 'pneumothorax', 'Airspace opacity': 'airspace_opacity', 'Nodule or mass': 'nodule_mass' }
const panelByFile = new Map()
const normalFiles = []
if (GOOGLE_COLS.every((c) => gHeader.includes(c))) {
  for (const r of gRecords) {
    const vals = GOOGLE_COLS.map((c) => String(r[c]).trim().toUpperCase())
    const cur = {}
    GOOGLE_COLS.forEach((c, i) => { if (vals[i] === 'YES') cur[GOOGLE_FINDING[c]] = true; else if (vals[i] === 'NO') cur[GOOGLE_FINDING[c]] = false })
    panelByFile.set(r['Image Index'], cur)
    // Panel yalnız 4 bulguyu değerlendirir; "normal" için raporun da "No Finding" demesi şart (efüzyon,
    // kardiyomegali vb. panel dışı bulgular aksi halde normal filme sızar).
    const reportClean = meta.get(r['Image Index'])?.labels.join('|') === 'No Finding'
    if (vals.every((v) => v === 'NO') && reportClean && normalFiles.length < NORMAL_CAP) normalFiles.push(r['Image Index'])
  }
} else {
  console.warn('uyarı: Google panel CSV beklenen sütunlara sahip değil, panel/normal seçimi atlanıyor')
}

/* 4) NLP-yalnız Emphysema / Hernia (değerlendirme dışı, öğrenme/uygulama) */
const nlpByFile = new Map()
const nlpCounts = { Emphysema: 0, Hernia: 0 }
for (const [file, m] of meta) {
  if (bboxByFile.has(file) || panelByFile.has(file)) continue
  for (const label of ['Emphysema', 'Hernia']) {
    if (m.labels.includes(label) && nlpCounts[label] < NLP_CAPS[label]) {
      nlpCounts[label]++
      nlpByFile.set(file, label)
    }
  }
}

const candidateFiles = new Set([...bboxByFile.keys(), ...normalFiles, ...nlpByFile.keys()])
console.log(`Aday film sayısı: ${candidateFiles.size} (bbox ${bboxByFile.size}, panel-normal ${normalFiles.length}, NLP ${nlpByFile.size})`)

if (dryRun) {
  console.log('[dry-run] zip erişimi atlandı.')
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  fs.writeFileSync(path.join(REPORTS_DIR, 'import-nih-remote.json'), JSON.stringify({ dryRun: true, candidateFiles: candidateFiles.size, bboxCounts, nlpCounts, normalSelected: normalFiles.length }, null, 2))
  process.exit(0)
}

/* 5) 12 zip'in merkezî dizinini oku (önbellekli) */
const indexPath = path.join(REPORTS_DIR, 'nih-zip-index.json')
fs.mkdirSync(REPORTS_DIR, { recursive: true })
let zipIndex
if (fs.existsSync(indexPath) && !opts['skip-index-cache']) {
  console.log('Zip dizini önbellekten okunuyor:', indexPath)
  zipIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
} else {
  zipIndex = { zips: [] }
  for (let i = 1; i <= ZIP_COUNT; i++) {
    const zipUrl = `${HF_BASE}images/images_${String(i).padStart(3, '0')}.zip`
    process.stdout.write(`  merkezî dizin okunuyor: images_${String(i).padStart(3, '0')}.zip … `)
    const t0 = Date.now()
    const { entries, totalSize } = await readCentralDirectory(zipUrl)
    const pngs = entries.filter((e) => !e.isDir && /\.png$/i.test(e.name))
    console.log(`${pngs.length} PNG, ${(totalSize / 1e9).toFixed(2)} GB, ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    zipIndex.zips.push({ url: zipUrl, totalSize, entries: pngs.map((e) => ({ name: path.basename(e.name), method: e.method, compressedSize: e.compressedSize, uncompressedSize: e.uncompressedSize, localHeaderOffset: e.localHeaderOffset })) })
  }
  fs.writeFileSync(indexPath, JSON.stringify(zipIndex, null, 1))
}

const fileToZip = new Map()
for (const z of zipIndex.zips) for (const e of z.entries) fileToZip.set(e.name, { url: z.url, entry: e })

const report = { dataset: DATASET, candidateFiles: candidateFiles.size, bboxCounts, normalSelected: normalFiles.length, nlpCounts, missingInZips: [], warnings: [] }
const drafts = []
for (const file of candidateFiles) {
  const loc = fileToZip.get(file)
  if (!loc) {
    report.missingInZips.push(file)
    continue
  }
  const m = meta.get(file)
  const rec = emptyRecord(`nih_${safeId(file)}`, DATASET, file)
  rec.viewPosition = m?.view ?? 'unknown'
  rec.ageYears = m?.age ?? null
  rec.sex = m?.sex ?? null
  rec.population = populationFor(rec.ageYears)
  const boxes = bboxByFile.get(file) ?? []
  for (const b of boxes) setFinding(rec, b.finding, 'expert_bbox')
  const panel = panelByFile.get(file)
  if (panel) {
    for (const [f, yes] of Object.entries(panel)) {
      if (yes) setFinding(rec, f, 'expert_panel')
      else setNegative(rec, f, 'expert_panel')
    }
  }
  if (normalFiles.includes(file)) {
    setFinding(rec, 'normal', 'expert_panel')
    rec.issues.push('Panel yalnız 4 bulgu için değerlendirmiştir (kırık, pnömotoraks, havalı alan opasitesi, nodül/kitle); diğer bulgular için garanti değildir — hekim gözden geçirmesi önerilir.')
  }
  const nlpLabel = nlpByFile.get(file)
  if (nlpLabel) setFinding(rec, nlpLabel === 'Emphysema' ? 'emphysema' : 'hernia', 'report_nlp')
  rec._boxes = boxes
  rec._loc = loc
  if (rec.population === 'pediatrik') rec.issues.push('pediatrik: yalnız uygulama/öğrenme katmanı, değerlendirme havuzu dışı')
  drafts.push(rec)
}

console.log(`İndiriliyor: ${drafts.length} film (eşzamanlılık ${CONCURRENCY})…`)
let done = 0
const out = []
await pMap(drafts, CONCURRENCY, async (rec) => {
  try {
    const buf = await fetchEntryData(rec._loc.url, rec._loc.entry)
    const sharp = (await import('sharp')).default
    const md = await sharp(buf).metadata()
    const img = await writeRuntimeImage(buf, rec.id)
    Object.assign(rec, { width: img.width, height: img.height, originalWidth: img.sourceWidth, originalHeight: img.sourceHeight, runtimeUrl: img.runtimeUrl, bytes: img.bytes })
    const W = md.width
    const H = md.height
    const scale = W === 1024 ? 1 : W / 1024
    for (const b of rec._boxes) rec.annotations.push({ finding: b.finding, source: 'expert_bbox', ...normBox(b.x * scale, b.y * scale, b.w * scale, b.h * scale, W, H) })
    delete rec._boxes
    delete rec._loc
    out.push(rec)
  } catch (e) {
    report.warnings.push(`${rec.sourceFile}: ${e.message}`)
  } finally {
    done++
    if (done % 25 === 0 || done === drafts.length) console.log(`  ${done}/${drafts.length}`)
  }
})

const merged = mergeImages(out, { dataset: DATASET, replace: false })
report.selected = out.length
report.byFinding = summarize(out)
fs.writeFileSync(path.join(REPORTS_DIR, 'import-nih-remote.json'), JSON.stringify(report, null, 2))
console.log(`NIH (uzak): ${out.length} görüntü içe aktarıldı; images.json toplam ${merged.count}`)
console.log(report.byFinding)
if (report.missingInZips.length) console.warn(`uyarı: ${report.missingInZips.length} dosya 12 zip içinde bulunamadı`)
if (report.warnings.length) console.warn(`uyarı: ${report.warnings.length} indirme/işleme hatası (rapora yazıldı)`)
