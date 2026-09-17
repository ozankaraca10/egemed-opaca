import type { RuntimeFlags } from './types'

/** SCORM çalışma zamanı soyutlaması (§25, §26).
 *  SCORM 2004 (API_1484_11) ve SCORM 1.2 (API) otomatik algılanır;
 *  hiçbiri yoksa bağımsız geliştirme modu için MockAdapter kullanılır. */

export interface ScormApi {
  version: '2004' | '1.2' | 'mock'
  init(): boolean
  get(key: string): string
  set(key: string, value: string): boolean
  commit(): boolean
  terminate(): boolean
}

/* anahtar eşleme tablosu (2004 ↔ 1.2 ortak durum) */
const KEY12: Record<string, string> = {
  'cmi.completion_status': 'cmi.core.lesson_status',
  'cmi.success_status': 'cmi.core.lesson_status',
  'cmi.location': 'cmi.core.lesson_location',
  'cmi.score.raw': 'cmi.core.score.raw',
  'cmi.score.min': 'cmi.core.score.min',
  'cmi.score.max': 'cmi.core.score.max',
  'cmi.session_time': 'cmi.core.session_time',
  'cmi.exit': 'cmi.core.exit',
  'cmi.learner_name': 'cmi.core.student_name',
  'cmi.learner_id': 'cmi.core.student_id',
  'cmi.progress_measure': '',
}
const SUCCESS_TO_12: Record<string, string> = { passed: 'passed', failed: 'failed' }

function findAPI(win: Window & typeof globalThis, apiName: string, maxDepth = 10): unknown {
  let w: unknown = win
  for (let i = 0; i < maxDepth; i++) {
    const candidate = w as { [k: string]: unknown } | null
    if (!candidate) return null
    if (candidate[apiName]) return candidate[apiName]
    const parent = (candidate as { parent?: unknown }).parent
    const opener = (candidate as { opener?: unknown }).opener
    if (parent && parent !== w) w = parent
    else if (opener) w = opener
    else return null
  }
  return null
}

export class Scorm2004Adapter implements ScormApi {
  version = '2004' as const
  private api: {
    Initialize: (p: string) => string
    GetValue: (k: string) => string
    SetValue: (k: string, v: string) => string
    Commit: (p: string) => string
    Terminate: (p: string) => string
    GetLastError: () => string
  }

  constructor(api: Scorm2004Adapter['api']) {
    this.api = api
  }
  init() {
    return this.api.Initialize('') === 'true'
  }
  get(key: string) {
    return this.api.GetValue(key)
  }
  set(key: string, value: string) {
    return this.api.SetValue(key, value) === 'true'
  }
  commit() {
    return this.api.Commit('') === 'true'
  }
  terminate() {
    return this.api.Terminate('') === 'true'
  }
}

export class Scorm12Adapter implements ScormApi {
  version = '1.2' as const
  private api: {
    LMSInitialize: (p: string) => string
    LMSGetValue: (k: string) => string
    LMSSetValue: (k: string, v: string) => string
    LMSCommit: (p: string) => string
    LMSFinish: (p: string) => string
  }

  constructor(api: Scorm12Adapter['api']) {
    this.api = api
  }
  init() {
    return this.api.LMSInitialize('') === 'true'
  }
  /** 1.2 anahtarını ortak 2004 anahtarına çevir */
  get(key: string) {
    const mapped = KEY12[key] || key
    if (!mapped) return ''
    return this.api.LMSGetValue(mapped)
  }
  set(key: string, value: string): boolean {
    // 1.2'de success_status lesson_status ile birleşiktir
    if (key === 'cmi.success_status' && value in SUCCESS_TO_12) {
      return this.api.LMSSetValue('cmi.core.lesson_status', SUCCESS_TO_12[value]) === 'true'
    }
    const mapped = KEY12[key] || key
    if (!mapped) return true
    return this.api.LMSSetValue(mapped, value) === 'true'
  }
  commit() {
    return this.api.LMSCommit('') === 'true'
  }
  terminate() {
    return this.api.LMSFinish('') === 'true'
  }
}

export class MockAdapter implements ScormApi {
  version = 'mock' as const
  private store = new Map<string, string>()
  init() {
    return true
  }
  get(key: string) {
    return this.store.get(key) ?? ''
  }
  set(key: string, value: string) {
    this.store.set(key, value)
    return true
  }
  commit() {
    return true
  }
  terminate() {
    return true
  }
  dump() {
    return Object.fromEntries(this.store)
  }
}

export function detectScorm(): ScormApi | null {
  if (typeof window === 'undefined') return null
  try {
    const a2004 = findAPI(window, 'API_1484_11') as Scorm2004Adapter['api'] | null
    if (a2004?.Initialize) return new Scorm2004Adapter(a2004)
    const a12 = findAPI(window, 'API') as Scorm12Adapter['api'] | null
    if (a12?.LMSInitialize) return new Scorm12Adapter(a12)
  } catch {
    /* standalone */
  }
  return null
}

export function makeScorm(): { api: ScormApi; flags: RuntimeFlags } {
  const detected = detectScorm()
  if (detected) {
    return {
      api: detected,
      flags: { dev: import.meta.env.DEV, scormAvailable: true, scormVersion: detected.version },
    }
  }
  return {
    api: new MockAdapter(),
    flags: { dev: import.meta.env.DEV, scormAvailable: false, scormVersion: 'mock' },
  }
}
