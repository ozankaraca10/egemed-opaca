/** İçe aktarıcıların ortak yardımcıları: görüntü işleme, envanter birleştirme, taksonomi. */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import JSZip from 'jszip'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DATA_DIR = path.join(ROOT, 'src', 'data')
// OPACA_OUT_DIR: testlerde depoyu kirletmemek için çıktı dizini yönlendirmesi
const OUT = process.env.OPACA_OUT_DIR
export const IMAGES_JSON = OUT ? path.join(OUT, 'images.json') : path.join(DATA_DIR, 'images.json')
export const RUNTIME_DIR = OUT ? path.join(OUT, 'runtime') : path.join(ROOT, 'public', 'assets', 'xray', 'runtime')
export const REPORTS_DIR = OUT ? path.join(OUT, 'reports') : path.join(ROOT, 'reports')
export const RUNTIME_URL = 'assets/xray/runtime'
export const MAX_EDGE = 1024
export const WEBP_QUALITY = 82
export const EXPERT = new Set(['expert_panel', 'expert_bbox', 'expert_mask', 'expert_reading', 'ct_confirmed'])

export const FINDINGS_DATA = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'findings.json'), 'utf8'))

export function readJson(p, fallback) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback
}

/** .csv / .csv.gz / .zip (tek csv) okur */
export async function readTextAny(p) {
  const buf = fs.readFileSync(p)
  if (p.endsWith('.gz')) return zlib.gunzipSync(buf).toString('utf8')
  if (p.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(buf)
    const f = Object.values(zip.files).find((x) => !x.dir && /\.csv$/i.test(x.name))
    if (!f) throw new Error(`${p}: zip içinde csv yok`)
    return f.async('string')
  }
  return buf.toString('utf8')
}

/** Klasörü özyinelemeli tarar; dosya adı → tam yol haritası */
export function indexFiles(dir, re) {
  const map = new Map()
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (re.test(e.name)) map.set(e.name, full)
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return map
}

/** Argüman ayrıştırıcı: konumsal + --anahtar değer (tekrar eden anahtarlar diziye toplanır) + --bayrak */
export function parseArgs(argv) {
  const pos = []
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      pos.push(a)
      continue
    }
    const key = a.slice(2)
    const next = argv[i + 1]
    const val = next && !next.startsWith('--') ? (i++, next) : true
    if (key in opts) opts[key] = [].concat(opts[key], val)
    else opts[key] = val
  }
  return { pos, opts }
}

export function list(v) {
  return v == null || v === true ? [] : [].concat(v)
}

/** Görüntüyü gri tonlamalı WebP'e dönüştürür (en uzun kenar ≤ MAX_EDGE). Ham 8 bit tampon da kabul eder. */
export async function writeRuntimeImage(input, id, raw) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true })
  const file = `${id}.webp`
  const dest = path.join(RUNTIME_DIR, file)
  const pipeline = raw ? sharp(input, { raw: { width: raw.width, height: raw.height, channels: 1 } }) : sharp(input)
  const meta = raw ? { width: raw.width, height: raw.height } : await sharp(input).metadata()
  const info = await pipeline
    .grayscale()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 5 })
    .toFile(dest)
  return {
    width: info.width,
    height: info.height,
    sourceWidth: meta.width,
    sourceHeight: meta.height,
    bytes: info.size,
    runtimeUrl: `${RUNTIME_URL}/${file}`,
  }
}

/** Kutuyu kaynak piksel uzayından normalize (0–1) uzaya çevirir ve sınırlar. */
export function normBox(x, y, w, h, W, H) {
  const cx = Math.max(0, Math.min(1, x / W))
  const cy = Math.max(0, Math.min(1, y / H))
  const cw = Math.max(0, Math.min(1 - cx, w / W))
  const ch = Math.max(0, Math.min(1 - cy, h / H))
  const r = (v) => Math.round(v * 10000) / 10000
  return { x: r(cx), y: r(cy), w: r(cw), h: r(ch) }
}

export function safeId(s) {
  return s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/** Kaynak önceliği: uzman kaynak NLP'yi ezer, NLP uzmanı ezemez. */
export function setFinding(rec, finding, source) {
  const cur = rec.findings[finding]
  if (!cur || (!EXPERT.has(cur) && EXPERT.has(source)) || (cur === source)) rec.findings[finding] = source
  if (EXPERT.has(source)) delete rec.negatives[finding]
}

export function setNegative(rec, finding, source) {
  if (EXPERT.has(rec.findings[finding] ?? '')) return
  if (rec.findings[finding] === 'report_nlp') delete rec.findings[finding]
  rec.negatives[finding] = source
}

export function emptyRecord(id, dataset, sourceFile) {
  return {
    id,
    sourceDataset: dataset,
    sourceFile,
    viewPosition: 'unknown',
    ageYears: null,
    sex: null,
    population: 'yetiskin',
    width: 0,
    height: 0,
    originalWidth: null,
    originalHeight: null,
    findings: {},
    negatives: {},
    annotations: [],
    quality: null,
    runtimeUrl: '',
    bytes: 0,
    validationStatus: 'validated',
    clinicalReview: 'beklemede',
    issues: [],
  }
}

export function populationFor(age) {
  return age != null && age < 18 ? 'pediatrik' : 'yetiskin'
}

/** images.json'a birleştirir: aynı veri setinin eski kayıtları --replace ile silinir, hekim onayı korunur. */
export function mergeImages(newRecords, { dataset, replace }) {
  const cur = readJson(IMAGES_JSON, { generatedAt: '', count: 0, records: [] })
  const prevById = new Map(cur.records.map((r) => [r.id, r]))
  let kept = cur.records.filter((r) => !(replace && r.sourceDataset === dataset))
  const incomingIds = new Set(newRecords.map((r) => r.id))
  kept = kept.filter((r) => !incomingIds.has(r.id))
  for (const r of newRecords) {
    const prev = prevById.get(r.id)
    if (prev) {
      r.clinicalReview = prev.clinicalReview
      if (prev.quality) r.quality = prev.quality
    }
  }
  const records = [...kept, ...newRecords].sort((a, b) => a.id.localeCompare(b.id))
  const out = { generatedAt: new Date().toISOString(), count: records.length, records }
  fs.writeFileSync(IMAGES_JSON, JSON.stringify(out, null, 1) + '\n')
  return out
}

export function primaryTeachingFinding(rec) {
  const teaching = FINDINGS_DATA.findings
  const expert = Object.entries(rec.findings).filter(([f, s]) => teaching[f]?.teaching && EXPERT.has(s))
  return expert.map(([f]) => f)
}

/** Seçim: bulgu başına en fazla `cap` görüntü; önce kutulu uzman, sonra uzman, sonra NLP. */
export function capPerFinding(records, cap) {
  const score = (r) => (r.annotations.length ? 0 : 1) + (Object.values(r.findings).some((s) => EXPERT.has(s)) ? 0 : 2)
  const sorted = [...records].sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))
  const perFinding = new Map()
  const out = []
  for (const r of sorted) {
    const keys = Object.entries(r.findings)
      .filter(([f]) => FINDINGS_DATA.findings[f]?.teaching)
      .map(([f]) => f)
    const bucket = keys.length ? keys : ['_other']
    if (bucket.every((k) => (perFinding.get(k) ?? 0) >= cap)) continue
    for (const k of bucket) perFinding.set(k, (perFinding.get(k) ?? 0) + 1)
    out.push(r)
  }
  return out
}

export function summarize(records) {
  const byFinding = {}
  for (const r of records)
    for (const [f, s] of Object.entries(r.findings)) {
      const k = `${f} (${EXPERT.has(s) ? 'uzman' : 'nlp'})`
      byFinding[k] = (byFinding[k] ?? 0) + 1
    }
  return byFinding
}
