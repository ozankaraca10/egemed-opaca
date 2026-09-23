#!/usr/bin/env node
/**
 * NIH rapor etiketlerini (Data_Entry_2017_v2020.csv "Finding Labels") images.json'daki nih-cxr14
 * kayıtlarına report_nlp kaynağıyla zenginleştirir — görüntü İNDİRMEDEN (BRIEF_OPACA_DISTRACTORS §1).
 *
 *   node scripts/enrich-nih-labels.mjs [--refresh-cache]
 *
 * Kök neden (brifte doğrulandı): import-nih-remote.mjs yalnız BBox/Google panel filmlerini ve az sayıda
 * NLP-yalnız (Emphysema/Hernia) filmi report_nlp ile etiketliyordu; 252 NIH filminin yalnız 27'sinde
 * report_nlp vardı — geri kalan 225 filimde yalnız uzman kutusu/panel etiketi vardı, rapor etiketleri hiç
 * içe aktarılmamıştı. safeDistractors() (case-selection.mjs) NIH için "güvenli" tek yolu hasNlpReport
 * (rapor bir bulguyu belirtmiyorsa o bulgu çeldirici için güvenlidir) olduğundan, bu 225 filmde yalnız
 * "normal" çeldirici kalıyordu → 2 seçenekli finding_identify sorusu.
 *
 * Bu betik ZATEN indirilmiş 252 NIH filminin TAMAMI için Data_Entry CSV'sindeki rapor etiketlerini
 * (Hugging Face aynası — import-nih-remote.mjs'nin kullandığı aynı kaynak) images.json'a ekler.
 *
 * Kurallar:
 *  - Uzman kaynaklı (EXPERT) bir bulgunun kaynağı ASLA değişmez — setFinding() (cxr-common.mjs) bunu
 *    zaten garanti eder (uzman > NLP; aynı değer tekrar yazılırsa da no-op).
 *  - "No Finding" → no_finding_report: report_nlp (findings.json → nihLabelMap zaten bu eşlemeyi içerir).
 *  - Panel-normal filmde rapor bulgu bildiriyorsa "normal" kaldırılır; panelin "yok" dediği bulguda
 *    çelişen rapor etiketi silinir (uzman > NLP).
 *  - Kayıtların başka HİÇBİR alanına dokunulmaz (yaş/cinsiyet/projeksiyon/annotations/vb. aynen kalır).
 *  - mergeImages ile yazılır; idempotenttir (aynı CSV ile tekrar çalıştırmak sonucu değiştirmez —
 *    setFinding zaten mevcut değeri tekrar yazmaktan farksızdır, "yeni eklenen" sayaçları da buna göre
 *    öncesi/sonrası karşılaştırmasıyla hesaplanır).
 *
 * CSV, reports/nih-data-entry-cache.csv altında önbelleklenir (import-nih-remote.mjs'nin zip dizini
 * önbellekleme desenine benzer) — --refresh-cache ile yok sayılıp yeniden indirilir.
 */
import fs from 'node:fs'
import path from 'node:path'
import { csvObjects } from './lib/csv.mjs'
import { REPORTS_DIR, IMAGES_JSON, readJson, FINDINGS_DATA, parseArgs, setFinding, mergeImages } from './lib/cxr-common.mjs'

const HF_BASE = 'https://huggingface.co/datasets/alkzar90/NIH-Chest-X-ray-dataset/resolve/main/data/'
const DATASET = 'nih-cxr14'
const CACHE_FILE = 'nih-data-entry-cache.csv'

const { opts } = parseArgs(process.argv.slice(2))
const refreshCache = !!opts['refresh-cache']

async function fetchTextCached(url, cacheName, refresh) {
  const cachePath = path.join(REPORTS_DIR, cacheName)
  if (!refresh && fs.existsSync(cachePath)) {
    console.log(`Data_Entry CSV önbellekten okunuyor: ${cachePath}`)
    return fs.readFileSync(cachePath, 'utf8')
  }
  console.log(`Data_Entry CSV indiriliyor: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const text = await res.text()
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  fs.writeFileSync(cachePath, text)
  return text
}

const csvText = await fetchTextCached(HF_BASE + 'Data_Entry_2017_v2020.csv', CACHE_FILE, refreshCache)
const { records: csvRecords } = csvObjects(csvText)
const labelsByFile = new Map()
for (const r of csvRecords) {
  const file = r['Image Index']
  if (!file) continue
  const labels = String(r['Finding Labels'] ?? '').split('|').map((s) => s.trim()).filter(Boolean)
  labelsByFile.set(file, labels)
}
console.log(`Data_Entry CSV: ${labelsByFile.size} film satırı`)

const labelMap = FINDINGS_DATA.nihLabelMap
const images = readJson(IMAGES_JSON, { records: [] })
const nihRecords = images.records.filter((r) => r.sourceDataset === DATASET)
console.log(`images.json: ${nihRecords.length} NIH kaydı`)

let enrichedFiles = 0
let addedLabels = 0
let missingInCsv = 0
const perFinding = {}
const unknownLabels = new Set()
const revokedNormals = []
const panelConflicts = []

for (const rec of nihRecords) {
  const labels = labelsByFile.get(rec.sourceFile)
  if (!labels) {
    missingInCsv++
    continue
  }
  let addedForThis = 0
  for (const l of labels) {
    const finding = labelMap[l]
    if (!finding) {
      unknownLabels.add(l)
      continue
    }
    const before = rec.findings[finding]
    if (before === 'report_nlp') continue // zaten var — idempotent, sayılmaz
    setFinding(rec, finding, 'report_nlp')
    if (rec.findings[finding] === 'report_nlp' && before !== 'report_nlp') {
      addedForThis++
      addedLabels++
      perFinding[finding] = (perFinding[finding] ?? 0) + 1
    }
  }
  if (addedForThis > 0) enrichedFiles++

  // Panel-normal ama raporda bulgu var → "normal" iddiası geri alınır (panel yalnız 4 bulguya bakar).
  if (rec.findings.normal === 'expert_panel' && labels.some((l) => l !== 'No Finding')) {
    delete rec.findings.normal
    rec.issues.push(`Panel-normal etiketi kaldırıldı: NIH raporu bulgu bildiriyor (${labels.join(', ')}).`)
    revokedNormals.push(rec.id)
  }
  // Panel "yok" dediği bulguda rapor "var" diyorsa uzman kararı geçerli; çelişen rapor etiketi silinir.
  for (const [f, src] of Object.entries(rec.negatives ?? {})) {
    if (src === 'expert_panel' && rec.findings[f] === 'report_nlp') {
      delete rec.findings[f]
      panelConflicts.push(`${rec.id}:${f}`)
    }
  }
}

const merged = mergeImages(nihRecords, { dataset: DATASET, replace: true })

const report = {
  dataset: DATASET,
  csvRows: labelsByFile.size,
  nihRecords: nihRecords.length,
  enrichedFiles,
  addedLabels,
  missingInCsv,
  perFinding,
  unknownLabels: [...unknownLabels],
  revokedNormals,
  panelConflicts,
}
fs.mkdirSync(REPORTS_DIR, { recursive: true })
fs.writeFileSync(path.join(REPORTS_DIR, 'enrich-nih-labels.json'), JSON.stringify(report, null, 2))
console.log(
  `NIH zenginleştirme: ${enrichedFiles}/${nihRecords.length} film en az bir yeni report_nlp etiketi aldı (${addedLabels} etiket eklendi); images.json toplam ${merged.count}`
)
console.log('Bulgu başına eklenen report_nlp sayısı:', perFinding)
if (revokedNormals.length) console.log(`Panel-normal geri alındı (raporda bulgu var): ${revokedNormals.length}`)
if (panelConflicts.length) console.log(`Panel ile çelişen rapor etiketi silindi: ${panelConflicts.length}`)
if (missingInCsv) console.warn(`uyarı: ${missingInCsv} NIH filmi Data_Entry CSV'sinde bulunamadı (sourceFile eşleşmedi)`)
if (unknownLabels.size) console.warn(`uyarı: bilinmeyen NIH etiketi(leri) (nihLabelMap'te yok): ${[...unknownLabels].join(', ')}`)
