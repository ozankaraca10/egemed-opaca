import { describe, expect, it } from 'vitest'
import { assessmentXp, attemptXp, learnXp, levelForXp, levelStartXp, practiceXp, totalXpFor } from '../../src/gamification/xp'
import { attempt } from './helpers'

describe('XP kuralları', () => {
  it('uygulama: vaka başına 5, ustalık +5, ipucu −2 (vaka başına 0 tabanı)', () => {
    expect(practiceXp({ caseCount: 10, hintsUsed: 0, mastery: false })).toBe(50)
    expect(practiceXp({ caseCount: 10, hintsUsed: 0, mastery: true })).toBe(100)
    expect(practiceXp({ caseCount: 10, hintsUsed: 5, mastery: false })).toBe(40)
    expect(practiceXp({ caseCount: 2, hintsUsed: 20, mastery: false })).toBe(0) // negatife düşmez
    expect(practiceXp({ caseCount: 0, hintsUsed: 0, mastery: true })).toBe(0)
  })
  it('değerlendirme: vaka başına 10, puan ≥ 80 ise +20 (eşik tam sınırda)', () => {
    expect(assessmentXp({ caseCount: 10, score: 79.9 })).toBe(100)
    expect(assessmentXp({ caseCount: 10, score: 80 })).toBe(120)
  })
  it('öğrenme: konu başına 2; toplam = denemeler + öğrenme', () => {
    const learn = { topics: ['a', 'b', 'c'], ctStacksCompleted: [] }
    expect(learnXp(learn)).toBe(6)
    const list = [attempt({ score: 85 }), attempt({ mode: 'practice', caseCount: 10, mastery: false })]
    expect(attemptXp(list[0])).toBe(120)
    expect(totalXpFor(list, learn)).toBe(120 + 50 + 6)
  })
})

describe('seviye eğrisi (genişlik 100 × n)', () => {
  it('başlangıçlar 0, 100, 300, 600, 1000', () => {
    expect([1, 2, 3, 4, 5].map(levelStartXp)).toEqual([0, 100, 300, 600, 1000])
  })
  it.each([
    [0, 1, 0, 100], [99, 1, 99, 1], [100, 2, 0, 200], [299, 2, 199, 1], [300, 3, 0, 300], [1000, 5, 0, 500],
  ])('%i XP → seviye %i (seviye içi %i, sonrakine %i)', (xp, level, into, toNext) => {
    const info = levelForXp(xp)
    expect(info.level).toBe(level)
    expect(info.xpIntoLevel).toBe(into)
    expect(info.xpToNext).toBe(toNext)
  })
})
