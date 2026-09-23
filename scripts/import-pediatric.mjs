#!/usr/bin/env node
/**
 * Kermany pediatrik göğüs radyografisi veri seti (Guangzhou Women and Children's Medical Center) —
 * archive.org aynasından uzaktan içe aktarım (indirmeden, HTTP Range ile).
 *
 *   npm run import:pediatric [-- --limit 10 --dry-run]
 *
 * Kaynak: https://archive.org/download/pneumonia_chest_xray/train.zip (train/NORMAL, train/PNEUMONIA)
 * Lisans: CC BY 4.0 — Kermany DS, ve ark. Identifying Medical Diagnoses and Treatable Diseases by
 *   Image-Based Deep Learning. Cell. 2018;172(5):1122-1131. Mendeley Data rscbjbr9sj.
 * Tüm görüntüler pediatrik (1–5 yaş, Guangzhou Women and Children's Medical Center), AP projeksiyon
 * (veri seti dokümantasyonunda "anterior-posterior" olarak belirtilir). Kişi bazlı yaş/cinsiyet
 * verisi bu arşivde bulunmadığından uydurulmaz (null bırakılır).
 * Etiket kaynağı `expert_reading`: Kermany ve ark. görüntüleri iki uzman radyolog tarafından
 * okunmuş, üçüncü bir uzmanla teyit edilmiştir (makale §Methods).
 */
import fs from 'node:fs'
import path from 'node:path'
import { readCentralDirectory, fetchEntryData, pMap } from './lib/remote-zip.mjs'
import { REPORTS_DIR, parseArgs, writeRuntimeImage, setFinding, setNegative, emptyRecord, mergeImages, summarize } from './lib/cxr-common.mjs'

const DATASET = 'kermany-pediatric'
const URL = 'https://archive.org/download/pneumonia_chest_xray/train.zip'
const CONCURRENCY = 6
const { opts } = parseArgs(process.argv.slice(2))
const dryRun = !!opts['dry-run']
const cap = (n) => (opts.limit ? Math.min(n, Number(opts.limit)) : n)
const NORMAL_CAP = cap(30)
const PNEUMONIA_CAP = cap(30)

console.log('Kermany pediatrik: merkezî dizin okunuyor…')
const { entries, totalSize } = await readCentralDirectory(URL)
console.log(`${(totalSize / 1e9).toFixed(2)} GB, ${entries.length} girdi`)

const normal = entries.filter((e) => /train\/NORMAL\/.*\.jpe?g$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, NORMAL_CAP)
const bacteria = entries.filter((e) => /train\/PNEUMONIA\/.*bacteria.*\.jpe?g$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))
const virus = entries.filter((e) => /train\/PNEUMONIA\/.*virus.*\.jpe?g$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))
const half = Math.ceil(PNEUMONIA_CAP / 2)
const pneumonia = [...bacteria.slice(0, half), ...virus.slice(0, PNEUMONIA_CAP - half)]
console.log(`seçilen: normal ${normal.length}, pnömoni ${pneumonia.length} (bakteriyel ${Math.min(half, bacteria.length)}, viral ${pneumonia.length - Math.min(half, bacteria.length)})`)

const report = { dataset: DATASET, totalEntries: entries.length, selectedNormal: normal.length, selectedPneumonia: pneumonia.length, warnings: [] }
if (dryRun) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  fs.writeFileSync(path.join(REPORTS_DIR, 'import-pediatric.json'), JSON.stringify({ ...report, dryRun: true }, null, 2))
  console.log(`[dry-run] ${normal.length + pneumonia.length} film seçilecekti`)
  process.exit(0)
}

const drafts = [...normal.map((e) => ({ e, isPneumonia: false })), ...pneumonia.map((e) => ({ e, isPneumonia: true }))]
console.log(`İndiriliyor: ${drafts.length} film (eşzamanlılık ${CONCURRENCY})…`)
let done = 0
const out = []
await pMap(drafts, CONCURRENCY, async ({ e, isPneumonia }) => {
  const stem = path.basename(e.name).replace(/\.[a-z]+$/i, '')
  const rec = emptyRecord(`kermany_${stem.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, DATASET, path.basename(e.name))
  try {
    const buf = await fetchEntryData(URL, e)
    rec.viewPosition = 'AP'
    rec.population = 'pediatrik'
    rec.issues.push('pediatrik: yalnız uygulama/öğrenme katmanı; kişi bazlı yaş/cinsiyet bu arşivde yok.')
    if (isPneumonia) {
      setFinding(rec, 'airspace_opacity', 'expert_reading')
      rec.issues.push(/bacteria/i.test(e.name) ? 'Kermany alt tipi: bakteriyel pnömoni' : 'Kermany alt tipi: viral pnömoni')
    } else {
      setFinding(rec, 'normal', 'expert_reading')
      setNegative(rec, 'airspace_opacity', 'expert_reading')
    }
    const img = await writeRuntimeImage(buf, rec.id)
    Object.assign(rec, { width: img.width, height: img.height, originalWidth: img.sourceWidth, originalHeight: img.sourceHeight, runtimeUrl: img.runtimeUrl, bytes: img.bytes })
    out.push(rec)
  } catch (err) {
    report.warnings.push(`${rec.sourceFile}: ${err.message}`)
  } finally {
    done++
    if (done % 20 === 0 || done === drafts.length) console.log(`  ${done}/${drafts.length}`)
  }
})

const merged = mergeImages(out, { dataset: DATASET, replace: !!opts.replace })
report.selected = out.length
report.byFinding = summarize(out)
fs.mkdirSync(REPORTS_DIR, { recursive: true })
fs.writeFileSync(path.join(REPORTS_DIR, 'import-pediatric.json'), JSON.stringify(report, null, 2))
console.log(`Kermany pediatrik: ${out.length} görüntü içe aktarıldı; images.json toplam ${merged.count}`)
console.log(report.byFinding)
if (report.warnings.length) console.warn(`uyarı: ${report.warnings.length} hata (rapora yazıldı)`)
