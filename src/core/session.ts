import type { CaseDef } from './types'

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

/** Katmanlı örnekleme: önce her bulgu sınıfından bir vaka, sonra kalan havuzdan doldur. */
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
  // 1. tur: her bulgudan bir vaka (çeşitlilik)
  for (const f of findings) {
    if (picked.length >= count) break
    const group = shuffle(byFinding.get(f)!, rnd)
    picked.push(group[0])
    usedIds.add(group[0].id)
  }
  // 2. tur: kalan havuzdan rastgele doldur
  if (picked.length < count) {
    const rest = shuffle(pool.filter((c) => !usedIds.has(c.id)), rnd)
    for (const c of rest) {
      if (picked.length >= count) break
      picked.push(c)
    }
  }
  return shuffle(picked, rnd).map((c) => c.id)
}
