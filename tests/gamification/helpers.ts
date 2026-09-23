import type { AttemptRecord } from '../../src/gamification/types'

let n = 0
/** Test için asgari AttemptRecord (varsayılan: 10 vakalık değerlendirme). */
export function attempt(p: Partial<AttemptRecord> = {}): AttemptRecord {
  n += 1
  return {
    id: `a-${n}`,
    mode: 'assessment',
    finishedAt: '2026-09-23T10:00:00.000Z',
    score: 70,
    mastery: false,
    caseCount: 10,
    hintsUsed: 0,
    durationMs: 600_000,
    domains: {},
    findings: [],
    localizationHits: 0,
    abcdeComplete: 0,
    qualityCorrect: 0,
    interpretationCorrect: 0,
    fastPerfect: false,
    ...p,
  }
}

/** Node ortamında basit bellek içi localStorage. */
export function installMemoryStorage(): Map<string, string> {
  const m = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size },
  }
  return m
}
