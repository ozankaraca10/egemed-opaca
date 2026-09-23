import { createContext, useContext, useEffect, useReducer, useRef, type Dispatch, type ReactNode } from 'react'
import type { CaseDef, CaseResult, ImageRecord, Mode, Question, Screen, SuspendPayload, Telemetry, ViewerTool } from './types'
import { bus } from './events'
import { makeScorm, type ScormApi } from './scorm'
import { deserializeSuspend, serializeSuspend, SUSPEND_LIMIT_12, SUSPEND_LIMIT_2004 } from './suspend'
import { scoreCase, aggregateResults, practiceAdjusted, MASTERY_THRESHOLD } from './scoring'
import { isAnswerCorrect } from './answers'
import { markToScorm } from './geometry'
import { getImage } from './images'
import { ALL_CASES } from '../data/pool'
import { ZONES } from '../data/zones'

/* ---------------- state ---------------- */
export interface AppState {
  screen: Screen
  currentCaseId: string
  mode: Mode
  caseIndex: number
  step: number
  answers: Record<string, string[]>
  revealed: Record<string, boolean>
  hintsUsed: number
  attempts: number
  caseResults: CaseResult[]
  telemetry: Telemetry
  /** Öğrenme/Uygulamada okuma bölgesi katmanı */
  showZones: boolean
  tutorialDone: boolean
  tutorialSeen: boolean
  /** değerlendirme oturumunun toplam süresi */
  assessmentTimer: number
  /** aktif vakanın süresi (vaka süre sınırı için) */
  caseElapsed: number
  lastFeedback: { correct: boolean; qid: string } | null
  session: { practiceIds: string[]; assessmentIds: string[]; seed: number }
  pendingSummary: CaseResult | null
  learnFocusKey: string | null
  /** A4: mod başına kalıcı en iyi toplam puan — "Yeni örneklem" onayında "en iyi puan
   *  korunur" ifadesinin karşılığı; localStorage'da kalıcıdır (StoreProvider ile okunur/
   *  yazılır), oturum/örneklem sıfırlansa da silinmez. SCORM suspend şemasına dahil değildir. */
  bestScore: { practice: number; assessment: number }
}

const emptyToolUse = (): Record<ViewerTool, number> => ({ zoom: 0, window: 0, invert: 0, overlay: 0, measure: 0 })
export const initialTelemetry = (): Telemetry => ({ visits: {}, order: [], toolUse: emptyToolUse() })

export const initialState: AppState = {
  screen: 'start',
  currentCaseId: '',
  mode: 'practice',
  caseIndex: 0,
  step: 0,
  answers: {},
  revealed: {},
  hintsUsed: 0,
  attempts: 0,
  caseResults: [],
  telemetry: initialTelemetry(),
  showZones: true,
  tutorialDone: false,
  tutorialSeen: false,
  assessmentTimer: 0,
  caseElapsed: 0,
  lastFeedback: null,
  session: { practiceIds: [], assessmentIds: [], seed: 0 },
  pendingSummary: null,
  learnFocusKey: null,
  bestScore: { practice: 0, assessment: 0 },
}

const BEST_SCORE_KEY = 'opaca.bestScore'

/** A4: localStorage'dan kalıcı en iyi puanları oku (try/catch — özel pencere/erişim engelinde yut) */
function loadBestScore(): { practice: number; assessment: number } {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY)
    if (!raw) return { practice: 0, assessment: 0 }
    const parsed = JSON.parse(raw) as { practice?: number; assessment?: number }
    return { practice: Number(parsed.practice) || 0, assessment: Number(parsed.assessment) || 0 }
  } catch {
    return { practice: 0, assessment: 0 }
  }
}

export type Action =
  | { type: 'goto'; screen: Screen }
  | { type: 'startMode'; mode: Mode }
  | { type: 'caseMount'; caseDef: CaseDef }
  | { type: 'startSession'; practiceIds: string[]; assessmentIds: string[]; seed: number }
  | { type: 'toggleZones'; show?: boolean }
  | { type: 'zoneEnter'; zoneIds: string[] }
  | { type: 'zoneDwell'; zoneIds: string[]; dwellMs: number }
  | { type: 'toolUsed'; tool: ViewerTool }
  | { type: 'answer'; qid: string; values: string[] }
  | { type: 'submitAnswer'; qid: string; correct: boolean }
  | { type: 'useHint' }
  | { type: 'timer'; deltaMs: number }
  | { type: 'advance' }
  | { type: 'finishCase' }
  | { type: 'nextCase' }
  | { type: 'tutorialDone'; done: boolean }
  | { type: 'tutorialSeen' }
  | { type: 'restore'; payload: SuspendPayload }
  | { type: 'resetCase' }
  | { type: 'setResults'; results: CaseResult[] }
  | { type: 'setLearnFocus'; key: string | null }

const findCase = (id: string) => ALL_CASES.find((c) => c.id === id)

/** Vaka puanı (store dışı da kullanılır: testler, sonuç ekranı). */
export function computeCaseResult(def: CaseDef, s: Pick<AppState, 'answers' | 'telemetry' | 'hintsUsed' | 'mode'>): CaseResult {
  let result = scoreCase(def, s.answers, s.telemetry, s.hintsUsed, getImage(def.imageId), ZONES)
  if (s.mode === 'practice' && s.hintsUsed > 0) {
    const adjusted = practiceAdjusted(result.total, s.hintsUsed)
    result = { ...result, total: adjusted, mastery: adjusted >= (def.masteryThreshold ?? MASTERY_THRESHOLD) }
  }
  return result
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'goto':
      return { ...s, screen: a.screen }
    case 'caseMount':
      if (a.caseDef.id === s.currentCaseId) return s
      return { ...s, currentCaseId: a.caseDef.id }
    case 'startMode':
      // K4: yeni oturum eski sonuçları taşımaz
      return {
        ...s, mode: a.mode, screen: 'simulation', caseIndex: 0, step: 0, answers: {}, revealed: {}, hintsUsed: 0,
        telemetry: initialTelemetry(), lastFeedback: null, pendingSummary: null,
        caseResults: [], assessmentTimer: 0, caseElapsed: 0, attempts: s.attempts + 1, currentCaseId: '',
      }
    case 'startSession':
      return { ...s, session: { practiceIds: a.practiceIds, assessmentIds: a.assessmentIds, seed: a.seed } }
    case 'toggleZones':
      return { ...s, showZones: a.show ?? !s.showZones }
    case 'zoneEnter': {
      if (!a.zoneIds.length) return s
      const visits = { ...s.telemetry.visits }
      let order = s.telemetry.order
      for (const id of a.zoneIds) {
        const prev = visits[id]
        visits[id] = { dwellMs: prev?.dwellMs ?? 0, visits: (prev?.visits ?? 0) + 1, firstOrder: prev ? prev.firstOrder : order.length }
        if (!prev) {
          order = [...order, id]
          bus.emit({ type: 'zone_visited', zoneId: id, at: Date.now() })
        }
      }
      return { ...s, telemetry: { ...s.telemetry, visits, order } }
    }
    case 'zoneDwell': {
      if (!a.zoneIds.length || a.dwellMs <= 0) return s
      const visits = { ...s.telemetry.visits }
      let order = s.telemetry.order
      for (const id of a.zoneIds) {
        const prev = visits[id]
        if (!prev) order = [...order, id]
        visits[id] = prev
          ? { ...prev, dwellMs: prev.dwellMs + a.dwellMs }
          : { dwellMs: a.dwellMs, visits: 1, firstOrder: order.length - 1 }
      }
      return { ...s, telemetry: { ...s.telemetry, visits, order } }
    }
    case 'toolUsed':
      bus.emit({ type: 'tool_used', tool: a.tool, at: Date.now() })
      return { ...s, telemetry: { ...s.telemetry, toolUse: { ...s.telemetry.toolUse, [a.tool]: s.telemetry.toolUse[a.tool] + 1 } } }
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
      return { ...s, assessmentTimer: s.assessmentTimer + a.deltaMs, caseElapsed: s.caseElapsed + a.deltaMs }
    case 'advance': {
      const def = findCase(s.currentCaseId)
      if (!def || def.questions[s.step + 1] == null) return s
      return { ...s, step: s.step + 1, lastFeedback: null }
    }
    case 'finishCase': {
      const def = findCase(s.currentCaseId)
      if (!def || s.pendingSummary) return s
      const result = computeCaseResult(def, s)
      bus.emit({ type: 'case_completed', caseId: def.id, mode: s.mode, at: Date.now() })
      return { ...s, caseResults: [...s.caseResults, result], pendingSummary: result, lastFeedback: null }
    }
    case 'nextCase':
      return {
        ...s, pendingSummary: null, step: 0, answers: {}, revealed: {}, hintsUsed: 0,
        telemetry: initialTelemetry(), caseIndex: s.caseIndex + 1, lastFeedback: null, caseElapsed: 0,
      }
    case 'tutorialDone':
      return { ...s, tutorialDone: a.done }
    case 'tutorialSeen':
      return { ...s, tutorialSeen: true }
    case 'restore': {
      const p = a.payload
      // K3: oturum örneklemi yalnız AKTİF modun listesine yüklenir
      const session =
        p.mode === 'assessment'
          ? { ...s.session, assessmentIds: p.sessionIds, seed: p.sessionSeed }
          : p.mode === 'practice'
            ? { ...s.session, practiceIds: p.sessionIds, seed: p.sessionSeed }
            : s.session
      return {
        ...s, mode: p.mode, caseIndex: p.caseIndex, step: p.step, answers: p.answers, hintsUsed: p.hintsUsed,
        tutorialDone: p.tutorialDone, tutorialSeen: true,
        telemetry: { ...initialTelemetry(), visits: p.visits, order: p.order },
        caseResults: p.caseResults, attempts: p.attempts, session,
        screen: p.mode === 'learn' ? 'learn' : 'simulation',
      }
    }
    case 'resetCase':
      return { ...s, step: 0, answers: {}, revealed: {}, hintsUsed: 0, telemetry: initialTelemetry(), lastFeedback: null, pendingSummary: null }
    case 'setResults': {
      // A4: oturum bitince mod başına en iyi toplam puanı güncelle (yalnız practice/assessment;
      // learn modu setResults dispatch etmez). Yeni örneklem/oturum sıfırlansa da korunur.
      const modeKey: 'practice' | 'assessment' = s.mode === 'assessment' ? 'assessment' : 'practice'
      const agg = aggregateResults(a.results)
      const prevBest = s.bestScore[modeKey] ?? 0
      const bestScore = agg.total > prevBest ? { ...s.bestScore, [modeKey]: agg.total } : s.bestScore
      return { ...s, caseResults: a.results, screen: 'results', bestScore }
    }
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
  terminated = false
  private finished = false
  private getState: () => AppState
  private totalCases: () => number
  private flushHandlers?: { unload: () => void; vis: () => void }

  constructor(getState: () => AppState, totalCases: () => number, api?: ScormApi) {
    const made = makeScorm()
    this.api = api ?? made.api
    this.flags = api ? { ...made.flags, scormAvailable: api.version !== 'mock', scormVersion: api.version } : made.flags
    this.getState = getState
    this.totalCases = totalCases
  }

  init(): SuspendPayload | null {
    this.api.init()
    const restored = deserializeSuspend(this.api.get('cmi.suspend_data'))
    // O1: tamamlanmış durum ezilmez
    const current = this.api.get('cmi.completion_status')
    if (!current || current === 'not attempted' || current === 'unknown') {
      this.api.set('cmi.completion_status', 'incomplete')
      this.api.commit()
    }
    return restored
  }

  saveInteractions(caseId: string, questions: Question[], answers: Record<string, string[]>, image: ImageRecord | undefined, latencyMs?: Record<string, number>) {
    if (this.terminated) return
    const is12 = this.api.version === '1.2'
    let idx = Number.parseInt(this.api.get('cmi.interactions._count'), 10)
    if (!Number.isFinite(idx) || idx < 0) idx = 0
    for (const q of questions) {
      const given = answers[q.id] ?? []
      if (!given.length) continue
      const correct = isAnswerCorrect(q, given, image)
      const base = `cmi.interactions.${idx}`
      this.api.set(`${base}.id`, `${caseId}.${q.id}`)
      // lokalizasyon işareti 'fill-in' (x43y55), seçmeli sorular 'choice' (O2)
      const isMark = q.type === 'localization'
      this.api.set(`${base}.type`, isMark ? 'fill-in' : 'choice')
      const response = isMark ? markToScorm(given[0]) : given.join(is12 ? ',' : '[,]')
      this.api.set(is12 ? `${base}.student_response` : `${base}.learner_response`, response)
      this.api.set(`${base}.result`, correct ? 'correct' : is12 ? 'wrong' : 'incorrect')
      const lat = latencyMs?.[q.id]
      if (!is12 && lat != null) this.api.set(`${base}.latency`, `PT${Math.max(0, Math.round(lat / 1000))}S`)
      idx++
    }
  }

  saveProgress(payload: SuspendPayload) {
    if (this.terminated) return
    const limit = this.api.version === '1.2' ? SUSPEND_LIMIT_12 : SUSPEND_LIMIT_2004
    if (!this.api.set('cmi.suspend_data', serializeSuspend(payload, limit))) console.warn('[Opaca] suspend_data yazılamadı (LMS limiti)')
    this.api.set(this.api.version === '2004' ? 'cmi.location' : 'cmi.core.lesson_location', `case:${payload.caseIndex}:step:${payload.step}`)
    this.api.commit()
  }

  reportScore(score: number, passed: boolean, finished: boolean) {
    if (this.terminated) return
    this.finished = finished
    this.api.set('cmi.score.min', '0')
    this.api.set('cmi.score.max', '100')
    this.api.set('cmi.score.raw', String(score))
    if (this.api.version === '2004') {
      this.api.set('cmi.score.scaled', String(Math.round(score) / 100))
      this.api.set('cmi.success_status', passed ? 'passed' : 'failed')
      this.api.set('cmi.completion_status', finished ? 'completed' : 'incomplete')
      this.api.set('cmi.progress_measure', String(Math.min(1, this.getState().caseResults.length / Math.max(1, this.totalCases()))))
    } else {
      this.api.set('cmi.core.lesson_status', finished ? (passed ? 'passed' : 'failed') : 'incomplete')
    }
    this.api.commit()
  }

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
    this.flushHandlers = { unload: flush, vis: () => { if (document.visibilityState === 'hidden') flush() } }
    window.addEventListener('beforeunload', this.flushHandlers.unload)
    document.addEventListener('visibilitychange', this.flushHandlers.vis)
  }

  detachAutoFlush() {
    if (!this.flushHandlers) return
    window.removeEventListener('beforeunload', this.flushHandlers.unload)
    document.removeEventListener('visibilitychange', this.flushHandlers.vis)
    this.flushHandlers = undefined
  }

  terminate() {
    if (this.terminated) return
    this.detachAutoFlush()
    const elapsed = Math.round((performance.now() - this.startedAt) / 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    this.api.set('cmi.session_time', `${pad(Math.floor(elapsed / 3600))}:${pad(Math.floor((elapsed % 3600) / 60))}:${pad(elapsed % 60)}`)
    this.api.set('cmi.exit', this.finished ? '' : 'suspend')
    this.api.commit()
    this.api.terminate()
    this.terminated = true
  }
}

/** Suspend yükü — yalnız AKTİF modun oturum listesi yazılır (K3). */
export function buildSuspend(state: AppState): SuspendPayload {
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
    sessionIds: state.mode === 'assessment' ? state.session.assessmentIds : state.session.practiceIds,
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
  const [state, dispatch] = useReducer(reducer, initialState, (init) => ({ ...init, bestScore: loadBestScore() }))
  const stateRef = useRef(state)
  stateRef.current = state
  const runtimeRef = useRef<ScormRuntime | null>(null)

  // A4: en iyi puan localStorage'a kalıcı yazılır (try/catch — özel pencere/erişim engelinde yut)
  useEffect(() => {
    try {
      localStorage.setItem(BEST_SCORE_KEY, JSON.stringify(state.bestScore))
    } catch {
      /* yut */
    }
  }, [state.bestScore])

  useEffect(() => {
    const rt = new ScormRuntime(() => stateRef.current, () => cases.filter((c) => c.modes.includes('assessment')).length)
    runtimeRef.current = rt
    // O6(a): ?fresh=1 yalnız DEV build'de devam kaydını yok sayar
    const fresh = import.meta.env.DEV && window.location.search.includes('fresh=1')
    const restored = fresh ? null : rt.init()
    if (fresh) rt.api.init()
    if (restored) dispatch({ type: 'restore', payload: restored })
    rt.attachAutoFlush()
    const onPageHide = () => rt.terminate()
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const rt = runtimeRef.current
    if (!rt || state.screen === 'start' || state.screen === 'modes') return
    rt.saveProgress(buildSuspend(state))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, state.caseIndex, state.step, state.attempts, state.tutorialDone])

  // A4: toplam öğrenme süresi hem uygulama hem değerlendirmede birikir (sonuç ekranında
  // "Toplam öğrenme süresi" kutusu için); vaka süre sınırı yalnız değerlendirmede kullanılır.
  useEffect(() => {
    if (state.screen !== 'simulation') return
    const t = window.setInterval(() => dispatch({ type: 'timer', deltaMs: 1000 }), 1000)
    return () => window.clearInterval(t)
  }, [state.screen])

  return <Ctx.Provider value={{ state, dispatch, runtime: runtimeRef.current }}>{children}</Ctx.Provider>
}

export function computeAggregate(results: CaseResult[]) {
  return aggregateResults(results)
}
