import { beforeEach, describe, expect, it } from 'vitest'
import { formatLmsName, initials, LocalRepo } from '../../src/gamification/repo'
import { emptyState, loadState, saveState, STORAGE_KEY } from '../../src/gamification/storage'
import { demoPeriodRow, DEMO_PEERS } from '../../src/gamification/mock'
import { demoStateFor } from '../../src/gamification/demo'
import { computeStats } from '../../src/gamification/stats'
import { computeStreak } from '../../src/gamification/streak'
import { attempt, installMemoryStorage } from './helpers'

let store: Map<string, string>
beforeEach(() => { store = installMemoryStorage() })
const now = new Date('2026-09-23T10:00:00Z')

describe('ad biçimi ve baş harf', () => {
  it('Moodle "Soyad, Ad" → "Ad Soyad"; tek kelime; boş', () => {
    expect(formatLmsName('Çelik, Selin')).toBe('Selin Çelik')
    expect(formatLmsName('  Kaya ,  Deniz Ali ')).toBe('Deniz Ali Kaya')
    expect(formatLmsName('Selin')).toBe('Selin')
    expect(formatLmsName('')).toBe('')
    expect(formatLmsName(null)).toBe('')
  })
  it('Türkçe baş harf (İ, Ş, Ç, Ö)', () => {
    expect(initials('irem şahin')).toBe('İŞ')
    expect(initials('Selin Çelik')).toBe('SÇ')
    expect(initials('Can Deniz Öztürk')).toBe('CÖ')
    expect(initials('Anonim')).toBe('A')
  })
})

describe('storage', () => {
  it('bozuk JSON, yanlış sürüm, eksik alan → boş durum (istisna yok)', () => {
    store.set(STORAGE_KEY, '{bozuk')
    expect(loadState()).toEqual(emptyState())
    store.set(STORAGE_KEY, JSON.stringify({ ...emptyState(), v: 2 }))
    expect(loadState()).toEqual(emptyState())
    store.set(STORAGE_KEY, JSON.stringify({ v: 1, attempts: [] }))
    expect(loadState()).toEqual(emptyState())
  })
  it('localStorage yoksa boş durum; kaydetme sessizce geçer', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage
    expect(loadState()).toEqual(emptyState())
    expect(() => saveState(emptyState())).not.toThrow()
  })
  it('en fazla 500 deneme tutulur (en eskiler düşer)', () => {
    const s = emptyState()
    s.attempts = Array.from({ length: 510 }, (_, i) => attempt({ id: `k${i}` }))
    saveState(s)
    const back = loadState()
    expect(back.attempts).toHaveLength(500)
    expect(back.attempts[0].id).toBe('k10')
  })
})

describe('LocalRepo', () => {
  it('recordAttempt idempotent ve rozetleri değerlendirir', async () => {
    const repo = new LocalRepo()
    const a = attempt({ id: 'same', score: 85 })
    await repo.recordAttempt(a)
    await repo.recordAttempt(a)
    expect(await repo.listAttempts()).toHaveLength(1)
    expect(loadState().earned.map((e) => e.id)).toEqual(expect.arrayContaining(['first-step', 'threshold']))
  })
  it('recordLearn konu/BT yığınını bir kez sayar', async () => {
    const repo = new LocalRepo()
    await repo.recordLearn({ topic: 'finding.pneumothorax' }, now)
    await repo.recordLearn({ topic: 'finding.pneumothorax', ctStack: 'tcia_ct_intro_01' }, now)
    const s = loadState()
    expect(s.learn).toEqual({ topics: ['finding.pneumothorax'], ctStacksCompleted: ['tcia_ct_intro_01'] })
    expect(s.earned.map((e) => e.id)).toContain('ct-explorer')
  })
  it('ad LMS\'ten gelir; anonim seçilince tabloda "Anonim öğrenci"; sonuç demo etiketli', async () => {
    const repo = new LocalRepo({ lmsStudentName: 'Çelik, Selin' })
    expect((await repo.getMe()).displayName).toBe('Selin Çelik')
    await repo.recordAttempt(attempt({ id: 'm1', score: 90, finishedAt: '2026-09-22T10:00:00Z' }))
    await repo.recordAttempt(attempt({ id: 'm2', score: 80, finishedAt: '2026-09-23T09:00:00Z' }))
    let view = await repo.getLeaderboard('month', 'all', now)
    expect(view.isDemo).toBe(true)
    let me = view.rows.find((r) => r.isMe)!
    expect(me.displayName).toBe('Selin Çelik')
    expect(me.periodScore).toBe(85)
    expect(me.rank).not.toBeNull()
    await repo.updateMe({ public: false })
    view = await repo.getLeaderboard('month', 'all', now)
    me = view.rows.find((r) => r.isMe)!
    expect(me.displayName).toBe('Anonim öğrenci')
    expect(JSON.stringify(view)).not.toContain('Selin')
  })
  it('kohort filtresi: yalnız o dönemin akranları; profil kohortu farklıysa "ben" listede yok', async () => {
    const repo = new LocalRepo()
    await repo.updateMe({ cohort: 5 })
    const view = await repo.getLeaderboard('month', 1, now)
    expect(view.rows.every((r) => r.cohort === 1)).toBe(true)
    expect(view.rows.some((r) => r.isMe)).toBe(false)
  })
})

describe('demo akranlar ve demo durumları', () => {
  it('akranlar deterministik: aynı dönem+now → aynı sonuç; kohortlar 1–6 aralığında', () => {
    for (const p of DEMO_PEERS) {
      expect(demoPeriodRow(p, 'month', now)).toEqual(demoPeriodRow(p, 'month', now))
      expect(p.cohort).toBeGreaterThanOrEqual(1)
      expect(p.cohort).toBeLessThanOrEqual(6)
    }
  })
  it('empty → hiç deneme yok; full → maketteki profil ölçeğinde; winner geçerli durum', () => {
    expect(demoStateFor('empty', now).attempts).toHaveLength(0)
    const full = demoStateFor('full', now)
    const stats = computeStats(full.attempts, full.learn, full.earned, now)
    expect(stats.assessmentCount).toBe(28)
    expect(stats.practiceCaseTotal).toBe(42)
    expect(computeStreak(full.attempts, now).current).toBe(3)
    expect(full.earned.length).toBeGreaterThan(0)
    const winner = demoStateFor('winner', now)
    expect(winner.v).toBe(1)
  })
})
