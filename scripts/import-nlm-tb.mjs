#!/usr/bin/env node
/**
 * NLM Montgomery + Shenzhen tüberküloz veri setleri — archive.org'dan uzaktan içe aktarım
 * (indirmeden, HTTP Range ile; bkz. scripts/lib/remote-zip.mjs).
 *
 *   npm run import:nlm-tb [-- --limit 10 --dry-run]
 *
 * Kaynak:
 *   Montgomery (138 film, tamamı alınır) — academictorrents_ac786f74878a5775c81d490b23842fd4736bfe33
 *   Shenzhen (662 film, seçmeli: TB 60 + normal 30) — academictorrents_462728e890bd37c05e9439c885df7afc36209cc8
 * Lisans: NLM (Jaeger S, et al. Quant Imaging Med Surg 2014); araştırma ve eğitim kullanımı, atıf koşullu.
 *
 * `ClinicalReadings/*.txt` okuma metni saklanır (readingText) ve anahtar kelimelerle bulguya eşlenir
 *   (bkz. scripts/lib/nlm-keywords.mjs — BRIEF_OPACA_DISTRACTORS §2: bu harita TEK kaynaktır, aynı zamanda
 *   case-selection.mjs'nin Montgomery çeldirici negatif çıkarımında kullanılır). Eşlenemeyen okuma metni
 *   yalnız genel `tuberculosis` etiketiyle kalır. Projeksiyon (PA/AP) veri setinde belirtilmediği için
 *   `unknown` bırakılır (hekim gözden geçirmesi önerilir) — DICOM meta verisi olmadığından uydurulmaz.
 */
import fs from 'node:fs'
import path from 'node:path'
import { readCentralDirectory, fetchEntryData, resolveArchiveOrgUrl, pMap } from './lib/remote-zip.mjs'
import { REPORTS_DIR, parseArgs, writeRuntimeImage, setFinding, setNegative, emptyRecord, populationFor, mergeImages, summarize } from './lib/cxr-common.mjs'
import { findingsFromReadingText } from './lib/nlm-keywords.mjs'

const DATASET = 'nlm-tb'
const CONCURRENCY = 10
const { opts } = parseArgs(process.argv.slice(2))
const dryRun = !!opts['dry-run']
const cap = (n) => (opts.limit ? Math.min(n, Number(opts.limit)) : n)
// archive.org düğümleri zaman zaman çok yavaş yanıt verebiliyor; daha sıkı zaman aşımı/deneme ile
// tıkanan istekler daha hızlı başarısız olur ve kuyruk ilerlemeye devam eder (--timeout-ms / --retries ile ayarlanabilir)
const netOpts = { timeoutMs: opts['timeout-ms'] ? Number(opts['timeout-ms']) : 15000, retries: opts.retries ? Number(opts.retries) : 3 }

// Montgomery: academictorrents_* aynası ia600504/ia800504 düğümünde kalıcı olarak çok yavaştı
// (tek istek 25 sn × 5 denemeyi aşıyordu, doğrulandı). "NLMMontgomeryCXRSet" öğesi aynı zip'i
// (aynı boyut, 616853875 bayt) farklı, sağlıklı bir düğümde (ia601800) barındırıyor — bkz. G3.
const ALL_SETS = [
  { id: 'montgomery', item: 'NLMMontgomeryCXRSet', zip: 'NLM-MontgomeryCXRSet.zip', imgDir: 'CXR_png/', txtDir: 'ClinicalReadings/', tbCap: Infinity, normalCap: Infinity },
  { id: 'shenzhen', item: 'academictorrents_462728e890bd37c05e9439c885df7afc36209cc8', zip: 'ChinaSet_AllFiles.zip', imgDir: 'CXR_png/', txtDir: 'ClinicalReadings/', tbCap: cap(60), normalCap: cap(30) },
]
// --only montgomery|shenzhen: yalnız bir alt veri setini (yeniden) çeker — bir düğüm yavaş/çökük olduğunda
// diğer başarılı seti tekrar indirmeden yalnız başarısız seti yeniden denemek için kullanışlıdır
const SETS = opts.only ? ALL_SETS.filter((s) => s.id === opts.only) : ALL_SETS

function parseReading(text) {
  const t = text.replace(/\r\n/g, '\n')
  let sex = null
  let age = null
  let lines = t.split('\n').map((l) => l.trim()).filter(Boolean)
  const mSex1 = /Patient'?s Sex:\s*([MF])/i.exec(t)
  const mAge1 = /Patient'?s Age:\s*(\d{1,3})Y/i.exec(t)
  const mFirst = /^\s*(male|female)\s+(\d{1,3})\s*y(rs?)?\.?/i.exec(lines[0] ?? '')
  if (mSex1 || mAge1) {
    sex = mSex1 ? mSex1[1].toUpperCase() : null
    age = mAge1 ? Number(mAge1[1]) : null
    lines = lines.filter((l) => !/^Patient'?s (Sex|Age):/i.test(l))
  } else if (mFirst) {
    sex = mFirst[1].toLowerCase() === 'male' ? 'M' : 'F'
    age = Number(mFirst[2])
    lines = lines.slice(1)
  }
  return { sex, age: age && age > 0 && age < 110 ? age : null, reading: lines.join(' ').trim() }
}

const report = { dataset: DATASET, sets: {}, warnings: [] }
const allDrafts = []

for (const set of SETS) {
  console.log(`\n${set.id}: merkezî dizin okunuyor…`)
  const url = set.id === 'montgomery' ? await resolveArchiveOrgUrl(set.item, set.zip, netOpts) : `https://archive.org/download/${set.item}/${set.zip}`
  const { entries, totalSize } = await readCentralDirectory(url, netOpts)
  console.log(`  ${(totalSize / 1e9).toFixed(2)} GB, ${entries.length} girdi`)
  const imgs = entries.filter((e) => e.name.includes(set.imgDir) && /\.png$/i.test(e.name))
  const txtByStem = new Map(entries.filter((e) => e.name.includes(set.txtDir) && /\.txt$/i.test(e.name)).map((e) => [path.basename(e.name, '.txt'), e]))

  const tb = imgs.filter((e) => /_1\.png$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, set.tbCap)
  const normal = imgs.filter((e) => /_0\.png$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, set.normalCap)
  console.log(`  seçilen: TB ${tb.length}, normal ${normal.length}`)
  report.sets[set.id] = { totalImages: imgs.length, selectedTb: tb.length, selectedNormal: normal.length }

  for (const e of [...tb, ...normal]) {
    const stem = path.basename(e.name, '.png')
    const isTb = /_1$/.test(stem)
    const txtEntry = txtByStem.get(stem)
    const rec = emptyRecord(`nlm_${set.id}_${stem.toLowerCase()}`, DATASET, path.basename(e.name))
    rec._imgUrl = url
    rec._imgEntry = e
    rec._txtUrl = url
    rec._txtEntry = txtEntry
    rec._isTb = isTb
    allDrafts.push(rec)
  }
}

if (dryRun) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  fs.writeFileSync(path.join(REPORTS_DIR, 'import-nlm-tb.json'), JSON.stringify({ ...report, dryRun: true, candidates: allDrafts.length }, null, 2))
  console.log(`\n[dry-run] ${allDrafts.length} film seçilecekti`)
  process.exit(0)
}

console.log(`\nİndiriliyor: ${allDrafts.length} film (eşzamanlılık ${CONCURRENCY})…`)
let done = 0
const out = []
await pMap(allDrafts, CONCURRENCY, async (rec) => {
  try {
    const [imgBuf, txtBuf] = await Promise.all([
      fetchEntryData(rec._imgUrl, rec._imgEntry, netOpts),
      rec._txtEntry ? fetchEntryData(rec._txtUrl, rec._txtEntry, netOpts) : Promise.resolve(null),
    ])
    const parsed = txtBuf ? parseReading(txtBuf.toString('utf8')) : { sex: null, age: null, reading: '' }
    rec.readingText = parsed.reading || null
    rec.ageYears = parsed.age
    rec.sex = parsed.sex
    rec.population = populationFor(rec.ageYears)
    rec.viewPosition = 'unknown'
    rec.issues.push('Projeksiyon (PA/AP) NLM veri setinde belirtilmemiştir; uydurulmadı, hekim gözden geçirmesiyle doldurulabilir.')
    if (rec._isTb) {
      setFinding(rec, 'tuberculosis', 'expert_reading')
      for (const f of findingsFromReadingText(parsed.reading)) setFinding(rec, f, 'expert_reading')
      if (!parsed.reading) rec.issues.push('Okuma metni yok; yalnız genel tüberküloz etiketiyle içe aktarıldı.')
    } else {
      setFinding(rec, 'normal', 'expert_reading')
      setNegative(rec, 'tuberculosis', 'expert_reading')
    }
    const img = await writeRuntimeImage(imgBuf, rec.id)
    Object.assign(rec, { width: img.width, height: img.height, originalWidth: img.sourceWidth, originalHeight: img.sourceHeight, runtimeUrl: img.runtimeUrl, bytes: img.bytes })
    if (rec.population === 'pediatrik') rec.issues.push('pediatrik: yalnız uygulama/öğrenme katmanı, değerlendirme havuzu dışı')
    delete rec._imgUrl
    delete rec._imgEntry
    delete rec._txtUrl
    delete rec._txtEntry
    delete rec._isTb
    out.push(rec)
  } catch (e) {
    report.warnings.push(`${rec.sourceFile}: ${e.message}`)
  } finally {
    done++
    if (done % 20 === 0 || done === allDrafts.length) console.log(`  ${done}/${allDrafts.length}`)
  }
})

const merged = mergeImages(out, { dataset: DATASET, replace: !!opts.replace })
report.selected = out.length
report.byFinding = summarize(out)
fs.mkdirSync(REPORTS_DIR, { recursive: true })
fs.writeFileSync(path.join(REPORTS_DIR, 'import-nlm-tb.json'), JSON.stringify(report, null, 2))
console.log(`\nNLM TB: ${out.length} görüntü içe aktarıldı; images.json toplam ${merged.count}`)
console.log(report.byFinding)
if (report.warnings.length) console.warn(`uyarı: ${report.warnings.length} hata (rapora yazıldı)`)
