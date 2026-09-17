#!/usr/bin/env node
/**
 * Görüntü envanterinden vaka üretici (npm run cases).
 *
 * Kaynak: src/data/images.json + library.json + findings.json (+ cases.json'daki elle yazılmış vakalar atlanır)
 * Çıktı:  src/data/cases-auto.json ve docs/klinik-degerlendirme-listesi.csv (hekim onay listesi)
 *
 * Kurallar (Ausculta §6 karşılığı):
 *  - Değerlendirme vakası yalnız uzman kaynaklı ana bulguyla ve yetişkin filmiyle üretilir.
 *  - Rapor tabanlı (NLP) etiketli filmler yalnız uygulama vakası olur; bulgu sorusu sorulmaz, not düşülür.
 *  - Çeldiriciler yalnız "güvenli" bulgulardan seçilir: uzmanın yok dediği bulgu, radyoloğun normal dediği
 *    filmde herhangi bir bulgu, uzman pozitifi olan filmde "normal" ve NIH raporunda hiç geçmeyen bulgu.
 *  - Lokalizasyon sorusu yalnız ana bulgu için uzman kutusu varsa sorulur.
 *  - Projeksiyon sorusu DICOM meta verisinden (PA/AP) gelir; rotasyon/inspirasyon soruları yalnız hekim
 *    gözden geçirmesi images.json'a işlendiyse üretilir.
 *  - Tanı sorusu üretilmez (doğrulanmış tanı eşlemesi olan veri seti henüz yok).
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, DATA_DIR, readJson, EXPERT } from './lib/cxr-common.mjs'
import { csvEscape } from './lib/csv.mjs'

const images = readJson(path.join(DATA_DIR, 'images.json'), { records: [] }).records
const library = readJson(path.join(DATA_DIR, 'library.json'), { groups: [] })
const findings = readJson(path.join(DATA_DIR, 'findings.json'), { findings: {} }).findings
const sources = readJson(path.join(DATA_DIR, 'sources.json'), { datasets: [] })
const core = readJson(path.join(DATA_DIR, 'cases.json'), { cases: [] }).cases

const libByFinding = {}
for (const g of library.groups) for (const it of g.items) if (it.finding) libByFinding[it.finding] = it
const systematicItem = library.groups.flatMap((g) => g.items).find((it) => it.key === 'finding.normal')
const TEACHING = Object.keys(findings).filter((f) => findings[f].teaching)
const ABNORMAL = TEACHING.filter((f) => f !== 'normal')
// ana bulgu önceliği (birden çok uzman pozitifi olduğunda)
const PRIORITY = ['pneumothorax', 'nodule_mass', 'airspace_opacity', 'pleural_effusion', 'cardiomegaly', 'atelectasis', 'edema', 'emphysema', 'fracture', 'normal']
const READING_ZONES = ['a_trachea', 'b_r_upper', 'b_l_upper', 'b_r_mid', 'b_l_mid', 'b_r_lower', 'b_l_lower', 'c_heart', 'd_r_diaphragm', 'd_l_diaphragm', 'e_bones']
const DEFAULT_WEIGHTS = { technique: 10, systematic: 5, quality: 10, localization: 25, recognition: 25, interpretation: 15, diagnosis: 10 }
const VIEW = { PA: 'PA', AP: 'AP' }
const coreImageIds = new Set(core.map((c) => c.imageId))
const attribution = Object.fromEntries(sources.datasets.map((d) => [d.id, d.attributionText]))

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

function safeDistractors(img, primary) {
  const hasNlpReport = img.sourceDataset === 'nih-cxr14' && Object.values(img.findings).some((s) => s === 'report_nlp')
  const expertNormal = img.findings.normal && EXPERT.has(img.findings.normal)
  const expertAbnormal = Object.entries(img.findings).some(([f, s]) => f !== 'normal' && EXPERT.has(s))
  const out = []
  for (const f of TEACHING) {
    if (f === primary || img.findings[f]) continue
    if (img.negatives[f] && EXPERT.has(img.negatives[f])) out.push(f)
    else if (expertNormal && f !== 'normal') out.push(f)
    else if (f === 'normal' && expertAbnormal) out.push(f)
    else if (hasNlpReport && f !== 'normal' && !img.findings.no_finding_report) out.push(f)
  }
  return out
}

function weightsFor(domains) {
  const w = { ...DEFAULT_WEIGHTS }
  for (const d of ['quality', 'localization', 'recognition', 'interpretation', 'diagnosis']) if (!domains.has(d)) w[d] = 0
  const deficit = 100 - Object.values(w).reduce((s, v) => s + v, 0)
  const target = domains.has('recognition') ? 'recognition' : domains.has('interpretation') ? 'interpretation' : 'quality'
  w[target] += deficit
  return w
}

const out = []
const skipped = {}
const skip = (why) => (skipped[why] = (skipped[why] ?? 0) + 1)
const titleCount = {}

for (const img of images) {
  if (coreImageIds.has(img.id)) continue
  if (img.validationStatus !== 'validated') {
    skip('görüntü dosyası eksik')
    continue
  }
  if (img.population !== 'yetiskin') {
    skip('pediatrik film (mezuniyet öncesi havuz dışı)')
    continue
  }
  const expertPos = PRIORITY.filter((f) => img.findings[f] && EXPERT.has(img.findings[f]))
  const withBox = expertPos.filter((f) => img.annotations.some((a) => a.finding === f && EXPERT.has(a.source)))
  const nlpPos = PRIORITY.filter((f) => img.findings[f] === 'report_nlp')
  const primary = withBox[0] ?? expertPos[0] ?? nlpPos[0] ?? (img.findings.no_finding_report ? 'no_finding_report' : null)
  if (!primary) {
    skip('ana bulgu yok')
    continue
  }
  const expert = EXPERT.has(img.findings[primary] ?? '')
  const lib = libByFinding[primary]
  const rnd = rng(img.id)
  const questions = []
  const fname = findings[primary]?.short ?? primary
  const srcText = expert
    ? img.findings[primary] === 'expert_panel'
      ? 'Bu etiket radyolog panelinin ortak kararıdır.'
      : img.findings[primary] === 'expert_reading'
        ? 'Bu film radyolog okumasıyla normal olarak sınıflandırılmıştır.'
        : 'Bulgunun yeri radyolog tarafından işaretlenmiştir.'
    : 'Bu etiket rapor metninden otomatik çıkarılmıştır ve radyolog tarafından doğrulanmamıştır.'

  // 1) bulgu tanıma — yalnız uzman kaynaklı ana bulguda
  if (expert && findings[primary]?.teaching) {
    const safe = shuffle(safeDistractors(img, primary), rnd).slice(0, 3)
    if (safe.length >= 1) {
      const opts = shuffle([primary, ...safe], rnd).map((f, i) => ({ id: String.fromCharCode(97 + i), label: findings[f].label, f }))
      questions.push({
        id: 'q_finding',
        type: 'finding_identify',
        domain: 'recognition',
        prompt: 'Radyolog değerlendirmesine göre bu grafideki ana bulgu hangisidir?',
        options: opts.map(({ id, label }) => ({ id, label })),
        correct: [opts.find((o) => o.f === primary).id],
        feedbackCorrect: `Doğru: ${findings[primary].label}. ${srcText}`,
        feedbackIncorrect: `Ana bulgu ${findings[primary].label}. ${lib?.sign ?? ''} ${srcText}`.trim(),
        hint: lib ? `Önerilen okuma bölgelerine bakın: ${lib.readingTip}` : undefined,
      })
    }
  }

  // 2) lokalizasyon — uzman kutusu varsa
  if (withBox.includes(primary)) {
    questions.push({
      id: 'q_mark',
      type: 'localization',
      domain: 'localization',
      prompt: `${fname} bulgusunu görüntü üzerinde işaretleyin.`,
      help: 'İşaretle aracıyla bulgunun üzerine tıklayın. Birden çok alan varsa herhangi birini işaretlemeniz yeterlidir.',
      options: [],
      correct: [],
      targetFinding: primary,
      feedbackCorrect: 'İşaretiniz radyoloğun çizdiği alanın içinde.',
      feedbackIncorrect: 'Radyoloğun işaretlediği alan filmde gösteriliyor; bulguyu komşu yapılarla karşılaştırın.',
      hint: lib?.readingTip,
    })
  }

  // 3) film kalitesi — projeksiyon (meta veri)
  if (VIEW[img.viewPosition]) {
    const opts = [
      { id: 'a', label: 'PA (arka-ön)' },
      { id: 'b', label: 'AP (ön-arka)' },
      { id: 'c', label: 'Lateral' },
    ]
    const isPA = img.viewPosition === 'PA'
    questions.push({
      id: 'q_projection',
      type: 'film_quality',
      domain: 'quality',
      prompt: 'Bu grafinin projeksiyonu nedir?',
      options: opts,
      correct: [isPA ? 'a' : 'b'],
      feedbackCorrect: isPA
        ? 'Doğru, PA grafi. Kalp filme yakın olduğundan boyutu daha doğru yansır; kardiyotorasik oran bu filmde yorumlanabilir.'
        : 'Doğru, AP grafi. Kalp olduğundan büyük görünür; kardiyotorasik oranı bu filmde yorumlamayın.',
      feedbackIncorrect: isPA
        ? 'Bu bir PA grafidir (kaynak: DICOM meta verisi). PA filmde skapulalar genellikle akciğer alanlarının dışına çekilmiştir.'
        : 'Bu bir AP grafidir (kaynak: DICOM meta verisi). AP filmde skapulalar akciğer alanlarına süperpoze olabilir ve kalp büyük görünür.',
      hint: 'Skapulaların konumuna ve klavikulaların eğimine bakın.',
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

  // 5) klinik yorum — kütüphane şablonu (normal/no-finding filmlerde ABCDE sorusu)
  const interp = lib?.interpretation ?? (primary === 'no_finding_report' ? systematicItem?.interpretation : null)
  if (interp) {
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
    })
  }

  if (!questions.length) {
    skip('soru üretilemedi')
    continue
  }
  const domains = new Set(questions.map((q) => q.domain))
  const assessable = expert && domains.has('recognition') || (expert && domains.has('localization'))
  const view = VIEW[img.viewPosition] ? `${img.viewPosition} grafi` : 'grafi'
  const baseTitle = primary === 'no_finding_report' ? `Sistematik okuma · ${view}` : `${fname} · ${view}`
  titleCount[baseTitle] = (titleCount[baseTitle] ?? 0) + 1

  out.push({
    id: `auto_${img.id}`,
    title: `${baseTitle} #${titleCount[baseTitle]}`,
    modes: assessable ? ['practice', 'assessment'] : ['practice'],
    population: 'yetiskin',
    patient: { age: img.ageYears, sex: img.sex === 'F' ? 'kadın' : img.sex === 'M' ? 'erkek' : null },
    chiefComplaint: 'Akciğer grafisi değerlendirmesi.',
    history: 'Veri setinde klinik öykü bulunmamaktadır; değerlendirmenizi yalnız görüntü bulgularına dayandırın.',
    vitalSigns: {},
    objectives: ['Filmi ABCDE sırasıyla sistematik okur.', primary === 'no_finding_report' ? 'Film kalitesini değerlendirir.' : `${fname} bulgusunu tanır ve yerini gösterir.`],
    imageId: img.id,
    primaryFinding: primary,
    clinicalDiagnosis: null,
    mappingValidation: expert ? 'validated' : 'educational_mapping',
    mappingNote: expert
      ? `${srcText} Klinik tanı iddiası içermez.`
      : primary === 'no_finding_report'
        ? "NIH raporunda bulgu belirtilmemiştir; bu, filmin radyolog tarafından normal olarak doğrulandığı anlamına gelmez. Vaka yalnız sistematik okuma ve film kalitesi içindir."
        : `${srcText} Vaka yalnız uygulama içindir; bulgu sorusu sorulmaz.`,
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
fs.writeFileSync(path.join(ROOT, 'docs', 'klinik-degerlendirme-listesi.csv'), '\ufeff' + rows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n')

const practice = out.filter((c) => c.modes.includes('practice')).length
const assessment = out.filter((c) => c.modes.includes('assessment')).length
console.log(`Vaka üretimi: ${out.length} vaka (uygulama ${practice}, değerlendirme ${assessment})`, skipped)
