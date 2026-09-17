#!/usr/bin/env node
/**
 * RSNA Pneumonia Detection Challenge (2018) içe aktarıcı.
 *
 *   npm run import:rsna -- <rsna-klasörü> [--cap 40] [--replace]
 *
 * Klasörde aranan dosyalar:
 *   stage_2_train_labels.csv          — patientId,x,y,width,height,Target (radyolog kutuları)
 *   stage_2_detailed_class_info.csv   — patientId,class ("Lung Opacity" | "Normal" | "No Lung Opacity / Not Normal")
 *   stage_2_train_images/*.dcm        — DICOM (sıkıştırmasız ya da JPEG baseline); Kaggle PNG kopyaları da kabul edilir
 *
 * Eşleme: "Lung Opacity" kutuları → airspace_opacity (expert_bbox). "Normal" → normal (expert_reading) ve
 * airspace_opacity yok (expert_reading). "No Lung Opacity / Not Normal" → yalnız opasite yok; ana bulgu olmadığından alınmaz.
 * Etiket pnömoni tanısı değildir; vakalar bunu açıkça belirtir.
 */
import fs from 'node:fs'
import path from 'node:path'
import { csvObjects } from './lib/csv.mjs'
import { parseDicom, dicomAgeYears, toGray8 } from './lib/dicom.mjs'
import {
  REPORTS_DIR, readTextAny, indexFiles, parseArgs, writeRuntimeImage, normBox, safeId,
  setFinding, setNegative, emptyRecord, populationFor, mergeImages, capPerFinding, summarize,
} from './lib/cxr-common.mjs'

const DATASET = 'rsna-pneumonia-2018'
const { pos, opts } = parseArgs(process.argv.slice(2))
const dir = pos[0]
if (!dir || !fs.existsSync(dir)) {
  console.error('Kullanım: npm run import:rsna -- <rsna-klasörü> [--cap 40] [--replace]')
  process.exit(1)
}
const cap = Number(opts.cap ?? 40)
const csvs = indexFiles(dir, /\.(csv|csv\.gz|zip)$/i)
const find = (re) => [...csvs.entries()].find(([n]) => re.test(n))?.[1]
const labelsPath = opts.labels ? String(opts.labels) : find(/train_labels\.csv/i)
const classPath = opts.classes ? String(opts.classes) : find(/detailed_class_info\.csv/i)
if (!labelsPath) {
  console.error('stage_2_train_labels.csv bulunamadı (--labels ile verin).')
  process.exit(1)
}

const report = { dataset: DATASET, labels: labelsPath, classes: classPath ?? null, warnings: [], skipped: {} }
const skip = (why) => (report.skipped[why] = (report.skipped[why] ?? 0) + 1)

const byPatient = new Map()
const get = (id) => {
  if (!byPatient.has(id)) byPatient.set(id, { boxes: [], cls: null, target: null })
  return byPatient.get(id)
}
for (const r of csvObjects(await readTextAny(labelsPath)).records) {
  const p = get(r.patientId)
  p.target = r.Target === '1' ? 1 : 0
  if (r.Target === '1') {
    const [x, y, w, h] = [r.x, r.y, r.width, r.height].map(Number)
    if ([x, y, w, h].every(Number.isFinite)) p.boxes.push({ x, y, w, h })
  }
}
if (classPath) for (const r of csvObjects(await readTextAny(classPath)).records) get(r.patientId).cls = r.class

const files = indexFiles(dir, /\.(dcm|png)$/i)
const drafts = []
for (const [pid, p] of byPatient) {
  const cls = p.cls ?? (p.target === 1 ? 'Lung Opacity' : null)
  if (cls !== 'Lung Opacity' && cls !== 'Normal') {
    skip(cls ? 'belirsiz sınıf (ana bulgu yok)' : 'sınıf bilgisi yok')
    continue
  }
  const file = files.get(`${pid}.dcm`) ?? files.get(`${pid}.png`)
  if (!file) {
    skip('görüntü dosyası yok')
    continue
  }
  const rec = emptyRecord(`rsna_${safeId(pid)}`, DATASET, path.basename(file))
  if (cls === 'Normal') {
    setFinding(rec, 'normal', 'expert_reading')
    setNegative(rec, 'airspace_opacity', 'expert_reading')
  } else if (p.boxes.length) {
    setFinding(rec, 'airspace_opacity', 'expert_bbox')
  } else {
    skip('opasite sınıfı ama kutu yok')
    continue
  }
  rec._boxes = p.boxes
  rec._file = file
  drafts.push(rec)
}

const selected = capPerFinding(drafts, cap)
const out = []
for (const rec of selected) {
  let input
  let raw
  let W
  let H
  if (rec._file.endsWith('.dcm')) {
    let d
    try {
      d = parseDicom(fs.readFileSync(rec._file))
    } catch (e) {
      report.warnings.push(`${rec.sourceFile}: ${e.message}`)
      continue
    }
    if (!d.supported || !d.pixel) {
      report.warnings.push(`${rec.sourceFile}: desteklenmeyen aktarım sözdizimi ${d.TransferSyntaxUID}`)
      continue
    }
    rec.ageYears = dicomAgeYears(d.PatientAge)
    rec.sex = d.PatientSex === 'F' ? 'F' : d.PatientSex === 'M' ? 'M' : null
    rec.viewPosition = ['PA', 'AP'].includes(d.ViewPosition) ? d.ViewPosition : 'unknown'
    W = d.Columns
    H = d.Rows
    if (d.isJpeg) {
      input = Buffer.concat(d.pixel.fragments)
      if (d.PhotometricInterpretation === 'MONOCHROME1') rec.issues.push('MONOCHROME1 JPEG: ters çevrilmedi, kontrol edin')
    } else {
      input = toGray8(d)
      raw = { width: W, height: H }
    }
  } else {
    input = fs.readFileSync(rec._file)
    W = 1024
    H = 1024
    rec.issues.push('PNG kopyası: yaş/cinsiyet/projeksiyon bilgisi yok')
  }
  rec.population = populationFor(rec.ageYears)
  const img = await writeRuntimeImage(input, rec.id, raw)
  W = W ?? img.sourceWidth
  H = H ?? img.sourceHeight
  Object.assign(rec, { width: img.width, height: img.height, originalWidth: W, originalHeight: H, runtimeUrl: img.runtimeUrl, bytes: img.bytes })
  for (const b of rec._boxes) rec.annotations.push({ finding: 'airspace_opacity', source: 'expert_bbox', ...normBox(b.x, b.y, b.w, b.h, W, H) })
  if (rec.population === 'pediatrik') rec.issues.push('pediatrik: mezuniyet öncesi değerlendirme havuzu dışında')
  delete rec._boxes
  delete rec._file
  out.push(rec)
}

const merged = mergeImages(out, { dataset: DATASET, replace: !!opts.replace })
report.selected = out.length
report.byFinding = summarize(out)
fs.mkdirSync(REPORTS_DIR, { recursive: true })
fs.writeFileSync(path.join(REPORTS_DIR, 'import-rsna.json'), JSON.stringify(report, null, 2))
console.log(`RSNA: ${out.length} görüntü içe aktarıldı; images.json toplam ${merged.count}`)
console.log(report.byFinding, report.skipped)
