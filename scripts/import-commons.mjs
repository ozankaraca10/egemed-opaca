#!/usr/bin/env node
/**
 * Wikimedia Commons içe aktarıcı — fixtures/commons-list.json'daki küratörlü liste.
 *
 *   npm run import:commons [-- --limit 5 --dry-run]
 *
 * Commons API (action=query, imageinfo + extmetadata) ile lisans doğrulanır: yalnız
 * CC0 / Public domain / CC BY( x.x) / CC BY-SA( x.x) kabul edilir; NC/ND atlanır ve rapora yazılır.
 * Etiket kaynağı her zaman `author_caption` (yükleyenin açıklaması) — EXPERT_SOURCES içinde değildir,
 * bu yüzden bu görüntüler yalnız öğrenme ve uygulamada kullanılır, değerlendirme havuzuna girmez.
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPORTS_DIR, ROOT, parseArgs, writeRuntimeImage, setFinding, emptyRecord, mergeImages, summarize } from './lib/cxr-common.mjs'
import { isAcceptableLicense } from './lib/license.mjs'

const DATASET = 'wikimedia-commons'
const UA = 'EGEMED-Opaca/1.0 (egitim amacli akciger grafisi simulatoru; iletisim: ozandeu@yahoo.com)'
const API = 'https://commons.wikimedia.org/w/api.php'

const { opts } = parseArgs(process.argv.slice(2))
const dryRun = !!opts['dry-run']
const listPath = path.join(ROOT, 'fixtures', 'commons-list.json')
const list = JSON.parse(fs.readFileSync(listPath, 'utf8')).items
const items = opts.limit ? list.slice(0, Number(opts.limit)) : list

const strip = (s) => (s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const meta = (v) => v?.value

async function apiGet(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Commons API HTTP ${res.status}`)
  return res.json()
}

async function pageToCandidate(page) {
  if (!page || page.missing != null || !page.imageinfo?.length) return null
  const info = page.imageinfo[0]
  const em = info.extmetadata ?? {}
  const licenseShort = meta(em.LicenseShortName)
  if (!isAcceptableLicense(licenseShort)) return { rejected: true, title: page.title, license: licenseShort ?? 'bilinmiyor' }
  return {
    title: page.title,
    url: info.url,
    descriptionUrl: info.descriptionurl,
    license: {
      name: licenseShort,
      url: meta(em.LicenseUrl) ?? 'https://creativecommons.org/',
      author: strip(meta(em.Artist)) || strip(meta(em.Credit)) || 'Bilinmiyor (Wikimedia Commons)',
      attribution: `${strip(meta(em.Artist)) || 'Wikimedia Commons katkıcısı'} — ${licenseShort}, Wikimedia Commons`,
      sourceUrl: info.descriptionurl,
    },
    description: strip(meta(em.ImageDescription)).slice(0, 300),
  }
}

async function findByTitle(title) {
  const j = await apiGet({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|extmetadata|size' })
  const page = Object.values(j.query?.pages ?? {})[0]
  return pageToCandidate(page)
}

const IMAGE_EXT = /\.(jpe?g|png|gif|tiff?|webp|svg)$/i

/** Arama sonuçları çoğunlukla alakasız (taranmış kitap/dergi PDF'leri) çıkıyor; yalnız gerçek görüntü
 *  dosyaları ve konuyla ilgili anahtar kelime geçen başlık/açıklamaya sahip adaylar kabul edilir. */
async function findBySearch(query, keywords, tried) {
  const j = await apiGet({ action: 'query', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '10', prop: 'imageinfo', iiprop: 'url|extmetadata|size' })
  const pages = Object.values(j.query?.pages ?? {})
  for (const page of pages) {
    if (tried.has(page.title) || !IMAGE_EXT.test(page.title)) continue
    tried.add(page.title)
    const cand = await pageToCandidate(page)
    if (!cand) continue
    if (cand.rejected) {
      tried.rejected = tried.rejected ?? []
      tried.rejected.push(cand)
      continue
    }
    const haystack = `${cand.title} ${cand.description}`.toLowerCase()
    if (keywords?.length && !keywords.some((k) => haystack.includes(k.toLowerCase()))) continue
    return cand
  }
  return null
}

const report = { dataset: DATASET, found: 0, notFound: [], licenseRejected: [], warnings: [] }
const drafts = []

for (const item of items) {
  let cand = null
  const tried = new Set()
  try {
    if (item.file) {
      cand = await findByTitle(item.file)
      if (cand?.rejected) {
        report.licenseRejected.push({ id: item.id, title: cand.title, license: cand.license })
        cand = null
      }
    }
    if (!cand && item.search) {
      cand = await findBySearch(item.search, item.keywords, tried)
      if (tried.rejected) for (const r of tried.rejected) report.licenseRejected.push({ id: item.id, title: r.title, license: r.license })
    }
  } catch (e) {
    report.warnings.push(`${item.id}: ${e.message}`)
  }
  if (!cand) {
    report.notFound.push({ id: item.id, topic: item.topic, tried: item.file ?? item.search })
    console.warn(`bulunamadı/lisans uygun değil: ${item.id} (${item.topic})`)
    continue
  }
  report.found++
  console.log(`bulundu: ${item.id} → ${cand.title} (${cand.license.name})`)
  drafts.push({ item, cand })
}

if (dryRun) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  fs.writeFileSync(path.join(REPORTS_DIR, 'import-commons.json'), JSON.stringify({ ...report, dryRun: true, wouldImport: drafts.length }, null, 2))
  console.log(`[dry-run] ${drafts.length} görüntü içe aktarılacaktı`)
  process.exit(0)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function downloadWithRetry(url, retries = 4) {
  let lastErr
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    lastErr = new Error(`HTTP ${res.status}`)
    if (res.status === 429 || res.status >= 500) await sleep(800 * 2 ** i)
    else break
  }
  throw lastErr
}

const out = []
for (const { item, cand } of drafts) {
  try {
    const buf = await downloadWithRetry(cand.url)
    const rec = emptyRecord(`commons_${item.id}`, DATASET, cand.title.replace(/^File:/, ''))
    rec.viewPosition = item.projection ?? 'unknown'
    rec.population = item.population ?? 'yetiskin'
    rec.bodyPart = item.bodyPart ?? 'toraks'
    rec.modality = item.modality ?? 'XR'
    rec.license = cand.license
    rec.issues.push('Bu görüntünün bulgu/projeksiyon bilgisi yükleyenin açıklamasına dayanır (author_caption); radyolog tarafından doğrulanmamıştır — hekim onayı bekliyor.')
    if (cand.description) rec.issues.push(`Commons açıklaması: ${cand.description}`)
    if (item.finding) setFinding(rec, item.finding, 'author_caption')
    const img = await writeRuntimeImage(buf, rec.id)
    Object.assign(rec, { width: img.width, height: img.height, originalWidth: img.sourceWidth, originalHeight: img.sourceHeight, runtimeUrl: img.runtimeUrl, bytes: img.bytes })
    out.push(rec)
  } catch (e) {
    report.warnings.push(`${item.id}: ${e.message}`)
  }
}

const merged = mergeImages(out, { dataset: DATASET, replace: !!opts.replace })
report.selected = out.length
report.byFinding = summarize(out)
fs.mkdirSync(REPORTS_DIR, { recursive: true })
fs.writeFileSync(path.join(REPORTS_DIR, 'import-commons.json'), JSON.stringify(report, null, 2))
console.log(`Commons: ${out.length} görüntü içe aktarıldı; images.json toplam ${merged.count}`)
console.log(`bulunamayan/lisans reddedilen: ${report.notFound.length + report.licenseRejected.length}`)
