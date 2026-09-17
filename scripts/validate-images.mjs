#!/usr/bin/env node
/**
 * Görüntü ve vaka envanteri doğrulaması (Ausculta validate-audio.mjs karşılığı).
 * Fatal hatada çıkış kodu 1 → paketleme durur.
 *
 * Denetimler:
 *  - images.json: runtime dosyası var ve çözülebilir; boyutlar kayıtla aynı; bulgu anahtarları taksonomide
 *  - kutular 0–1 aralığında ve alanı > 0; kutunun bulgusu kayıtta uzman kaynaklı pozitif
 *  - veri seti ve etiket kaynağı lisansı doğrulanmış (sources.json inventory.licenseVerified);
 *    OPACA_ALLOW_LICENSE_REVIEW=1 yalnız yerel geliştirmede bu denetimi uyarıya çevirir
 *  - dağıtılamaz (inventory_only) veri setinden kayıt yok
 *  - vakalar: görüntü var; değerlendirme vakasının ana bulgusu uzman kaynaklı ve film yetişkin;
 *    lokalizasyon hedefinin uzman kutusu var; seçmeli soruların doğru yanıtı seçeneklerde
 *  - kütüphane: bestZones geçerli okuma bölgeleri; her öğretilen bulgunun kütüphane kalemi var
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { ROOT, DATA_DIR, readJson, EXPERT } from './lib/cxr-common.mjs'

const fatal = []
const warn = []
const allowReview = process.env.OPACA_ALLOW_LICENSE_REVIEW === '1'

const images = readJson(path.join(DATA_DIR, 'images.json'), null)
if (!images) {
  console.error('images.json yok — önce `npm run import:sample` ya da `npm run import:nih` çalıştırın.')
  process.exit(1)
}
const findings = readJson(path.join(DATA_DIR, 'findings.json'), {}).findings
const zones = readJson(path.join(DATA_DIR, 'reading-zones.json'), {}).zones
const zoneIds = new Set(zones.map((z) => z.id))
const library = readJson(path.join(DATA_DIR, 'library.json'), {}).groups
const sources = readJson(path.join(DATA_DIR, 'sources.json'), {})
const inventory = new Map(sources.inventory.map((i) => [i.id, i]))
const cases = [
  ...readJson(path.join(DATA_DIR, 'cases.json'), { cases: [] }).cases,
  ...readJson(path.join(DATA_DIR, 'cases-auto.json'), { cases: [] }).cases,
]

const licenseProblem = (id, what) => {
  const inv = inventory.get(id)
  if (!inv) return fatal.push(`${what}: veri seti envanterde yok (${id})`)
  if (inv.status === 'inventory_only') return fatal.push(`${what}: ${id} dağıtılamaz (yalnız envanter)`)
  if (!inv.licenseVerified) (allowReview ? warn : fatal).push(`${what}: ${id} lisansı doğrulanmadı${allowReview ? ' (yerel geliştirme izni)' : ''}`)
  if (!sources.datasets.some((d) => d.id === id)) fatal.push(`${what}: ${id} için atıf (sources.datasets) yok`)
}

const usedDatasets = new Set()
const byId = new Map()
let totalBytes = 0
for (const r of images.records) {
  const tag = r.id
  if (byId.has(r.id)) fatal.push(`${tag}: yinelenen id`)
  byId.set(r.id, r)
  usedDatasets.add(r.sourceDataset)
  if (Object.values(r.findings).includes('expert_panel') && r.sourceDataset === 'nih-cxr14') usedDatasets.add('google-nih-adjudicated')
  for (const f of [...Object.keys(r.findings), ...Object.keys(r.negatives)]) if (!findings[f]) fatal.push(`${tag}: bilinmeyen bulgu ${f}`)
  for (const a of r.annotations) {
    const okRange = [a.x, a.y, a.w, a.h].every((v) => typeof v === 'number' && v >= 0 && v <= 1) && a.x + a.w <= 1.0001 && a.y + a.h <= 1.0001
    if (!okRange || a.w <= 0 || a.h <= 0) fatal.push(`${tag}: geçersiz kutu ${JSON.stringify(a)}`)
    if (!EXPERT.has(a.source)) fatal.push(`${tag}: kutu uzman kaynaklı değil (${a.source})`)
    if (!EXPERT.has(r.findings[a.finding] ?? '')) fatal.push(`${tag}: kutunun bulgusu (${a.finding}) kayıtta uzman pozitifi değil`)
  }
  if (r.validationStatus !== 'validated') {
    warn.push(`${tag}: dosya eksik olarak işaretli`)
    continue
  }
  const file = path.join(ROOT, 'public', r.runtimeUrl)
  if (!fs.existsSync(file)) {
    fatal.push(`${tag}: runtime dosyası yok (${r.runtimeUrl}) — içe aktarıcıyı yeniden çalıştırın`)
    continue
  }
  try {
    const md = await sharp(file).metadata()
    if (md.width !== r.width || md.height !== r.height) fatal.push(`${tag}: boyut uyuşmuyor (${md.width}×${md.height} ≠ ${r.width}×${r.height})`)
    totalBytes += fs.statSync(file).size
  } catch (e) {
    fatal.push(`${tag}: görüntü çözülemedi (${e.message})`)
  }
}
for (const id of usedDatasets) licenseProblem(id, 'lisans')

const caseIds = new Set()
let assessment = 0
for (const c of cases) {
  const tag = `vaka ${c.id}`
  if (caseIds.has(c.id)) fatal.push(`${tag}: yinelenen id`)
  caseIds.add(c.id)
  const img = byId.get(c.imageId)
  if (!img) {
    fatal.push(`${tag}: görüntü yok (${c.imageId})`)
    continue
  }
  if (!findings[c.primaryFinding]) fatal.push(`${tag}: bilinmeyen ana bulgu ${c.primaryFinding}`)
  const inAssessment = c.modes.includes('assessment')
  if (inAssessment) {
    assessment++
    if (!EXPERT.has(img.findings[c.primaryFinding] ?? '')) fatal.push(`${tag}: değerlendirme vakası uzman kaynaklı değil`)
    if (img.population !== 'yetiskin') fatal.push(`${tag}: değerlendirmede pediatrik film`)
    if (c.mappingValidation !== 'validated') fatal.push(`${tag}: değerlendirme vakası doğrulanmamış eşleme`)
  }
  for (const z of c.technique?.requiredZones ?? []) if (!zoneIds.has(z)) fatal.push(`${tag}: bilinmeyen bölge ${z}`)
  for (const q of c.questions) {
    if (q.type === 'localization') {
      if (!img.annotations.some((a) => a.finding === q.targetFinding && EXPERT.has(a.source))) fatal.push(`${tag}/${q.id}: hedef bulgu için uzman kutusu yok`)
      continue
    }
    const ids = new Set(q.options.map((o) => o.id))
    if (!q.correct.length || !q.correct.every((x) => ids.has(x))) fatal.push(`${tag}/${q.id}: doğru yanıt seçeneklerde yok`)
    if (q.domain === 'diagnosis' && c.mappingValidation !== 'validated') fatal.push(`${tag}/${q.id}: doğrulanmamış tanı sorusu`)
  }
  if (c.clinicalReview !== 'onayli') warn.push(`${tag}: hekim onayı bekliyor`)
}

const libFindings = new Set()
for (const g of library)
  for (const it of g.items) {
    if (it.finding) libFindings.add(it.finding)
    for (const z of it.bestZones) if (!zoneIds.has(z)) fatal.push(`kütüphane ${it.key}: bilinmeyen bölge ${z}`)
    if (it.finding && !findings[it.finding]) fatal.push(`kütüphane ${it.key}: bilinmeyen bulgu ${it.finding}`)
  }
for (const [f, def] of Object.entries(findings)) if (def.teaching && !libFindings.has(f)) fatal.push(`bulgu ${f}: öğretilen bulgunun kütüphane kalemi yok`)
for (const f of libFindings) if (!images.records.some((r) => r.findings[f])) warn.push(`kütüphane ${f}: örnek film yok (veri bekleniyor)`)
if (assessment < 10) warn.push(`değerlendirme havuzu ${assessment} vaka (<10): oturumlar kısa kalır`)

const reviewWarns = warn.filter((w) => w.includes('hekim onayı')).length
const otherWarns = warn.filter((w) => !w.includes('hekim onayı'))
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports', 'validate-images.json'), JSON.stringify({ fatal, warn, images: images.records.length, cases: cases.length, assessment, totalBytes }, null, 2))
for (const w of otherWarns) console.warn('uyarı:', w)
if (reviewWarns) console.warn(`uyarı: ${reviewWarns} vaka hekim onayı bekliyor (docs/klinik-degerlendirme-listesi.csv)`)
for (const f of fatal) console.error('HATA:', f)
console.log(`Doğrulama: ${images.records.length} görüntü (${(totalBytes / 1024 / 1024).toFixed(1)} MB), ${cases.length} vaka, ${assessment} değerlendirme vakası — ${fatal.length} hata, ${warn.length} uyarı`)
process.exit(fatal.length ? 1 : 0)
