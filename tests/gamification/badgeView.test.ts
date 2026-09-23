import { describe, expect, it } from 'vitest'
import { BADGES } from '../../src/gamification/badges'
import { badgeViews, sortBadgeViews, STUDY_KEY, trDate } from '../../src/gamification/badgeView'
import { computeStats } from '../../src/gamification/stats'
import { LIBRARY_ITEMS } from '../../src/data/terminology'
import { attempt } from './helpers'

const now = new Date('2026-09-23T10:00:00Z')

describe('rozet görünüm modeli', () => {
  it('her rozetin kısa koşulu var; çalışma anahtarları kütüphanede mevcut', () => {
    const views = badgeViews(computeStats([], { topics: [], ctStacksCompleted: [] }, [], now), [])
    expect(views).toHaveLength(BADGES.length)
    expect(views.every((v) => v.rule.length > 0)).toBe(true)
    const keys = new Set(LIBRARY_ITEMS.map((i) => i.key))
    expect(Object.values(STUDY_KEY).every((k) => keys.has(k))).toBe(true)
    expect(views.every((v) => v.state === 'locked')).toBe(true)
  })
  it('kazanılmış / devam eden / kilitli; Podyum ilerlemeli görünmez', () => {
    const stats = computeStats([attempt({ localizationHits: 7 })], { topics: [], ctStacksCompleted: [] }, [], now)
    const v = Object.fromEntries(badgeViews(stats, [{ id: 'first-step', at: '2026-09-20T10:00:00Z' }]).map((x) => [x.def.id, x]))
    expect(v['first-step'].state).toBe('earned')
    expect(v['sharp-eye-1']).toMatchObject({ state: 'progress', value: 7, max: 10 })
    expect(v['perfect'].state).toBe('locked')
    expect(v['podium'].state).toBe('locked')
  })
  it('sıralama: en yeni kazanılan önce, sonra ilerleme oranı yüksek olan', () => {
    const stats = computeStats([attempt({ localizationHits: 20 })], { topics: [], ctStacksCompleted: [] }, [], now)
    const sorted = sortBadgeViews(badgeViews(stats, [{ id: 'first-step', at: '2026-09-01T00:00:00Z' }, { id: 'sharp-eye-1', at: '2026-09-20T00:00:00Z' }]))
    expect(sorted.slice(0, 2).map((x) => x.def.id)).toEqual(['sharp-eye-1', 'first-step'])
    expect(sorted[2].state).toBe('progress')
  })
  it('TR tarih', () => {
    expect(trDate('2026-09-18T21:30:00Z')).toBe('19 Eyl 2026')
  })
})
