import { describe, expect, it } from 'vitest'
import type { CaseDef, ImageRecord, Question, SuspendPayload, Telemetry } from '../src/core/types'
import { DEFAULT_WEIGHTS, EXPERT_SOURCES } from '../src/core/types'
import { decodeMark, encodeMark, inBox, markHitsFinding, markToScorm, ratio, zonesAt } from '../src/core/geometry'
import { isAnswerCorrect } from '../src/core/answers'
import { aggregateResults, practiceAdjusted, scoreCase } from '../src/core/scoring'
import { validateCase } from '../src/core/validation'
import { deserializeSuspend, serializeSuspend, SUSPEND_LIMIT_12 } from '../src/core/suspend'
import {
  firstWeakLibraryKey, isTimedOut, nextActionForSubmit, remainingSec, stepProgress, tutorialProgress, weakDomainKeys, zoneChipState,
} from '../src/core/flow'
import { sampleSession, shuffledOptions } from '../src/core/session'
import { buildSuspend, computeCaseResult, initialState, initialTelemetry, reducer, ScormRuntime, type AppState } from '../src/core/store'
import { MockAdapter, Scorm12Adapter, type ScormApi } from '../src/core/scorm'
import { ZONES, ZONE_IDS } from '../src/data/zones'
import { FINDINGS, LIBRARY_ITEMS } from '../src/data/terminology'
import { ALL_CASES, poolFor } from '../src/data/pool'
import { getImage, IMAGES } from '../src/core/images'

/* ---------------- test verisi ---------------- */
const img = (over: Partial<ImageRecord> = {}): ImageRecord => ({
  id: 'img_t',
  sourceDataset: 'nih-cxr14',
  sourceFile: 't.png',
  viewPosition: 'PA',
  ageYears: 50,
  sex: 'F',
  population: 'yetiskin',
  width: 1000,
  height: 1000,
  originalWidth: 1000,
  originalHeight: 1000,
  findings: { pneumothorax: 'expert_bbox' },
  negatives: { fracture: 'expert_panel' },
  annotations: [{ finding: 'pneumothorax', source: 'expert_bbox', x: 0.6, y: 0.1, w: 0.2, h: 0.3 }],
  quality: null,
  runtimeUrl: 'assets/xray/runtime/img_t.webp',
  bytes: 1,
  validationStatus: 'validated',
  clinicalReview: 'beklemede',
  issues: [],
  ...over,
})

const qChoice: Question = {
  id: 'q1', type: 'finding_identify', domain: 'recognition', prompt: 'p',
  options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correct: ['a'], feedbackCorrect: '', feedbackIncorrect: '',
}
const qMark: Question = {
  id: 'q2', type: 'localization', domain: 'localization', prompt: 'p', options: [], correct: [], targetFinding: 'pneumothorax',
  feedbackCorrect: '', feedbackIncorrect: '',
}
const qQuality: Question = {
  id: 'q3', type: 'film_quality', domain: 'quality', prompt: 'p',
  options: [{ id: 'a', label: 'PA' }, { id: 'b', label: 'AP' }], correct: ['a'], feedbackCorrect: '', feedbackIncorrect: '',
}

const REQUIRED = ['a_trachea', 'b_r_upper', 'c_heart', 'd_r_diaphragm', 'e_bones']
const mkCase = (over: Partial<CaseDef> = {}): CaseDef => ({
  id: 'case_t',
  title: 'T',
  modes: ['practice', 'assessment'],
  population: 'yetiskin',
  patient: { age: 50, sex: 'kadın' },
  chiefComplaint: '',
  history: '',
  vitalSigns: {},
  objectives: [],
  imageId: 'img_t',
  primaryFinding: 'pneumothorax',
  clinicalDiagnosis: null,
  mappingValidation: 'validated',
  technique: { requiredZones: REQUIRED, minDwellMs: 500, systematicOrder: true },
  questions: [qChoice, qMark, qQuality],
  feedback: { summary: '' },
  references: [],
  scoringWeights: { ...DEFAULT_WEIGHTS, diagnosis: 0, interpretation: 0, recognition: 50 },
  ...over,
})

const tele = (order: string[], dwell = 1000): Telemetry => ({
  visits: Object.fromEntries(order.map((id, i) => [id, { dwellMs: dwell, visits: 1, firstOrder: i }])),
  order,
  toolUse: { zoom: 0, window: 0, invert: 0, overlay: 0, measure: 0 },
})

const findingIds = new Set(Object.keys(FINDINGS))
const images = new Map([['img_t', img()]])
const getTestImage = (id: string) => images.get(id)

/* ---------------- geometri ---------------- */
describe('geometri', () => {
  it('işaret kodlaması gidiş-dönüş', () => {
    const v = encodeMark({ x: 0.12345, y: 0.9 })
    expect(v).toBe('pt:0.1235,0.9000')
    expect(decodeMark(v)).toEqual({ x: 0.1235, y: 0.9 })
    expect(decodeMark('pt:1.2,0.5')).toBeNull()
    expect(decodeMark('a')).toBeNull()
    expect(decodeMark(undefined)).toBeNull()
    expect(markToScorm(v)).toBe('x12y90')
  })
  it('kutu içi ve tolerans', () => {
    const b = { x: 0.2, y: 0.2, w: 0.1, h: 0.1 }
    expect(inBox({ x: 0.25, y: 0.25 }, b)).toBe(true)
    expect(inBox({ x: 0.315, y: 0.25 }, b)).toBe(false)
    expect(inBox({ x: 0.315, y: 0.25 }, b, 0.02)).toBe(true)
  })
  it('işaret yalnız uzman kutusunda isabet sayılır', () => {
    const i = img()
    expect(markHitsFinding({ x: 0.7, y: 0.2 }, i, 'pneumothorax')).toBe(true)
    expect(markHitsFinding({ x: 0.2, y: 0.2 }, i, 'pneumothorax')).toBe(false)
    expect(markHitsFinding({ x: 0.7, y: 0.2 }, i, 'nodule_mass')).toBe(false)
    const nlp = img({ annotations: [{ finding: 'pneumothorax', source: 'report_nlp', x: 0, y: 0, w: 1, h: 1 }] })
    expect(markHitsFinding({ x: 0.5, y: 0.5 }, nlp, 'pneumothorax')).toBe(false)
    expect(markHitsFinding({ x: 0.5, y: 0.5 }, undefined, 'pneumothorax')).toBe(false)
  })
  it('bölge bulma ve oran', () => {
    expect(zonesAt({ x: 0.5, y: 0.05 }, ZONES)).toContain('a_trachea')
    expect(zonesAt({ x: 0.02, y: 0.4 }, ZONES)).toEqual(['e_bones'])
    expect(ratio(55, 100)).toBe(0.55)
    expect(ratio(1, 0)).toBeNull()
  })
})

/* ---------------- yanıtlar ve skor ---------------- */
describe('yanıt doğruluğu', () => {
  it('seçmeli ve lokalizasyon', () => {
    expect(isAnswerCorrect(qChoice, ['a'], undefined)).toBe(true)
    expect(isAnswerCorrect(qChoice, ['a', 'b'], undefined)).toBe(false)
    expect(isAnswerCorrect(qChoice, [], undefined)).toBe(false)
    expect(isAnswerCorrect(qMark, [encodeMark({ x: 0.7, y: 0.3 })], img())).toBe(true)
    expect(isAnswerCorrect(qMark, [encodeMark({ x: 0.1, y: 0.3 })], img())).toBe(false)
    expect(isAnswerCorrect({ ...qMark, targetFinding: undefined }, [encodeMark({ x: 0.7, y: 0.3 })], img())).toBe(false)
  })
})

describe('skor', () => {
  const c = mkCase()
  const allRight = { q1: ['a'], q2: [encodeMark({ x: 0.7, y: 0.2 })], q3: ['a'] }
  it('tam puan: doğru yanıt + ABCDE sırasıyla tüm bölgeler', () => {
    const r = scoreCase(c, allRight, tele(REQUIRED), 0, img(), ZONES)
    expect(r.total).toBe(100)
    expect(r.mastery).toBe(true)
    expect(r.domains.systematic.earned).toBe(5)
  })
  it('sıra bozuksa sistematik puanın yarısı', () => {
    const r = scoreCase(c, allRight, tele(['c_heart', ...REQUIRED.filter((z) => z !== 'c_heart')]), 0, img(), ZONES)
    expect(r.domains.systematic.earned).toBe(2.5)
    expect(r.domains.technique.earned).toBe(10)
  })
  it('yetersiz inceleme süresi teknik puanı düşürür, sistematik puan verilmez', () => {
    const t = tele(REQUIRED, 100)
    t.visits.a_trachea.dwellMs = 900
    const r = scoreCase(c, allRight, t, 0, img(), ZONES)
    expect(r.domains.technique.earned).toBeCloseTo(2)
    expect(r.domains.systematic.earned).toBe(0)
  })
  it('lokalizasyon ıskası yalnız kendi alanını etkiler (çifte ceza yok)', () => {
    const r = scoreCase(c, { ...allRight, q2: [encodeMark({ x: 0.1, y: 0.9 })] }, tele(REQUIRED), 0, img(), ZONES)
    expect(r.domains.localization.earned).toBe(0)
    expect(r.domains.recognition.earned).toBe(50)
    expect(r.total).toBe(75)
  })
  it('sorusu olmayan alan ulaşılamaz puan üretmez (K2)', () => {
    const r = scoreCase(mkCase({ questions: [qChoice], scoringWeights: undefined }), { q1: ['a'] }, tele(REQUIRED), 0, img(), ZONES)
    expect(r.domains.localization.max).toBe(0)
    expect(r.domains.interpretation.max).toBe(0)
    expect(r.total).toBe(100)
  })
  it('bölge şartı olmayan vakada teknik alanı devre dışı', () => {
    const r = scoreCase(mkCase({ technique: { requiredZones: [], minDwellMs: 0 } }), allRight, initialTelemetry(), 0, img(), ZONES)
    expect(r.domains.technique.max).toBe(0)
    expect(r.domains.systematic.max).toBe(0)
    expect(r.total).toBe(100)
  })
  it('ipucu cezası yalnız uygulamada', () => {
    expect(practiceAdjusted(80, 2)).toBe(70)
    expect(practiceAdjusted(3, 2)).toBe(0)
  })
  it('toplam: alan ağırlıklarıyla birleşir', () => {
    const a = scoreCase(c, allRight, tele(REQUIRED), 0, img(), ZONES)
    const b = scoreCase(c, {}, initialTelemetry(), 0, img(), ZONES)
    const agg = aggregateResults([a, b])
    expect(agg.total).toBe(50)
    expect(agg.mastery).toBe(false)
    expect(aggregateResults([]).total).toBe(0)
  })
})

/* ---------------- doğrulama ---------------- */
describe('vaka doğrulama', () => {
  const errors = (c: CaseDef, get = getTestImage) => validateCase(c, ZONE_IDS, get, findingIds).filter((i) => i.severity === 'error')
  it('geçerli vaka hata üretmez', () => {
    expect(errors(mkCase())).toEqual([])
  })
  it('NLP etiketli ana bulgu değerlendirmeye giremez', () => {
    const nlpImg = img({ findings: { pneumothorax: 'report_nlp' }, annotations: [] })
    const e = errors(mkCase({ questions: [qChoice, qQuality] }), () => nlpImg)
    expect(e.some((x) => x.message.includes('uzman kaynaklı değil'))).toBe(true)
  })
  it('uzman kutusu olmadan lokalizasyon sorusu reddedilir', () => {
    const noBox = img({ findings: { pneumothorax: 'expert_panel' }, annotations: [] })
    expect(errors(mkCase(), () => noBox).some((x) => x.message.includes('uzman kutusu yok'))).toBe(true)
  })
  it('pediatrik film değerlendirmeye giremez', () => {
    const ped = img({ population: 'pediatrik' })
    expect(errors(mkCase(), () => ped).some((x) => x.message.includes('yetişkin'))).toBe(true)
  })
  it('doğrulanmamış tanı sorusu reddedilir', () => {
    const qd: Question = { ...qChoice, id: 'qd', type: 'diagnosis', domain: 'diagnosis' }
    const e = errors(mkCase({ modes: ['practice'], mappingValidation: 'educational_mapping', questions: [qd] }))
    expect(e.map((x) => x.message)).toEqual(
      expect.arrayContaining(['Tanı sorusu var ama clinicalDiagnosis tanımlı değil', 'Doğrulanmamış tanı eşlemesi tanı sorusu üretemez'])
    )
  })
  it('bilinmeyen bölge, görüntü ve bulgu', () => {
    const e = errors(mkCase({ imageId: 'yok', primaryFinding: 'uydurma', technique: { requiredZones: ['z'], minDwellMs: 1 } }))
    expect(e.length).toBeGreaterThanOrEqual(3)
  })
  it('doğru yanıt seçeneklerde olmalı', () => {
    const e = errors(mkCase({ questions: [{ ...qChoice, correct: ['x'] }] }))
    expect(e.some((x) => x.message.includes('seçeneklerde yok'))).toBe(true)
  })
})

/* ---------------- gerçek veri bütünlüğü ---------------- */
describe('paketlenen veri', () => {
  it('tüm vakalar hatasız', () => {
    const issues = ALL_CASES.flatMap((c) => validateCase(c, ZONE_IDS, getImage, findingIds)).filter((i) => i.severity === 'error')
    expect(issues).toEqual([])
  })
  it('değerlendirme havuzu yalnız uzman kaynaklı yetişkin filmlerinden oluşur', () => {
    for (const c of poolFor('assessment')) {
      const i = getImage(c.imageId)!
      expect((EXPERT_SOURCES as readonly string[]).includes(i.findings[c.primaryFinding])).toBe(true)
      expect(i.population).toBe('yetiskin')
    }
  })
  it('öğretilen her bulgunun kütüphane kalemi ve geçerli bölgeleri var', () => {
    for (const [f, def] of Object.entries(FINDINGS)) if (def.teaching) expect(LIBRARY_ITEMS.some((it) => it.finding === f)).toBe(true)
    for (const it of LIBRARY_ITEMS) for (const z of it.bestZones) expect(ZONE_IDS).toContain(z)
  })
  it('kütüphane yorum şablonları tutarlı', () => {
    for (const it of LIBRARY_ITEMS) {
      if (!it.interpretation) continue
      const ids = it.interpretation.options.map((o) => o.id)
      expect(it.interpretation.correct.every((c) => ids.includes(c))).toBe(true)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
  it('bölge dikdörtgenleri 0–1 aralığında ve her ABCDE adımı temsil ediliyor', () => {
    for (const z of ZONES) for (const r of z.rects) expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1).toBe(true)
    expect(new Set(ZONES.map((z) => z.step))).toEqual(new Set(['A', 'B', 'C', 'D', 'E']))
  })
  it('görüntü kayıtlarında NLP kaynaklı kutu yok', () => {
    for (const r of IMAGES) for (const a of r.annotations) expect(a.source).not.toBe('report_nlp')
  })
})

/* ---------------- suspend ---------------- */
describe('suspend', () => {
  const base: SuspendPayload = {
    v: 1, mode: 'assessment', caseIndex: 3, step: 1, answers: { q2: ['pt:0.1000,0.2000'] }, hintsUsed: 0,
    caseResults: [scoreCase(mkCase(), { q1: ['a'] }, tele(REQUIRED), 0, img(), ZONES)],
    tutorialDone: true, visits: tele(REQUIRED, 1234).visits, order: REQUIRED, attempts: 2,
    sessionIds: ['a', 'b'], sessionSeed: 42,
  }
  it('gidiş-dönüş', () => {
    const back = deserializeSuspend(serializeSuspend(base))!
    expect(back.mode).toBe('assessment')
    expect(back.answers).toEqual(base.answers)
    expect(back.visits.b_r_upper.dwellMs).toBe(1234)
    expect(back.caseResults[0].domains.recognition.max).toBe(50)
    expect(back.sessionIds).toEqual(['a', 'b'])
  })
  it('1.2 limitinde kademeli küçülür, ilerleme korunur', () => {
    const big = { ...base, caseResults: Array.from({ length: 60 }, (_, i) => ({ ...base.caseResults[0], caseId: `auto_rsna_${i}_xxxxxxxxxxxxxxxx` })) }
    const s = serializeSuspend(big, SUSPEND_LIMIT_12)
    expect(s.length).toBeLessThanOrEqual(SUSPEND_LIMIT_12)
    const back = deserializeSuspend(s)!
    expect(back.caseIndex).toBe(3)
    expect(back.sessionSeed).toBe(42)
  })
  it('bozuk veri null döner', () => {
    expect(deserializeSuspend('{')).toBeNull()
    expect(deserializeSuspend('')).toBeNull()
    expect(deserializeSuspend('null')).toBeNull()
  })
})

/* ---------------- reducer ---------------- */
describe('reducer', () => {
  const s0: AppState = { ...initialState }
  it('startMode eski sonuçları ve sayaçları sıfırlar (K4)', () => {
    const dirty: AppState = { ...s0, caseResults: [{} as never], assessmentTimer: 5000, caseElapsed: 4000, caseIndex: 4 }
    const s = reducer(dirty, { type: 'startMode', mode: 'assessment' })
    expect(s.caseResults).toEqual([])
    expect(s.assessmentTimer).toBe(0)
    expect(s.caseElapsed).toBe(0)
    expect(s.caseIndex).toBe(0)
    expect(s.attempts).toBe(1)
  })
  it('bölge girişi sırayı bir kez kaydeder, süre birikir', () => {
    let s = reducer(s0, { type: 'zoneEnter', zoneIds: ['a_trachea'] })
    s = reducer(s, { type: 'zoneEnter', zoneIds: ['a_trachea', 'c_heart'] })
    s = reducer(s, { type: 'zoneDwell', zoneIds: ['a_trachea'], dwellMs: 250 })
    s = reducer(s, { type: 'zoneDwell', zoneIds: ['a_trachea', 'e_bones'], dwellMs: 250 })
    expect(s.telemetry.order).toEqual(['a_trachea', 'c_heart', 'e_bones'])
    expect(s.telemetry.visits.a_trachea).toEqual({ dwellMs: 500, visits: 2, firstOrder: 0 })
    expect(s.telemetry.visits.e_bones.firstOrder).toBe(2)
    expect(reducer(s, { type: 'zoneDwell', zoneIds: [], dwellMs: 250 })).toBe(s)
  })
  it('araç kullanımı sayılır', () => {
    const s = reducer(reducer(s0, { type: 'toolUsed', tool: 'zoom' }), { type: 'toolUsed', tool: 'zoom' })
    expect(s.telemetry.toolUse.zoom).toBe(2)
  })
  it('restore yalnız aktif modun listesine yazar (K3)', () => {
    const start: AppState = { ...s0, session: { practiceIds: ['p1'], assessmentIds: ['a1'], seed: 1 } }
    const payload = buildSuspend({ ...start, mode: 'assessment', session: { practiceIds: ['x'], assessmentIds: ['a9', 'a8'], seed: 7 } })
    const s = reducer(start, { type: 'restore', payload })
    expect(s.session).toEqual({ practiceIds: ['p1'], assessmentIds: ['a9', 'a8'], seed: 7 })
    expect(s.screen).toBe('simulation')
    expect(s.tutorialSeen).toBe(true)
  })
  it('finishCase bekleyen özet varken tekrar sonuç eklemez; nextCase sıfırlar', () => {
    const def = ALL_CASES[0]
    if (!def) return
    let s = reducer({ ...s0, mode: 'practice' }, { type: 'caseMount', caseDef: def })
    s = reducer(s, { type: 'timer', deltaMs: 3000 })
    s = reducer(s, { type: 'finishCase' })
    s = reducer(s, { type: 'finishCase' })
    expect(s.caseResults).toHaveLength(1)
    expect(s.pendingSummary).not.toBeNull()
    s = reducer(s, { type: 'nextCase' })
    expect(s.pendingSummary).toBeNull()
    expect(s.caseIndex).toBe(1)
    expect(s.caseElapsed).toBe(0)
    expect(s.telemetry.order).toEqual([])
  })
  it('advance son soruda ilerlemez', () => {
    const def = ALL_CASES[0]
    if (!def) return
    let s = reducer(s0, { type: 'caseMount', caseDef: def })
    for (let i = 0; i < def.questions.length + 2; i++) s = reducer(s, { type: 'advance' })
    expect(s.step).toBe(def.questions.length - 1)
  })
  it('uygulamada ipucu cezası vaka sonucuna yansır', () => {
    const def = ALL_CASES[0]
    if (!def) return
    const correct = Object.fromEntries(def.questions.map((q) => [q.id, q.correct]))
    const full = computeCaseResult(def, { answers: correct, telemetry: initialTelemetry(), hintsUsed: 0, mode: 'practice' })
    const hinted = computeCaseResult(def, { answers: correct, telemetry: initialTelemetry(), hintsUsed: 1, mode: 'practice' })
    const assess = computeCaseResult(def, { answers: correct, telemetry: initialTelemetry(), hintsUsed: 1, mode: 'assessment' })
    expect(hinted.total).toBe(Math.max(0, full.total - 5))
    expect(assess.total).toBe(full.total)
  })
})

/* ---------------- SCORM ---------------- */
/** Gerçek Scorm12Adapter'ı sahte bir LMS 1.2 API'si üzerinde çalıştırır (anahtar eşlemesi dahil). */
class Mock12 {
  store = new Map<string, string>()
  writesAfterTerminate = 0
  done = false
  adapter: ScormApi
  constructor() {
    const lms = {
      LMSInitialize: () => 'true',
      LMSGetValue: (k: string) => this.store.get(k) ?? '',
      LMSSetValue: (k: string, v: string) => {
        if (this.done) this.writesAfterTerminate++
        this.store.set(k, v)
        return 'true'
      },
      LMSCommit: () => 'true',
      LMSFinish: () => {
        this.done = true
        return 'true'
      },
    }
    this.adapter = new Scorm12Adapter(lms)
  }
  get(k: string) {
    return this.store.get(k) ?? ''
  }
}

describe('SCORM çalışma zamanı', () => {
  const state = () => initialState
  it('etkileşimler: seçmeli choice, işaret fill-in', () => {
    const api = new Mock12()
    const rt = new ScormRuntime(state, () => 1, api.adapter)
    rt.saveInteractions('case_t', [qChoice, qMark, qQuality], { q1: ['b'], q2: [encodeMark({ x: 0.7, y: 0.2 })] }, img())
    expect(api.get('cmi.interactions.0.type')).toBe('choice')
    expect(api.get('cmi.interactions.0.result')).toBe('wrong')
    expect(api.get('cmi.interactions.1.id')).toBe('case_t.q2')
    expect(api.get('cmi.interactions.1.type')).toBe('fill-in')
    expect(api.get('cmi.interactions.1.student_response')).toBe('x70y20')
    expect(api.get('cmi.interactions.1.result')).toBe('correct')
    expect(api.get('cmi.interactions.2.id')).toBe('')
  })
  it('etkileşim dizini _count değerinden devam eder', () => {
    const api = new Mock12()
    api.store.set('cmi.interactions._count', '4')
    new ScormRuntime(state, () => 1, api.adapter).saveInteractions('c', [qChoice], { q1: ['a'] }, undefined)
    expect(api.get('cmi.interactions.4.result')).toBe('correct')
  })
  it('tamamlanmış durum ezilmez (O1), bitmemiş oturum suspend ile çıkar (O3)', () => {
    const api = new Mock12()
    api.store.set('cmi.core.lesson_status', 'passed')
    const rt = new ScormRuntime(state, () => 1, api.adapter)
    rt.init()
    expect(api.get('cmi.core.lesson_status')).toBe('passed')
    rt.terminate()
    expect(api.get('cmi.core.exit')).toBe('suspend')
    rt.saveProgress(buildSuspend(initialState))
    rt.reportScore(90, true, true)
    expect(api.writesAfterTerminate).toBe(0)
  })
  it('puan raporu 1.2 durumunu yazar', () => {
    const api = new Mock12()
    const rt = new ScormRuntime(state, () => 1, api.adapter)
    rt.reportScore(72, false, true)
    expect(api.get('cmi.core.score.raw')).toBe('72')
    expect(api.get('cmi.core.lesson_status')).toBe('failed')
    rt.terminate()
    expect(api.get('cmi.core.exit')).toBe('')
  })
  it('suspend 1.2 limitine sığar', () => {
    const api = new Mock12()
    const rt = new ScormRuntime(state, () => 1, api.adapter)
    rt.saveProgress(buildSuspend({ ...initialState, mode: 'practice' }))
    expect(api.get('cmi.suspend_data').length).toBeLessThanOrEqual(SUSPEND_LIMIT_12)
    expect(api.get('cmi.core.lesson_location')).toBe('case:0:step:0')
  })
  it('mock bağdaştırıcı', () => {
    const m = new MockAdapter()
    m.set('a', '1')
    expect(m.get('a')).toBe('1')
  })
})

/* ---------------- akış ---------------- */
describe('akış', () => {
  it('yanıt eylemi', () => {
    expect(nextActionForSubmit('practice', false, false)).toBe('submit')
    expect(nextActionForSubmit('practice', true, false)).toBe('advance')
    expect(nextActionForSubmit('practice', true, true)).toBe('finish')
    expect(nextActionForSubmit('assessment', false, false)).toBe('submit-then-advance')
    expect(nextActionForSubmit('assessment', false, true)).toBe('submit-then-finish')
  })
  it('bölge çipi ve adım ilerlemesi', () => {
    const visits = { a: { dwellMs: 900 }, b: { dwellMs: 100 } }
    expect(zoneChipState('b', ['b'], visits, 500)).toBe('active')
    expect(zoneChipState('a', [], visits, 500)).toBe('inspected')
    expect(zoneChipState('b', [], visits, 500)).toBe('default')
    const p = stepProgress([{ id: 'a', step: 'A' }, { id: 'b', step: 'A' }, { id: 'c', step: 'B' }], visits, 500)
    expect(p).toEqual({ A: { done: 1, total: 2 }, B: { done: 0, total: 1 } })
  })
  it('öğretici ilerlemesi', () => {
    expect(tutorialProgress([]).currentStep).toBe(0)
    expect(tutorialProgress(['window']).currentStep).toBe(0)
    expect(tutorialProgress(['zoom', 'window']).currentStep).toBe(2)
    expect(tutorialProgress(['mark', 'zoom', 'window']).allDone).toBe(true)
  })
  it('süre sınırı', () => {
    expect(isTimedOut(179_000, 180)).toBe(false)
    expect(isTimedOut(180_000, 180)).toBe(true)
    expect(isTimedOut(999_000, undefined)).toBe(false)
    expect(remainingSec(1500, 180)).toBe(179)
    expect(remainingSec(999_000, 180)).toBe(0)
    expect(remainingSec(0, undefined)).toBeNull()
  })
  it('zayıf alanlar ve öğrenme odağı', () => {
    expect(weakDomainKeys({ a: { earned: 5, max: 10 }, b: { earned: 9, max: 10 }, c: { earned: 0, max: 0 } })).toEqual(['a'])
    expect(weakDomainKeys(null)).toEqual([])
    const res = [{ caseId: 'x', answers: [{ correct: true }] }, { caseId: 'y', answers: [{ correct: false }] }]
    expect(firstWeakLibraryKey(res, (id) => (id === 'y' ? 'finding.pneumothorax' : null))).toBe('finding.pneumothorax')
    expect(firstWeakLibraryKey(res, () => null)).toBeNull()
  })
})

/* ---------------- oturum ---------------- */
describe('oturum örnekleme', () => {
  const pool = Array.from({ length: 30 }, (_, i) => mkCase({ id: `c${i}`, primaryFinding: ['pneumothorax', 'normal', 'cardiomegaly'][i % 3] }))
  it('deterministik ve katmanlı', () => {
    const a = sampleSession(pool, 7, 10)
    expect(a).toEqual(sampleSession(pool, 7, 10))
    expect(new Set(a).size).toBe(10)
    const findingsIn = new Set(a.map((id) => pool.find((c) => c.id === id)!.primaryFinding))
    expect(findingsIn.size).toBe(3)
  })
  it('küçük havuz tamamen döner, boş havuz boş', () => {
    expect(sampleSession(pool.slice(0, 4), 1, 10)).toHaveLength(4)
    expect(sampleSession([], 1, 10)).toEqual([])
  })
  it('seçenek karıştırma deterministik (K1)', () => {
    const opts = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id }))
    expect(shuffledOptions('x', 'q', opts)).toEqual(shuffledOptions('x', 'q', opts))
    expect(shuffledOptions('x', 'q', opts).map((o) => o.id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})
