/** EGEMED Opaca — `?gami=1&demo=full|empty|winner` için hazır `GamiStateV1` durumları
 *  (yol haritası §4, §6 Faz 2 UI'sinin ihtiyaç duyacağı sabit demo profiller). Saf fonksiyonlar;
 *  zaman parametre (`now`) — içeride Date.now()/new Date(now olmadan) yok.
 *
 *  Basitleştirme (bkz. rapor "varsayımlar"): gerçekçi bir kullanım geçmişini birebir simüle etmek
 *  yerine, hedef toplam istatistiklere (yaklaşık 28 değerlendirme, 42 uygulama vakası, 3 günlük
 *  güncel seri…) ulaşacak şekilde deterministik (tohumlu) bir deneme dizisi üretilir. `earned`
 *  rozetleri, üretilen tüm denemeler tek seferde uygulanmış gibi hesaplanır (gerçek kazanma
 *  tarihleri değil, `now` damgalıdır) — bu demo verisinin doğası gereği kabul edilebilir bir
 *  yaklaşıklıktır ve UI'nin gerçek bir profille aynı şekle sahip veri görmesini sağlar. */

import type { AttemptRecord, GamiStateV1 } from './types'
import { emptyState } from './storage'
import { computeStats } from './stats'
import { evaluateBadges } from './badges'
import { startOfMonthTr } from './time'
import { FINDINGS } from '../data/terminology'

export type DemoKind = 'full' | 'empty' | 'winner'

const DAY_MS = 86_400_000

/** FNV-1a benzeri dizge → 32-bit tohum (mock.ts ile aynı yöntem, bağımsız kopya — döngüsel
 *  bağımlılık kurmamak için burada da tanımlanır). */
function seedFromString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TEACHING_FINDING_IDS = Object.entries(FINDINGS)
  .filter(([, def]) => def.teaching)
  .map(([id]) => id)

function mkAttempt(over: Partial<AttemptRecord> & Pick<AttemptRecord, 'id' | 'mode' | 'finishedAt'>): AttemptRecord {
  return {
    score: 0,
    mastery: false,
    caseCount: 1,
    hintsUsed: 0,
    durationMs: 5 * 60_000,
    domains: {},
    findings: [],
    localizationHits: 0,
    abcdeComplete: 0,
    qualityCorrect: 0,
    interpretationCorrect: 0,
    fastPerfect: false,
    ...over,
  }
}

function isoAtOffset(now: Date, daysAgo: number): string {
  return new Date(now.getTime() - daysAgo * DAY_MS).toISOString()
}

/** Boş durum: hiç deneme yok, varsayılan profil (bkz. storage.emptyState). */
export function demoStateEmpty(): GamiStateV1 {
  return emptyState()
}

/** Dolu profil: docs/mockups/gami-mock-data.mjs'teki "me" profiline yakın büyüklükte (§T0 maketi):
 *  ~28 değerlendirme, ~42 uygulama vakası, güncel seri 3 gün, birkaç kazanılmış rozet. */
export function demoStateFull(now: Date): GamiStateV1 {
  const rng = mulberry32(seedFromString('opaca-demo-full'))
  const attempts: AttemptRecord[] = []

  // Güncel seri = 3 gün: bugün, dün, evvelsi gün en az bir oturum; sonrasında aralıklı günler
  // (longest streak da 3 kalsın diye ardışık olmayan, 3 günlük boşluklu ofsetler kullanılır).
  const assessmentOffsets = [0, 1, 2, ...Array.from({ length: 25 }, (_, i) => 5 + i * 3)] // 28 gün
  assessmentOffsets.forEach((daysAgo, i) => {
    const score = Math.round((70 + rng() * 28) * 10) / 10
    const findingId = TEACHING_FINDING_IDS[i % TEACHING_FINDING_IDS.length]
    const correct = rng() > 0.15
    attempts.push(
      mkAttempt({
        id: `demo-full-assess-${i}`,
        mode: 'assessment',
        finishedAt: isoAtOffset(now, daysAgo),
        score,
        mastery: score >= 80,
        caseCount: 5,
        hintsUsed: 0,
        localizationHits: correct ? 2 : 1,
        abcdeComplete: i % 3 === 0 ? 1 : 0,
        qualityCorrect: correct ? 2 : 1,
        interpretationCorrect: correct ? 2 : 1,
        fastPerfect: score >= 90 && i % 4 === 0,
        findings: [{ finding: findingId, correct }],
        // alan yüzdeleri: puan etrafında sabit sapmalar (klinik yorum bilinçli olarak zayıf)
        domains: {
          technique: Math.min(100, Math.round(score + 6)), systematic: Math.round(score - 4), quality: Math.min(100, Math.round(score + 3)),
          recognition: Math.round(score), localization: Math.round(score - 10), interpretation: Math.round(score - 27), diagnosis: Math.round(score - 18),
        },
      })
    )
  })

  // Uygulama: 6 oturum × 7 vaka = 42 vaka, farklı (deneme günleriyle çakışmayan) günlerde.
  // 3. gün boş kalmalı: aksi hâlde güncel seri 0–2. günlerle birleşip 3 yerine 5–6 olur.
  const practiceOffsets = [4, 7, 34, 37, 65, 68]
  practiceOffsets.forEach((daysAgo, i) => {
    attempts.push(
      mkAttempt({
        id: `demo-full-practice-${i}`,
        mode: 'practice',
        finishedAt: isoAtOffset(now, daysAgo),
        caseCount: 7,
        hintsUsed: 0,
        mastery: i % 2 === 0,
        score: 0,
      })
    )
  })

  const learn = {
    topics: [
      'technique.systematic', 'technique.projection', 'finding.pneumothorax', 'finding.pleural_effusion',
      'finding.cardiomegaly', 'finding.nodule_mass', 'finding.tuberculosis', 'finding.fracture',
      'finding.hiatal_hernia', 'finding.westermark_sign', 'ct.axial_anatomy', 'ct.windows',
    ],
    ctStacksCompleted: ['ct-thorax-demo-1'],
  }

  const state: GamiStateV1 = {
    v: 1,
    attempts,
    learn,
    earned: [],
    profile: { displayName: 'Selin Çelik', public: true, cohort: 5 },
  }

  const stats = computeStats(state.attempts, state.learn, [], now)
  const earned = evaluateBadges(stats, [], now)
  state.earned = earned

  return state
}

/** Geçen ayın (TR takvimine göre) ödül kazananı: önceki TR ayı içinde, aday olmaya yeten sayıda
 *  yüksek puanlı, adla görünür değerlendirme. Gerçek `rewards.ts` yapılandırmasıyla eşleşmesi
 *  (kohort/asgari deneme) çağıran tarafın kullandığı `MonthlyReward`'a bağlıdır; bu fonksiyon yalnız
 *  makul bir aday profili üretir. */
export function demoStateWinner(now: Date): GamiStateV1 {
  const rng = mulberry32(seedFromString('opaca-demo-winner'))
  const thisMonthStart = startOfMonthTr(now)
  const prevMonthAnchor = new Date(thisMonthStart.getTime() - DAY_MS) // önceki ay içinde bir an
  const prevMonthStart = startOfMonthTr(prevMonthAnchor)

  const dayOffsetsIntoMonth = [2, 5, 9, 14, 18]
  const attempts: AttemptRecord[] = dayOffsetsIntoMonth.map((d, i) => {
    const finishedAt = new Date(prevMonthStart.getTime() + d * DAY_MS).toISOString()
    const score = Math.round((90 + rng() * 9) * 10) / 10
    const findingId = TEACHING_FINDING_IDS[i % TEACHING_FINDING_IDS.length]
    return mkAttempt({
      id: `demo-winner-assess-${i}`,
      mode: 'assessment',
      finishedAt,
      score,
      mastery: true,
      caseCount: 5,
      localizationHits: 3,
      abcdeComplete: 1,
      qualityCorrect: 3,
      interpretationCorrect: 3,
      fastPerfect: i === 0,
      findings: [{ finding: findingId, correct: true }],
    })
  })

  const learn = { topics: ['technique.systematic', 'finding.pneumothorax', 'finding.cardiomegaly'], ctStacksCompleted: [] }

  const state: GamiStateV1 = {
    v: 1,
    attempts,
    learn,
    earned: [],
    profile: { displayName: 'Demo Kazanan', public: true, cohort: 4 },
  }

  const stats = computeStats(state.attempts, state.learn, [], now)
  state.earned = evaluateBadges(stats, [], now)

  return state
}

export function demoStateFor(kind: DemoKind, now: Date): GamiStateV1 {
  switch (kind) {
    case 'empty':
      return demoStateEmpty()
    case 'winner':
      return demoStateWinner(now)
    case 'full':
      return demoStateFull(now)
  }
}
