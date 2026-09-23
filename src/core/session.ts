import type { CaseDef, Question } from './types'

/** Oturum örnekleme (§ oturum başına 10 vaka, rastgele ama tekrarlanabilir).
 *  Amaç: öğrenciye her oturumda havuzdan 10 farklı vaka sunmak; hakimiyet
 *  ölçümü oturum bazında deterministik kalsın diye tohum (seed) yalnızca
 *  oturum başında üretilir ve suspend verisinde saklanır. */

export const SESSION_SIZE = 10

/** mulberry32 — küçük, deterministik PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** String → 32-bit tohum (K1: soru seçeneklerinin deterministik karıştırılması). */
export function stringSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return h >>> 0
}

/** Soru seçeneklerini vaka+soru id'sinden türeyen tohumla deterministik karıştırır (K1).
 *  Doğru yanıtın hep 'a' olma önyargısını kaldırır; aynı vaka+soru her zaman aynı sırayı üretir. */
export function shuffledOptions<T extends { id: string }>(caseId: string, questionId: string, options: T[]): T[] {
  const rnd = mulberry32(stringSeed(`${caseId}:${questionId}`))
  return shuffle(options, rnd)
}

/** V2/§3 (düzeltilmiş tanım — koordinatör kararı 23 Eylül): soru imzası artık soru TÜRÜNE göre
 *  ikiye ayrılır — scripts/lib/case-selection.mjs'teki `questionSignature` ile BİREBİR AYNI algoritma
 *  (audit/validate betikleri bunu build-time'da tekrar hesaplar; ikisi de değiştirilirse eşleştirilmeli).
 *  - GÖRÜNTÜYE BAĞLI sorular (finding_identify/localization/film_quality): imza = tür|görüntüId|doğru
 *    yanıt. Her vaka farklı bir görüntüden türediğinden bunlar doğası gereği benzersizdir; imza yalnız
 *    AYNI görüntüde birebir aynı soru üretilirse çakışır.
 *  - BİLGİ soruları (interpretation ve görüntüden bağımsız her tür): imza = tür|prompt|doğru yanıt.
 *    Öğrencinin bir oturumda anlamca aynı bilgi sorusunu iki kez görmemesi burada garanti edilir.
 *  Seçenek id'leri (a/b/c) `shuffledOptions` ile render sırasında karıştırıldığından imza id yerine
 *  etiket metnine dayanır. */
export const IMAGE_DEPENDENT_QUESTION_TYPES = new Set<Question['type']>(['finding_identify', 'localization', 'film_quality'])

function correctLabelKey(q: Question): string {
  if (q.type === 'localization') return `hedef:${q.targetFinding ?? ''}`
  const labelById = new Map(q.options.map((o) => [o.id, o.label]))
  return [...q.correct].map((id) => labelById.get(id) ?? id).sort().join('~')
}

export function questionSignature(q: Question, imageId?: string): string {
  const correctKey = correctLabelKey(q)
  if (IMAGE_DEPENDENT_QUESTION_TYPES.has(q.type)) return `${q.type}|${imageId ?? ''}|${correctKey}`
  return `${q.type}|${q.prompt}|${correctKey}`
}

function caseSignatures(c: CaseDef): string[] {
  return c.questions.map((q) => questionSignature(q, c.imageId))
}

/** Katmanlı örnekleme: önce her bulgu sınıfından bir vaka, sonra kalan havuzdan doldur.
 *  V2/§3 kesin kural: seçilen vakaların hiçbirinin soru imzası bir diğeriyle çakışmaz — çakışan
 *  aday atlanıp bir sonrakine geçilir. Havuz tükenip çakışmasız aday kalmazsa (çok küçük havuzlarda
 *  olabilir), oturum boyutunu korumak için son çare olarak çakışmaya izin verilir. */
export function sampleSession(pool: CaseDef[], seed: number, count = SESSION_SIZE): string[] {
  if (pool.length <= count) return shuffle(pool, mulberry32(seed)).map((c) => c.id)
  const rnd = mulberry32(seed)
  const byFinding = new Map<string, CaseDef[]>()
  for (const c of pool) {
    const key = c.primaryFinding
    if (!byFinding.has(key)) byFinding.set(key, [])
    byFinding.get(key)!.push(c)
  }
  const findings = shuffle([...byFinding.keys()], rnd)
  const picked: CaseDef[] = []
  const usedIds = new Set<string>()
  const usedSignatures = new Set<string>()
  const collides = (c: CaseDef) => caseSignatures(c).some((sig) => usedSignatures.has(sig))
  const take = (c: CaseDef) => {
    picked.push(c)
    usedIds.add(c.id)
    for (const sig of caseSignatures(c)) usedSignatures.add(sig)
  }

  // 1. tur: her bulgudan bir vaka (çeşitlilik) — grup içinde çakışmayan ilk aday tercih edilir
  for (const f of findings) {
    if (picked.length >= count) break
    const group = shuffle(byFinding.get(f)!, rnd)
    const cand = group.find((c) => !collides(c)) ?? group[0]
    take(cand)
  }
  // 2. tur: kalan havuzdan önce çakışmayanlarla doldur
  if (picked.length < count) {
    const rest = shuffle(pool.filter((c) => !usedIds.has(c.id)), rnd)
    for (const c of rest) {
      if (picked.length >= count) break
      if (!collides(c)) take(c)
    }
    // son çare: hâlâ eksikse (havuzda çakışmasız aday kalmadı) çakışmaya izin ver
    if (picked.length < count) {
      for (const c of rest) {
        if (picked.length >= count) break
        if (!usedIds.has(c.id)) take(c)
      }
    }
  }

  // Onarım turu: yukarıdaki turlarda (bulgu grubu ya da tüm havuz içinde) çakışmasız aday
  // BULUNAMADIĞI için zorunlu çakışmayla alınmış bir vaka kalmış olabilir (ör. bir bulgunun tüm
  // adayları aynı sabit soru şablonunu paylaşıyorsa). Bu son adım, öyle bir vakayı TÜM havuzdan
  // (yalnız kendi bulgu grubuyla sınırlı kalmadan) çakışmayan bir adayla değiştirmeyi dener — V2/§3
  // "kesin kural"ını (oturumda soru tekrarı sıfır) büyük ölçekte garanti eder.
  repairCollisions(picked, pool, rnd)

  return shuffle(picked, rnd).map((c) => c.id)
}

function repairCollisions(picked: CaseDef[], pool: CaseDef[], rnd: () => number): void {
  for (let i = 0; i < picked.length; i++) {
    const others = picked.filter((_, j) => j !== i)
    const otherSignatures = new Set(others.flatMap(caseSignatures))
    if (!caseSignatures(picked[i]).some((sig) => otherSignatures.has(sig))) continue
    const usedIds = new Set(picked.map((c) => c.id))
    const replacement = shuffle(pool.filter((c) => !usedIds.has(c.id)), rnd).find(
      (c) => !caseSignatures(c).some((sig) => otherSignatures.has(sig))
    )
    if (replacement) picked[i] = replacement
  }
}
