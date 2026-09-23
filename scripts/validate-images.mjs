#!/usr/bin/env node
/**
 * Görüntü ve vaka envanteri doğrulaması (Ausculta validate-audio.mjs karşılığı).
 * Fatal hatada çıkış kodu 1 → paketleme durur.
 *
 * Denetimler:
 *  - images.json: runtime dosyası var ve çözülebilir; boyutlar kayıtla aynı; bulgu anahtarları taksonomide
 *  - kutular 0–1 aralığında ve alanı > 0; kutunun bulgusu kayıtta uzman kaynaklı pozitif
 *  - veri seti ve etiket kaynağı lisansı doğrulanmış (sources.json datasets[].licenseVerified — V6/V11:
 *    eski `inventory` listesi kaldırıldı, lisans durumu artık doğrudan `datasets` kaydının üstünde);
 *    OPACA_ALLOW_LICENSE_REVIEW=1 yalnız yerel geliştirmede bu denetimi uyarıya çevirir
 *  - V11: sources.json'da atfı olup images.json'da HİÇ kaydı olmayan veri seti varsa hata (kullanılmayan atıf)
 *  - vakalar: görüntü var; değerlendirme vakasının ana bulgusu uzman kaynaklı ve film yetişkin;
 *    lokalizasyon hedefinin uzman kutusu var VE kutu alanı %35'ten küçük (V3); seçmeli soruların doğru
 *    yanıtı seçeneklerde
 *  - kütüphane: bestZones geçerli okuma bölgeleri; her öğretilen bulgunun kütüphane kalemi var;
 *    interpretation/nextStepQuestion en az 3 varyant içeren dizi (V2)
 *  - V2 (düzeltilmiş tanım, koordinatör kararı 23 Eylül): bilgi sorusu (interpretation) varyantı havuzda
 *    >4 vakada kullanılmışsa HATA; bulgudan bağımsız genel soru (ör. ABCDE sırası) oranı >%10 ise HATA.
 *    Eski ≥0,45 "benzersiz/toplam" ölçütü KALDIRILDI (görüntüye bağlı meşru tekrarları haksız sayıyordu);
 *    eski oran yine de reports/validate-images.json'da bilgi amaçlı raporlanır.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { ROOT, DATA_DIR, readJson, EXPERT } from './lib/cxr-common.mjs'
import {
  questionSignature, legacyQuestionSignature, genericQuestionRatio, IMAGE_DEPENDENT_TYPES,
  KNOWLEDGE_QUESTION_CAP, GENERIC_QUESTION_MAX_RATIO, boxArea, MAX_LOCALIZATION_BOX_AREA,
  hasEnoughOptions, MIN_ASSESSMENT_OPTIONS,
} from './lib/case-selection.mjs'

// V9: dosya bazlı lisanslı, author_caption kaynaklı veri setleri — görüntüye özgü lisans zorunlu,
// değerlendirme havuzuna asla giremez (Wikimedia Commons + Europe PMC açık erişim figürleri).
const FILE_LICENSED_DATASETS = new Set(['wikimedia-commons', 'europepmc'])
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
const datasetById = new Map(sources.datasets.map((d) => [d.id, d]))
const cases = [
  ...readJson(path.join(DATA_DIR, 'cases.json'), { cases: [] }).cases,
  ...readJson(path.join(DATA_DIR, 'cases-auto.json'), { cases: [] }).cases,
]

const licenseProblem = (id, what) => {
  // sources.json'daki `datasets` dizisi TEK doğruluk kaynağıdır (atıf metni ve lisans durumu burada).
  const d = datasetById.get(id)
  if (!d) return fatal.push(`${what}: ${id} için atıf (sources.datasets) yok`)
  if (!d.licenseVerified) (allowReview ? warn : fatal).push(`${what}: ${id} lisansı doğrulanmadı${allowReview ? ' (yerel geliştirme izni)' : ''}`)
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
  // dosya bazlı lisanslı kaynaklar (Wikimedia Commons, V9: Europe PMC): görüntüye özgü lisans zorunlu
  if (FILE_LICENSED_DATASETS.has(r.sourceDataset)) {
    const lic = r.license
    if (!lic || !lic.name || !lic.url || !lic.author || !lic.attribution || !lic.sourceUrl) {
      fatal.push(`${tag}: ${r.sourceDataset} görüntüsünde eksik/geçersiz lisans bilgisi`)
    }
  }
  if (r.findings && Object.values(r.findings).includes('author_caption') && !FILE_LICENSED_DATASETS.has(r.sourceDataset)) {
    warn.push(`${tag}: author_caption kaynaklı ama veri seti dosya-bazlı lisanslı bir kaynak değil (${r.sourceDataset})`)
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
// V11: atıf verilen ama hiç kullanılmayan veri seti — hata (elle silmek yerine üretim sırasında doğrulanır)
for (const d of sources.datasets) if (!usedDatasets.has(d.id)) fatal.push(`sources.datasets: ${d.id} için atıf var ama images.json'da hiç kayıt yok (kullanılmayan veri seti — sources.json'dan kaldırılmalı)`)

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
    if (FILE_LICENSED_DATASETS.has(img.sourceDataset)) fatal.push(`${tag}: değerlendirmede ${img.sourceDataset} (author_caption) kaynaklı film — bu havuza asla girmemeli`)
    if (c.mappingValidation !== 'validated') fatal.push(`${tag}: değerlendirme vakası doğrulanmamış eşleme`)
  }
  for (const z of c.technique?.requiredZones ?? []) if (!zoneIds.has(z)) fatal.push(`${tag}: bilinmeyen bölge ${z}`)
  for (const q of c.questions) {
    if (q.type === 'localization') {
      const boxes = img.annotations.filter((a) => a.finding === q.targetFinding && EXPERT.has(a.source))
      if (!boxes.length) fatal.push(`${tag}/${q.id}: hedef bulgu için uzman kutusu yok`)
      // V3: çok büyük kutuda (görüntü alanının ≥%35'i) lokalizasyon sorusu üretilmemeli — işaret
      // neredeyse her yere konsa doğru sayılır, öğretici değildir. generate-cases.mjs'deki filtrenin
      // ikinci savunma hattı (kod değişirse/elle vaka eklenirse de yakalanır).
      if (boxes.length && Math.max(...boxes.map(boxArea)) >= MAX_LOCALIZATION_BOX_AREA) {
        fatal.push(`${tag}/${q.id}: hedef kutu alanı ≥%${Math.round(MAX_LOCALIZATION_BOX_AREA * 100)} — lokalizasyon sorusu üretilmemeliydi (V3)`)
      }
      continue
    }
    const ids = new Set(q.options.map((o) => o.id))
    if (!q.correct.length || !q.correct.every((x) => ids.has(x))) fatal.push(`${tag}/${q.id}: doğru yanıt seçeneklerde yok`)
    // BRIEF_OPACA_DISTRACTORS §5: değerlendirme havuzunda seçmeli bir soru <3 seçenekliyse hata (ikinci
    // savunma hattı — generate-cases.mjs modes kararında zaten eleniyor olmalı, kural gevşetilmez).
    if (inAssessment && !hasEnoughOptions(q)) fatal.push(`${tag}/${q.id}: değerlendirme vakasında ${q.options.length} seçenekli seçmeli soru (<${MIN_ASSESSMENT_OPTIONS}, V/§5)`)
    if (q.domain === 'diagnosis' && c.mappingValidation !== 'validated') fatal.push(`${tag}/${q.id}: doğrulanmamış tanı sorusu`)
  }
  if (c.clinicalReview !== 'onayli') warn.push(`${tag}: hekim onayı bekliyor`)
}

// V2 (düzeltilmiş tanım — koordinatör kararı 23 Eylül; eski ≥0,45 "benzersiz/toplam" ölçütünün YERİNE
// geçer, o ölçüt görüntüye bağlı ama meşru biçimde aynı kalıpta sorulan soruları haksız yere tekrar
// sayıyordu). Eski tanım yalnız RAPOR karşılaştırması için hâlâ hesaplanır (kabul ölçütü değildir).
const allQAndImage = cases.flatMap((c) => c.questions.map((q) => ({ q, imageId: c.imageId })))
const legacySignatures = allQAndImage.map(({ q }) => legacyQuestionSignature(q))
const legacyRatio = legacySignatures.length ? new Set(legacySignatures).size / legacySignatures.length : 1

// §2a: bir oturumda aynı BİLGİ sorusu iki kez çıkmaz — bu, sampleSession'ın (src/core/session.ts /
// case-selection.mjs) çakışma-kaçınma mantığıyla garanti edilir; birim testinde 1000 rastgele tohumla
// doğrulanır (tests/core.test.ts). Burada yalnız havuz genelinde statik ölçütler denetlenir.

// §2b: her BİLGİ sorusu varyantı havuzda en fazla KNOWLEDGE_QUESTION_CAP (4) vakada kullanılabilir.
const knowledgeQs = allQAndImage.filter(({ q }) => !IMAGE_DEPENDENT_TYPES.has(q.type))
const knowledgeSignatures = knowledgeQs.map(({ q }) => questionSignature(q))
const knowledgeRatio = knowledgeSignatures.length ? new Set(knowledgeSignatures).size / knowledgeSignatures.length : 1
const knowledgeCounts = new Map()
for (const sig of knowledgeSignatures) knowledgeCounts.set(sig, (knowledgeCounts.get(sig) ?? 0) + 1)
for (const [sig, count] of knowledgeCounts) {
  if (count > KNOWLEDGE_QUESTION_CAP) fatal.push(`soru havuzu: bilgi sorusu varyantı ${count} vakada kullanılmış (>${KNOWLEDGE_QUESTION_CAP}, V2/§2b) — ${sig}`)
}

// §2d: "ABCDE sırası" gibi bulgudan bağımsız genel sorular havuzdaki vakaların en fazla %10'unda olabilir.
const genRatio = genericQuestionRatio(cases)
if (genRatio > GENERIC_QUESTION_MAX_RATIO) {
  fatal.push(`soru havuzu: bulgudan bağımsız genel soru oranı ${genRatio.toFixed(3)} > ${GENERIC_QUESTION_MAX_RATIO} (V2/§2d)`)
}

const libFindings = new Set()
for (const g of library)
  for (const it of g.items) {
    if (it.finding) libFindings.add(it.finding)
    for (const z of it.bestZones) if (!zoneIds.has(z)) fatal.push(`kütüphane ${it.key}: bilinmeyen bölge ${z}`)
    if (it.finding && !findings[it.finding]) fatal.push(`kütüphane ${it.key}: bilinmeyen bulgu ${it.finding}`)
    // V2: interpretation/nextStepQuestion artık varyant dizisi — en az 3 varyant, hepsi prompt/seçenek bakımından geçerli
    for (const [field, templates] of [['interpretation', it.interpretation], ['nextStepQuestion', it.nextStepQuestion]]) {
      if (!templates) continue
      if (!Array.isArray(templates) || templates.length < 3) fatal.push(`kütüphane ${it.key}.${field}: en az 3 varyant içeren bir dizi olmalı (V2)`)
      for (const t of templates) {
        const ids = new Set((t.options ?? []).map((o) => o.id))
        if (!t.correct?.length || !t.correct.every((c) => ids.has(c))) fatal.push(`kütüphane ${it.key}.${field}: doğru yanıt seçeneklerde yok`)
      }
    }
  }
for (const [f, def] of Object.entries(findings)) if (def.teaching && !libFindings.has(f)) fatal.push(`bulgu ${f}: öğretilen bulgunun kütüphane kalemi yok`)
for (const f of libFindings) if (!images.records.some((r) => r.findings[f])) warn.push(`kütüphane ${f}: örnek film yok (veri bekleniyor)`)
if (assessment < 10) warn.push(`değerlendirme havuzu ${assessment} vaka (<10): oturumlar kısa kalır`)

// paket boyutu bütçesi: OPACA-V2-ICERIK-PLANI.md hedefi ≤ 60 MB (yalnız görüntü paketi; build çıktısı hariç)
const BUDGET_BYTES = 60 * 1024 * 1024
const totalMB = totalBytes / 1024 / 1024
if (totalBytes > BUDGET_BYTES) warn.push(`görüntü paketi ${totalMB.toFixed(1)} MB, hedef ≤ 60 MB'yi aşıyor`)
else if (totalBytes > BUDGET_BYTES * 0.85) warn.push(`görüntü paketi ${totalMB.toFixed(1)} MB, 60 MB hedefine yaklaşıyor`)

const byDataset = {}
for (const r of images.records) {
  const d = (byDataset[r.sourceDataset] ??= { count: 0, bytes: 0 })
  d.count++
  d.bytes += fs.existsSync(path.join(ROOT, 'public', r.runtimeUrl)) ? fs.statSync(path.join(ROOT, 'public', r.runtimeUrl)).size : 0
}

// G4: 400+ uyarı satırı konsolu boğuyordu (çoğu tekrarlayan "hekim onayı bekliyor" / lisans / eksik
// örnek film kalıpları). Kurallar gevşetilmedi — tüm uyarılar hâlâ üretiliyor ve reports/validate-images.json
// içinde tek tek yer alıyor; konsola yalnız türe göre gruplanmış özet satırları ve "diğer" kategorisindeki
// (ilk kez görülen / öngörülemeyen) uyarılar basılıyor.
const CATEGORIES = [
  { key: 'hekimOnayi', label: 'hekim onayı bekliyor', test: (w) => w.includes('hekim onayı') },
  { key: 'lisans', label: 'lisans', test: (w) => w.startsWith('lisans:') },
  { key: 'ornekFilmYok', label: 'kütüphane: örnek film yok', test: (w) => w.includes('örnek film yok') },
]
const grouped = Object.fromEntries(CATEGORIES.map((c) => [c.key, []]))
const other = []
for (const w of warn) {
  const cat = CATEGORIES.find((c) => c.test(w))
  if (cat) grouped[cat.key].push(w)
  else other.push(w)
}
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports', 'validate-images.json'), JSON.stringify({
  fatal, warn, warnSummary: Object.fromEntries(CATEGORIES.map((c) => [c.key, grouped[c.key].length])),
  images: images.records.length, cases: cases.length, assessment, totalBytes, totalMB: Number(totalMB.toFixed(2)), byDataset,
  questionSignatures: {
    legacy: { total: legacySignatures.length, unique: new Set(legacySignatures).size, ratio: Number(legacyRatio.toFixed(3)) },
    knowledgeOnly: { total: knowledgeSignatures.length, unique: new Set(knowledgeSignatures).size, ratio: Number(knowledgeRatio.toFixed(3)), cap: KNOWLEDGE_QUESTION_CAP },
    genericQuestionRatio: Number(genRatio.toFixed(3)),
  },
}, null, 2))
for (const w of other) console.warn('uyarı:', w)
for (const f of fatal) console.error('HATA:', f)
const summaryParts = CATEGORIES.filter((c) => grouped[c.key].length).map((c) => `${grouped[c.key].length} ${c.label}`)
if (other.length) summaryParts.push(`${other.length} diğer`)
console.log(`Doğrulama: ${images.records.length} görüntü (${totalMB.toFixed(1)} MB), ${cases.length} vaka, ${assessment} değerlendirme vakası — ${fatal.length} hata, ${warn.length} uyarı (${summaryParts.join(', ') || 'uyarı yok'})`)
console.log(`Soru imzası — eski tanım (bilgi amaçlı): ${new Set(legacySignatures).size}/${legacySignatures.length} (oran ${legacyRatio.toFixed(3)})`)
console.log(`Soru imzası — yeni tanım, yalnız bilgi soruları (kabul ölçütü §2b): ${new Set(knowledgeSignatures).size}/${knowledgeSignatures.length} (oran ${knowledgeRatio.toFixed(3)}, tavan ${KNOWLEDGE_QUESTION_CAP}/varyant)`)
console.log(`Bulgudan bağımsız genel soru oranı (§2d, hedef ≤${GENERIC_QUESTION_MAX_RATIO}): ${genRatio.toFixed(3)}`)
console.log('Ayrıntı: reports/validate-images.json (docs/klinik-degerlendirme-listesi.csv hekim onayı listesi)')
console.log('Kaynak seti başına:', byDataset)
process.exit(fatal.length ? 1 : 0)
