import { describe, expect, it } from 'vitest'
import { buildChartSeries, labelEvery, niceMax, trShortDate } from '../../src/gamification/chart'
import { attempt } from './helpers'

const S = '2026-09-01T00:00:00.000Z', E = '2026-09-30T23:59:59.000Z'

describe('ilerleme grafiği verisi', () => {
  it('0 nokta: boş; 1 nokta: tek nokta', () => {
    expect(buildChartSeries([], S, E)).toEqual([])
    const one = buildChartSeries([attempt({ score: 88, finishedAt: '2026-09-08T10:00:00.000Z' })], S, E)
    expect(one).toHaveLength(1)
    expect(one[0]).toMatchObject({ label: '8 Eyl', score: 88, cumulativeXp: 120 })
  })
  it('60 nokta, kümülatif XP dönem öncesini de sayar; uygulama noktası yok ama XP\'si birikir', () => {
    const before = attempt({ score: 90, finishedAt: '2026-08-20T10:00:00.000Z' }) // 120 XP, dönem dışı
    const practice = attempt({ mode: 'practice', caseCount: 10, finishedAt: '2026-09-02T09:00:00.000Z' }) // 50 XP
    const many = Array.from({ length: 60 }, (_, i) => attempt({ score: 70, finishedAt: new Date(Date.parse('2026-09-03T00:00:00Z') + i * 9 * 3_600_000).toISOString() }))
    const pts = buildChartSeries([...many, before, practice], S, E)
    expect(pts).toHaveLength(60)
    expect(pts[0].cumulativeXp).toBe(120 + 50 + 100)
    expect(pts[59].cumulativeXp).toBe(120 + 50 + 60 * 100)
  })
  it('TR tarih: UTC 21:00 bir sonraki gün', () => {
    expect(trShortDate('2026-09-07T21:00:00.000Z')).toBe('8 Eyl')
    expect(trShortDate('2026-12-31T20:59:00.000Z')).toBe('31 Ara')
  })
  it('XP ekseni yuvarlak üst sınır; etiket aralığı genişliğe göre', () => {
    expect([80, 120, 920, 1500, 6200].map(niceMax)).toEqual([100, 200, 1000, 2000, 10000])
    expect(labelEvery(12, 680)).toBe(2)
    expect(labelEvery(12, 250)).toBe(4)
    expect(labelEvery(60, 680)).toBe(6)
    expect(labelEvery(1, 300)).toBe(1)
  })
})
