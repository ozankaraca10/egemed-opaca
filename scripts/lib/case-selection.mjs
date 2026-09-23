/** V1/V10/V2/V3 (BRIEF_OPACA_V3) + BRIEF_OPACA_DISTRACTORS (çeldirici düzeltmesi): 200 vakalık havuz
 *  seçimi, soru varyant dağıtımı ve çeldirici seçimi için saf, bağımsız test edilebilir yardımcılar.
 *  generate-cases.mjs bunları orkestre eder. */
import { EXPERT } from './cxr-common.mjs'
import { findingsFromReadingText, NLM_READING_FINDING_KEYWORDS } from './nlm-keywords.mjs'

/** Deterministik PRNG (dize tohumundan) — FNV-1a benzeri karıştırma + xorshift. */
export function seededRng(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

export function seededShuffle(arr, rnd) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** V1 kural 4: hasta düzeyinde bağımsızlık. NIH'de dosya/id önekindeki hasta numarası
 *  (`nih_XXXXXXXX_NNN` → `nih_XXXXXXXX`) kullanılır; diğer veri setlerinde her görüntü
 *  kendi başına tek bir "hasta" sayılır (bilinen çoklu-görüntü/hasta ilişkisi yok). */
export function patientKey(img) {
  if (img.sourceDataset === 'nih-cxr14') {
    const m = /^nih_(\d+)_/.exec(img.id)
    if (m) return `nih_${m[1]}`
  }
  return img.id
}

/** V3: kutu alanı (0–1 normalize w*h) bu eşiği aşarsa lokalizasyon sorusu üretilmez. */
export const MAX_LOCALIZATION_BOX_AREA = 0.35

export function boxArea(b) {
  return b.w * b.h
}

/** V10 seçim puanı (azalan sırada sırala, katman kotası dolana dek al):
 *  1. expert_bbox/expert_mask (kutulu) var → +100 (kutu alanı %35'ten küçükse +20 ek)
 *  2. kutu yoksa kaynağa göre: expert_panel +60, expert_reading +40, report_nlp +10, author_caption +5
 *  3. aynı hastadan ikinci vaka → −50 (pratikte eler)
 *  Eşitlikte çağıran taraf çözünürlük + deterministik tohumla sıralar (bu fonksiyon yalnız puanı verir). */
export function candidateScore({ hasBox, boxAreaOk, source, isRepeatPatient }) {
  let score = 0
  if (hasBox) {
    score += 100
    if (boxAreaOk) score += 20
  } else if (source === 'expert_panel') score += 60
  else if (source === 'expert_reading') score += 40
  else if (source === 'report_nlp') score += 10
  else if (source === 'author_caption') score += 5
  if (isRepeatPatient) score -= 50
  return score
}

/** V2 (düzeltilmiş tanım — koordinatör kararı 23 Eylül, eski ≥0,45 oranı ölçütünün yerine geçer):
 *  soru imzası artık soru TÜRÜNE göre iki farklı biçimde hesaplanır — src/core/session.ts'teki
 *  `questionSignature` ile BİREBİR AYNI algoritma (build-time betikleri tarayıcı paketine TS içe
 *  aktaramadığı için burada ayrıca tutulur; ikisi de değiştirilirse eşleştirilmeli).
 *
 *  - GÖRÜNTÜYE BAĞLI sorular (finding_identify/localization/film_quality): imza = tür|görüntüId|doğru
 *    yanıt. Her vaka farklı bir görüntüden türediğinden bunlar doğası gereği benzersizdir — havuz
 *    düzeyinde "tekrar" sayılmaz (eski tanım prompt metnini de imzaya katıyordu; bu, "Bu grafideki ana
 *    bulgu hangisidir?" gibi görüntüye özgü ama aynı kalıpta sorulan meşru soruları haksız yere tekrar
 *    sayıyordu).
 *  - BİLGİ soruları (interpretation ve görüntüden bağımsız her tür): imza = tür|prompt|doğru yanıt.
 *    Asıl tekrar riski burada — aynı kütüphane şablonu birden çok vakaya aynen kopyalanabilir.
 *
 *  `legacyQuestionSignature` eski (ilk V2 turu) tanımı yalnız rapor karşılaştırması için korur. */
export const IMAGE_DEPENDENT_TYPES = new Set(['finding_identify', 'localization', 'film_quality'])
/** Bilgi sorusu varyantı havuzda en fazla bu kadar vakada kullanılabilir (V2 §2b). */
export const KNOWLEDGE_QUESTION_CAP = 4
/** Bulgudan bağımsız genel sorular (ör. ABCDE sırası) havuzdaki vakaların en fazla bu oranında olabilir (V2 §2d). */
export const GENERIC_QUESTION_MAX_RATIO = 0.1

function correctLabelKey(q) {
  if (q.type === 'localization') return `hedef:${q.targetFinding ?? ''}`
  const labelById = new Map(q.options.map((o) => [o.id, o.label]))
  return [...q.correct].map((id) => labelById.get(id) ?? id).sort().join('~')
}

export function questionSignature(q, imageId) {
  const correctKey = correctLabelKey(q)
  if (IMAGE_DEPENDENT_TYPES.has(q.type)) return `${q.type}|${imageId ?? ''}|${correctKey}`
  return `${q.type}|${q.prompt}|${correctKey}`
}

/** Eski (ilk V2 turu) tanım — yalnız rapor karşılaştırması için korunur, artık kabul ölçütü değildir. */
export function legacyQuestionSignature(q) {
  if (q.type === 'localization') return `${q.type}|${q.prompt}|hedef:${q.targetFinding ?? ''}`
  const labelById = new Map(q.options.map((o) => [o.id, o.label]))
  const optionsKey = [...q.options].map((o) => o.label).sort().join('~')
  const correctKey = [...q.correct].map((id) => labelById.get(id) ?? id).sort().join('~')
  return `${q.type}|${q.prompt}|${optionsKey}|${correctKey}`
}

/** V2 §2b: bilgi sorusu varyant kullanım tavanı — generate-cases.mjs bunu her q_interpret/q_nextstep
 *  eklemeden önce çağırır; tavan dolmuşsa false döner ve o vaka için o soru eklenmez (vaka yalnız
 *  görüntüye bağlı sorularla kalır — bu beklenen/istenen davranıştır, V2 §2c). */
export function createKnowledgeCapTracker(cap = KNOWLEDGE_QUESTION_CAP) {
  const usage = new Map()
  return function tryUse(signature) {
    const n = usage.get(signature) ?? 0
    if (n >= cap) return false
    usage.set(signature, n + 1)
    return true
  }
}

/** V2 §2d: bulgudan bağımsız (generic:true) soru içeren vakaların havuz oranı. */
export function genericQuestionRatio(cases) {
  if (!cases.length) return 0
  const generic = cases.filter((c) => c.questions.some((q) => q.generic)).length
  return generic / cases.length
}

/** mulberry32 — src/core/session.ts'teki PRNG ile birebir aynı (V8 audit betiği aynı oturum
 *  örneklemesini build-time'da tekrarlayabilsin diye burada da tutulur). */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function mulberryShuffle(arr, rnd) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** src/core/session.ts → sampleSession ile BİREBİR AYNI algoritma (V8 audit: 100 rastgele tohumla
 *  oturum içi tekrar denetimi için). SESSION_SIZE=10 sabit varsayılan; case listesi CaseDef[]'e benzer
 *  {id, primaryFinding, questions} nesneleri bekler. */
export function sampleSession(pool, seed, count = 10) {
  if (pool.length <= count) return mulberryShuffle(pool, mulberry32(seed)).map((c) => c.id)
  const rnd = mulberry32(seed)
  const byFinding = new Map()
  for (const c of pool) {
    const key = c.primaryFinding
    if (!byFinding.has(key)) byFinding.set(key, [])
    byFinding.get(key).push(c)
  }
  const findingsList = mulberryShuffle([...byFinding.keys()], rnd)
  const picked = []
  const usedIds = new Set()
  const usedSignatures = new Set()
  const sigsOf = (c) => c.questions.map((q) => questionSignature(q, c.imageId))
  const collides = (c) => sigsOf(c).some((s) => usedSignatures.has(s))
  const take = (c) => {
    picked.push(c)
    usedIds.add(c.id)
    for (const s of sigsOf(c)) usedSignatures.add(s)
  }
  for (const f of findingsList) {
    if (picked.length >= count) break
    const group = mulberryShuffle(byFinding.get(f), rnd)
    const cand = group.find((c) => !collides(c)) ?? group[0]
    take(cand)
  }
  if (picked.length < count) {
    const rest = mulberryShuffle(pool.filter((c) => !usedIds.has(c.id)), rnd)
    for (const c of rest) {
      if (picked.length >= count) break
      if (!collides(c)) take(c)
    }
    if (picked.length < count) {
      for (const c of rest) {
        if (picked.length >= count) break
        if (!usedIds.has(c.id)) take(c)
      }
    }
  }
  // Onarım turu — src/core/session.ts ile birebir aynı mantık (bkz. oradaki yorum).
  for (let i = 0; i < picked.length; i++) {
    const others = picked.filter((_, j) => j !== i)
    const otherSignatures = new Set(others.flatMap(sigsOf))
    if (!sigsOf(picked[i]).some((s) => otherSignatures.has(s))) continue
    const stillUsed = new Set(picked.map((c) => c.id))
    const replacement = mulberryShuffle(pool.filter((c) => !stillUsed.has(c.id)), rnd).find(
      (c) => !sigsOf(c).some((s) => otherSignatures.has(s))
    )
    if (replacement) picked[i] = replacement
  }
  return mulberryShuffle(picked, rnd).map((c) => c.id)
}

/** V2 kural 2: deterministik varyant dağıtımı (round-robin + tohum karışımı).
 *  Aynı bulgudaki (anahtar) ardışık çağrılar HER ZAMAN farklı varyant döndürür (varyant sayısı ≥2 ise) —
 *  bir turun tükenip yeniden karıştırıldığı sınırda bile önceki turun son elemanıyla çakışmayı önler.
 *  Aynı işlem sırası + aynı girdiyle her zaman aynı dizilim üretir (deterministik). */
export function createVariantAssigner() {
  const state = new Map()
  return function pick(key, variants) {
    const n = variants.length
    if (n <= 1) return variants[0] ?? null
    let st = state.get(key)
    if (!st || st.i >= st.perm.length) {
      const cycle = st ? st.cycle + 1 : 0
      let perm = seededShuffle(
        Array.from({ length: n }, (_, i) => i),
        seededRng(`variant:${key}:${cycle}`)
      )
      if (st && perm[0] === st.lastIdx) {
        const rnd = seededRng(`variant:${key}:${cycle}:swap`)
        const j = 1 + Math.floor(rnd() * (n - 1))
        ;[perm[0], perm[j]] = [perm[j], perm[0]]
      }
      st = { perm, i: 0, lastIdx: st ? st.lastIdx : null, cycle }
    }
    const idx = st.perm[st.i]
    st.i += 1
    st.lastIdx = idx
    state.set(key, st)
    return variants[idx]
  }
}

/* =====================================================================================
 * BRIEF_OPACA_DISTRACTORS — çeldirici havuzu düzeltmesi
 * ===================================================================================== */

/** §3: ayırıcı tanı önceliği. Yalnız GÜVENLİ adaylar (safeDistractors çıktısı) arasında bir sıralamadır —
 *  bu harita hiçbir zaman güvensiz (uzman/NLP pozitif) bir bulguyu çeldiriciye dönüştürmez; sadece zaten
 *  güvenli sayılan adaylar arasından klinik olarak en makul olanları öne alır. Liste dışı primary'ler
 *  (ör. 'normal', pediatrik bulgular, vasküler işaretler) için öncelik yoktur — tüm güvenli adaylar eşit
 *  ağırlıklı, seed'li rastgele sırayla değerlendirilir.
 *  Değerlendirmedeki tüm tüberküloz alt tipleri (tuberculosis/_cavity/_fibrosis/miliary_pattern) aynı
 *  listeyi paylaşır (brif: "tüberküloz (tüm alt tipler)"). */
export const DIFFERENTIALS = {
  tuberculosis: ['airspace_opacity', 'nodule_mass', 'normal', 'pleural_effusion', 'emphysema'],
  tuberculosis_cavity: ['airspace_opacity', 'nodule_mass', 'normal', 'pleural_effusion', 'emphysema'],
  tuberculosis_fibrosis: ['airspace_opacity', 'nodule_mass', 'normal', 'pleural_effusion', 'emphysema'],
  miliary_pattern: ['airspace_opacity', 'nodule_mass', 'normal', 'pleural_effusion', 'emphysema'],
  airspace_opacity: ['atelectasis', 'pleural_effusion', 'nodule_mass', 'tuberculosis', 'normal'],
  nodule_mass: ['tuberculosis', 'airspace_opacity', 'atelectasis', 'normal'],
  pleural_effusion: ['atelectasis', 'airspace_opacity', 'cardiomegaly', 'normal'],
  pneumothorax: ['emphysema', 'atelectasis', 'normal'],
  atelectasis: ['airspace_opacity', 'pleural_effusion', 'nodule_mass', 'normal'],
  cardiomegaly: ['pleural_effusion', 'airspace_opacity', 'normal'],
  emphysema: ['pneumothorax', 'normal', 'atelectasis'],
}

/** §1/§2: bir görüntü için hangi öğretilen bulguların "güvenli" çeldirici adayı olduğunu hesaplar.
 *  Güvenli = filmde o bulgunun uzman/NLP kaynaklı pozitif bir kaydı OLMADIĞINA dair somut bir işaret var:
 *   1. uzman kaynaklı açık negatif (img.negatives[f])
 *   2. film uzman kaynaklı "normal" ise (tek pozitif bulgu normal olduğundan diğer HER şey güvenli)
 *   3. film uzman kaynaklı en az bir anormal bulguya sahipse "normal" güvenli (film normal değil)
 *   4. NIH filminde rapor (NLP) etiketleri varsa (report_nlp) — rapor bulguyu içermiyorsa güvenli
 *      (BRIEF_OPACA_DISTRACTORS §1: NIH zenginleştirmesiyle bu yol artık çoğu NIH filminde etkin)
 *   5. NLM Montgomery filminde readingText, NLM_READING_FINDING_KEYWORDS'teki bulgunun anahtar sözcüğünü
 *      HİÇ içermiyorsa (BRIEF_OPACA_DISTRACTORS §2) — yalnız bu haritadaki bulgular için; Shenzhen'de
 *      okumalar kısa kod olduğundan bu yol uygulanmaz.
 *  `teachingFindings`: değerlendirilecek bulgu anahtarlarının listesi (findings.json'da teaching:true olanlar). */
export function safeDistractors(img, primary, teachingFindings) {
  const hasNlpReport = img.sourceDataset === 'nih-cxr14' && Object.values(img.findings).some((s) => s === 'report_nlp')
  const expertNormal = !!img.findings.normal && EXPERT.has(img.findings.normal)
  const expertAbnormal = Object.entries(img.findings).some(([f, s]) => f !== 'normal' && EXPERT.has(s))
  const isMontgomery = img.sourceDataset === 'nlm-tb' && img.id.startsWith('nlm_montgomery_') && !!img.readingText
  const readingFindings = isMontgomery ? new Set(findingsFromReadingText(img.readingText)) : null
  const out = []
  for (const f of teachingFindings) {
    if (f === primary || img.findings[f]) continue
    if (img.negatives[f] && EXPERT.has(img.negatives[f])) out.push(f)
    else if (expertNormal && f !== 'normal') out.push(f)
    else if (f === 'normal' && expertAbnormal) out.push(f)
    else if (hasNlpReport && f !== 'normal' && !img.findings.no_finding_report) out.push(f)
    else if (isMontgomery && f in NLM_READING_FINDING_KEYWORDS && !readingFindings.has(f)) out.push(f)
  }
  return out
}

/** §3: güvenli adayları ayırıcı tanı önceliğine göre sıralar — önce DIFFERENTIALS[primary]'de listelenen
 *  (klinik önem sırasıyla), sonra kalanlar seed'li rastgele sırayla. `rnd`: seededRng gibi 0–1 üreten bir
 *  fonksiyon (çağıran tarafın görüntü id'sinden türettiği deterministik PRNG'i). */
export function orderDistractorsByDifferential(candidates, primary, rnd) {
  const priority = DIFFERENTIALS[primary] ?? []
  const rank = new Map(priority.map((f, i) => [f, i]))
  const prioritized = candidates.filter((f) => rank.has(f)).sort((a, b) => rank.get(a) - rank.get(b))
  const rest = seededShuffle(candidates.filter((f) => !rank.has(f)), rnd)
  return [...prioritized, ...rest]
}

/* =====================================================================================
 * BRIEF_OPACA_DISTRACTORS §5 — değerlendirme kapısı: seçmeli sorularda en az 3 seçenek
 * ===================================================================================== */

/** Bir vakanın değerlendirmeye girebilmesi için tüm SEÇMELİ (options dizisi dolu) sorularının en az
 *  bu kadar seçeneği olmalı (tahminle doğru yanıt olasılığı ≤ 1/3). Localization gibi options'ı boş
 *  dizi olan (seçmeli olmayan) sorular bu kurala tabi değildir. */
export const MIN_ASSESSMENT_OPTIONS = 3

/** Tek bir sorunun kapıyı geçip geçmediğini söyler — generate-cases.mjs (modes kararı) ve
 *  validate-images.mjs (ikinci savunma hattı) AYNI fonksiyonu kullanır. */
export function hasEnoughOptions(q) {
  return !q.options || q.options.length === 0 || q.options.length >= MIN_ASSESSMENT_OPTIONS
}

/** Bir vakanın TÜM sorularının kapıyı geçip geçmediği. */
export function caseSelectableOk(questions) {
  return questions.every(hasEnoughOptions)
}
