import { describe, expect, it } from 'vitest'
import { BADGES, evaluateBadges } from '../../src/gamification/badges'
import { computeStats } from '../../src/gamification/stats'
import { attempt } from './helpers'

const now = new Date('2026-09-23T10:00:00Z')
const learn0 = { topics: [], ctStacksCompleted: [] }
const statsOf = (list = [attempt()], learn = learn0, earned: { id: string; at: string }[] = []) => computeStats(list, learn, earned, now)
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

describe('rozetler', () => {
  it('28 rozet, benzersiz kimlik, 5 kategori', () => {
    expect(BADGES).toHaveLength(28)
    expect(new Set(ids(BADGES)).size).toBe(28)
    expect(new Set(BADGES.map((b) => b.cat))).toEqual(new Set(['topic', 'skill', 'streak', 'learn', 'milestone']))
  })
  it('ilk değerlendirme → İlk Adım; eşik tam 80 → Eşik Aşıldı, 79 değil', () => {
    expect(ids(evaluateBadges(statsOf([attempt({ score: 79 })]), [], now))).toContain('first-step')
    expect(ids(evaluateBadges(statsOf([attempt({ score: 79 })]), [], now))).not.toContain('threshold')
    expect(ids(evaluateBadges(statsOf([attempt({ score: 80 })]), [], now))).toContain('threshold')
  })
  it('Keskin Göz kademeleri tam sınırda (9 → yok, 10 → bronz, 25 → gümüş)', () => {
    expect(ids(evaluateBadges(statsOf([attempt({ localizationHits: 9 })]), [], now))).not.toContain('sharp-eye-1')
    const at10 = ids(evaluateBadges(statsOf([attempt({ localizationHits: 10 })]), [], now))
    expect(at10).toContain('sharp-eye-1')
    expect(at10).not.toContain('sharp-eye-2')
    expect(ids(evaluateBadges(statsOf([attempt({ localizationHits: 25 })]), [], now))).toEqual(expect.arrayContaining(['sharp-eye-1', 'sharp-eye-2']))
  })
  it('beceri/konu sayaçları yalnız değerlendirmeden beslenir', () => {
    const s = statsOf([attempt({ mode: 'practice', localizationHits: 50, findings: [{ finding: 'pneumothorax', correct: true }] })])
    expect(s.localizationHits).toBe(0)
    expect(s.topicCorrect.pleura).toBe(0)
  })
  it('konu eşlemesi findings.json gruplarından; kemik rozeti yalnız kırık; eşleşmeyen bulgu yok sayılır', () => {
    const s = statsOf([attempt({ findings: [
      { finding: 'pneumothorax', correct: true }, { finding: 'pleural_effusion', correct: true }, { finding: 'pleural_effusion', correct: false },
      { finding: 'rib_fracture', correct: true }, { finding: 'scoliosis', correct: true }, { finding: 'bilinmeyen_bulgu', correct: true },
      { finding: 'tuberculosis_cavity', correct: true },
    ] })])
    expect(s.topicCorrect.pleura).toBe(2)
    expect(s.topicCorrect.bone).toBe(1)
    expect(s.topicCorrect.tb).toBe(1)
  })
  it('kazanılmış rozet geri alınmaz ve yeniden verilmez; Podyum v1\'de kazanılamaz', () => {
    const prev = [{ id: 'first-step', at: '2026-09-01T00:00:00Z' }]
    const again = evaluateBadges(statsOf([attempt()]), prev, now)
    expect(ids(again)).not.toContain('first-step')
    expect(ids(again)).not.toContain('podium')
  })
  it('öğrenme rozetleri: 10 konu → Öğrenme Kaşifi, 1 BT yığını → BT Kaşifi', () => {
    const learn = { topics: Array.from({ length: 10 }, (_, i) => `t${i}`), ctStacksCompleted: ['tcia_ct_intro_01'] }
    const got = ids(evaluateBadges(statsOf([], learn), [], now))
    expect(got).toEqual(expect.arrayContaining(['explorer', 'ct-explorer']))
  })
  it('kazanım zamanı verilen now', () => {
    expect(evaluateBadges(statsOf(), [], now)[0].at).toBe(now.toISOString())
  })
})
