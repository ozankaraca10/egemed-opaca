#!/usr/bin/env node
/**
 * V9 (BRIEF_OPACA_V3) — Europe PMC açık erişim vaka raporu figürleri içe aktarıcı.
 *
 *   npm run import:europepmc [-- --limit 3 --dry-run --topic edema]
 *
 * Amaç: örneği hiç olmayan (edema, hyperinflation, elevated_hemidiaphragm) ve tek örnekli
 * (fracture, steeple_sign, epiglottitis_thumb_sign, air_trapping, hampton_hump, westermark_sign,
 * clavicle_fracture, foreign_body_radiopaque, diaphragm_hernia_congenital, hiatal_hernia,
 * ct_filling_defect, rib_fracture, scoliosis) konular için Europe PMC'den yeni öğrenme/uygulama
 * görselleri toplamak — Wikimedia Commons bu konularda tükendi (lisans filtresiyle yeni sonuç yok).
 *
 * Akış (konu başına fixtures/epmc-terms.json'daki her arama terimi için):
 *  1. `search` REST API'si — yalnız CC BY / CC BY-SA / CC0, OPEN_ACCESS:Y, HAS_FT:Y.
 *  2. Aday makale başına `fullTextXML` çekilir; JATS <fig> düğümleri ayrıştırılır (hafif regex —
 *     bu proje bir XML ayrıştırıcı bağımlılığı eklemiyor, yapı öngörülebilir).
 *  3. Altyazı, konunun anahtar sözcüklerinden birini VE genel "göğüs grafisi" (XR) ya da "BT" (CT)
 *     ifadesini içermeli.
 *  4. ÇOK PANELLİ figürler ATLANIR (altyazıda ≥2 "(A)"/"(B)"/"(C)" gibi alt-panel etiketi varsa) —
 *     tek görsel dosyasında birden çok kombine panel olduğunda otomatik kırpma güvenilir değil;
 *     yanlış/karışık bir görüntü içe aktarmaktansa atlamak tercih edildi.
 *  5. Kabul edilen figürün görseli, JATS <graphic> düğümünün yanındaki `<?cloudpmc-path ...?>`
 *     işleme talimatından türeyen `https://cdn.ncbi.nlm.nih.gov/pmc/{path}` adresinden indirilir
 *     (Europe PMC'nin kendi `.../bin/...` adresi güncel PMC düzeninde çalışmıyor; doğrulandı).
 *
 * KESİN KURAL (Ausculta §6 / OPACA mevcut kuralı ile aynı): bu görüntülerin etiket kaynağı HER ZAMAN
 * `author_caption`tır (tanı yazar altyazısına dayanır, radyolog doğrulaması DEĞİLDİR) — yalnız öğrenme
 * ve uygulamada kullanılır, DEĞERLENDİRME havuzuna asla girmez (generate-cases.mjs zaten bu kuralı
 * `EXPERT_SOURCES` üzerinden uyguluyor, burada ekstra bir şey gerekmiyor).
 *
 * İNSAN DENETİMİ: her yeni görüntü `clinicalReview: 'beklemede'` ile eklenir ve
 * docs/klinik-degerlendirme-listesi.csv'ye (generate-cases.mjs bir sonraki çalıştırmada) "hekim onayı
 * bekliyor" olarak düşer. Altyazıda ok/işaret olduğu tespit edilirse (embeddedPointer) ayrıca
 * `issues`'a not düşülür ki ileride yalnız-öğrenme kısıtı değerlendirilebilsin.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, REPORTS_DIR, parseArgs, writeRuntimeImage, setFinding, emptyRecord, mergeImages, summarize, safeId } from './lib/cxr-common.mjs'

const DATASET = 'europepmc'
const UA = 'EGEMED-Opaca/1.0 (egitim amacli akciger grafisi simulatoru; iletisim: ozandeu@yahoo.com)'
const SEARCH_API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'
const ACCEPTED_LICENSES = new Set(['cc by', 'cc by-sa', 'cc0'])
const GENERIC_XR_TERMS = ['chest radiograph', 'chest x-ray', 'chest xray', 'chest film', 'cxr', 'plain radiograph', 'radiograph', 'x-ray']
const GENERIC_CT_TERMS = ['computed tomography', 'ct scan', ' ct ', 'ct chest', 'ct pulmonary angiography', 'ctpa']
// steeple_sign/epiglottitis_thumb_sign gibi BOYUN konuları için ayrı, "chest" içermeyen genel terim listesi
// (BRIEF_OPACA_V3 mevcut şema kuralı: bu iki bulgu images.json'da bodyPart:'boyun' ile işaretlenir).
const GENERIC_NECK_XR_TERMS = ['neck x-ray', 'neck radiograph', 'lateral neck', 'soft tissue neck x-ray', 'radiograph']
const NECK_TOPICS = new Set(['steeple_sign', 'epiglottitis_thumb_sign'])
const CANDIDATES_PER_QUERY = 12

const { opts } = parseArgs(process.argv.slice(2))
const dryRun = !!opts['dry-run']
const perTopicLimit = opts.limit ? Number(opts.limit) : null
const onlyTopic = opts.topic

const termsPath = path.join(ROOT, 'fixtures', 'epmc-terms.json')
const { topics } = JSON.parse(fs.readFileSync(termsPath, 'utf8'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Europe PMC çok sayıda ardışık isteği (konu başına arama + onlarca fullTextXML çağrısı) zaman zaman
 *  429/5xx ile sınırlıyor; sessizce 0 sonuç dönmesin diye üstel geri çekilmeli yeniden deneme yapılır. */
async function fetchWithRetry(url, asJson, retries = 4) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...(asJson ? { Accept: 'application/json' } : {}) } })
      if (res.ok) return asJson ? res.json() : res.text()
      lastErr = new Error(`HTTP ${res.status} — ${url}`)
      if (res.status !== 429 && res.status < 500) break
    } catch (e) {
      lastErr = e
    }
    if (i < retries) await sleep(500 * 2 ** i)
  }
  throw lastErr
}

async function getJson(url) {
  return fetchWithRetry(url, true)
}

async function getText(url) {
  return fetchWithRetry(url, false)
}

async function searchArticles(query) {
  const q = `(${query}) AND (LICENSE:"cc by" OR LICENSE:"cc by-sa" OR LICENSE:"cc0") AND OPEN_ACCESS:Y AND HAS_FT:Y`
  const url = `${SEARCH_API}?${new URLSearchParams({ query: q, resultType: 'core', format: 'json', pageSize: String(CANDIDATES_PER_QUERY) })}`
  const j = await getJson(url)
  return (j.resultList?.result ?? []).filter((r) => r.pmcid && ACCEPTED_LICENSES.has((r.license ?? '').toLowerCase()))
}

const strip = (s) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

/** JATS <fig>...</fig> bloklarını, altyazı metnini ve görselin cdn.ncbi.nlm.nih.gov/pmc/ altındaki
 *  göreli yolunu hafif regex ile çıkarır. Europe PMC/PMC yayıncıdan yayıncıya iki farklı işleme
 *  talimatı (PI) biçimi kullanıyor (test edildi):
 *   A) Wiley vb.: <graphic ... content-type="image" ...><?cloudpmc-path {yol}?>
 *   B) Cureus vb.: <graphic ...><?image-cloudpmc-urn urn:cdn:{yol}?> (+ ayrıca thumb-cloudpmc-urn —
 *      bu THUMBNAIL'dır, PI adı "image-" ile başlayanı tercih edilir, "thumb-" ile başlayan atlanır). */
function extractImagePath(block) {
  let m = /<\?cloudpmc-path\s+([^?\s][^?]*?)\?>/.exec(block)
  if (m) return m[1].trim()
  m = /<\?image-cloudpmc-urn\s+urn:cdn:([^?\s][^?]*?)\?>/.exec(block)
  if (m) return m[1].trim()
  return null
}

function extractFigures(xml) {
  const figs = []
  const figRe = /<fig[^>]*>([\s\S]*?)<\/fig>/g
  let m
  while ((m = figRe.exec(xml))) {
    const block = m[1]
    const capMatch = /<caption>([\s\S]*?)<\/caption>/.exec(block)
    const caption = strip(capMatch?.[1] ?? '')
    const cloudpmcPath = extractImagePath(block)
    if (!caption || !cloudpmcPath) continue
    figs.push({ caption, cloudpmcPath })
  }
  return figs
}

/** Altyazıda birden çok alt-panel etiketi ("(A)" "(B)" ..., "(a-b)", "(left)...(right)") varsa
 *  bileşik/kombine figürdür — otomatik kırpma güvenilir olmadığından atlanır. */
function isMultiPanel(caption) {
  const letterPanels = caption.match(/\([A-H]\)|\([a-h]\)/g)
  if (letterPanels && letterPanels.length >= 2) return true
  if (/\([a-h]\s*[-–]\s*[a-h]\)/i.test(caption)) return true // "(a-b)", "(A-D)" tek parantez aralığı
  if (/\(left\)/i.test(caption) && /\(right\)/i.test(caption)) return true // iki görüntü yan yana
  return false
}

function hasEmbeddedPointer(caption) {
  return /\barrow(s|head)?\b|\byellow\b.*\barrow\b|\bpointer\b/i.test(caption)
}

/** Projeksiyon/pozisyon, görüntünün kendi altyazısındaki ifadeden çıkarılır (uydurma değil — yazarın
 *  kendi tanımı); belirsizse (hem lateral hem AP/PA aynı altyazıda geçiyorsa, ya da hiçbiri geçmiyorsa)
 *  'unknown' döner ve generate-cases.mjs projeksiyon sorusu üretmez (mevcut kural, değişmedi). */
function inferViewPosition(caption, topicKey) {
  const low = caption.toLowerCase()
  const hasLateral = /\blateral\b/.test(low)
  const hasAP = /\banteroposterior\b|\banterior-posterior\b|\(ap\)|\bap view\b|\bap chest\b|\bap radiograph\b/.test(low)
  const hasPA = /\bposteroanterior\b|\bposterior-anterior\b|\(pa\)|\bpa view\b|\bpa chest\b|\bpa radiograph\b|\bposterior[- ]anterior\b/.test(low)
  const neck = NECK_TOPICS.has(topicKey)
  if (hasLateral && !hasAP && !hasPA) return 'LAT'
  if (hasAP && !hasLateral && !hasPA) return neck ? 'NECK_AP' : 'AP'
  if (hasPA && !hasLateral && !hasAP) return 'PA'
  if (/\bfrontal\b/.test(low) && !hasLateral) return neck ? 'NECK_AP' : 'AP'
  return 'unknown'
}

function matchesModality(caption, modality, topicKey) {
  const low = caption.toLowerCase()
  const terms = modality === 'CT' ? GENERIC_CT_TERMS : NECK_TOPICS.has(topicKey) ? GENERIC_NECK_XR_TERMS : GENERIC_XR_TERMS
  return terms.some((t) => low.includes(t))
}

function matchesTopic(caption, keywords) {
  const low = caption.toLowerCase()
  return keywords.some((k) => low.includes(k.toLowerCase()))
}

const report = { dataset: DATASET, byTopic: {}, warnings: [] }
const drafts = [] // { topicKey, finding, modality, pmcid, articleTitle, caption, cloudpmcPath, embeddedPointer, doi }

const topicEntries = Object.entries(topics).filter(([key]) => !onlyTopic || key === onlyTopic)

for (const [topicKey, cfg] of topicEntries) {
  const want = perTopicLimit ?? cfg.targetCount ?? 2
  const picked = []
  const seen = new Set()
  for (const query of cfg.queries) {
    if (picked.length >= want) break
    let results
    try {
      results = await searchArticles(query)
    } catch (e) {
      report.warnings.push(`${topicKey}: arama başarısız (${query}) — ${e.message}`)
      continue
    }
    for (const r of results) {
      if (picked.length >= want) break
      if (seen.has(r.pmcid)) continue
      seen.add(r.pmcid)
      await sleep(120) // API'yi yormamak için istekler arasında küçük bekleme
      let xml
      try {
        xml = await getText(`https://www.ebi.ac.uk/europepmc/webservices/rest/${r.pmcid}/fullTextXML`)
      } catch (e) {
        report.warnings.push(`${topicKey}/${r.pmcid}: fullTextXML alınamadı — ${e.message}`)
        continue
      }
      const figs = extractFigures(xml)
      for (const fig of figs) {
        if (picked.length >= want) break
        if (isMultiPanel(fig.caption)) continue
        if (!matchesModality(fig.caption, cfg.modality, topicKey)) continue
        // Altyazı bazen bulgu adını tekrarlamaz (ör. "Chest radiograph. Increased lucency...") ama
        // makale BAŞLIĞI teşhisi doğrudan adlandırır (ör. "...Westermark Sign..."); yazarın kendi
        // başlığı da "yazar kaynaklı" bir iddiadır — bu yüzden anahtar sözcük altyazı VEYA başlıkta aranır.
        const titleMatch = matchesTopic(r.title ?? '', cfg.captionKeywords)
        const captionMatch = matchesTopic(fig.caption, cfg.captionKeywords)
        if (!captionMatch && !titleMatch) continue
        picked.push({
          topicKey,
          finding: topicKey,
          modality: cfg.modality,
          pmcid: r.pmcid,
          articleTitle: r.title,
          authorString: r.authorString,
          doi: r.doi,
          caption: fig.caption,
          cloudpmcPath: fig.cloudpmcPath,
          embeddedPointer: hasEmbeddedPointer(fig.caption),
          matchedViaTitle: !captionMatch && titleMatch,
        })
      }
    }
  }
  report.byTopic[topicKey] = { wanted: want, found: picked.length, pmcids: picked.map((p) => p.pmcid) }
  console.log(`${topicKey}: ${picked.length}/${want} bulundu${picked.length ? ' (' + picked.map((p) => p.pmcid).join(', ') + ')' : ''}`)
  drafts.push(...picked)
}

if (dryRun) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  fs.writeFileSync(path.join(REPORTS_DIR, 'import-europepmc.json'), JSON.stringify({ ...report, dryRun: true, wouldImport: drafts.length, drafts }, null, 2))
  console.log(`[dry-run] ${drafts.length} görüntü içe aktarılacaktı`)
  process.exit(0)
}

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
const usedIds = new Set()
for (const d of drafts) {
  try {
    const url = `https://cdn.ncbi.nlm.nih.gov/pmc/${d.cloudpmcPath}`
    const buf = await downloadWithRetry(url)
    // id, görüntü dosyasının kendi (kararlı) adından türetilir — bir önceki turdaki gibi çalıştırma-
    // yerel bir sayaçtan DEĞİL. Böylece betik birden çok kez (farklı konularla/kısmi denemelerle)
    // çalıştırıldığında aynı kaynak görüntü her zaman aynı id'yi alır (mergeImages güvenle günceller,
    // aynı görüntü için yinelenen kayıt oluşmaz).
    let id = `epmc_${d.pmcid.toLowerCase()}_${safeId(path.basename(d.cloudpmcPath))}`
    if (usedIds.has(id)) id = `${id}_${usedIds.size}`
    usedIds.add(id)
    const rec = emptyRecord(id, DATASET, path.basename(d.cloudpmcPath))
    rec.viewPosition = d.modality === 'CT' ? 'CT_AXIAL' : inferViewPosition(d.caption, d.topicKey)
    rec.population = 'yetiskin'
    rec.bodyPart = NECK_TOPICS.has(d.topicKey) ? 'boyun' : 'toraks'
    rec.modality = d.modality
    rec.license = {
      name: 'CC BY 4.0 (Europe PMC açık erişim — bkz. makale için tam lisans metni)',
      url: `https://europepmc.org/article/PMC/${d.pmcid}`,
      author: d.authorString ?? 'Bilinmiyor (Europe PMC yazar(lar)ı)',
      attribution: `${d.authorString ?? 'Yazar(lar) bilinmiyor'}. "${d.articleTitle}". ${d.doi ? `doi:${d.doi}. ` : ''}Europe PMC ${d.pmcid} (açık erişim).`,
      sourceUrl: `https://europepmc.org/article/PMC/${d.pmcid}`,
    }
    rec.issues.push(
      `Bu görüntünün bulgu bilgisi Europe PMC ${d.pmcid} makalesinin figür altyazısına dayanır (author_caption); radyolog tarafından doğrulanmamıştır — hekim onayı bekliyor.`
    )
    rec.issues.push(`Figür altyazısı: ${d.caption}`)
    if (d.matchedViaTitle) {
      rec.issues.push(`Not: bulgu anahtar sözcüğü altyazıda değil, makale başlığında geçiyor — "${d.articleTitle}" (yazar kaynaklı teşhis iddiası, radyolog doğrulaması değil).`)
    }
    if (d.embeddedPointer) {
      rec.issues.push(
        'Altyazı gömülü ok/işaret sözcüğü içeriyor olabilir (görüntü üzerinde ok/işaretleme bulunabilir) — öğrenciye ipucu vermemesi için bu görüntü yalnız öğrenme amaçlı kullanılmalı, hekim onayında ayrıca değerlendirilmeli.'
      )
    }
    setFinding(rec, d.finding, 'author_caption')
    const img = await writeRuntimeImage(buf, rec.id)
    Object.assign(rec, { width: img.width, height: img.height, originalWidth: img.sourceWidth, originalHeight: img.sourceHeight, runtimeUrl: img.runtimeUrl, bytes: img.bytes })
    out.push(rec)
    console.log(`indirildi: ${id} (${d.topicKey}, ${d.pmcid})`)
  } catch (e) {
    report.warnings.push(`${d.pmcid}: indirme başarısız — ${e.message}`)
  }
}

const merged = mergeImages(out, { dataset: DATASET, replace: !!opts.replace })
report.imported = out.length
report.byFinding = summarize(out)
fs.mkdirSync(REPORTS_DIR, { recursive: true })
fs.writeFileSync(path.join(REPORTS_DIR, 'import-europepmc.json'), JSON.stringify(report, null, 2))
console.log(`Europe PMC: ${out.length} görüntü içe aktarıldı; images.json toplam ${merged.count}`)
if (report.warnings.length) console.log(`Uyarılar: ${report.warnings.length} (bkz. reports/import-europepmc.json)`)
