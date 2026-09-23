#!/usr/bin/env node
/**
 * Görüntü envanterinden vaka üretici (npm run cases).
 *
 * Kaynak: src/data/images.json + library.json + findings.json (+ cases.json'daki elle yazılmış vakalar atlanır)
 * Çıktı:  src/data/cases-auto.json ve docs/klinik-degerlendirme-listesi.csv (hekim onay listesi)
 *
 * BRIEF_OPACA_V3 — V1/V10 (200 vakalık katmanlı seçim) + V2 (soru tekrarını bitirme) + V3 (büyük kutu
 * filtresi) bu turda birlikte uygulanır:
 *  - images.json'daki 562 görüntü SİLİNMEZ; yalnız vaka üretimi ~200 vakayla sınırlanır (aşama 1).
 *    Seçilmeyen görüntüler öğrenme kütüphanesinde (Learn ekranı, images.json'ı doğrudan okur) kalır.
 *  - Seçim iki aşamalıdır: (a) her görüntü için aday "vaka" hesaplanır (ana bulgu, uzman/box durumu),
 *    (b) adaylar hedef dağılım kovalarına (bkz. BUCKET_TARGET) göre V10 puanıyla sıralanıp seçilir —
 *    hasta düzeyinde bağımsızlık (V1 kural 4) ve pediatrik oran ≤%15 (V1 kural 5) bu aşamada uygulanır.
 *  - Yalnız SEÇİLEN görüntüler için soru üretilir (aşama 2, eski tek-geçişli mantığın aynısı + V2/V3 eklentileri).
 *
 * Kurallar (Ausculta §6 karşılığı, korunur):
 *  - Değerlendirme vakası yalnız uzman kaynaklı ana bulguyla ve yetişkin filmiyle üretilir.
 *  - Rapor tabanlı (NLP) ve yükleyici açıklamalı (author_caption) etiketli filmler yalnız uygulama vakası
 *    olur; bulgu sorusu sorulmaz (author_caption'da hiç, NLP'de de expert olmadığından sorulmaz), not düşülür.
 *  - Çeldiriciler yalnız "güvenli" bulgulardan seçilir.
 *  - Lokalizasyon sorusu yalnız ana bulgu için uzman kutusu varsa VE kutu alanı görüntünün %35'inden
 *    küçükse sorulur (V3) — aksi halde yalnız bulgu tanıma sorulur.
 *  - Projeksiyon sorusu DICOM meta verisinden (PA/AP) gelir.
 *  - Tanı sorusu üretilmez.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, DATA_DIR, readJson, EXPERT } from './lib/cxr-common.mjs'
import { csvEscape } from './lib/csv.mjs'
import { allowPediatric } from './lib/pediatric-ratio.mjs'
import {
  patientKey, candidateScore, createVariantAssigner, boxArea, MAX_LOCALIZATION_BOX_AREA,
  questionSignature, legacyQuestionSignature, createKnowledgeCapTracker, genericQuestionRatio,
  IMAGE_DEPENDENT_TYPES, KNOWLEDGE_QUESTION_CAP, GENERIC_QUESTION_MAX_RATIO,
  safeDistractors, orderDistractorsByDifferential, caseSelectableOk,
} from './lib/case-selection.mjs'

const images = readJson(path.join(DATA_DIR, 'images.json'), { records: [] }).records
const library = readJson(path.join(DATA_DIR, 'library.json'), { groups: [] })
const findings = readJson(path.join(DATA_DIR, 'findings.json'), { findings: {} }).findings
const sources = readJson(path.join(DATA_DIR, 'sources.json'), { datasets: [] })
const core = readJson(path.join(DATA_DIR, 'cases.json'), { cases: [] }).cases

const libByFinding = {}
for (const g of library.groups) for (const it of g.items) if (it.finding) libByFinding[it.finding] = it
const systematicItem = library.groups.flatMap((g) => g.items).find((it) => it.key === 'finding.normal')
const TEACHING = Object.keys(findings).filter((f) => findings[f].teaching)
// ana bulgu önceliği (birden çok uzman pozitifi olduğunda) — daha spesifik/acil bulgular önde
const PRIORITY = [
  'pneumothorax', 'ct_filling_defect', 'westermark_sign', 'hampton_hump',
  'tuberculosis_cavity', 'miliary_pattern', 'tuberculosis_fibrosis', 'tuberculosis',
  'foreign_body_radiopaque', 'air_trapping', 'steeple_sign', 'epiglottitis_thumb_sign',
  'diaphragm_hernia_congenital', 'hiatal_hernia', 'elevated_hemidiaphragm',
  'nodule_mass', 'airspace_opacity', 'pleural_effusion', 'cardiomegaly', 'hyperinflation',
  'atelectasis', 'edema', 'emphysema', 'rib_fracture', 'clavicle_fracture', 'fracture', 'scoliosis',
  'normal',
]
const READING_ZONES = ['a_trachea', 'b_r_upper', 'b_l_upper', 'b_r_mid', 'b_l_mid', 'b_r_lower', 'b_l_lower', 'c_heart', 'd_r_diaphragm', 'd_l_diaphragm', 'e_bones']
const DEFAULT_WEIGHTS = { technique: 10, systematic: 5, quality: 10, localization: 25, recognition: 25, interpretation: 15, diagnosis: 10 }
const VIEW_LABEL = { PA: 'PA (arka-ön)', AP: 'AP (ön-arka)', LAT: 'Lateral', NECK_AP: 'Boyun — AP' }
const coreImageIds = new Set(core.map((c) => c.imageId))
const attribution = Object.fromEntries(sources.datasets.map((d) => [d.id, d.attributionText]))
// V1: pediatrik vakalar yalnız uygulamada ve sınırlı oranda — ≤%15 (önceki tur ≤%20 idi)
const PEDIATRIC_MAX_RATIO = 0.15

/** Deterministik PRNG (görüntü id'sinden) — çeldirici seçimi her çalıştırmada aynı kalır */
function rng(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}
const shuffle = (arr, rnd) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function weightsFor(domains) {
  const w = { ...DEFAULT_WEIGHTS }
  for (const d of ['quality', 'localization', 'recognition', 'interpretation', 'diagnosis']) if (!domains.has(d)) w[d] = 0
  const deficit = 100 - Object.values(w).reduce((s, v) => s + v, 0)
  const target = domains.has('recognition') ? 'recognition' : domains.has('interpretation') ? 'interpretation' : 'quality'
  w[target] += deficit
  return w
}

/* =====================================================================================
 * AŞAMA 1 — Aday hesaplama + V10 katmanlı seçim (200 vaka hedefi, ±%10 esneklik)
 * ===================================================================================== */

/** V1 hedef dağılımı (BRIEF_OPACA_V3 §V1 tablosu). 'diğer' kovasına eşlenmeyen her bulgu düşer
 *  (herni, kırık, skolyoz, yabancı cisim, krup, PE, BT, ödem — çoğunlukla Commons/author_caption). */
const FINDING_TO_BUCKET = {
  normal: 'normal',
  airspace_opacity: 'airspace_opacity',
  tuberculosis: 'tuberculosis',
  tuberculosis_cavity: 'tuberculosis_cavity',
  tuberculosis_fibrosis: 'tuberculosis_fibrosis',
  miliary_pattern: 'miliary_pattern',
  nodule_mass: 'nodule_mass',
  pleural_effusion: 'pleural_effusion',
  pneumothorax: 'pneumothorax',
  atelectasis: 'atelectasis',
  cardiomegaly: 'cardiomegaly',
  emphysema: 'emphysema_hyperinflation',
  hyperinflation: 'emphysema_hyperinflation',
}
const bucketOf = (finding) => FINDING_TO_BUCKET[finding] ?? 'diger'
// Kova sırası = brifin V1 tablosundaki sıra; pediatrik oran kapasitesi bu sırayla dolar.
const BUCKET_TARGET = {
  normal: 30,
  airspace_opacity: 25,
  tuberculosis: 18,
  tuberculosis_cavity: 10,
  tuberculosis_fibrosis: 10,
  miliary_pattern: 2,
  nodule_mass: 20,
  pleural_effusion: 12,
  pneumothorax: 15,
  atelectasis: 12,
  cardiomegaly: 14,
  emphysema_hyperinflation: 10,
  // 'diğer' brifte "~22" olarak verilmiş; ancak 22 Commons görüntüsünden 4'ü (2 normal, 1 nodule_mass,
  // 1 pneumothorax BT) kendi bulgu kovalarına düşüyor (FINDING_TO_BUCKET'ta ayrıca eşlenmiş). Gerçek
  // "diğer" adayı: 18 Commons görüntüsü (herni/kırık/skolyoz/yabancı cisim/krup/PE) + 1 NIH
  // "no_finding_report" (sistematik okuma) = 19 — bu, bu veri setindeki gerçek tavandır.
  diger: 19,
}

/** Görüntünün ana bulgusunu ve uzman/kutu durumunu hesaplar (V1 seçiminden ÖNCE, tüm adaylar için).
 *  NOT: önceki sürümde author_caption (Wikimedia Commons) etiketleri asla `primary` olamıyordu —
 *  bu nedenle Commons'tan içe aktarılan 22 görüntünün TAMAMI vaka üretiminde sessizce atlanıyordu
 *  (0 Commons vakası). V1/V10 "diğer" kovasının Commons'a dayanması için bu düzeltildi: uzman/NLP
 *  yoksa author_caption da bir öncelik kademesi olarak kabul edilir (yine değerlendirmeye giremez,
 *  `expert` yalnız EXPERT_SOURCES için true kalır). */
function computeCandidate(img) {
  const expertPos = PRIORITY.filter((f) => img.findings[f] && EXPERT.has(img.findings[f]))
  const withBox = expertPos.filter((f) => img.annotations.some((a) => a.finding === f && EXPERT.has(a.source)))
  const nlpPos = PRIORITY.filter((f) => img.findings[f] === 'report_nlp')
  const captionPos = PRIORITY.filter((f) => img.findings[f] === 'author_caption')
  const primary = withBox[0] ?? expertPos[0] ?? nlpPos[0] ?? captionPos[0] ?? (img.findings.no_finding_report ? 'no_finding_report' : null)
  if (!primary) return null
  const primarySource = img.findings[primary]
  const expert = EXPERT.has(primarySource ?? '')
  const hasBox = withBox.includes(primary)
  const boxes = hasBox ? img.annotations.filter((a) => a.finding === primary && EXPERT.has(a.source)) : []
  const maxBoxArea = boxes.length ? Math.max(...boxes.map(boxArea)) : 0
  const boxAreaOk = hasBox ? maxBoxArea < MAX_LOCALIZATION_BOX_AREA : false
  return { img, primary, primarySource, expert, hasBox, boxAreaOk, isPediatric: img.population !== 'yetiskin' }
}

const allCandidates = []
const preSkipped = {}
const preSkip = (why) => (preSkipped[why] = (preSkipped[why] ?? 0) + 1)
for (const img of images) {
  if (coreImageIds.has(img.id)) continue
  // Toraks BT kesit yığınları yalnız öğrenme içindir — grafi soru tipleri (projeksiyon, ABCDE) BT'ye uymaz.
  if (img.modality === 'CT') {
    preSkip('BT (yalnız öğrenme)')
    continue
  }
  if (img.validationStatus !== 'validated') {
    preSkip('görüntü dosyası eksik')
    continue
  }
  const cand = computeCandidate(img)
  if (!cand) {
    preSkip('ana bulgu yok')
    continue
  }
  allCandidates.push(cand)
}

// V10 puanı + deterministik eşitlik bozucu (çözünürlük, sonra sabit tohum) — SEÇİM aşamasında kullanılır.
function scoreAndSort(list) {
  return [...list].sort((a, b) => {
    const sa = candidateScore({ hasBox: a.hasBox, boxAreaOk: a.boxAreaOk, source: a.primarySource, isRepeatPatient: false })
    const sb = candidateScore({ hasBox: b.hasBox, boxAreaOk: b.boxAreaOk, source: b.primarySource, isRepeatPatient: false })
    if (sb !== sa) return sb - sa
    const resA = a.img.width * a.img.height
    const resB = b.img.width * b.img.height
    if (resB !== resA) return resB - resA
    const seedA = rng(a.img.id)()
    const seedB = rng(b.img.id)()
    if (seedB !== seedA) return seedB - seedA
    return a.img.id.localeCompare(b.img.id)
  })
}

const byBucket = new Map()
for (const cand of allCandidates) {
  const bucket = bucketOf(cand.primary)
  if (!byBucket.has(bucket)) byBucket.set(bucket, [])
  byBucket.get(bucket).push(cand)
}

const selected = []
const usedPatients = new Set()
let pediatricAccepted = 0
let totalAccepted = 0
const selectionSkipped = {}
const selSkip = (why) => (selectionSkipped[why] = (selectionSkipped[why] ?? 0) + 1)
const bucketOrder = Object.keys(BUCKET_TARGET)
for (const bucket of bucketOrder) {
  const target = BUCKET_TARGET[bucket]
  const candidates = scoreAndSort(byBucket.get(bucket) ?? [])
  let acceptedInBucket = 0
  for (const cand of candidates) {
    if (acceptedInBucket >= target) break
    const pKey = patientKey(cand.img)
    if (usedPatients.has(pKey)) {
      selSkip('aynı hastadan ikinci vaka (hasta bağımsızlığı)')
      continue
    }
    if (cand.isPediatric && !allowPediatric(pediatricAccepted, totalAccepted, PEDIATRIC_MAX_RATIO)) {
      selSkip('pediatrik oran sınırına ulaşıldı (≤%15)')
      continue
    }
    usedPatients.add(pKey)
    selected.push(cand)
    acceptedInBucket++
    totalAccepted++
    if (cand.isPediatric) pediatricAccepted++
  }
}

/* =====================================================================================
 * AŞAMA 2 — Seçilen görüntüler için soru üretimi (V2 varyant dağıtımı + V3 büyük kutu filtresi)
 * ===================================================================================== */

const out = []
const skipped = {}
const skip = (why) => (skipped[why] = (skipped[why] ?? 0) + 1)
const titleCount = {}
const interpAssigner = createVariantAssigner()
const nextStepAssigner = createVariantAssigner()
// V2 §2b (koordinatör kararı 23 Eylül): her bilgi sorusu varyantı havuzda en fazla KNOWLEDGE_QUESTION_CAP
// (4) vakada kullanılabilir. q_interpret ve q_nextstep AYNI tavan sayacını paylaşır (imza zaten prompt'a
// göre ayrışır); tavan dolduğunda o vaka için ilgili bilgi sorusu eklenmez — vaka yalnız görüntüye bağlı
// sorularla (bulgu tanıma/lokalizasyon/projeksiyon) kalır (V2 §2c, beklenen davranış).
const knowledgeCapTryUse = createKnowledgeCapTracker(KNOWLEDGE_QUESTION_CAP)

// V2/§4 (havuz düzeyinde benzersizlik ≥0,45): q_finding/q_mark/q_projection soruları eskiden TEK sabit
// prompt metniyle üretiliyordu; aynı bulgudaki (ya da aynı projeksiyondaki) vakalar genellikle aynı
// çeldirici/kutu/kombinasyonu paylaştığından bu, imzaların (type|prompt|options|correct) çoğunluğunu
// tek başına eziyordu. Prompt metnini vaka id'sinden türeyen deterministik bir tohumla (her vaka
// kendi anahtarı — bu üç soru tipinde V2'nin "ardışık farklı" kuralı yalnız `interpretation` için
// zorunludur, ayrıca burada geniş bir havuzda eşit dağılım yeterlidir) döndürmek, anlam değişmeden
// benzersiz imza sayısını belirgin biçimde artırır.
const findingPromptAssigner = createVariantAssigner()
const markPromptAssigner = createVariantAssigner()
const projPromptAssigner = createVariantAssigner()
// Bazı varyantlar GERÇEK vaka verisini (yaş/cinsiyet/projeksiyon) kullanır — uydurma değil, images.json'daki
// mevcut alanlardır; bu, özellikle küçük çeldirici havuzu yüzünden seçenek kümesi sabit kalan bulgu
// gruplarında (ör. RSNA airspace_opacity: çoğu görüntüde tek güvenli çeldirici "normal") imzayı prompt
// üzerinden anlamlı biçimde çeşitlendirir.
const AGE_TXT = (img) => (img.ageYears != null ? `${img.ageYears} yaşındaki hastanın` : 'Bu hastanın')
const SEX_TXT = (img) => (img.sex === 'F' ? 'kadın hastanın' : img.sex === 'M' ? 'erkek hastanın' : 'hastanın')
const FINDING_PROMPTS = [
  () => 'Radyolog değerlendirmesine göre bu grafideki ana bulgu hangisidir?',
  () => 'Bu akciğer grafisinde görülen ana radyografik bulgu hangisidir?',
  () => 'Aşağıdakilerden hangisi bu filmin ana bulgusudur?',
  () => 'Bu grafiyi sistematik olarak değerlendirdiğinizde ana bulgu hangisidir?',
  () => 'Bu filmde saptanan ana radyografik bulgu hangi seçenekte doğru verilmiştir?',
  (img) => `${AGE_TXT(img)} grafisinde ana bulgu hangisidir?`,
  (img) => `${VIEW_LABEL[img.viewPosition] ? `${VIEW_LABEL[img.viewPosition]} grafide` : 'Bu grafide'} görülen ana bulgu hangisidir?`,
  (img) => `Elinizdeki ${SEX_TXT(img)} akciğer grafisinde ana bulgu hangisidir?`,
]
const MARK_PROMPTS = [
  (fname) => `${fname} bulgusunu görüntü üzerinde işaretleyin.`,
  (fname) => `Bu filmde ${fname} nerede? Görüntü üzerinde işaretleyin.`,
  (fname) => `${fname} bulgusunun yerini işaretle aracıyla gösterin.`,
  (fname) => `Grafide ${fname} bulgusunun bulunduğu alanı işaretleyin.`,
  (fname) => `${fname} bulgusunu fark ettiğiniz bölgeyi görüntü üzerinde gösterin.`,
  (fname, img) => `${AGE_TXT(img)} filminde ${fname} bulgusunu işaretleyin.`,
  (fname, img) => `${VIEW_LABEL[img.viewPosition] ? `${VIEW_LABEL[img.viewPosition]} grafide` : 'Bu grafide'} ${fname} bulgusunun yerini gösterin.`,
]
const PROJECTION_PROMPTS = [
  () => 'Bu grafinin projeksiyonu/pozisyonu nedir?',
  () => 'Bu filmin çekim projeksiyonu/pozisyonu hangisidir?',
  () => 'Aşağıdakilerden hangisi bu grafinin projeksiyon/pozisyon bilgisidir?',
  () => 'Bu film hangi projeksiyon/pozisyonda çekilmiştir?',
  () => 'Bu grafinin çekim tekniği (projeksiyon/pozisyon) hangisidir?',
  (img) => `${AGE_TXT(img)} filmi hangi projeksiyon/pozisyonda çekilmiştir?`,
  (img) => `Elinizdeki ${SEX_TXT(img)} grafisinin projeksiyonu/pozisyonu nedir?`,
]

// deterministik, tekrarlanabilir işleme sırası: id'ye göre alfabetik (önceki sürümle tutarlı)
const orderedSelected = [...selected].sort((a, b) => a.img.id.localeCompare(b.img.id))

for (const { img, primary, primarySource, expert, hasBox: withBoxPrimary, boxAreaOk, isPediatric } of orderedSelected) {
  const withBox = withBoxPrimary ? [primary] : []
  const lib = libByFinding[primary]
  const rnd = rng(img.id)
  const questions = []
  const fname = findings[primary]?.short ?? primary
  const srcText = primarySource === 'expert_panel'
    ? 'Bu etiket radyolog panelinin ortak kararıdır.'
    : primarySource === 'expert_reading'
      ? primary === 'normal'
        ? 'Bu film radyolog okumasıyla normal olarak sınıflandırılmıştır.'
        : 'Bu bulgu radyoloğun görüntü düzeyinde okumasıyla saptanmıştır.'
      : primarySource === 'expert_bbox' || primarySource === 'expert_mask'
        ? 'Bulgunun yeri radyolog tarafından işaretlenmiştir.'
        : primarySource === 'author_caption'
          ? 'Bu etiket Wikimedia Commons yükleyicisinin açıklamasına dayanır ve radyolog tarafından doğrulanmamıştır.'
          : 'Bu etiket rapor metninden otomatik çıkarılmıştır ve radyolog tarafından doğrulanmamıştır.'

  // 1) bulgu tanıma — yalnız uzman kaynaklı ana bulguda
  if (expert && findings[primary]?.teaching) {
    // BRIEF_OPACA_DISTRACTORS §3: önce ayırıcı tanı listesinden (klinik öncelik sırasıyla), sonra
    // kalan güvenli adaylardan seed'li rastgele — hedef 3 çeldirici (4 seçenek).
    const safe = orderDistractorsByDifferential(safeDistractors(img, primary, TEACHING), primary, rnd).slice(0, 3)
    if (safe.length >= 1) {
      const opts = shuffle([primary, ...safe], rnd).map((f, i) => ({ id: String.fromCharCode(97 + i), label: findings[f].label, f }))
      questions.push({
        id: 'q_finding',
        type: 'finding_identify',
        domain: 'recognition',
        prompt: findingPromptAssigner(img.id, FINDING_PROMPTS)(img),
        options: opts.map(({ id, label }) => ({ id, label })),
        correct: [opts.find((o) => o.f === primary).id],
        feedbackCorrect: `Doğru: ${findings[primary].label}. ${srcText}`,
        feedbackIncorrect: `Ana bulgu ${findings[primary].label}. ${lib?.sign ?? ''} ${srcText}`.trim(),
        hint: lib ? `Önerilen okuma bölgelerine bakın: ${lib.readingTip}` : undefined,
      })
    }
  }

  // 2) lokalizasyon — uzman kutusu varsa VE kutu alanı görüntünün %35'inden küçükse (V3).
  //    Çok büyük kutuda işaret neredeyse her yere konsa doğru sayılacağından lokalizasyon sorusu
  //    üretilmez; bulgu tanıma sorusu (yukarıda, madde 1) zaten koşulsuz üretilir.
  if (withBox.includes(primary) && boxAreaOk) {
    questions.push({
      id: 'q_mark',
      type: 'localization',
      domain: 'localization',
      prompt: markPromptAssigner(img.id, MARK_PROMPTS)(fname, img),
      help: 'İşaretle aracıyla bulgunun üzerine tıklayın; sabit yarıçaplı daire yerleşir, sürükleyerek ya da tekrar tıklayarak taşıyabilirsiniz.',
      options: [],
      correct: [],
      targetFinding: primary,
      feedbackCorrect: 'İşaretiniz radyoloğun çizdiği alanın içinde.',
      feedbackIncorrect: 'İşaretiniz hedef alanın dışında kaldı. Radyoloğun işaretlediği alan filmde gösteriliyor; bulguyu komşu yapılarla karşılaştırın.',
      hint: lib?.readingTip,
    })
  }

  // 3) film kalitesi — projeksiyon/pozisyon tanıma (meta veri; CT ve bilinmeyen projeksiyonda sorulmaz)
  //    BRIEF_OPACA_DISTRACTORS §4: önden grafi (PA/AP) ve lateral filmlerde seçenekler HER ZAMAN sabit
  //    üçlü PA/AP/Lateral'dır (lateral ayırt etme de öğretim hedefi) — eskiden olasılıksal olarak 2
  //    seçeneğe düşebiliyordu (ölçülen sorun: 50 vaka). Boyun (NECK_AP) tek görüntüde farklı bir seri
  //    olduğundan kendi sabit üçlüsünü kullanır (yine her zaman tam 3, benzersiz seçenek).
  if (VIEW_LABEL[img.viewPosition]) {
    const presentViews = img.viewPosition === 'NECK_AP' ? ['NECK_AP', 'AP', 'PA'] : ['PA', 'AP', 'LAT']
    const opts = shuffle(presentViews, rnd).map((v, i) => ({ id: String.fromCharCode(97 + i), label: VIEW_LABEL[v], v }))
    const correctOpt = opts.find((o) => o.v === img.viewPosition)
    const metaSource = img.sourceDataset === 'nih-cxr14' ? 'DICOM meta verisi (ViewPosition)' : 'veri seti dokümantasyonu / küratör ataması'
    questions.push({
      id: 'q_projection',
      type: 'film_quality',
      domain: 'quality',
      prompt: projPromptAssigner(img.id, PROJECTION_PROMPTS)(img),
      options: opts.map(({ id, label }) => ({ id, label })),
      correct: [correctOpt.id],
      feedbackCorrect: `Doğru, ${VIEW_LABEL[img.viewPosition]}. Kaynak: ${metaSource}.`,
      feedbackIncorrect: `Bu bir ${VIEW_LABEL[img.viewPosition]} grafidir (kaynak: ${metaSource}).`,
      hint: img.viewPosition === 'PA' || img.viewPosition === 'AP' ? 'Skapulaların konumuna ve klavikulaların eğimine bakın.' : 'Görüntünün genel yönelimine ve anatomik yerleşime bakın.',
    })
  }

  // 4) film kalitesi — hekim gözden geçirmesi işlendiyse
  if (img.quality?.inspiration) {
    const ok = img.quality.inspiration === 'yeterli'
    questions.push({
      id: 'q_inspiration',
      type: 'film_quality',
      domain: 'quality',
      prompt: 'Bu filmde inspirasyon yeterli mi?',
      options: [
        { id: 'a', label: 'Yeterli' },
        { id: 'b', label: 'Yetersiz' },
      ],
      correct: [ok ? 'a' : 'b'],
      feedbackCorrect: 'Doğru. Yeterli inspirasyonda diyafram hizasında genellikle 9–10 arka kaburga sayılır.',
      feedbackIncorrect: `Radyolog değerlendirmesine göre inspirasyon ${img.quality.inspiration}. Diyafram hizasındaki arka kaburgaları sayın.`,
      hint: 'Sağ hemidiyafram hizasındaki arka kaburgaları sayın.',
    })
  }

  // 5) klinik yorum — kütüphane şablonu (V2: interpretation artık VARYANT DİZİSİ; vaka id'sinden
  //    türeyen deterministik round-robin ile aynı bulgudaki ardışık vakalara farklı varyant atanır).
  //    ÖNEMLİ: no_finding_report vakası da AYNI havuzu (finding.normal) kullandığından, çakışmayı
  //    önlemek için AYNI atayıcı ANAHTARINI paylaşmalı (ayrı bir anahtar kullanılırsa iki bağımsız
  //    round-robin döngüsü aynı varyantı bağımsız seçip bir oturumda çarpışabilir — audit:dupes'ın
  //    100-tohum oturum denetiminde yakalandı).
  const interpVariants = lib?.interpretation ?? (primary === 'no_finding_report' ? systematicItem?.interpretation : null)
  if (interpVariants?.length) {
    const assignerKey = primary === 'no_finding_report' ? systematicItem.key : lib.key
    const interp = interpAssigner(assignerKey, interpVariants)
    const interpSig = questionSignature({ type: 'interpretation', prompt: interp.prompt, options: interp.options, correct: interp.correct })
    // V2 §2b/§2c: tavan (4 vaka/varyant) dolmuşsa bu vakaya bilgi sorusu EKLENMEZ (yalnız görüntüye
    // bağlı sorularla kalır) — round-robin atayıcı yine de ilerler, sonraki vakalar için deterministik kalır.
    if (knowledgeCapTryUse(interpSig)) {
      questions.push({
        id: 'q_interpret',
        type: 'interpretation',
        domain: 'interpretation',
        prompt: interp.prompt,
        options: interp.options,
        correct: interp.correct,
        feedbackCorrect: interp.feedbackCorrect,
        feedbackIncorrect: interp.feedbackIncorrect,
        hint: interp.hint,
        ...(interp.generic ? { generic: true } : {}),
      })
    }
  }

  // 6) "bir sonraki tetkik" bilgi sorusu — yalnız kütüphanede tanımlıysa (ör. PE → BTPA, yabancı cisim → bronkoskopi)
  if (lib?.nextStepQuestion?.length) {
    const nq = nextStepAssigner(lib.key, lib.nextStepQuestion)
    const nqSig = questionSignature({ type: 'interpretation', prompt: nq.prompt, options: nq.options, correct: nq.correct })
    if (knowledgeCapTryUse(nqSig)) {
      questions.push({
        id: 'q_nextstep',
        type: 'interpretation',
        domain: 'interpretation',
        prompt: nq.prompt,
        options: nq.options,
        correct: nq.correct,
        feedbackCorrect: nq.feedbackCorrect,
        feedbackIncorrect: nq.feedbackIncorrect,
        hint: nq.hint,
        ...(nq.generic ? { generic: true } : {}),
      })
    }
  }

  if (!questions.length) {
    skip('soru üretilemedi')
    continue
  }
  const domains = new Set(questions.map((q) => q.domain))
  // BRIEF_OPACA_DISTRACTORS §5: değerlendirme kapısı — tüm seçmeli sorular ≥3 seçenekli olmalı,
  // yoksa vaka yalnız uygulamada kalır (kural gevşetilmez; kutlu/lokalizasyon soruları bu kurala tabi değil).
  const assessable = !isPediatric && ((expert && domains.has('recognition')) || (expert && domains.has('localization'))) && caseSelectableOk(questions)
  const view = VIEW_LABEL[img.viewPosition] ? `${VIEW_LABEL[img.viewPosition]} grafi` : 'grafi'
  const baseTitle = primary === 'no_finding_report' ? `Sistematik okuma · ${view}` : `${fname} · ${view}`
  titleCount[baseTitle] = (titleCount[baseTitle] ?? 0) + 1

  out.push({
    id: `auto_${img.id}`,
    title: `${baseTitle} #${titleCount[baseTitle]}`,
    modes: assessable ? ['practice', 'assessment'] : ['practice'],
    population: img.population,
    patient: { age: img.ageYears, sex: img.sex === 'F' ? 'kadın' : img.sex === 'M' ? 'erkek' : null },
    chiefComplaint: 'Akciğer grafisi değerlendirmesi.',
    history: 'Veri setinde klinik öykü bulunmamaktadır; değerlendirmenizi yalnız görüntü bulgularına dayandırın.',
    vitalSigns: {},
    objectives: ['Filmi ABCDE sırasıyla sistematik okur.', primary === 'no_finding_report' ? 'Film kalitesini değerlendirir.' : `${fname} bulgusunu tanır ve yerini gösterir.`],
    imageId: img.id,
    primaryFinding: primary,
    clinicalDiagnosis: null,
    mappingValidation: expert && !isPediatric ? 'validated' : 'educational_mapping',
    mappingNote: (expert
      ? `${srcText} Klinik tanı iddiası içermez.`
      : primary === 'no_finding_report'
        ? "NIH raporunda bulgu belirtilmemiştir; bu, filmin radyolog tarafından normal olarak doğrulandığı anlamına gelmez. Vaka yalnız sistematik okuma ve film kalitesi içindir."
        : `${srcText} Vaka yalnız uygulama içindir; bulgu sorusu sorulmaz.`
    ) + (isPediatric ? ' Pediatrik film — bu vaka yalnız uygulamada, sınırlı bir katman olarak sunulur; değerlendirme havuzuna girmez.' : ''),
    clinicalReview: img.clinicalReview ?? 'beklemede',
    technique: { requiredZones: READING_ZONES, minDwellMs: 600, systematicOrder: true },
    questions,
    feedback: {
      summary: lib ? `${lib.description} ${srcText}` : `Bu filmde değerlendirme sistematik okuma ve film kalitesi üzerinedir. ${srcText}`,
      differential: lib?.sign,
      techniqueNotes: lib?.readingTip ?? 'Her filmde hava yolu, akciğerler, kalp, diyafram ve kemikleri aynı sırayla okuyun.',
    },
    references: [attribution[img.sourceDataset]].filter(Boolean),
    scoringWeights: weightsFor(domains),
    libraryKey: lib?.key ?? (primary === 'no_finding_report' ? 'technique.systematic' : undefined),
    timeLimitSec: 180,
  })
}

fs.writeFileSync(path.join(DATA_DIR, 'cases-auto.json'), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), cases: out }, null, 1) + '\n')

// hekim onay listesi (çekirdek + otomatik)
const all = [...core, ...out]
const rows = [['id', 'baslik', 'goruntu', 'ana_bulgu', 'etiket_kaynagi', 'esleme', 'modlar', 'hekim_onayi', 'soru_sayisi', 'soru_metinleri']]
const imgById = new Map(images.map((i) => [i.id, i]))
for (const c of all) {
  const img = imgById.get(c.imageId)
  rows.push([c.id, c.title, c.imageId, c.primaryFinding, img?.findings[c.primaryFinding] ?? '', c.mappingValidation, c.modes.join('|'), c.clinicalReview ?? 'beklemede', c.questions.length, c.questions.map((q) => q.prompt).join(' | ')])
}
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'docs', 'klinik-degerlendirme-listesi.csv'), '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n')

/* ---------------- rapor ---------------- */
const practice = out.filter((c) => c.modes.includes('practice')).length
const assessment = out.filter((c) => c.modes.includes('assessment')).length
const boxedCount = out.filter((c) => c.questions.some((q) => q.type === 'localization')).length
const bySourceTier = {}
for (const c of out) {
  const img = imgById.get(c.imageId)
  const src = img?.findings[c.primaryFinding] ?? 'bilinmiyor'
  bySourceTier[src] = (bySourceTier[src] ?? 0) + 1
}
const byBucketCount = {}
for (const c of out) {
  const b = bucketOf(c.primaryFinding)
  byBucketCount[b] = (byBucketCount[b] ?? 0) + 1
}
console.log(`Vaka üretimi (V1/V10/V2/V3): ${out.length} vaka (uygulama ${practice}, değerlendirme ${assessment}, kutulu/lokalizasyon ${boxedCount})`)
console.log('Ön eleme (aday hesaplama):', preSkipped)
console.log('Seçim aşamasında elenenler:', selectionSkipped)
console.log('Soru üretim aşamasında elenenler:', skipped)
console.log('Kova başına gerçekleşen vaka sayısı (hedef):', Object.fromEntries(bucketOrder.map((b) => [b, `${byBucketCount[b] ?? 0} (${BUCKET_TARGET[b]})`])))
console.log('Etiket kaynağı türüne göre dağılım:', bySourceTier)

// V2 (koordinatör kararı 23 Eylül): eski (tüm sorular, imzada prompt dahil) ve yeni (görüntüye bağlı
// sorular görüntüId ile, bilgi soruları prompt ile) tanımların oranlarını YAN YANA raporla.
const allQuestionsWithImage = out.flatMap((c) => c.questions.map((q) => ({ q, imageId: c.imageId })))
const legacySignatures = allQuestionsWithImage.map(({ q }) => legacyQuestionSignature(q))
const legacyRatio = legacySignatures.length ? new Set(legacySignatures).size / legacySignatures.length : 1
const knowledgeQs = allQuestionsWithImage.filter(({ q }) => !IMAGE_DEPENDENT_TYPES.has(q.type))
const knowledgeSignatures = knowledgeQs.map(({ q }) => questionSignature(q))
const knowledgeRatio = knowledgeSignatures.length ? new Set(knowledgeSignatures).size / knowledgeSignatures.length : 1
const knowledgeCounts = new Map()
for (const sig of knowledgeSignatures) knowledgeCounts.set(sig, (knowledgeCounts.get(sig) ?? 0) + 1)
const knowledgeOverCap = [...knowledgeCounts.entries()].filter(([, n]) => n > KNOWLEDGE_QUESTION_CAP)
const genRatio = genericQuestionRatio(out)
console.log(
  `Soru imzası — eski tanım (bilgilendirme amaçlı): ${new Set(legacySignatures).size}/${legacySignatures.length} benzersiz (oran ${legacyRatio.toFixed(3)})`
)
console.log(
  `Soru imzası — yeni tanım, yalnız BİLGİ soruları (kabul ölçütü §2b): ${new Set(knowledgeSignatures).size}/${knowledgeSignatures.length} benzersiz (oran ${knowledgeRatio.toFixed(3)}), tavanı (>${KNOWLEDGE_QUESTION_CAP}) aşan varyant: ${knowledgeOverCap.length}`
)
console.log(`Bulgudan bağımsız genel soru oranı (§2d, hedef ≤${GENERIC_QUESTION_MAX_RATIO}): ${genRatio.toFixed(3)} (${out.filter((c) => c.questions.some((q) => q.generic)).length}/${out.length} vaka)`)
