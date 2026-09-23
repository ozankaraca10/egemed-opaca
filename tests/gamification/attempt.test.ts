import { describe, expect, it } from 'vitest'
import { attemptId, buildAttemptRecord } from '../../src/gamification/attempt'
import type { CaseDef, CaseResult } from '../../src/core/types'

const q = (id: string, type: string) => ({ id, type, domain: 'recognition', prompt: '', options: [], correct: [] })
const def = (id: string, finding: string): CaseDef => ({
  id, primaryFinding: finding, timeLimitSec: 120,
  questions: [q(`${id}-f`, 'finding_identify'), q(`${id}-l`, 'localization'), q(`${id}-q`, 'film_quality'), q(`${id}-i`, 'interpretation')],
} as unknown as CaseDef)
const res = (id: string, correct: boolean, total = 90): CaseResult => ({
  caseId: id, total, max: 100, mastery: total >= 80, hintsUsed: 1,
  domains: { systematic: { earned: correct ? 10 : 5, max: 10 }, recognition: { earned: correct ? 20 : 0, max: 20 } } as CaseResult['domains'],
  answers: [`${id}-f`, `${id}-l`, `${id}-q`, `${id}-i`].map((qid) => ({ qid, correct, given: [] })),
})
const defs = new Map([['c1', def('c1', 'pneumothorax')], ['c2', def('c2', 'cardiomegaly')]])

describe('oturum → AttemptRecord', () => {
  it('sayaçlar, bulgular, alan yüzdeleri, ipucu toplamı', () => {
    const a = buildAttemptRecord({ mode: 'assessment', results: [res('c1', true), res('c2', false, 40)], caseById: (i) => defs.get(i), sessionSeed: 42, durationMs: 60_000, finishedAt: new Date('2026-09-23T10:00:00Z') })!
    expect(a).toMatchObject({ mode: 'assessment', caseCount: 2, hintsUsed: 2, localizationHits: 1, qualityCorrect: 1, interpretationCorrect: 1, abcdeComplete: 1 })
    expect(a.findings).toEqual([{ finding: 'pneumothorax', correct: true }, { finding: 'cardiomegaly', correct: false }])
    expect(a.domains.systematic).toBe(75)
    expect(a.finishedAt).toBe('2026-09-23T10:00:00.000Z')
  })
  it('kimlik kararlı (aynı oturum → aynı id), farklı tohum → farklı id', () => {
    expect(attemptId('assessment', 42, ['c1', 'c2'])).toBe(attemptId('assessment', 42, ['c1', 'c2']))
    expect(attemptId('assessment', 43, ['c1', 'c2'])).not.toBe(attemptId('assessment', 42, ['c1', 'c2']))
    expect(attemptId('practice', 42, ['c1', 'c2'])).not.toBe(attemptId('assessment', 42, ['c1', 'c2']))
  })
  it('Hızlı ve Doğru: yalnız değerlendirme, ≥90 ve süre ≤ sınırın yarısı', () => {
    const base = { results: [res('c1', true, 95), res('c2', true, 95)], caseById: (i: string) => defs.get(i), sessionSeed: 1, finishedAt: new Date() }
    expect(buildAttemptRecord({ ...base, mode: 'assessment', durationMs: 120_000 })!.fastPerfect).toBe(true) // sınır 240 sn
    expect(buildAttemptRecord({ ...base, mode: 'assessment', durationMs: 121_000 })!.fastPerfect).toBe(false)
    expect(buildAttemptRecord({ ...base, mode: 'practice', durationMs: 1_000 })!.fastPerfect).toBe(false)
  })
  it('boş oturum → null', () => {
    expect(buildAttemptRecord({ mode: 'practice', results: [], caseById: () => undefined, sessionSeed: 1, durationMs: 0, finishedAt: new Date() })).toBeNull()
  })
})
