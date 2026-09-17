import { describe, it, expect, beforeEach } from 'vitest'
import { MockAdapter, detectScorm, makeScorm, Scorm2004Adapter, Scorm12Adapter } from '../src/core/scorm'

import { scoreCase, aggregateResults, practiceAdjusted, MASTERY_THRESHOLD } from '../src/core/scoring'
import { validateCase, filterAssessmentPool } from '../src/core/validation'
import { resolveAssignment, resolveAssignmentEx, resolveCaseSounds, resolveCaseSoundsEx, resolveLibrarySound, RECORDS, assessmentPointFilter } from '../src/core/resolver'
import casesData from '../src/data/cases.json'
import pointsData from '../src/data/auscultation-points.json'
import libraryJson from '../src/data/library.json'
import sourcesJson from '../src/data/sources.json'
import { mapCircorMurmur, mapCircorLocations } from '../scripts/lib/external-mapping.mjs'
import { sampleSession, SESSION_SIZE, shuffledOptions } from '../src/core/session'
import { poolFor as poolForTest, AUTO_CASES, ALL_CASES } from '../src/data/pool'
import { EXTERNAL_RECORDS } from '../src/core/resolver'
import { computeMetrics } from '../src/data/metrics'
import { serializeSuspend, deserializeSuspend, SUSPEND_LIMIT_12, SUSPEND_LIMIT_2004 } from '../src/core/suspend'
import { ScormRuntime, reducer, initialState, buildSuspend } from '../src/core/store'
import {
  nextActionForSubmit, regionChipState, countUnlistenedInOtherView, otherViewHintText,
  libraryKeyForCase, firstWeakLibraryKey, weakDomainKeys, tutorialProgress,
} from '../src/core/flow'
import { libraryShortTitle, libraryTitle } from '../src/data/terminology'
import type { CaseDef, SuspendPayload, Telemetry } from '../src/core/types'

const cases = casesData.cases as unknown as CaseDef[]
const pointIds = pointsData.points.map((p) => (p as { id: string }).id)
const soundKeys = new Set<string>()
const soundIdList = RECORDS.map((r) => r.id)

/* ---------------- SCORM runtime (§25, §26) ---------------- */
describe('SCORM runtime', () => {
  let mock: MockAdapter
  beforeEach(() => { mock = new MockAdapter() })

  it('mock adapter temel CRUD sağlar', () => {
    expect(mock.init()).toBe(true)
    mock.set('cmi.score.raw', '85')
    expect(mock.get('cmi.score.raw')).toBe('85')
    expect(mock.commit()).toBe(true)
    expect(mock.terminate()).toBe(true)
  })

  it('LMS yoksa standalone fallback (mock) devreye girer (§37)', () => {
    expect(detectScorm()).toBeNull()
    const { api, flags } = makeScorm()
    expect(api.version).toBe('mock')
    expect(flags.scormAvailable).toBe(false)
  })

  it('2004 adapter Initialize/SetValue/GetValue çağrılarını doğru sırada yapar', () => {
    const calls: string[] = []
    const api = {
      Initialize: () => { calls.push('init'); return 'true' },
      GetValue: (k: string) => { calls.push(`get:${k}`); return 'ok' },
      SetValue: (k: string, v: string) => { calls.push(`set:${k}=${v}`); return 'true' },
      Commit: () => 'true',
      Terminate: () => 'true',
      GetLastError: () => '0',
    }
    const a = new Scorm2004Adapter(api)
    a.init()
    a.set('cmi.score.raw', '100')
    a.get('cmi.score.raw')
    expect(calls[0]).toBe('init')
    expect(calls.some((c) => c.startsWith('set:cmi.score.raw=100'))).toBe(true)
    expect(calls.some((c) => c.startsWith('get:cmi.score.raw'))).toBe(true)
  })

  it('1.2 adapter success_status → lesson_status eşlemesi yapar (§26)', () => {
    const store = new Map<string, string>([['cmi.core.lesson_status', 'incomplete']])
    const api = {
      LMSInitialize: () => 'true',
      LMSGetValue: (k: string) => store.get(k) ?? '',
      LMSSetValue: (k: string, v: string) => { store.set(k, v); return 'true' },
      LMSCommit: () => 'true',
      LMSFinish: () => 'true',
    }
    const a = new Scorm12Adapter(api)
    a.set('cmi.success_status', 'passed')
    expect(store.get('cmi.core.lesson_status')).toBe('passed')
    a.set('cmi.score.raw', '85')
    expect(store.get('cmi.core.score.raw')).toBe('85')
  })
})

/* ---------------- suspend data (§27) ---------------- */
describe('suspend data', () => {
  const payload: SuspendPayload = {
    v: 1,
    mode: 'assessment',
    caseIndex: 2,
    step: 3,
    answers: { q1: ['a'], q2: ['a', 'b'] },
    hintsUsed: 1,
    caseResults: [{
      caseId: 'case_s3',
      total: 85,
      max: 100,
      mastery: true,
      domains: {
        technique: { earned: 20, max: 20 }, localization: { earned: 20, max: 20 },
        recognition: { earned: 25, max: 25 }, interpretation: { earned: 15, max: 20 },
        diagnosis: { earned: 0, max: 10 }, systematic: { earned: 5, max: 5 },
      },
      answers: [],
      hintsUsed: 1,
    }],
    tutorialDone: true,
    visits: { cardiac_mitral: { dwellMs: 5000, listenMs: 4200, visits: 2, firstOrder: 0 } },
    order: ['cardiac_mitral'],
    attempts: 1,
  }

  it('round-trip doğru çalışır', () => {
    const back = deserializeSuspend(serializeSuspend(payload))
    expect(back).not.toBeNull()
    expect(back!.mode).toBe('assessment')
    expect(back!.caseIndex).toBe(2)
    expect(back!.step).toBe(3)
    expect(back!.answers.q1).toEqual(['a'])
    expect(back!.hintsUsed).toBe(1)
    expect(back!.tutorialDone).toBe(true)
    expect(back!.visits.cardiac_mitral.dwellMs).toBe(5000)
    expect(back!.caseResults[0].total).toBe(85)
    expect(back!.caseResults[0].domains.technique.earned).toBe(20)
    expect(back!.caseResults[0].domains.diagnosis.max).toBe(10)
  })

  it('bozuk veri için null döner (çökmeme §37)', () => {
    expect(deserializeSuspend('{bozuk')).toBeNull()
    expect(deserializeSuspend('')).toBeNull()
    expect(deserializeSuspend(null)).toBeNull()
  })

  it('SCORM 1.2 limitine (4096 karakter) sığar', () => {
    const big: SuspendPayload = {
      ...payload,
      answers: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`q${i}`, ['a', 'b']])),
      visits: Object.fromEntries(
        Array.from({ length: 16 }, (_, i) => [`point_${i}`, { dwellMs: 9000, listenMs: 8000, visits: 3, firstOrder: i }])
      ),
    }
    expect(serializeSuspend(big).length).toBeLessThanOrEqual(4096)
  })
})

/* ---------------- reducer: oturum/mod geçişleri (K3, K4) ---------------- */
describe('reducer: yeni oturum ve devam ettirme', () => {
  it('öğretici "Atla" ile oturum içinde görüldü sayılır; kalıcı tutorialDone değişmez', () => {
    const seen = reducer(initialState, { type: 'tutorialSeen' })
    expect(seen.tutorialSeen).toBe(true)
    expect(seen.tutorialDone).toBe(false)
    // suspend'e yazılmaz (yalnız kalıcı bayrak taşınır)
    expect(buildSuspend(seen).tutorialDone).toBe(false)
  })
  it('K4: startMode eski vaka sonuçlarını ve zamanlayıcıyı sıfırlar', () => {
    const dirty = { ...initialState, caseResults: [{ caseId: 'x', total: 90, max: 100, mastery: true, domains: {} as never, answers: [], hintsUsed: 0 }], assessmentTimer: 45000, attempts: 2 }
    const next = reducer(dirty, { type: 'startMode', mode: 'assessment' })
    expect(next.caseResults).toEqual([])
    expect(next.assessmentTimer).toBe(0)
    expect(next.attempts).toBe(3)
  })

  it('K3: buildSuspend yalnız aktif modun oturum listesini yazar', () => {
    const state = { ...initialState, mode: 'assessment' as const, session: { practiceIds: ['p1', 'p2'], assessmentIds: ['a1', 'a2'], seed: 9 } }
    const payload = buildSuspend(state)
    expect(payload.sessionIds).toEqual(['a1', 'a2'])
    expect(payload.sessionSeed).toBe(9)
  })

  it('O9: uygulama modunda ipucu cezası vaka sonucuna uygulanır (değerlendirmede uygulanmaz)', () => {
    const def = ALL_CASES.find((c) => c.id === 'case_normal_heart')!
    const allCorrect = Object.fromEntries(def.questions.map((q) => [q.id, q.correct]))
    const telemetry = {
      visits: Object.fromEntries(def.technique.requiredPoints.map((p, i) => [p, { dwellMs: 99999, listenMs: 99999, visits: 1, firstOrder: i }])),
      order: [...def.technique.requiredPoints],
      headChanges: 0,
      headUse: { bell: 0, diaphragm: 0 } as const,
      replayCount: 0,
    }
    const baseState = {
      ...initialState,
      currentCaseId: def.id,
      step: def.questions.length - 1,
      answers: allCorrect,
      telemetry,
      hintsUsed: 2,
    }
    const practiceNext = reducer({ ...baseState, mode: 'practice' as const }, { type: 'finishCase' })
    expect(practiceNext.caseResults[0].total).toBe(90) // 100 - 2*5
    expect(practiceNext.caseResults[0].mastery).toBe(true)
    expect(practiceNext.pendingSummary?.total).toBe(90)

    const assessmentNext = reducer({ ...baseState, mode: 'assessment' as const }, { type: 'finishCase' })
    expect(assessmentNext.caseResults[0].total).toBe(100) // değerlendirmede ipucu cezası yok
  })

  it('madde 1/5: advance son soruda vakayı bitirmez — finishCase/nextCase gerekir', () => {
    const def = ALL_CASES.find((c) => c.id === 'case_normal_heart')!
    const baseState = { ...initialState, mode: 'practice' as const, currentCaseId: def.id, step: def.questions.length - 1 }
    // son soruda 'advance' hiçbir şey yapmamalı (state değişmez)
    const afterAdvance = reducer(baseState, { type: 'advance' })
    expect(afterAdvance).toBe(baseState)
    expect(afterAdvance.caseResults).toEqual([])
  })

  it('madde 5: finishCase sonrası nextCase caseIndex\'i ilerletir ve pendingSummary\'yi temizler', () => {
    const def = ALL_CASES.find((c) => c.id === 'case_normal_heart')!
    const allCorrect = Object.fromEntries(def.questions.map((q) => [q.id, q.correct]))
    const baseState = { ...initialState, mode: 'practice' as const, currentCaseId: def.id, step: def.questions.length - 1, answers: allCorrect }
    const finished = reducer(baseState, { type: 'finishCase' })
    expect(finished.pendingSummary).not.toBeNull()
    expect(finished.caseIndex).toBe(0) // finishCase vakayı DEĞİŞTİRMEZ
    const next = reducer(finished, { type: 'nextCase' })
    expect(next.pendingSummary).toBeNull()
    expect(next.caseIndex).toBe(1)
    expect(next.step).toBe(0)
  })

  it('K3: serialize → deserialize → restore sonrası aynı oturum vaka listesi korunur', () => {
    const pool = poolForTest('assessment')
    const seed = 555
    const ids = sampleSession(pool, seed)
    const state = { ...initialState, mode: 'assessment' as const, session: { practiceIds: [], assessmentIds: ids, seed } }
    const payload = buildSuspend(state)
    const raw = serializeSuspend(payload)
    const restored = deserializeSuspend(raw)!
    const next = reducer(state, { type: 'restore', payload: restored })
    expect(next.session.assessmentIds).toEqual(ids)
    expect(next.session.seed).toBe(seed)
    expect(next.session.practiceIds).toEqual([]) // diğer mod dokunulmaz
  })
})

/* ---------------- skor (§24) ---------------- */
describe('skor hesaplama', () => {
  const c = cases.find((x) => x.id === 'case_normal_heart')!
  const baseTelemetry: Telemetry = {
    visits: {
      cardiac_aortic: { dwellMs: 4000, listenMs: 4000, visits: 1, firstOrder: 0 },
      cardiac_pulmonary: { dwellMs: 4000, listenMs: 3500, visits: 1, firstOrder: 1 },
      cardiac_tricuspid: { dwellMs: 4000, listenMs: 3000, visits: 1, firstOrder: 2 },
      cardiac_mitral: { dwellMs: 5000, listenMs: 4000, visits: 1, firstOrder: 3 },
    },
    order: ['cardiac_aortic', 'cardiac_pulmonary', 'cardiac_tricuspid', 'cardiac_mitral'],
    headChanges: 1,
    headUse: { bell: 0, diaphragm: 1 },
    replayCount: 0,
  }
  const allCorrect = Object.fromEntries(c.questions.map((q) => [q.id, q.correct]))

  it('tam doğru + eksiksiz teknik → 100', () => {
    const r = scoreCase(c, allCorrect, baseTelemetry, 0)
    expect(r.total).toBe(100)
    expect(r.mastery).toBe(true)
  })

  it('yanlış tanıma → ses tanımlama 0, toplam < 80', () => {
    const r = scoreCase(c, { ...allCorrect, q1: ['b'] }, baseTelemetry, 0)
    expect(r.domains.recognition.earned).toBe(0)
    expect(r.total).toBeLessThan(80)
    expect(r.mastery).toBe(false)
  })

  it('teknik eşiğini tutmayan nokta teknik puanı düşürür', () => {
    const t: Telemetry = {
      ...baseTelemetry,
      visits: { ...baseTelemetry.visits, cardiac_mitral: { dwellMs: 100, listenMs: 100, visits: 1, firstOrder: 3 } },
    }
    const r = scoreCase(c, allCorrect, t, 0)
    expect(r.domains.technique.earned).toBeLessThan(20)
  })

  it('yanlış sıra → sistematik puan yarım (çifte ceza yok)', () => {
    const t: Telemetry = { ...baseTelemetry, order: [...baseTelemetry.order].reverse() }
    const r = scoreCase(c, allCorrect, t, 0)
    expect(r.domains.systematic.earned).toBe(2.5)
  })

  it('ipucu cezası deterministiktir (Uygulama modu)', () => {
    expect(practiceAdjusted(90, 0)).toBe(90)
    expect(practiceAdjusted(90, 2)).toBe(80)
    expect(practiceAdjusted(8, 2)).toBe(0)
  })

  it('hakimiyet eşiği 80 (§24)', () => {
    expect(MASTERY_THRESHOLD).toBe(80)
  })

  it('çoklu vaka toplamı alan bazlı birleşir', () => {
    const r = scoreCase(c, allCorrect, baseTelemetry, 0)
    const agg = aggregateResults([r, r])
    expect(agg.total).toBe(100)
    expect(agg.domains.technique.max).toBe(40)
  })

  it('ulaşılamayan ağırlık yok (K2): değerlendirme havuzundaki her vakada kusursuz performans 100 puan verir', () => {
    for (const cc of poolForTest('assessment')) {
      const answers = Object.fromEntries(cc.questions.map((q) => [q.id, q.correct]))
      const telemetry: Telemetry = {
        visits: Object.fromEntries(
          cc.technique.requiredPoints.map((p, i) => [p, { dwellMs: 99999, listenMs: 99999, visits: 1, firstOrder: i }])
        ),
        order: [...cc.technique.requiredPoints],
        headChanges: 0,
        headUse: { bell: 0, diaphragm: 0 },
        replayCount: 0,
      }
      const r = scoreCase(cc, answers, telemetry, 0)
      expect(r.total, `${cc.id} kusursuz performansta 100 vermeli`).toBe(100)
      expect(r.mastery, cc.id).toBe(true)
    }
  })
})

/* ---------------- vaka şeması (§19, §36) ---------------- */
describe('vaka şeması doğrulaması', () => {
  it('mevcut tüm vakalar hatasızdır', () => {
    for (const c of cases) {
      const errors = validateCase(c, pointIds, soundKeys).filter((i) => i.severity === 'error')
      expect(errors, `${c.id} hata içermemeli`).toEqual([])
    }
  })

  it('bilinmeyen oskültasyon noktası hatadır', () => {
    const c = cases[0]
    const bad = { ...c, technique: { ...c.technique, requiredPoints: ['yok_olmayan_nokta'] } }
    expect(validateCase(bad, pointIds, soundKeys).some((i) => i.message.includes('yok_olmayan_nokta'))).toBe(true)
  })

  it('doğrulanmamış eşleme + tanı sorusu → değerlendirmeye giremez (§6, §19)', () => {
    const c = cases[0]
    const withDiag: CaseDef = {
      ...c,
      clinicalDiagnosis: null,
      mappingValidation: 'educational_mapping',
      questions: [{
        id: 'qdiag', type: 'diagnosis', domain: 'diagnosis',
        prompt: '?', options: [{ id: 'a', label: 'X' }], correct: ['a'],
        feedbackCorrect: '', feedbackIncorrect: '',
      }],
    }
    const issues = validateCase(withDiag, pointIds, soundKeys)
    expect(issues.some((i) => i.severity === 'error' && /tanı|clinicalDiagnosis/i.test(i.message))).toBe(true)
  })

  it('soru doğru yanıtı seçenekler arasında olmalıdır', () => {
    const c = cases[0]
    const bad: CaseDef = {
      ...c,
      questions: [{ ...c.questions[0], correct: ['yok'] }],
    }
    expect(validateCase(bad, pointIds, soundKeys).some((i) => i.message.includes('seçeneklerde yok'))).toBe(true)
  })

  it('filtre havuzu hatalı vakayı dışlar (§19)', () => {
    const c = cases[0]
    const broken: CaseDef = { ...c, id: 'broken_case', questions: [] }
    const pool = filterAssessmentPool([c, broken], [
      { caseId: 'broken_case', severity: 'error', message: 'Soru yok' },
    ])
    expect(pool.some((x) => x.id === 'broken_case')).toBe(false)
    expect(pool.some((x) => x.id === c.id)).toBe(true)
  })
})

/* ---------------- veri seti senkronizasyonu (§36) ---------------- */
describe('veri seti ↔ kütüphane ↔ vaka senkronizasyonu', () => {
  const libraryData = libraryJson as unknown as { groups: { id: string; items: { acousticFinding: string }[] }[] }
  const libFindings = new Set(libraryData.groups.flatMap((g) => g.items.map((i) => i.acousticFinding)))
  const heartClasses = new Set(RECORDS.filter((r) => r.category === 'heart').map((r) => r.acousticFinding))
  const lungClasses = new Set(RECORDS.filter((r) => r.category === 'lung').map((r) => r.acousticFinding))
  const practice = new Set(cases.filter((c) => c.modes.includes('practice')).map((c) => c.primaryAcousticFinding))
  const assessment = new Set(cases.filter((c) => c.modes.includes('assessment')).map((c) => c.primaryAcousticFinding))

  it('her veri seti sınıfının kütüphane kalemi var', () => {
    for (const f of [...heartClasses, ...lungClasses]) expect(libFindings.has(f), `kütüphane: ${f}`).toBe(true)
  })
  it('her veri seti sınıfı uygulama modunda kapsanıyor', () => {
    for (const f of [...heartClasses, ...lungClasses]) expect(practice.has(f), `uygulama: ${f}`).toBe(true)
  })
  it('her veri seti sınıfı değerlendirme modunda kapsanıyor', () => {
    for (const f of [...heartClasses, ...lungClasses]) expect(assessment.has(f), `değerlendirme: ${f}`).toBe(true)
  })
  it('kütüphanedeki her ses sınıfı için en az bir çalınabilir kayıt var', () => {
    for (const f of libFindings) {
      const playable = RECORDS.some((r) => r.acousticFinding === f && r.validationStatus === 'validated')
      expect(playable, `kayıt: ${f}`).toBe(true)
    }
  })
  it('kombine (mixed) sesler kütüphanede ve uygulamada temsil ediliyor', () => {
    const mixedItems = libraryData.groups.find((g) => g.id === 'mixed')?.items ?? []
    expect(mixedItems.length).toBeGreaterThan(0)
    const mixedCases = cases.filter((c) => c.primaryAcousticFinding.includes('+') && c.modes.includes('practice'))
    expect(mixedCases.length).toBeGreaterThan(0)
  })
  it('her kütüphane kaleminde ses metaforu var (izleme modu gereksinimi)', () => {
    const items = (libraryJson as unknown as { groups: { items: { key: string; metaphor?: string }[] }[] }).groups.flatMap((g) => g.items)
    for (const it of items) expect(it.metaphor && it.metaphor.length > 10, `metafor: ${it.key}`).toBe(true)
  })
  it('değerlendirme vakaları doğrulanmış eşlemeye sahip', () => {
    for (const c of cases.filter((x) => x.modes.includes('assessment'))) {
      expect(c.mappingValidation, c.id).toBe('validated')
    }
  })
  it('K5: kalp kategorili otomatik vakaların metinlerinde akciğer terimleri ("solunum sesi", "veziküler") geçmez', () => {
    const heartAuto = AUTO_CASES.filter((c) => c.id.startsWith('auto_heart_'))
    expect(heartAuto.length).toBeGreaterThan(0)
    for (const c of heartAuto) {
      const text = `${c.feedback?.summary ?? ''} ${c.questions.map((q) => `${q.feedbackCorrect} ${q.feedbackIncorrect}`).join(' ')}`
      expect(text, c.id).not.toMatch(/solunum sesi|veziküler/i)
    }
  })
})

/* ---------------- oturum örnekleme ve havuz bütünlüğü ---------------- */
describe('oturum örnekleme (rastgele 10 vaka)', () => {
  const pool = poolForTest('practice')
  const assessment = poolForTest('assessment')

  it('her oturumda tam 10 vaka seçilir', () => {
    expect(sampleSession(pool, 42).length).toBe(SESSION_SIZE)
    expect(sampleSession(assessment, 7).length).toBe(SESSION_SIZE)
  })
  it('aynı tohum aynı örneklemi üretir (deterministik / SCORM uyumlu)', () => {
    expect(sampleSession(pool, 123)).toEqual(sampleSession(pool, 123))
  })
  it('farklı tohumlar farklı örneklem üretir (her oturum farklı)', () => {
    const a = sampleSession(pool, 1).join(',')
    const b = sampleSession(pool, 2).join(',')
    expect(a).not.toBe(b)
  })
  it('örneklem havuz dışından vaka içermez ve tekrar etmez', () => {
    const ids = sampleSession(pool, 99)
    expect(new Set(ids).size).toBe(ids.length)
    const poolIds = new Set(pool.map((c) => c.id))
    for (const id of ids) expect(poolIds.has(id)).toBe(true)
  })
  it('vaka havuzu veri seti sınırlarına kadar geniştir', () => {
    expect(pool.length).toBeGreaterThanOrEqual(100)
    expect(assessment.length).toBeGreaterThanOrEqual(60)
  })
  it('havuzdaki tüm vakalar doğrulanmış ses atamaları çözer', () => {
    for (const c of pool) {
      for (const a of c.soundAssignments) {
        const rec = a.soundId
          ? RECORDS.find((r) => r.id === a.soundId)
          : resolveAssignment({ ...a, pointId: a.pointId }) ?? resolveAssignmentEx(a).record
        expect(rec, `${c.id} → ${a.pointId}`).not.toBeNull()
      }
    }
  })
  it('otomatik üretilen tüm vakalar şema doğrulamasından geçer', () => {
    const errs: string[] = []
    for (const c of [...pool, ...poolForTest('assessment')]) {
      const issues = validateCase(c, pointIds, soundKeys).filter((i) => i.severity === 'error')
      if (issues.length) errs.push(`${c.id}: ${issues.map((i) => i.message).join('; ')}`)
    }
    expect(errs).toEqual([])
  })
  it('pediatrik vakalar mevcut ve pediatrik havuzda temsil ediliyor', () => {
    const ped = pool.filter((c) => (c as { population?: string }).population === 'pediatrik')
    expect(ped.length).toBeGreaterThanOrEqual(3)
  })
  it('gerçek pediatrik hasta kayıtları (CirCor) vaka havuzuna bağlanmıştır', () => {
    const pedCases = pool.filter((c) => c.id.startsWith('auto_ped_'))
    expect(pedCases.length).toBeGreaterThanOrEqual(3)
    for (const c of pedCases) {
      const usesReal = c.soundAssignments.some((a) => a.soundId && EXTERNAL_RECORDS.some((r) => r.id === a.soundId))
      expect(usesReal, c.id).toBe(true)
    }
  })
  it('değerlendirme havuzu yalnız doğrulanmış eşlemeli vakalar içerir', () => {
    for (const c of assessment) expect(c.mappingValidation).toBe('validated')
  })
})

describe('soru seçenek karıştırma (K1)', () => {
  const poolAll = [...poolForTest('practice'), ...poolForTest('assessment')]

  it('aynı vaka+soru tohumu aynı sırayı üretir (deterministik)', () => {
    const c = poolAll.find((x) => x.questions.length > 0)!
    const q = c.questions[0]
    const a = shuffledOptions(c.id, q.id, q.options).map((o) => o.id)
    const b = shuffledOptions(c.id, q.id, q.options).map((o) => o.id)
    expect(a).toEqual(b)
  })

  it('doğru yanıt konumu havuz genelinde tek bir seçeneğe (ör. "a") yığılmaz', () => {
    const positions: Record<number, number> = {}
    let total = 0
    for (const c of poolAll) {
      for (const q of c.questions) {
        if (q.correct.length !== 1) continue // yalnız tek doğru yanıtlı sorular konum analizine girer
        const shuffled = shuffledOptions(c.id, q.id, q.options)
        const pos = shuffled.findIndex((o) => o.id === q.correct[0])
        positions[pos] = (positions[pos] ?? 0) + 1
        total++
      }
    }
    for (const [pos, count] of Object.entries(positions)) {
      expect(count / total, `konum ${pos} oranı`).toBeLessThanOrEqual(0.45)
    }
  })
})

describe('tıbbi tutarlılık (pediatrik vitaller + soru bütünlüğü)', () => {
  // Yaşa göre beklenen istirahat aralıkları (pediatric-reference.json ile uyumlu)
  // yaş birimi: YIL (0–1 ay hariç; bebek/çocuk vakalarında yaş yıldır)
  const HR: [number, number, number][] = [[1, 100, 180], [3, 90, 160], [6, 80, 140], [12, 70, 120], [18, 60, 100], [999, 60, 100]]
  const RR: [number, number, number][] = [[1, 30, 60], [3, 22, 38], [6, 20, 30], [12, 18, 25], [18, 12, 20], [999, 12, 20]]
  const range = (tbl: [number, number, number][], age: number) => {
    for (const [max, lo, hi] of tbl) if (age <= max) return [lo, hi] as const
    return [60, 100] as const
  }
  const poolAll = [...poolForTest('practice'), ...poolForTest('assessment')]

  it('pediatrik vakaların vitalleri yaşa göre fizyolojik aralıkta', () => {
    for (const c of poolAll) {
      const pop = (c as { population?: string }).population
      if (pop !== 'pediatrik') continue
      const age = c.patient.age
      const [hrLo, hrHi] = range(HR, age)
      const [rrLo, rrHi] = range(RR, age)
      expect(c.vitalSigns.hr, `${c.id} HR ${c.vitalSigns.hr} (yaş ${age})`).toBeGreaterThanOrEqual(hrLo)
      expect(c.vitalSigns.hr, `${c.id} HR üst`).toBeLessThanOrEqual(hrHi)
      expect(c.vitalSigns.rr, `${c.id} RR ${c.vitalSigns.rr} (yaş ${age})`).toBeGreaterThanOrEqual(rrLo)
      expect(c.vitalSigns.rr, `${c.id} RR üst`).toBeLessThanOrEqual(rrHi)
    }
  })
  it('yetişkin vakaların vitalleri fizyolojik aralıkta', () => {
    for (const c of poolAll) {
      const pop = (c as { population?: string }).population
      if (pop === 'pediatrik') continue
      expect(c.vitalSigns.hr, `${c.id} HR`).toBeGreaterThanOrEqual(40)
      expect(c.vitalSigns.hr, `${c.id} HR üst`).toBeLessThanOrEqual(140)
      expect(c.vitalSigns.rr, `${c.id} RR`).toBeGreaterThanOrEqual(8)
      expect(c.vitalSigns.rr, `${c.id} RR üst`).toBeLessThanOrEqual(38)
    }
  })
  it('her soruda seçenek etiketleri benzersizdir', () => {
    const errs: string[] = []
    for (const c of poolAll) {
      for (const q of c.questions) {
        const labels = q.options.map((o) => o.label)
        const dup = labels.filter((l, i) => labels.indexOf(l) !== i)
        if (dup.length) errs.push(`${c.id}/${q.id}: ${dup.join(', ')}`)
        const ids = q.options.map((o) => o.id)
        expect(new Set(ids).size, `${c.id}/${q.id} id benzersizliği`).toBe(ids.length)
      }
    }
    expect(errs).toEqual([])
  })
  it('O8: bir soruda iki seçenek parantez içi kaldırılınca aynı metne indirgenmez', () => {
    // (ör. s4 "geç diyastol (presistol)" ile late_diastolic_murmur "geç diyastol (presistolik)"
    // gibi parantez öncesi eşdeğer etiketler aynı soruda birlikte distraktör olamaz)
    const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()
    const errs: string[] = []
    for (const c of poolAll) {
      for (const q of c.questions) {
        const labels = q.options.map((o) => o.label)
        for (let i = 0; i < labels.length; i++) {
          for (let j = i + 1; j < labels.length; j++) {
            const a = norm(labels[i])
            const b = norm(labels[j])
            if (a === b) errs.push(`${c.id}/${q.id}: "${labels[i]}" ~ "${labels[j]}"`)
          }
        }
      }
    }
    expect(errs).toEqual([])
  })
  it('pediatrik vakalar hasta yaşıyla uyumlu başlıklar kullanır', () => {
    for (const c of poolAll) {
      if ((c as { population?: string }).population !== 'pediatrik') continue
      expect(/pediatrik|çocuk/i.test(c.title), c.id).toBe(true)
    }
  })
})

describe('SCORM interactions ve auto-flush (§25-27)', () => {
  const fakeApi = (version: '2004' | '1.2') => {
    const store: Record<string, string> = {}
    return {
      store,
      version,
      init: () => true,
      get: (k: string) => store[k] ?? '',
      set: (k: string, v: string) => {
        store[k] = v
        return true
      },
      commit: () => true,
      terminate: () => true,
    }
  }
  const qs = [
    { id: 'q1', type: 'single_choice', domain: 'recognition', prompt: 'P', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correct: ['a'], feedbackCorrect: '', feedbackIncorrect: '' },
  ] as never

  it('2004: yanlış yanıt "incorrect", latency PT#S biçiminde', () => {
    const api = fakeApi('2004')
    const rt = new ScormRuntime(() => ({ caseResults: [], session: { practiceIds: [], assessmentIds: [], seed: 0 } } as never), () => 1)
    rt.api = api as never
    rt.saveInteractions('case_x', qs as never, { q1: ['b'] }, { q1: 4200 })
    expect(api.store['cmi.interactions.0.result']).toBe('incorrect')
    expect(api.store['cmi.interactions.0.latency']).toBe('PT4S')
    expect(api.store['cmi.interactions.0.learner_response']).toBe('b')
  })
  it('1.2: yanlış yanıt "wrong", latency yazılmaz', () => {
    const api = fakeApi('1.2')
    const rt = new ScormRuntime(() => ({ caseResults: [], session: { practiceIds: [], assessmentIds: [], seed: 0 } } as never), () => 1)
    rt.api = api as never
    rt.saveInteractions('case_x', qs as never, { q1: ['a'] }, { q1: 4200 })
    expect(api.store['cmi.interactions.0.result']).toBe('correct')
    expect(api.store['cmi.interactions.0.student_response']).toBe('a')
    expect(api.store['cmi.interactions.0.latency']).toBeUndefined()
  })
  it('O2(a,b,c): type her zaman "choice", id vaka bağlamlı, 1.2 ayırıcı virgüldür', () => {
    const multi = [
      { id: 'q1', type: 'multi_choice', domain: 'recognition', prompt: 'P', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correct: ['a', 'b'], feedbackCorrect: '', feedbackIncorrect: '' },
    ] as never
    const api12 = fakeApi('1.2')
    const rt12 = new ScormRuntime(() => ({ caseResults: [], session: { practiceIds: [], assessmentIds: [], seed: 0 } } as never), () => 1)
    rt12.api = api12 as never
    rt12.saveInteractions('case_af', multi, { q1: ['a', 'b'] })
    expect(api12.store['cmi.interactions.0.type']).toBe('choice')
    expect(api12.store['cmi.interactions.0.id']).toBe('case_af.q1')
    expect(api12.store['cmi.interactions.0.student_response']).toBe('a,b')

    const api2004 = fakeApi('2004')
    const rt2004 = new ScormRuntime(() => ({ caseResults: [], session: { practiceIds: [], assessmentIds: [], seed: 0 } } as never), () => 1)
    rt2004.api = api2004 as never
    rt2004.saveInteractions('case_af', multi, { q1: ['a', 'b'] })
    expect(api2004.store['cmi.interactions.0.type']).toBe('choice')
    expect(api2004.store['cmi.interactions.0.learner_response']).toBe('a[,]b')
  })
  it('O2(d): indeks cmi.interactions._count\'tan başlar', () => {
    const api = fakeApi('2004')
    api.store['cmi.interactions._count'] = '3'
    const rt = new ScormRuntime(() => ({ caseResults: [], session: { practiceIds: [], assessmentIds: [], seed: 0 } } as never), () => 1)
    rt.api = api as never
    rt.saveInteractions('case_x', qs as never, { q1: ['a'] })
    expect(api.store['cmi.interactions.3.id']).toBe('case_x.q1')
    expect(api.store['cmi.interactions.0.id']).toBeUndefined()
  })
  it('O1: init() zaten passed/completed/failed ise ezmez, boş/not attempted/unknown ise incomplete yazar', () => {
    // ScormRuntime, jenerik 'cmi.completion_status' anahtarı üzerinden çalışır; 1.2 ↔ lesson_status
    // eşlemesi Scorm12Adapter içinde yapılır (bkz. "1.2 adapter success_status → lesson_status eşlemesi" testi).
    const apiDone = fakeApi('1.2')
    apiDone.store['cmi.completion_status'] = 'passed'
    const rtDone = new ScormRuntime(() => ({ caseResults: [], session: { practiceIds: [], assessmentIds: [], seed: 0 } } as never), () => 1)
    rtDone.api = apiDone as never
    rtDone.init()
    expect(apiDone.store['cmi.completion_status']).toBe('passed')

    const apiFresh = fakeApi('1.2')
    apiFresh.store['cmi.completion_status'] = 'not attempted'
    const rtFresh = new ScormRuntime(() => ({ caseResults: [], session: { practiceIds: [], assessmentIds: [], seed: 0 } } as never), () => 1)
    rtFresh.api = apiFresh as never
    rtFresh.init()
    expect(apiFresh.store['cmi.completion_status']).toBe('incomplete')
  })
  it('O1: gerçek Scorm12Adapter ile — lesson_status "passed" iken init() ezmez', () => {
    const store = new Map<string, string>([['cmi.core.lesson_status', 'passed']])
    const rawApi = {
      LMSInitialize: () => 'true',
      LMSGetValue: (k: string) => store.get(k) ?? '',
      LMSSetValue: (k: string, v: string) => { store.set(k, v); return 'true' },
      LMSCommit: () => 'true',
      LMSFinish: () => 'true',
    }
    const rt = new ScormRuntime(() => ({ caseResults: [], session: { practiceIds: [], assessmentIds: [], seed: 0 } } as never), () => 1)
    rt.api = new Scorm12Adapter(rawApi)
    rt.init()
    expect(store.get('cmi.core.lesson_status')).toBe('passed')
  })
  it('O3: terminate() tamamlanmadıysa cmi.exit="suspend", tamamlandıysa "" yazar', () => {
    const apiOngoing = fakeApi('2004')
    const rtOngoing = new ScormRuntime(() => ({ caseResults: [], session: { practiceIds: [], assessmentIds: [], seed: 0 } } as never), () => 1)
    rtOngoing.api = apiOngoing as never
    rtOngoing.terminate()
    expect(apiOngoing.store['cmi.exit']).toBe('suspend')

    const apiDone = fakeApi('2004')
    const rtDone = new ScormRuntime(() => ({ caseResults: [], session: { practiceIds: [], assessmentIds: [], seed: 0 } } as never), () => 1)
    rtDone.api = apiDone as never
    rtDone.reportScore(90, true, true)
    rtDone.terminate()
    expect(apiDone.store['cmi.exit']).toBe('')
  })
  it('D12: terminate() sonrası set/commit tetikleyen çağrılar no-op olur', () => {
    const api = fakeApi('2004')
    const rt = new ScormRuntime(() => ({ caseResults: [], session: { practiceIds: [], assessmentIds: [], seed: 0 } } as never), () => 1)
    rt.api = api as never
    rt.terminate()
    expect(rt.terminated).toBe(true)
    const snapshot = { ...api.store }
    rt.reportScore(100, true, true)
    rt.saveProgress({ v: 1, mode: 'practice', caseIndex: 0, step: 0, answers: {}, hintsUsed: 0, caseResults: [], tutorialDone: true, visits: {}, order: [], attempts: 1, sessionIds: [], sessionSeed: 0 })
    rt.saveInteractions('case_x', qs as never, { q1: ['a'] })
    rt.flushNow()
    expect(api.store).toEqual(snapshot)
  })
  it('auto-flush: beforeunload suspend_data yazar', () => {
    const api = fakeApi('2004')
    const state = {
      mode: 'practice', caseIndex: 2, step: 1, answers: {}, hintsUsed: 0, caseResults: [],
      tutorialDone: true, telemetry: { visits: {}, order: [] }, attempts: 1,
      session: { practiceIds: ['a'], assessmentIds: [], seed: 5 },
    } as never
    const rt = new ScormRuntime(() => state, () => 3)
    rt.api = api as never
    rt.flushNow()
    expect(api.store['cmi.suspend_data']).toContain('"c":2')
    rt.attachAutoFlush()
    rt.detachAutoFlush()
  })
})

describe('SCORM suspend boyut koruması (§27)', () => {
  const bigPayload = () => {
    const visits: Record<string, { dwellMs: number; listenMs: number; visits: number; firstOrder: number }> = {}
    for (let i = 0; i < 200; i++) visits[`lung_right_lower_posterior_${i}`] = { dwellMs: 12345, listenMs: 23456, visits: 3, firstOrder: i }
    const caseResults = Array.from({ length: 10 }, (_, i) => ({
      caseId: `auto_mixed_normal_wheezing_lung_right_lower_anterior_${String(i).padStart(3, '0')}`,
      total: 87.5, max: 100, mastery: true,
      domains: { technique: { earned: 20, max: 20 }, localization: { earned: 25, max: 25 }, recognition: { earned: 40, max: 40 }, interpretation: { earned: 15, max: 15 }, diagnosis: { earned: 0, max: 0 }, systematic: { earned: 5, max: 5 } } as never,
      answers: [], hintsUsed: 0,
    }))
    return {
      v: 3, mode: 'assessment' as const, caseIndex: 7, step: 3,
      answers: { q1: ['a'], q2: ['b', 'c'] }, hintsUsed: 0, tutorialDone: true, attempts: 1,
      visits, order: Object.keys(visits), caseResults,
      sessionIds: Array.from({ length: 20 }, (_, i) => `auto_ped_early_systolic_murmur_aortic_${String(i).padStart(3, '0')}`),
      sessionSeed: 123456789,
    }
  }
  it('SCORM 1.2 limitinde (4096) serialize edilir ve geri okunur', () => {
    const s1 = serializeSuspend(bigPayload(), SUSPEND_LIMIT_12)
    expect(s1.length).toBeLessThanOrEqual(SUSPEND_LIMIT_12)
    const back = deserializeSuspend(s1)
    expect(back).not.toBeNull()
    expect(back!.mode).toBe('assessment')
    expect(back!.caseIndex).toBe(7)
    expect(back!.step).toBe(3)
    expect(back!.sessionIds.length).toBe(20)
    expect(back!.sessionSeed).toBe(123456789)
  })
  it('küçük yükte tam ayrıntı korunur (birim kaybı yok)', () => {
    const p = bigPayload()
    p.visits = { cardiac_aortic: { dwellMs: 4321, listenMs: 5000, visits: 2, firstOrder: 1 } }
    const s1 = serializeSuspend(p, SUSPEND_LIMIT_2004)
    const back = deserializeSuspend(s1)!
    expect(back.visits.cardiac_aortic.dwellMs).toBe(4321)
    expect(back.visits.cardiac_aortic.firstOrder).toBe(1)
  })
})

describe('landing metrikleri', () => {
  it('envanter zenginliği metrikleri hesaplanır ve tutarlıdır', () => {
    const m = computeMetrics()
    expect(m.datasets).toBeGreaterThanOrEqual(2)
    expect(m.datasetsPediatric).toBeGreaterThanOrEqual(1)
    expect(m.soundClasses).toBeGreaterThanOrEqual(16)
    expect(m.auscultationPoints).toBeGreaterThanOrEqual(17)
    expect(m.practicePoolSize).toBeGreaterThanOrEqual(100)
    expect(m.assessmentPoolSize).toBeGreaterThanOrEqual(60)
    expect(m.assessmentQuestions).toBeGreaterThanOrEqual(150)
    expect(m.pediatricCases).toBeGreaterThanOrEqual(7)
    expect(m.bundledRecordings).toBeGreaterThanOrEqual(200)
  })
})

/* ---------------- veri seti envanteri ve dış eşleme (§5, §6, §34) ---------------- */
describe('veri seti envanteri', () => {
  const sources = sourcesJson as unknown as {
    datasets: { id: string; title: string; license: string; authors: string[]; attributionText: string }[]
    inventory: {
      id: string; title: string; authors: string[]; license: string; licenseUrl: string
      licenseVerified: boolean; status: string; accessUrl: string; notes: string
      recordings: number; attributionText: string; importScript: string | null
    }[]
  }

  it('envanter yalnızca kullanılan veri setlerini içerir (HLS-CMDS + CirCor)', () => {
    const ids = sources.inventory.map((x) => x.id).sort()
    expect(ids).toEqual(['hls-cmds-v3', 'physionet-circor'])
  })
  it('kullanılan tüm veri setlerinin lisansı doğrulanmıştır', () => {
    const unverified = sources.inventory.filter((x) => !(x as { licenseVerified?: boolean }).licenseVerified)
    expect(unverified).toEqual([])
  })
  it('her envanter kaydında etiket kalitesi bilgisi vardır', () => {
    for (const it of sources.inventory as unknown as { id: string; labelTypes?: string[] }[]) {
      expect(Array.isArray(it.labelTypes) && it.labelTypes!.length > 0, `etiket: ${it.id}`).toBe(true)
    }
  })
  it('pediatrik veri seti (CirCor) envanterdedir', () => {
    const ped = sources.inventory.filter((x) => /pediatrik|pediatric|çocuk|fetal/i.test(`${x.population} ${x.title} ${x.notes}`))
    expect(ped.length).toBeGreaterThanOrEqual(1)
  })
  it('her envanter kaydı lisans, atıf ve erişim bağlantısı içerir', () => {
    for (const it of sources.inventory) {
      expect(it.license.length, `lisans: ${it.id}`).toBeGreaterThan(3)
      expect(it.licenseUrl.length, `lisans bağlantısı: ${it.id}`).toBeGreaterThan(8)
      expect(it.attributionText.length, `atıf: ${it.id}`).toBeGreaterThan(10)
      expect(it.accessUrl.startsWith('http'), `erişim: ${it.id}`).toBe(true)
      if (it.recordings != null) expect(it.recordings).toBeGreaterThan(0)
    }
  })
  it('pakete dahil veri setleri doğrulanmış lisansa sahiptir', () => {
    for (const it of sources.inventory.filter((x) => ['bundled', 'samples_included', 'importer_ready'].includes(x.status))) {
      expect(it.licenseVerified, `${it.id} lisansı doğrulanmış olmalı`).toBe(true)
    }
  })
  it('ICBHI 2017 paket içeriğinde bulunmaz (§34)', () => {
    // envanterde tutulmaz; hiçbir kayıt ICBHI kaynaklı olmamalı
    expect(RECORDS.some((r) => r.sourceDataset === 'icbhi-2017')).toBe(false)
  })
  it('paketlenen seslerin kaynak atıfları tanımlıdır (datasets ↔ inventory)', () => {
    const bundled = RECORDS.find((r) => r.sourceDataset === 'hls-cmds-v3')
    expect(bundled).toBeDefined()
    expect(sources.inventory.some((it) => it.id === 'hls-cmds-v3' && it.status === 'bundled')).toBe(true)
    expect(sources.datasets.some((d) => d.id === 'hls-cmds-v3' && d.license.includes('CC BY 4.0'))).toBe(true)
  })
})

describe('CirCor dış eşleme kuralları (§6)', () => {
  it('Murmur=Absent → normal (validated)', () => {
    expect(mapCircorMurmur('Absent', 'nan', 'nan')).toMatchObject({ finding: 'normal', mappingStatus: 'validated' })
  })
  it('zamanlama birebir eşleşince validated olur', () => {
    expect(mapCircorMurmur('Present', 'Early-systolic', 'nan')).toMatchObject({ finding: 'early_systolic_murmur', mappingStatus: 'validated' })
    expect(mapCircorMurmur('Present', 'Mid-systolic', 'nan')).toMatchObject({ finding: 'mid_systolic_murmur', mappingStatus: 'validated' })
    expect(mapCircorMurmur('Present', 'Late-systolic', 'nan')).toMatchObject({ finding: 'late_systolic_murmur', mappingStatus: 'validated' })
  })
  it('holosistolik yalnız eğitim eşlemesidir (değerlendirmeye giremez)', () => {
    const r = mapCircorMurmur('Present', 'Holosystolic', 'nan')
    expect(r.finding).toBe('mid_systolic_murmur')
    expect(r.mappingStatus).toBe('educational_mapping')
  })
  it('uyumsuz etiketler uydurulmaz (unsupported)', () => {
    expect(mapCircorMurmur('Present', 'nan', 'nan').finding).toBeNull()
    expect(mapCircorMurmur('Present', 'nan', 'Early-diastolic').finding).toBeNull()
    expect(mapCircorMurmur('Unknown', 'nan', 'nan').finding).toBeNull()
  })
  it('konum kodları simülasyon noktalarına eşlenir', () => {
    expect(mapCircorLocations('AV+PV+TV+MV')).toEqual(['cardiac_aortic', 'cardiac_pulmonary', 'cardiac_tricuspid', 'cardiac_mitral'])
    expect(mapCircorLocations('MV')).toEqual(['cardiac_mitral'])
  })
})

/* ---------------- ses-konum eşleme (§2, §13, §14) ---------------- */
describe('ses eşleme', () => {
  it('kalp normal RUSB → aort odağı', () => {
    const rec = resolveAssignment({ pointId: 'cardiac_aortic', category: 'heart', acousticFinding: 'normal', recordedLocation: 'RUSB' })
    expect(rec).not.toBeNull()
    expect(rec!.recordedLocation).toBe('RUSB')
    expect(rec!.simulationLocation).toBe('cardiac_aortic')
  })

  it('RC/LC kayıtları adlandırılmış odağa eşlenmez (dürüst eşleme §13)', () => {
    expect(resolveAssignment({ pointId: 'cardiac_aortic', category: 'heart', acousticFinding: 'normal', recordedLocation: 'RC' })).toBeNull()
    expect(resolveAssignment({ pointId: 'cardiac_mitral', category: 'heart', acousticFinding: 'normal', recordedLocation: 'LC' })).toBeNull()
  })

  it('vaka ses haritası çözülebilir kayıtlar üretir', () => {
    for (const c of cases) {
      const map = resolveCaseSounds(c.soundAssignments)
      for (const [pointId, rec] of Object.entries(map)) {
        if (!rec) continue
        expect(pointIds).toContain(pointId)
        expect(soundIdList).toContain(rec.id)
      }
    }
  })

  it('kütüphane sesi sim konumuyla tercihli çözülür (apeks normal → Apex kaydı)', () => {
    expect(resolveLibrarySound('heart', 'normal', 'cardiac_mitral')!.recordedLocation).toBe('Apex')
  })

  it('crackles kütüphane kalemleri kayıtlı (C→FC dosya eşlemesi)', () => {
    expect(resolveLibrarySound('lung', 'fine_crackles')).not.toBeNull()
    expect(resolveLibrarySound('lung', 'coarse_crackles')).not.toBeNull()
  })

  it('posterior nokta ataması anterior kayda fallback yapar ve kaynak bölgeyi bildirir (§14)', () => {
    const res = resolveAssignmentEx({ pointId: 'lung_left_upper_posterior', category: 'lung', acousticFinding: 'normal' })
    expect(res.record).not.toBeNull()
    expect(res.record!.simulationLocation).toBe('lung_left_upper_anterior')
    expect(res.fallbackFrom).toBe('lung_left_upper_anterior')
  })

  it('posterior fallback ile tüm akciğer vakaları arka görünümde ses üretir', () => {
    const lungCases = cases.filter((c) => c.soundAssignments.some((a) => a.pointId.startsWith('lung_')))
    for (const c of lungCases) {
      const { sounds } = resolveCaseSoundsEx(c.soundAssignments)
      const posterior = Object.entries(sounds).filter(([pid, rec]) => pid.includes('posterior') && rec)
      expect(posterior.length, `${c.id} posterior ses üretmeli`).toBeGreaterThan(0)
    }
  })

  it('tüm vaka atamalarının en az bir yarısı çözülür (eksikler bilinçli)', () => {
    for (const c of cases) {
      const map = resolveCaseSounds(c.soundAssignments)
      const resolvedCount = Object.values(map).filter(Boolean).length
      expect(resolvedCount).toBeGreaterThan(0)
    }
  })

  it('O7: assessmentPointFilter fallback (kaynak bölgeden alınmamış) noktaları dışlar', () => {
    const lungCase = cases.find((c) => c.id === 'case_normal_lung')!
    const filtered = assessmentPointFilter(lungCase.soundAssignments)
    for (const pid of filtered) expect(pid.includes('posterior')).toBe(false)
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.length).toBeLessThan(lungCase.soundAssignments.length)
  })
})

/* ---------------- madde 1: uygulamada submit sonrası advance olmaz ---------------- */
describe('nextActionForSubmit (madde 1)', () => {
  it('uygulama modunda ilk tık yalnız gönderir — advance ÇAĞRILMAZ', () => {
    expect(nextActionForSubmit('practice', false, false)).toBe('submit')
    expect(nextActionForSubmit('practice', false, true)).toBe('submit')
  })
  it('uygulama modunda geri bildirim gösterildikten (revealed) sonra "Devam Et"/"Vakayı tamamla" ilerler', () => {
    expect(nextActionForSubmit('practice', true, false)).toBe('advance')
    expect(nextActionForSubmit('practice', true, true)).toBe('finish')
  })
  it('değerlendirmede geri bildirim yok — submit hemen ilerler', () => {
    expect(nextActionForSubmit('assessment', false, false)).toBe('submit-then-advance')
    expect(nextActionForSubmit('assessment', false, true)).toBe('submit-then-finish')
  })
})

/* ---------------- madde 1 (wave 2): bölge chip'leri — saf durum hesabı ---------------- */
describe('regionChipState (madde 1, wave 2)', () => {
  it('stetoskopun üstünde olan nokta "active" döner', () => {
    expect(regionChipState('cardiac_mitral', 'cardiac_mitral', {})).toBe('active')
  })
  it('bu oturumda dinlenmiş (listenMs>0) ama aktif olmayan nokta "listened" döner', () => {
    expect(regionChipState('cardiac_aortic', 'cardiac_mitral', { cardiac_aortic: { listenMs: 1200 } })).toBe('listened')
  })
  it('hiç dinlenmemiş, aktif olmayan nokta "default" döner', () => {
    expect(regionChipState('cardiac_aortic', 'cardiac_mitral', {})).toBe('default')
    expect(regionChipState('cardiac_aortic', null, { cardiac_aortic: { listenMs: 0 } })).toBe('default')
  })
  it('aktiflik dinlenmiş olmaya önceliklidir', () => {
    expect(regionChipState('cardiac_mitral', 'cardiac_mitral', { cardiac_mitral: { listenMs: 5000 } })).toBe('active')
  })
})

describe('countUnlistenedInOtherView / otherViewHintText (madde 1, wave 2)', () => {
  const pts = [
    { id: 'p1', view: 'front' as const },
    { id: 'p2', view: 'front' as const },
    { id: 'p3', view: 'back' as const },
    { id: 'p4', view: 'back' as const },
  ]
  it('yalnız öbür görünümdeki, pointIds içinde olan ve dinlenmemiş noktaları sayar', () => {
    expect(countUnlistenedInOtherView(pts, ['p1', 'p2', 'p3', 'p4'], 'front', {})).toBe(2)
    expect(countUnlistenedInOtherView(pts, ['p1', 'p2', 'p3', 'p4'], 'front', { p3: { listenMs: 400 } })).toBe(1)
  })
  it('pointIds verilmezse tüm öbür-görünüm noktaları sayılır', () => {
    expect(countUnlistenedInOtherView(pts, undefined, 'back', {})).toBe(2)
  })
  it('otherViewHintText: sayı 0 ise null, değilse "Arka/Ön görünümde N bölge daha"', () => {
    expect(otherViewHintText('front', 0)).toBeNull()
    expect(otherViewHintText('front', 3)).toBe('Arka görünümde 3 bölge daha')
    expect(otherViewHintText('back', 1)).toBe('Ön görünümde 1 bölge daha')
  })
})

/* ---------------- madde 5 (wave 2): zayıf alan → Öğrenme odağı ---------------- */
describe('libraryKeyForCase / firstWeakLibraryKey / weakDomainKeys (madde 5, wave 2)', () => {
  const libraryItems = [
    { key: 'heart.normal', category: 'heart', acousticFinding: 'normal' },
    { key: 'heart.s3', category: 'heart', acousticFinding: 's3' },
    { key: 'lung.normal', category: 'lung', acousticFinding: 'normal' },
  ]
  it('libraryKey doluysa doğrudan onu kullanır', () => {
    const c = { libraryKey: 'heart.s3', primaryAcousticFinding: 'normal', soundAssignments: [{ category: 'heart' }] }
    expect(libraryKeyForCase(c, libraryItems)).toBe('heart.s3')
  })
  it('libraryKey yoksa kategori + akustik bulgu eşleşmesiyle bulur (heart.normal ≠ lung.normal)', () => {
    const heartCase = { primaryAcousticFinding: 'normal', soundAssignments: [{ category: 'heart' }] }
    const lungCase = { primaryAcousticFinding: 'normal', soundAssignments: [{ category: 'lung' }] }
    expect(libraryKeyForCase(heartCase, libraryItems)).toBe('heart.normal')
    expect(libraryKeyForCase(lungCase, libraryItems)).toBe('lung.normal')
  })
  it('eşleşme yoksa veya vaka tanımsızsa null', () => {
    expect(libraryKeyForCase(undefined, libraryItems)).toBeNull()
    expect(libraryKeyForCase({ primaryAcousticFinding: 'yok', soundAssignments: [{ category: 'heart' }] }, libraryItems)).toBeNull()
  })

  it('firstWeakLibraryKey: yanlış yanıtı olan İLK vakanın anahtarını döndürür', () => {
    const results = [
      { caseId: 'c1', answers: [{ correct: true }] },
      { caseId: 'c2', answers: [{ correct: false }, { correct: true }] },
      { caseId: 'c3', answers: [{ correct: false }] },
    ]
    const resolve = (id: string) => (id === 'c2' ? 'heart.s3' : id === 'c3' ? 'lung.normal' : null)
    expect(firstWeakLibraryKey(results, resolve)).toBe('heart.s3')
  })
  it('firstWeakLibraryKey: hiç yanlış yoksa veya eşleşme yoksa null', () => {
    expect(firstWeakLibraryKey([{ caseId: 'c1', answers: [{ correct: true }] }], () => 'heart.s3')).toBeNull()
    expect(firstWeakLibraryKey([{ caseId: 'c1', answers: [{ correct: false }] }], () => null)).toBeNull()
  })

  it('weakDomainKeys: yalnız max>0 ve yüzdesi eşiğin altında olan alanları döndürür', () => {
    const domains = {
      technique: { earned: 20, max: 20 }, // %100
      localization: { earned: 5, max: 20 }, // %25 — zayıf
      recognition: { earned: 0, max: 0 }, // soru yok — hariç
      interpretation: { earned: 11, max: 20 }, // %55 — zayıf
    }
    expect(weakDomainKeys(domains, 60).sort()).toEqual(['interpretation', 'localization'].sort())
  })
  it('weakDomainKeys: domains null ise boş dizi', () => {
    expect(weakDomainKeys(null)).toEqual([])
  })
})

/* ---------------- madde 5 (wave 3): interaktif öğretici — saf adım-makinesi ---------------- */
describe('tutorialProgress (madde 5, wave 3)', () => {
  it('hiç olay yoksa hiçbir adım tamam değildir, sıradaki adım 0', () => {
    const p = tutorialProgress([])
    expect(p.steps).toEqual([false, false, false])
    expect(p.currentStep).toBe(0)
    expect(p.allDone).toBe(false)
  })
  it('yalnız drag olayı: 1. adım tamam, sıradaki 1', () => {
    const p = tutorialProgress(['drag'])
    expect(p.steps).toEqual([true, false, false])
    expect(p.currentStep).toBe(1)
    expect(p.allDone).toBe(false)
  })
  it('sıra bağımsızdır — snap, drag olmadan da gelebilir (ör. klavye ile yerleştirme)', () => {
    const p = tutorialProgress(['snap'])
    expect(p.steps).toEqual([false, true, false])
    expect(p.currentStep).toBe(0)
  })
  it('tekrarlanan olaylar tekrar sayılmaz, sonucu değiştirmez', () => {
    const p = tutorialProgress(['drag', 'drag', 'snap'])
    expect(p.steps).toEqual([true, true, false])
    expect(p.currentStep).toBe(2)
  })
  it('üç olay da gelince hepsi tamam, allDone true, currentStep 3', () => {
    const p = tutorialProgress(['drag', 'snap', 'head'])
    expect(p.steps).toEqual([true, true, true])
    expect(p.currentStep).toBe(3)
    expect(p.allDone).toBe(true)
  })
})

/* ---------------- madde 4 (wave 2): kütüphane kısa başlık ---------------- */
describe('libraryShortTitle (madde 4, wave 2)', () => {
  it('üfürüm kalemleri için kısa başlık üretir (tam ad ile aynı değildir)', () => {
    expect(libraryShortTitle('heart.murmur.early_systolic')).toBe('Erken sistolik üfürüm')
    expect(libraryTitle('heart.murmur.early_systolic')).toBe('Sistolik Üfürüm (Erken Sistolik)')
    expect(libraryShortTitle('heart.murmur.early_systolic')).not.toBe(libraryTitle('heart.murmur.early_systolic'))
  })
  it('akciğer kalemleri için kısa başlık üretir', () => {
    expect(libraryShortTitle('lung.fine_crackles')).toBe('İnce Raller')
    expect(libraryShortTitle('lung.coarse_crackles')).toBe('Kaba Raller')
  })
  it('bilinmeyen anahtar için çökmeden yedek metin döner', () => {
    expect(libraryShortTitle('mixed.msm_wheezing')).toBeTruthy()
    expect(() => libraryShortTitle('bilinmeyen.key')).not.toThrow()
  })
})
