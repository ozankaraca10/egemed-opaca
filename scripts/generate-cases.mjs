#!/usr/bin/env node
/**
 * Veri setinden vaka üretici — havuzu ses veritabanının sınırlarına kadar genişletir.
 *
 * Kaynak: src/data/sounds.json (HLS-CMDS v3, birincil) ve varsa src/data/sounds-external.json
 *        (ör. CirCor — pediatrik, doğrulanmış üfürüm zamanlamaları).
 *
 * Her (akustik sınıf × kayıt konumu × popülasyon) için bir vaka üretilir; böylece
 * kütüphanedeki her ses sınıfı çok sayıda varyantla çalışılabilir. Vakaların soruları
 * sınıf/konum/zamanlama şablonlarından üretilir; tanı sorusu yalnız doğrulanmış
 * klinik eşlemesi olan sınıflarda eklenir (§6).
 *
 * Çıktı: src/data/cases-auto.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sounds = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'sounds.json'), 'utf8'))
const library = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'library.json'), 'utf8'))
const externalPath = path.join(ROOT, 'src', 'data', 'sounds-external.json')
const external = fs.existsSync(externalPath) ? JSON.parse(fs.readFileSync(externalPath, 'utf8')) : { records: [] }

const records = [...sounds.records, ...(external.records ?? [])]

/** Sınıf tanımları: başlık, Zamanlama/yorum metinleri, kafa tercihi, tanı (yalnız doğrulanmış) */
const HEART = {
  normal: { label: 'Normal Kalp Sesleri', timing: 'S1 sistol başında, S2 diyastol başında duyulur', head: 'diaphragm', diag: null },
  s3: { label: 'S3 (Üçüncü Kalp Sesi)', timing: "Erken diyastol, S2'den hemen sonra", head: 'bell', diag: null },
  s4: { label: 'S4 (Dördüncü Kalp Sesi)', timing: "Presistol, S1'den hemen önce (atriyal kontraksiyona bağlı)", head: 'bell', diag: null },
  early_systolic_murmur: { label: 'Erken Sistolik Üfürüm', timing: "Erken sistol; S1'i izler ve kısa sürede söner", head: 'diaphragm', diag: null },
  mid_systolic_murmur: { label: 'Orta Sistolik Üfürüm', timing: 'Orta sistol; S1 ile S2 arasında yoğunlaşır', head: 'diaphragm', diag: null },
  late_systolic_murmur: { label: 'Geç Sistolik Üfürüm', timing: "Geç sistol; S2'ye doğru güçlenir", head: 'diaphragm', diag: null },
  late_diastolic_murmur: { label: 'Geç Diyastolik Üfürüm', timing: "Geç diyastol / presistol; S1 ile kesilir", head: 'bell', diag: null },
  atrial_fibrillation: { label: 'Atriyal Fibrilasyon', timing: 'Tamamen düzensiz aralıklarla, siklus boyunca', head: 'diaphragm', diag: 'Atriyal fibrilasyon' },
  tachycardia: { label: 'Taşikardi', timing: 'Düzenli fakat hızlı ritimle, kısalmış diyastolde', head: 'diaphragm', diag: 'Taşikardi' },
  av_block: { label: 'Atriyoventriküler Blok', timing: 'Değişken aralıklarla, atıştan atışa farklı zamanlamada', head: 'diaphragm', diag: 'Atriyoventriküler blok' },
}
const LUNG = {
  normal: { label: 'Normal Solunum Sesleri', phase: 'İnspirasyon ekspirasyondan uzun ve sürekli', head: 'diaphragm' },
  wheezing: { label: 'Wheezing', phase: 'Ekspirasyonda belirgin, sürekli ve müzikal', head: 'diaphragm' },
  rhonchi: { label: 'Ronküs', phase: 'Her iki fazda duyulabilir; öksürükle değişebilir', head: 'diaphragm' },
  fine_crackles: { label: 'İnce Raller (Fine Crackles)', phase: 'İnspirasyon sonunda, kesintili', head: 'diaphragm' },
  coarse_crackles: { label: 'Kaba Raller (Coarse Crackles)', phase: 'İnspirasyon boyunca, kesintili ve kaba', head: 'diaphragm' },
  pleural_rub: { label: 'Plevral Frotman', phase: 'İnspirasyon ve ekspirasyonun ikisinde de (iki fazlı)', head: 'diaphragm' },
}

/** simulationLocation → okunur tam etiket */
const pointLabels = {}
{
  const points = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'auscultation-points.json'), 'utf8'))
  for (const p of points.points) pointLabels[p.id] = p.fullLabel
}

// K5: anahtar category.acousticFinding olmalı — heart.normal ile lung.normal aynı
// acousticFinding'i paylaştığından yalnız acousticFinding ile indekslemek kalp/akciğer
// metinlerinin birbirini ezmesine yol açıyordu. library.json'daki `key` alanı biçimi
// tutarsız olduğundan (ör. "heart.murmur.early_systolic") burada kullanılmaz;
// category+acousticFinding her kalemde güvenilir biçimde mevcuttur.
const libByKey = {}
for (const g of library.groups) for (const it of g.items) libByKey[`${it.category}.${it.acousticFinding}`] = it

const out = []
const counters = {}

// O5: lokalizasyon soruları kaldırıldı (kayıtlar tek RMS'e normalize edildiğinden "hangi
// odakta kaydedildi" metaveri bilgisidir, dinlemeyle yanıtlanamaz) — ağırlık recognition/
// interpretation'a dağıtıldı, toplam 100 kalır.
function caseWeights(hasDiag) {
  return hasDiag
    ? { technique: 20, localization: 0, recognition: 45, interpretation: 20, diagnosis: 10, systematic: 5 }
    : { technique: 20, localization: 0, recognition: 50, interpretation: 30, diagnosis: 0, systematic: 0 }
}

/** Aynı sınıfın kayıtlarından konum listesi */
function locationsFor(findings, category) {
  const map = new Map()
  for (const r of records) {
    if (r.validationStatus !== 'validated') continue
    if (r.category !== category) continue
    if (!findings.includes(r.acousticFinding)) continue
    if (!r.simulationLocation) continue
    if (!map.has(r.simulationLocation)) map.set(r.simulationLocation, r.recordedLocation)
  }
  return map
}

function distractor(classes, correctKey, n = 3) {
  return Object.keys(classes).filter((k) => k !== correctKey).slice(0, n)
}

// O8: etiket karşılaştırması — iki seçenek "eşdeğer" sayılırsa (parantez içi kaldırılınca
// aynı metin ya da ilk 12 karakter özdeş) biri distraktör kümesinden çıkarılır
// (ör. s4 "geç diyastol (presistol)" ile late_diastolic_murmur "geç diyastol (presistolik)").
const normLabel = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()
function labelsEquivalent(a, b) {
  const na = normLabel(a)
  const nb = normLabel(b)
  return na === nb || na.slice(0, 12) === nb.slice(0, 12)
}

// O8: ritim sınıflarında zamanlama yerine ritim tanımı sorulur (zamanlama bu sınıflar için
// ayırt edici değildir; asıl ayırt edici özellik ritmin düzenliliğidir).
// Seçenek etiketleri tanı adı içermez (q5 tanı sorusunun yanıtını sızdırmasın).
const RHYTHM_OPTIONS = [
  { key: 'atrial_fibrillation', label: 'Tamamen düzensiz; aralıklar atıştan atışa değişir' },
  { key: 'tachycardia', label: 'Düzenli, hızlı' },
  { key: 'av_block', label: 'Düzenli düzensiz; aralıklar değişken, ritim kaotik değil' },
  { key: 'normal', label: 'Düzenli, normal hız' },
]
// Zamanlaması tıbben eşdeğer sınıflar birbirine distraktör olamaz (ikisi de presistolik).
const TIMING_EQUIVALENT = { s4: ['late_diastolic_murmur'], late_diastolic_murmur: ['s4'] }
const RHYTHM_CLASSES = new Set(['atrial_fibrillation', 'tachycardia', 'av_block'])

// ---------------- KALP VAKALARI ----------------
for (const [key, def] of Object.entries(HEART)) {
  const locs = locationsFor([key], 'heart')
  if (!locs.size) continue
  const locations = [...locs.keys()]
  for (const primary of locations) {
    const id = `auto_heart_${key}_${primary.replace('cardiac_', '')}`
    counters[id] = (counters[id] ?? 0) + 1
    const lib = libByKey[`heart.${key}`]
    const sex = 'erkek' // gövde her zaman erkek (cinsiyet seçici kaldırıldı)
    const age = key === 's3' ? 26 : key === 's4' ? 64 : key === 'tachycardia' ? 38 : key === 'av_block' ? 73 : 55
    const q = []
    q.push({
      id: 'q1', type: 'sound_identify', domain: 'recognition',
      prompt: 'Duyduğunuz akustik bulgu hangisidir?',
      options: [{ id: 'a', label: def.label }, ...distractor(HEART, key).map((k, i) => ({ id: String.fromCharCode(98 + i), label: HEART[k].label }))],
      correct: ['a'],
      feedbackCorrect: `Doğru. Kayıt ${def.label} sınıfı olarak etiketlenmiştir. ${lib?.description ?? ''}`,
      feedbackIncorrect: `Dinlediğiniz kayıt ${def.label} sınıfına aittir. ${lib?.metaphor ?? ''}`,
      hint: lib?.metaphor,
    })
    if (RHYTHM_CLASSES.has(key)) {
      const correctRhythm = RHYTHM_OPTIONS.find((o) => o.key === key)
      q.push({
        id: 'q3', type: 'single_choice', domain: 'interpretation',
        prompt: 'Bu kayıtta ritim nasıl tanımlanır?',
        options: [
          { id: 'a', label: correctRhythm.label },
          ...RHYTHM_OPTIONS.filter((o) => o.key !== key).map((o, i) => ({ id: String.fromCharCode(98 + i), label: o.label })),
        ],
        correct: ['a'],
        feedbackCorrect: `Doğru. Ritim tanımı: ${correctRhythm.label}.`,
        feedbackIncorrect: `Doğru tanım: ${correctRhythm.label}. S1'ler arasındaki aralıkların düzenliliğine odaklanarak tekrar dinleyin.`,
      })
    } else {
      const distractorDefs = Object.entries(HEART).filter(
        ([k, v]) => k !== key && !RHYTHM_CLASSES.has(k) && !(TIMING_EQUIVALENT[key] ?? []).includes(k) && !labelsEquivalent(def.timing, v.timing)
      )
      q.push({
        id: 'q3', type: 'single_choice', domain: 'interpretation',
        prompt: 'Bu bulgu kalp siklusunun hangi döneminde duyulur?',
        options: [
          { id: 'a', label: def.timing },
          ...distractorDefs.slice(0, 3).map(([, v], i) => ({ id: String.fromCharCode(98 + i), label: v.timing })),
        ],
        correct: ['a'],
        feedbackCorrect: `Doğru. ${def.label} için zamanlama: ${def.timing}.`,
        feedbackIncorrect: `Doğru zamanlama: ${def.timing}. S1 ve S2'yi referans alarak tekrar dinleyin.`,
      })
    }
    q.push({
      id: 'q4', type: 'bell_diaphragm', domain: 'interpretation',
      prompt: 'Bu bulgu için hangi stetoskop kafası daha uygundur?',
      options: [{ id: 'a', label: 'Bell' }, { id: 'b', label: 'Diyafram' }],
      correct: [def.head === 'bell' ? 'a' : 'b'],
      feedbackCorrect: def.head === 'bell' ? 'Doğru. Düşük frekanslı ek sesler için bell uygundur.' : 'Doğru. Orta-yüksek frekanslı sesler için diyafram uygundur.',
      feedbackIncorrect: def.head === 'bell' ? 'Düşük frekanslı bu bulgu için bell tercih edilir.' : 'Bu bulgu için diyafram tercih edilir.',
    })
    if (def.diag) {
      q.push({
        id: 'q5', type: 'diagnosis', domain: 'diagnosis',
        prompt: 'Bu oskültasyon bulgusu aşağıdakilerden hangisiyle en uyumludur?',
        options: [
          { id: 'a', label: def.diag },
          { id: 'b', label: 'Normal sinüs ritmi' },
          { id: 'c', label: 'Sistolik üfürüm' },
          { id: 'd', label: 'Atriyal fibrilasyon' },
        ].filter((o, i, arr) => arr.findIndex((x) => x.label === o.label) === i).slice(0, 4),
        correct: ['a'],
        feedbackCorrect: `Doğru. Bu ritim ${def.diag} ile uyumludur; veri seti sınıfı doğrulanmıştır.`,
        feedbackIncorrect: `Bu kayıt ${def.diag} sınıfına aittir; kesin tanı için klinik bağlam ve EKG desteği gerekir.`,
      })
    }
    const assignments = locations.map((l) => ({
      pointId: l, category: 'heart', acousticFinding: key, recordedLocation: locs.get(l),
    }))
    // posterior karşılık yoksa tek nokta; teknik rubriği ilk 3 noktayı ister
    const required = [primary, ...locations.filter((l) => l !== primary).slice(0, 2)]
    out.push({
      id, title: `${def.label} — ${pointLabels[primary]}`,
      modes: ['practice', 'assessment'],
      population: 'yetişkin',
      patient: { age, sex },
      chiefComplaint: 'Kalp seslerinin değerlendirilmesi',
      history: 'Fizik muayenede kardiyak oskültasyon planlanıyor; tüm odaklar sistematik olarak dinlenmelidir.',
      vitalSigns: { hr: key === 'tachycardia' ? 118 : key === 'av_block' ? 58 : 76, rr: 16, bp: '122/78', spo2: 98, temp: '36.6 °C' },
      objectives: [`${def.label} bulgusunu tanımak`, 'Zamanlamayı ve en iyi duyulan odağı belirlemek'],
      tasks: ['Odakları sistematik dinleyin.', 'Bulguyu tanımlayın.', 'Zamanlamayı ve odağı seçin.'],
      views: ['front'],
      allowedHeads: ['bell', 'diaphragm'],
      soundAssignments: assignments,
      primaryAcousticFinding: key,
      clinicalDiagnosis: def.diag,
      mappingValidation: 'validated',
      mappingNote: 'Akustik sınıf veri seti etiketiyle doğrulanmıştır; kapak lezyonu eşlemesi yapılmaz.',
      technique: { requiredPoints: required, minPointsVisited: Math.min(2, required.length), minDwellMs: 1500, minListenMsPerPoint: 2000, systematicOrder: required.length > 1 },
      questions: q,
      feedback: { summary: lib?.description ?? '', techniqueNotes: 'Sistematik odak taraması ve karşılaştırma önerilir.' },
      references: [`HLS-CMDS v3 — ${def.label} kayıtları`],
      scoringWeights: caseWeights(!!def.diag),
      masteryThreshold: 80,
      auto: true,
    })
  }
}

// ---------------- AKCİĞER VAKALARI ----------------
const POSTERIOR_MAP = {
  lung_right_upper_anterior: 'lung_right_upper_posterior',
  lung_left_upper_anterior: 'lung_left_upper_posterior',
  lung_right_middle_anterior: 'lung_right_middle_posterior',
  lung_left_middle_anterior: 'lung_left_middle_posterior',
  lung_right_lower_anterior: 'lung_right_lower_posterior',
  lung_left_lower_anterior: 'lung_left_lower_posterior',
}
for (const [key, def] of Object.entries(LUNG)) {
  const locs = locationsFor([key], 'lung')
  if (!locs.size) continue
  const locations = [...locs.keys()]
  for (const primary of locations) {
    const id = `auto_lung_${key}_${primary.replace('lung_', '')}`
    const lib = libByKey[`lung.${key}`]
    const posterior = POSTERIOR_MAP[primary]
    const assignments = locations.map((l) => ({ pointId: l, category: 'lung', acousticFinding: key, recordedLocation: locs.get(l) }))
    if (posterior) assignments.push({ pointId: posterior, category: 'lung', acousticFinding: key, simulationNote: 'posterior fallback (kaynak anterior)' })
    const q = [
      {
        id: 'q1', type: 'sound_identify', domain: 'recognition',
        prompt: 'Dinlediğiniz solunum sesi hangisidir?',
        options: [{ id: 'a', label: def.label }, ...distractor(LUNG, key).map((k, i) => ({ id: String.fromCharCode(98 + i), label: LUNG[k].label }))],
        correct: ['a'],
        feedbackCorrect: `Doğru. ${lib?.description ?? def.label}`,
        feedbackIncorrect: `Dinlediğiniz kayıt ${def.label} sınıfına aittir. ${lib?.metaphor ?? ''}`,
        hint: lib?.metaphor,
      },
      {
        id: 'q2', type: 'single_choice', domain: 'interpretation',
        prompt: 'Bu ses solunum siklusunun hangi bölümünde belirgindir?',
        options: [
          { id: 'a', label: def.phase },
          ...Object.entries(LUNG).filter(([k]) => k !== key).slice(0, 3).map(([, v], i) => ({ id: String.fromCharCode(98 + i), label: v.phase })),
        ],
        correct: ['a'],
        feedbackCorrect: `Doğru. ${def.label} için ayırt edici zamanlama: ${def.phase}.`,
        feedbackIncorrect: `Doğru zamanlama: ${def.phase}. İnspirasyon ve ekspirasyon fazlarını ayırarak tekrar dinleyin.`,
      },
    ]
    out.push({
      id, title: `${def.label} — ${pointLabels[primary]}`,
      modes: ['practice', 'assessment'],
      population: 'yetişkin',
      patient: { age: key === 'pleural_rub' ? 47 : 62, sex: 'erkek' },
      chiefComplaint: 'Solunum seslerinin değerlendirilmesi',
      history: 'Bilateral karşılaştırmalı oskültasyon planlanıyor.',
      vitalSigns: { hr: 88, rr: 22, bp: '128/80', spo2: 95, temp: '36.9 °C' },
      objectives: [`${def.label} bulgusunu tanımak`, 'Bilateral karşılaştırma yapmak'],
      tasks: ['Bölgeleri bilateral dinleyin.', 'Bulguyu tanımlayın.', 'Duyulma fazını belirleyin.'],
      views: ['front', 'back'],
      allowedHeads: ['bell', 'diaphragm'],
      soundAssignments: assignments,
      primaryAcousticFinding: key,
      clinicalDiagnosis: null,
      mappingValidation: 'validated',
      technique: { requiredPoints: [primary], minPointsVisited: 1, minDwellMs: 1500, minListenMsPerPoint: 2000 },
      questions: q,
      feedback: { summary: lib?.description ?? '', techniqueNotes: 'Posterior kayıt yoksa anterior kayıt, kaynak bölge belirtilerek çalınır.' },
      references: [`HLS-CMDS v3 — ${def.label} kayıtları`],
      scoringWeights: caseWeights(false),
      masteryThreshold: 80,
      auto: true,
    })
  }
}

// ---------------- KOMBİNE (MIXED) VAKALAR — veri setinin sınırları ----------------
{
  const mixed = records.filter((r) => r.category === 'mixed' && r.validationStatus === 'validated' && r.simulationLocation)
  const byKey = new Map()
  for (const r of mixed) {
    const k = `${r.acousticFinding}|${r.simulationLocation}`
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(r)
  }
  let n = 0
  for (const [k, recs] of byKey) {
    const [combo, loc] = k.split('|')
    const [hf, lf] = combo.split('+')
    const r = recs[0]
    n++
    const id = `auto_mixed_${hf}_${lf}_${loc.replace('lung_', '')}_${String(n).padStart(3, '0')}`
    const posterior = POSTERIOR_MAP[loc]
    const assignments = [{ pointId: loc, category: 'mixed', acousticFinding: combo, recordedLocation: r.recordedLocation }]
    if (posterior) assignments.push({ pointId: posterior, category: 'mixed', acousticFinding: combo })
    out.push({
      id, title: `Kombine: ${HEART[hf]?.label ?? hf} + ${LUNG[lf]?.label ?? lf}`,
      modes: ['practice'],
      population: 'yetişkin',
      patient: { age: 60, sex: 'erkek' },
      chiefComplaint: 'Kalp ve akciğer seslerinin birlikte değerlendirilmesi',
      history: 'Aynı bölgede kalp ve solunum sesleri üst üste gelmektedir.',
      vitalSigns: { hr: 84, rr: 20, bp: '130/80', spo2: 96, temp: '36.8 °C' },
      objectives: ['Kombine kayıtta iki bileşeni ayrıştırmak'],
      tasks: ['Bölgeyi dinleyin.', 'Kalp bileşenini tanımlayın.', 'Akciğer bileşenini tanımlayın.'],
      views: ['front', 'back'],
      allowedHeads: ['bell', 'diaphragm'],
      soundAssignments: assignments,
      primaryAcousticFinding: combo,
      clinicalDiagnosis: null,
      mappingValidation: 'educational_mapping',
      mappingNote: 'Veri seti mixed kategorisi; hastalık tanımı içermez.',
      technique: { requiredPoints: [loc], minPointsVisited: 1, minDwellMs: 2000, minListenMsPerPoint: 3000 },
      questions: [
        {
          id: 'q1', type: 'sound_identify', domain: 'recognition',
          prompt: 'Kayıttaki KALP kaynaklı bileşen hangisidir?',
          options: [{ id: 'a', label: HEART[hf]?.label ?? hf }, ...Object.entries(HEART).filter(([k2]) => k2 !== hf).slice(0, 3).map(([, v], i) => ({ id: String.fromCharCode(98 + i), label: v.label }))],
          correct: ['a'],
          feedbackCorrect: `Doğru. Kalp kaynaklı bileşen ${HEART[hf]?.label ?? hf} olarak duyulur.`,
          feedbackIncorrect: `Bu kayıtta kalp kaynaklı bileşen olarak ${HEART[hf]?.label ?? hf} duyulur; tekrar dinleyip karşılaştırın.`,
          hint: libByKey[`heart.${hf}`]?.metaphor,
        },
        {
          id: 'q2', type: 'sound_identify', domain: 'recognition',
          prompt: 'Kayıttaki AKCİĞER kaynaklı bileşen hangisidir?',
          options: [{ id: 'a', label: LUNG[lf]?.label ?? lf }, ...Object.entries(LUNG).filter(([k2]) => k2 !== lf).slice(0, 3).map(([, v], i) => ({ id: String.fromCharCode(98 + i), label: v.label }))],
          correct: ['a'],
          feedbackCorrect: `Doğru. Akciğer kaynaklı bileşen ${LUNG[lf]?.label ?? lf} olarak duyulur.`,
          feedbackIncorrect: `Bu kayıtta akciğer kaynaklı bileşen olarak ${LUNG[lf]?.label ?? lf} duyulur; tekrar dinleyip karşılaştırın.`,
        },
      ],
      feedback: { summary: 'Kombine kayıtlarda iki kaynağı ayrıştırmak klinik dinlemenin temelidir.' },
      references: [`HLS-CMDS v3 — Mixed kayıtları (${combo})`],
      scoringWeights: { technique: 20, localization: 20, recognition: 50, interpretation: 0, diagnosis: 0, systematic: 10 },
      masteryThreshold: 80,
      auto: true,
      clinicalReview: 'beklemede',
    })
  }
  console.log('kombine vaka:', n)
}

// ---------------- PEDİATRİK VAKALAR (gerçek pediatrik kayıtlar — CirCor, ODC-BY 1.0) ----------------
{
  const pedRecords = records.filter((r) => r.sourceDataset === 'physionet-circor' && r.validationStatus === 'validated')
  const byFinding = new Map()
  for (const r of pedRecords) {
    if (!r.simulationLocation) continue
    if (!byFinding.has(r.acousticFinding)) byFinding.set(r.acousticFinding, [])
    byFinding.get(r.acousticFinding).push(r)
  }
  // pediatrik bağlam: yaş, hız ve solunum sayısı yaşa uygun
  const PED_CTX = {
    normal: { age: 7, hr: 96, rr: 22, note: 'Çocuklarda kalp hızı yaşla azalır; okul çağında ~70–110/dk beklenir.' },
    early_systolic_murmur: { age: 5, hr: 110, rr: 24, note: 'Ateşli dönemde kısa sistolik üfürümler sık; masum/patolojik ayrımı klinik bağlamla yapılır.' },
    mid_systolic_murmur: { age: 4, hr: 108, rr: 26, note: 'Orta sistolik üfürüm pediatride sık duyulur; masum Still üfürümü kısa ve müzikal olabilir.' },
    late_systolic_murmur: { age: 6, hr: 100, rr: 22, note: 'Geç sistolik üfürüm genellikle daha dikkatli değerlendirme gerektirir.' },
  }
  let n = 0
  for (const [finding, recs] of byFinding) {
    const ctx = PED_CTX[finding] ?? { age: 6, hr: 100, rr: 24, note: 'Pediatrik değerlendirme; yaşa uygun aralıkları hatırlayın.' }
    // her kayıt için bir pediatrik vaka (aynı odağa farklı noktalar ekleyerek karşılaştırma)
    for (const r of recs) {
      n++
      const primary = r.simulationLocation
      const id = `auto_ped_${finding}_${primary.replace('cardiac_', '')}_${String(n).padStart(3, '0')}`
      const otherPoints = ['cardiac_pulmonary', 'cardiac_tricuspid', 'cardiac_mitral'].filter((x) => x !== primary).slice(0, 2)
      const assignments = [{ soundId: r.id, pointId: primary, category: 'heart', acousticFinding: finding }]
      for (const op of otherPoints) {
        assignments.push({ pointId: op, category: 'heart', acousticFinding: 'normal' })
      }
      out.push({
        id, title: `Pediatrik ${HEART[finding]?.label ?? finding} — ${pointLabels[primary]}`,
        modes: ['practice', 'assessment'],
        population: 'pediatrik',
        patient: { age: ctx.age, sex: 'erkek' },
        chiefComplaint: 'Kalp seslerinin pediatrik değerlendirmesi',
        history: 'Çocuk hastada kardiyak oskültasyon planlanmıştır; ana odak kaydı gerçek bir pediatrik hastadan alınmıştır (CirCor, ODC-BY 1.0).',
        vitalSigns: { hr: ctx.hr, rr: ctx.rr, bp: '100/64', spo2: 98, temp: '37.2 °C' },
        objectives: ['Pediatrik kalp seslerini tanımak', 'Yaşa uygun hız/solunum değerlerini yorumlamak'],
        tasks: [
          'Odakları sistematik dinleyin.',
          // O8: 'normal' bulgusu üfürüm içermez; görev metni bulguya göre değişir
          finding === 'normal' ? 'Ek ses veya üfürüm olup olmadığını değerlendirin.' : 'Üfürümün zamanlamasını belirleyin.',
          'Pediatrik bağlamı değerlendirin.',
        ],
        views: ['front'],
        allowedHeads: ['bell', 'diaphragm'],
        soundAssignments: assignments,
        primaryAcousticFinding: finding,
        clinicalDiagnosis: null,
        mappingValidation: 'validated',
        mappingNote: 'Ana odak kaydı GERÇEK PEDİATRİK HASTADAN (CirCor, ODC-BY 1.0); diğer odaklar karşılaştırma için manikin normal kayıtlarıdır. Hastalık tanısı iddia edilmez.',
        technique: { requiredPoints: [primary], minPointsVisited: 2, minDwellMs: 1500, minListenMsPerPoint: 2000 },
        questions: [
          {
            id: 'q1', type: 'sound_identify', domain: 'recognition',
            prompt: 'Ana odakta duyduğunuz bulgu hangisidir?',
            options: [{ id: 'a', label: HEART[finding]?.label ?? finding }, ...Object.entries(HEART).filter(([k2]) => k2 !== finding && k2 !== 'normal').slice(0, 3).map(([, v], i) => ({ id: String.fromCharCode(98 + i), label: v.label }))],
            correct: ['a'],
            // O8: q1 sesi tanımlar, kalp hızı notu q2'ye ayrılmıştır (bilgi tekrarı yok)
            feedbackCorrect: `Doğru. ${libByKey[`heart.${finding}`]?.description ?? HEART[finding]?.label ?? finding}`,
            feedbackIncorrect: `Dinlediğiniz kayıt ${HEART[finding]?.label ?? finding} sınıfına aittir. ${libByKey[`heart.${finding}`]?.metaphor ?? ''}`,
            hint: libByKey[`heart.${finding}`]?.metaphor,
          },
          {
            id: 'q2', type: 'single_choice', domain: 'interpretation',
            prompt: 'Bu yaş grubunda beklenen istirahat kalp hızı aralığı hangisidir?',
            options: [{ id: 'a', label: `${ctx.hr >= 140 ? '90–160' : ctx.hr >= 100 ? '80–140' : ctx.hr >= 80 ? '70–110' : '60–100'}/dk` }, { id: 'b', label: '40–60/dk' }, { id: 'c', label: '140–200/dk' }, { id: 'd', label: '30–50/dk' }],
            correct: ['a'],
            feedbackCorrect: `Doğru. ${ctx.note}`,
            feedbackIncorrect: `Yaşa göre aralık: ${ctx.note}`,
          },
        ],
        feedback: { summary: `Pediatrik gerçek hasta kaydı (CirCor). ${ctx.note}` },
        references: ['CirCor DigiScope (PhysioNet v1.0.3) — ODC-BY 1.0', 'HLS-CMDS v3 — karşılaştırma kayıtları'],
        scoringWeights: caseWeights(false),
        masteryThreshold: 80,
        auto: true,
        clinicalReview: 'beklemede',
      })
    }
  }
  console.log('pediatrik gerçek kayıt vakası:', n)
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: 'sounds.json + sounds-external.json',
  count: out.length,
  cases: out,
}
fs.writeFileSync(path.join(ROOT, 'src', 'data', 'cases-auto.json'), JSON.stringify(manifest, null, 2))

// Hekim gözden geçirme listesi (tüm havuz) — klinik metinlerin insan onayından geçmesi için
{
  const core = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'cases.json'), 'utf8')).cases
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ')}"`
  const rows = ['id,populasyon,baslik,ana_bulgu,esleme,hekim_onayi,soru_sayisi,soru_metinleri,geri_bildirim']
  for (const c of [...core, ...out]) {
    rows.push([
      c.id, c.population ?? 'yetiskin', c.title, c.primaryAcousticFinding, c.mappingValidation,
      c.clinicalReview ?? 'beklemede', c.questions.length,
      c.questions.map((q) => q.prompt).join(' | '),
      (c.feedback?.summary ?? '').slice(0, 300),
    ].map(esc).join(','))
  }
  fs.writeFileSync(path.join(ROOT, 'docs', 'klinik-degerlendirme-listesi.csv'), '\ufeff' + rows.join('\n'))
  console.log('hekim gözden geçirme listesi:', rows.length - 1, 'vaka')
}
const byKind = out.reduce((acc, c) => {
  const k = c.id.split('_')[1]
  acc[k] = (acc[k] ?? 0) + 1
  return acc
}, {})
console.log(`Üretilen vaka: ${out.length}`, byKind)
