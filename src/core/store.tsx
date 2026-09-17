import { createContext, useContext, useEffect, useReducer, useRef, type Dispatch, type ReactNode } from 'react'
import type {
  CaseDef, CaseResult, Mode, PointVisit, PatientView, Question, Screen, SoundRecord, StethHead, SuspendPayload, Telemetry,
} from './types'
import { bus } from './events'
import { makeScorm, type ScormApi } from './scorm'
import { deserializeSuspend, serializeSuspend, SUSPEND_LIMIT_12, SUSPEND_LIMIT_2004 } from './suspend'
import { scoreCase, aggregateResults, practiceAdjusted, MASTERY_THRESHOLD } from './scoring'
import { ALL_CASES } from '../data/pool'

/* ---------------- state ---------------- */
export interface AppState {
  screen: Screen
  /** aktif vaka — oturum havuzuyla tutarlı tek doğruluk kaynağı (§24) */
  currentCaseId: string
  /** hasta gövde cinsiyeti (vakadan gelir; öğrenme modunda değiştirilebilir) */
  bodySex: 'kadin' | 'erkek' | 'pediatrik'
  mode: Mode
  caseIndex: number
  step: number
  answers: Record<string, string[]>
  revealed: Record<string, boolean>
  hintsUsed: number
  attempts: number
  caseResults: CaseResult[]
  telemetry: Telemetry
  view: PatientView
  head: StethHead
  volume: number
  showPoints: boolean
  showLabels: boolean
  tutorialDone: boolean
  /** öğretici bu oturumda bir kez görüldü/atlandı — kalıcı değil (kalıcı: tutorialDone) */
  tutorialSeen: boolean
  tutorialStep: number
  assessmentTimer: number
  lastFeedback: { correct: boolean; qid: string } | null
  dragStarted: boolean
  /** oturum örneklemi (rastgele 10 vaka) — suspend ile korunur */
  session: { practiceIds: string[]; assessmentIds: string[]; seed: number }
  /** madde 1/5: vaka bitince finishCase ile hesaplanır, nextCase ile temizlenir.
   *  Uygulama modunda vaka sonu özet kartını tetikler; değerlendirmede aynı olayda
   *  hemen nextCase izlediği için kalıcı görünmez. */
  pendingSummary: CaseResult | null
  /** madde 5 (wave 2): Sonuçlar ekranındaki "Öğrenme modunda çalış" zayıf alana odaklı
   *  açılış için LearnScreen'e iletilen tek seferlik kütüphane anahtarı (tüketilince temizlenir). */
  learnFocusKey: string | null
}

export const initialTelemetry: Telemetry = {
  visits: {},
  order: [],
  headChanges: 0,
  headUse: { bell: 0, diaphragm: 0 },
  replayCount: 0,
}

export const initialState: AppState = {
  screen: 'start',
  currentCaseId: '',
  bodySex: 'erkek',
  mode: 'practice',
  caseIndex: 0,
  step: 0,
  answers: {},
  revealed: {},
  hintsUsed: 0,
  attempts: 0,
  caseResults: [],
  telemetry: initialTelemetry,
  view: 'front',
  head: 'diaphragm',
  volume: 0.85,
  showPoints: true,
  showLabels: true,
  tutorialDone: false,
  tutorialSeen: false,
  tutorialStep: 0,
  assessmentTimer: 0,
  lastFeedback: null,
  dragStarted: false,
  session: { practiceIds: [], assessmentIds: [], seed: 0 },
  pendingSummary: null,
  learnFocusKey: null,
}

export type Action =
  | { type: 'goto'; screen: Screen }
  | { type: 'startMode'; mode: Mode }
  | { type: 'caseMount'; caseDef: CaseDef }
  | { type: 'setBodySex'; sex: 'kadin' | 'erkek' | 'pediatrik' }
  | { type: 'startSession'; practiceIds: string[]; assessmentIds: string[]; seed: number }
  | { type: 'setView'; view: PatientView }
  | { type: 'setHead'; head: StethHead }
  | { type: 'setVolume'; volume: number }
  | { type: 'togglePoints'; show?: boolean }
  | { type: 'toggleLabels'; show?: boolean }
  | { type: 'visit'; pointId: string }
  | { type: 'listen'; pointId: string; listenMs: number }
  | { type: 'dwell'; pointId: string; dwellMs: number }
  | { type: 'replay' }
  | { type: 'answer'; qid: string; values: string[] }
  | { type: 'submitAnswer'; qid: string; correct: boolean }
  | { type: 'useHint' }
  | { type: 'timer'; deltaMs: number }
  | { type: 'advance' }
  | { type: 'finishCase' }
  | { type: 'nextCase' }
  | { type: 'tutorialDone'; done: boolean }
  | { type: 'tutorialSeen' }
  | { type: 'tutorialStep'; step: number }
  | { type: 'restore'; payload: SuspendPayload }
  | { type: 'startDrag' }
  | { type: 'resetCase' }
  | { type: 'setResults'; results: CaseResult[] }
  | { type: 'setLearnFocus'; key: string | null }

/** dışa açık: test amaçlı (K3, K4 reducer testleri) — üretim kodu StoreProvider üzerinden kullanır. */
export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'goto':
      return { ...s, screen: a.screen }
    case 'caseMount': {
      const def = a.caseDef
      if (def.id === s.currentCaseId) return s
      const pop = (def as CaseDef & { population?: string }).population
      const sex: 'kadin' | 'erkek' | 'pediatrik' = pop === 'pediatrik' ? 'pediatrik' : def.patient.sex === 'kadın' ? 'kadin' : 'erkek'
      return { ...s, currentCaseId: def.id, bodySex: sex }
    }
    case 'startMode':
      // K4: yeni oturum eski sonuçları taşımaz — vaka sonuçları ve zamanlayıcı sıfırlanır.
      return {
        ...s, mode: a.mode, screen: 'simulation', caseIndex: 0, step: 0, answers: {}, revealed: {}, hintsUsed: 0,
        telemetry: { ...initialTelemetry }, lastFeedback: null, pendingSummary: null,
        caseResults: [], assessmentTimer: 0, attempts: s.attempts + 1,
      }
    case 'setView':
      return { ...s, view: a.view }
    case 'setBodySex':
      return { ...s, bodySex: a.sex }
    case 'startSession':
      return { ...s, session: { practiceIds: a.practiceIds, assessmentIds: a.assessmentIds, seed: a.seed } }
    case 'setHead':
      if (s.head === a.head) return s
      bus.emit({ type: 'filter_changed', head: a.head, at: Date.now() })
      return {
        ...s, head: a.head,
        telemetry: { ...s.telemetry, headChanges: s.telemetry.headChanges + 1, headUse: { ...s.telemetry.headUse, [a.head]: s.telemetry.headUse[a.head] + 1 } },
      }
    case 'setVolume':
      return { ...s, volume: a.volume }
    case 'togglePoints':
      return { ...s, showPoints: a.show ?? !s.showPoints }
    case 'toggleLabels':
      return { ...s, showLabels: a.show ?? !s.showLabels }
    case 'visit': {
      const visits = { ...s.telemetry.visits }
      const prev = visits[a.pointId]
      visits[a.pointId] = {
        dwellMs: prev?.dwellMs ?? 0,
        listenMs: prev?.listenMs ?? 0,
        visits: (prev?.visits ?? 0) + 1,
        firstOrder: prev ? prev.firstOrder : s.telemetry.order.length,
      }
      const order = prev ? s.telemetry.order : [...s.telemetry.order, a.pointId]
      bus.emit({ type: 'point_visited', pointId: a.pointId, at: Date.now(), dwellMs: prev?.dwellMs ?? 0 })
      return { ...s, telemetry: { ...s.telemetry, visits, order } }
    }
    case 'dwell': {
      const visits = { ...s.telemetry.visits }
      const prev = visits[a.pointId] ?? { dwellMs: 0, listenMs: 0, visits: 1, firstOrder: s.telemetry.order.length }
      visits[a.pointId] = { ...prev, dwellMs: prev.dwellMs + a.dwellMs }
      return { ...s, telemetry: { ...s.telemetry, visits } }
    }
    case 'listen': {
      const visits = { ...s.telemetry.visits }
      const prev = visits[a.pointId] ?? { dwellMs: 0, listenMs: 0, visits: 1, firstOrder: s.telemetry.order.length }
      visits[a.pointId] = { ...prev, listenMs: prev.listenMs + a.listenMs }
      bus.emit({ type: 'auscultation_stopped', pointId: a.pointId, listenMs: a.listenMs, at: Date.now() })
      return { ...s, telemetry: { ...s.telemetry, visits } }
    }
    case 'replay':
      return { ...s, telemetry: { ...s.telemetry, replayCount: s.telemetry.replayCount + 1 } }
    case 'answer':
      bus.emit({ type: 'answer_selected', qid: a.qid, at: Date.now() })
      return { ...s, answers: { ...s.answers, [a.qid]: a.values } }
    case 'submitAnswer':
      bus.emit({ type: 'answer_submitted', qid: a.qid, correct: a.correct, at: Date.now() })
      return { ...s, revealed: { ...s.revealed, [a.qid]: true }, lastFeedback: { correct: a.correct, qid: a.qid } }
    case 'useHint':
      bus.emit({ type: 'hint_used', caseId: s.currentCaseId, at: Date.now() })
      return { ...s, hintsUsed: s.hintsUsed + 1 }
    case 'timer':
      return { ...s, assessmentTimer: s.assessmentTimer + a.deltaMs }
    case 'advance': {
      // madde 1/5: yalnız vaka İÇİNDE sonraki soruya geçer. Son sorudan sonra vakayı
      // bitirmek için 'finishCase' (skor + vaka sonu özeti), sıradaki vakaya geçmek
      // için 'nextCase' kullanılır — primaryAction (SimulationScreen) bu ikisini
      // nextActionForSubmit()'in kararına göre ayrı ayrı dispatch eder.
      const def = ALL_CASES.find((c) => c.id === s.currentCaseId)
      if (!def) return s
      if (def.questions[s.step + 1] == null) return s // son soru: 'finishCase' kullanılmalı
      return { ...s, step: s.step + 1, lastFeedback: null }
    }
    case 'finishCase': {
      const def = ALL_CASES.find((c) => c.id === s.currentCaseId)
      if (!def) return s
      // vaka bitti: sonucu bir kez kaydet ve vaka sonu özetini (pendingSummary) üret (§24 deterministik)
      let result = scoreCase(def, s.answers, s.telemetry, s.hintsUsed)
      // O9: uygulama modunda ipucu cezası görünür puana uygulanır (değerlendirmede ipucu yok, etkilenmez)
      if (s.mode === 'practice' && s.hintsUsed > 0) {
        const adjustedTotal = practiceAdjusted(result.total, s.hintsUsed)
        const threshold = def.masteryThreshold ?? MASTERY_THRESHOLD
        result = { ...result, total: adjustedTotal, mastery: adjustedTotal >= threshold }
      }
      return {
        ...s,
        caseResults: [...s.caseResults, result],
        pendingSummary: result,
        lastFeedback: null,
      }
    }
    case 'nextCase':
      // vaka sonu özeti kapatılır, sıradaki vakaya geçilir (uygulama: "Sonraki vaka" tıklanınca;
      // değerlendirme: finishCase hemen ardından otomatik — bkz. SimulationScreen primaryAction)
      return {
        ...s,
        pendingSummary: null,
        step: 0,
        answers: {},
        revealed: {},
        hintsUsed: 0,
        telemetry: { ...initialTelemetry },
        caseIndex: s.caseIndex + 1,
        lastFeedback: null,
      }
    case 'tutorialDone':
      return { ...s, tutorialDone: a.done }
    case 'tutorialSeen':
      return { ...s, tutorialSeen: true }
    case 'tutorialStep':
      return { ...s, tutorialStep: a.step }
    case 'restore': {
      const p = a.payload
      // K3: suspend'e yazılan oturum örneklemi (sessionIds/sessionSeed) yalnız AKTİF modun
      // listesine (practiceIds/assessmentIds) yüklenir; diğer mod dokunulmaz.
      const session =
        p.mode === 'assessment'
          ? { ...s.session, assessmentIds: p.sessionIds, seed: p.sessionSeed }
          : p.mode === 'practice'
            ? { ...s.session, practiceIds: p.sessionIds, seed: p.sessionSeed }
            : s.session
      return {
        ...s, mode: p.mode, caseIndex: p.caseIndex, step: p.step, answers: p.answers, hintsUsed: p.hintsUsed,
        tutorialDone: p.tutorialDone,
        telemetry: { ...initialTelemetry, visits: p.visits, order: p.order },
        caseResults: p.caseResults, attempts: p.attempts,
        session,
        screen: p.mode === 'learn' ? 'learn' : 'simulation',
      }
    }
    case 'startDrag':
      return { ...s, dragStarted: true }
    case 'resetCase':
      return { ...s, step: 0, answers: {}, revealed: {}, hintsUsed: 0, telemetry: { ...initialTelemetry }, lastFeedback: null, pendingSummary: null }
    case 'setResults':
      return { ...s, caseResults: a.results, screen: 'results' }
    case 'setLearnFocus':
      return { ...s, learnFocusKey: a.key }
    default:
      return s
  }
}

/* ---------------- SCORM runtime ---------------- */
export class ScormRuntime {
  api: ScormApi
  flags: ReturnType<typeof makeScorm>['flags']
  startedAt = performance.now()
  /** D12: terminate() sonrası true — bu andan sonra set/commit çağrıları no-op'tur. */
  terminated = false
  private getState: () => AppState
  private totalCases: () => number

  constructor(getState: () => AppState, totalCases: () => number) {
    const { api, flags } = makeScorm()
    this.api = api
    this.flags = flags
    this.getState = getState
    this.totalCases = totalCases
  }

  init(): SuspendPayload | null {
    this.api.init()
    const raw = this.api.get('cmi.suspend_data')
    const restored = deserializeSuspend(raw)
    // O1: LMS'te zaten passed/completed/failed varsa ezilmez — yalnız boş/not attempted/unknown ise incomplete yazılır.
    const current = this.api.get('cmi.completion_status')
    if (!current || current === 'not attempted' || current === 'unknown') {
      this.api.set('cmi.completion_status', 'incomplete')
      this.api.commit()
    }
    return restored
  }

  saveInteractions(caseId: string, questions: Question[], answers: Record<string, string[]>, latencyMs?: Record<string, number>) {
    if (this.terminated) return
    const is12 = this.api.version === '1.2'
    // O2(d): dizin cmi.interactions._count'tan başlar (sayı değilse 0 kabul edilir)
    const countRaw = this.api.get('cmi.interactions._count')
    let idx = Number.parseInt(countRaw, 10)
    if (!Number.isFinite(idx) || idx < 0) idx = 0
    for (const q of questions) {
      const given = answers[q.id] ?? []
      if (given.length === 0) continue
      const correct = given.length > 0 && q.correct.length === given.length && given.every((g) => q.correct.includes(g))
      const base = `cmi.interactions.${idx}`
      // O2(c): id vaka bağlamıyla benzersizleştirilir (aynı q.id birden çok vakada tekrar edebilir)
      this.api.set(`${base}.id`, `${caseId}.${q.id}`)
      // O2(a): SCORM 1.2/2004 interaction type sözlüğünde 'multiple-choice' geçersizdir; hep 'choice'.
      this.api.set(`${base}.type`, 'choice')
      // O2(b): 1.2'de ayırıcı ',' , 2004'te '[,]'dır.
      const response = given.join(is12 ? ',' : '[,]')
      if (is12) this.api.set(`${base}.student_response`, response)
      else this.api.set(`${base}.learner_response`, response)
      this.api.set(`${base}.result`, correct ? 'correct' : is12 ? 'wrong' : 'incorrect')
      const lat = latencyMs?.[q.id]
      if (!is12 && lat != null) this.api.set(`${base}.latency`, `PT${Math.max(0, Math.round(lat / 1000))}S`)
      idx++
    }
  }

  saveProgress(payload: SuspendPayload) {
    if (this.terminated) return
    const limit = this.api.version === '1.2' ? SUSPEND_LIMIT_12 : SUSPEND_LIMIT_2004
    const data = serializeSuspend(payload, limit)
    const okSet = this.api.set('cmi.suspend_data', data)
    if (!okSet) console.warn('[Ausculta] suspend_data yazılamadı (LMS limiti)')
    this.api.set(
      this.api.version === '2004' ? 'cmi.location' : 'cmi.core.lesson_location',
      `case:${payload.caseIndex}:step:${payload.step}`
    )
    this.api.commit()
  }

  /** O3: terminate() sırasında cmi.exit/cmi.core.exit için "tamamlandı" bilgisini tutar. */
  private finished = false

  reportScore(score: number, passed: boolean, finished: boolean) {
    if (this.terminated) return
    this.finished = finished
    this.api.set('cmi.score.min', '0')
    this.api.set('cmi.score.max', '100')
    this.api.set('cmi.score.raw', String(score))
    if (this.api.version === '2004') {
      this.api.set('cmi.score.scaled', String(Math.round((score / 100) * 100) / 100))
      this.api.set('cmi.success_status', passed ? 'passed' : 'failed')
      this.api.set('cmi.completion_status', finished ? 'completed' : 'incomplete')
      this.api.set('cmi.progress_measure', String(Math.min(1, this.getState().caseResults.length / Math.max(1, this.totalCases()))))
    } else {
      this.api.set('cmi.core.lesson_status', finished ? (passed ? 'passed' : 'failed') : 'incomplete')
    }
    this.api.commit()
  }

  /** Sekme kapanır/gizlenirse son durumu LMS'e yaz (§27 devam güvencesi). */
  /** Son durumu LMS'e yazar (kapanış/gizlenme ve testler tarafından kullanılır). */
  flushNow() {
    if (this.terminated) return
    try {
      this.saveProgress(buildSuspend(this.getState()))
    } catch {
      /* LMS erişilemezse sessizce yut */
    }
  }
  attachAutoFlush() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const flush = () => this.flushNow()
    this.flushHandlers = {
      unload: flush,
      vis: () => {
        if (document.visibilityState === 'hidden') flush()
      },
    }
    window.addEventListener('beforeunload', this.flushHandlers.unload)
    document.addEventListener('visibilitychange', this.flushHandlers.vis)
  }
  detachAutoFlush() {
    if (!this.flushHandlers) return
    window.removeEventListener('beforeunload', this.flushHandlers.unload)
    document.removeEventListener('visibilitychange', this.flushHandlers.vis)
    this.flushHandlers = undefined
  }
  private flushHandlers?: { unload: () => void; vis: () => void }

  terminate() {
    if (this.terminated) return
    this.detachAutoFlush()
    const elapsed = Math.round((performance.now() - this.startedAt) / 1000)
    const time = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
    this.api.set('cmi.session_time', time)
    // O3: tamamlanmadıysa 'suspend' (devam ettirilebilir), tamamlandıysa '' yazılır (KEY12'de cmi.exit → cmi.core.exit).
    this.api.set('cmi.exit', this.finished ? '' : 'suspend')
    this.api.commit()
    this.api.terminate()
    // D12: bundan sonra set/commit tetikleyen çağrılar no-op'tur (bazı LMS'ler Terminate sonrası yazımı reddeder).
    this.terminated = true
  }
}

/** Suspend yükünü state'ten üret (§27). K3: yalnız AKTİF modun oturum listesi yazılır —
 *  practice/assessment örneklemleri birbirine karışmaz, devam ettirmede doğru havuz geri gelir. */
export function buildSuspend(state: AppState): SuspendPayload {
  const activeIds = state.mode === 'assessment' ? state.session.assessmentIds : state.session.practiceIds
  return {
    v: 1,
    mode: state.mode,
    caseIndex: state.caseIndex,
    step: state.step,
    answers: state.answers,
    hintsUsed: state.hintsUsed,
    caseResults: state.caseResults,
    tutorialDone: state.tutorialDone,
    visits: state.telemetry.visits,
    order: state.telemetry.order,
    attempts: state.attempts,
    sessionIds: activeIds,
    sessionSeed: state.session.seed,
  }
}

/* ---------------- context ---------------- */
interface StoreCtx {
  state: AppState
  dispatch: Dispatch<Action>
  runtime: ScormRuntime | null
}

const Ctx = createContext<StoreCtx | null>(null)

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('StoreProvider dışında kullanım')
  return ctx
}

export function StoreProvider({ children, cases }: { children: ReactNode; cases: CaseDef[] }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const runtimeRef = useRef<ScormRuntime | null>(null)

  useEffect(() => {
    const rt = new ScormRuntime(
      () => stateRef.current,
      () => cases.filter((c) => c.modes.includes('assessment')).length
    )
    runtimeRef.current = rt
    // ?fresh=1 ile yüklemede devam durumu yoksayılır (geliştirme/e2e yardımcısı) — O6(a):
    // yalnız DEV build'de etkilidir; üretimde bir öğrenci bu parametreyle devam kaydını atlayamaz.
    const fresh = import.meta.env.DEV && typeof window !== 'undefined' && window.location.search.includes('fresh=1')
    const restored = fresh ? null : rt.init()
    if (restored) dispatch({ type: 'restore', payload: restored })
    rt.attachAutoFlush()
    const onPageHide = () => rt.terminate()
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('unload', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('unload', onPageHide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // durum değişimlerinde suspend kaydet (§27)
  useEffect(() => {
    const rt = runtimeRef.current
    if (!rt || state.screen === 'start' || state.screen === 'modes') return
    rt.saveProgress(buildSuspend(state))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, state.caseIndex, state.step, state.attempts, state.tutorialDone])

  // değerlendirme oturum sayacı
  useEffect(() => {
    if (state.mode !== 'assessment' || state.screen !== 'simulation') return
    const t = window.setInterval(() => dispatch({ type: 'timer', deltaMs: 1000 }), 1000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, state.screen])

  // vaka olayı + akım vaka id
  // vaka başlangıcında hasta gövdesini vakaya göre ayarla (pediatrik öncelikli)
  return <Ctx.Provider value={{ state, dispatch, runtime: runtimeRef.current }}>{children}</Ctx.Provider>
}

/* yardımcılar */
export function computeCaseResult(caseDef: CaseDef, answers: Record<string, string[]>, telemetry: Telemetry, hintsUsed: number): CaseResult {
  return scoreCase(caseDef, answers, telemetry, hintsUsed)
}
export function computeAggregate(results: CaseResult[]) {
  return aggregateResults(results)
}
export type { StethHead, PatientView, PointVisit, SoundRecord, Question, Mode }
