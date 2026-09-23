/** EGEMED Opaca — `localStorage` okuma/yazma sınırı (yol haritası §2.7, §4).
 *  BU DOSYA istisnadır: storage/repo sınırında olduğu için doğrudan `localStorage`'a erişir.
 *  `localStorage` yoksa (SCORM paketleyici, gizli sekme, eski tarayıcı) ya da veri bozuksa/eski
 *  sürümdeyse SESSİZCE boş duruma döner — oyunlaştırma uygulamayı asla kıramaz. */

import type { GamiStateV1 } from './types'
import { RULES } from './rules'

export const STORAGE_KEY = RULES.storage.key

export function emptyState(): GamiStateV1 {
  return {
    v: 1,
    attempts: [],
    learn: { topics: [], ctStacksCompleted: [] },
    earned: [],
    profile: { displayName: null, public: true, cohort: null },
  }
}

function isValidState(x: unknown): x is GamiStateV1 {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  if (s.v !== 1) return false
  if (!Array.isArray(s.attempts) || !Array.isArray(s.earned)) return false
  if (!s.learn || typeof s.learn !== 'object') return false
  if (!s.profile || typeof s.profile !== 'object') return false
  const learn = s.learn as Record<string, unknown>
  if (!Array.isArray(learn.topics) || !Array.isArray(learn.ctStacksCompleted)) return false
  return true
}

export function loadState(): GamiStateV1 {
  try {
    if (typeof localStorage === 'undefined') return emptyState()
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed: unknown = JSON.parse(raw)
    if (!isValidState(parsed)) return emptyState()
    return parsed
  } catch {
    return emptyState()
  }
}

/** `attempts` en fazla `RULES.storage.maxAttempts` kayıt tutar; en eskiler düşer (kazanılmış
 *  rozetler `earned` ayrı tutulduğundan bundan etkilenmez). */
export function saveState(state: GamiStateV1): void {
  try {
    if (typeof localStorage === 'undefined') return
    const trimmed: GamiStateV1 = {
      ...state,
      attempts:
        state.attempts.length > RULES.storage.maxAttempts
          ? state.attempts.slice(state.attempts.length - RULES.storage.maxAttempts)
          : state.attempts,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // sessizce yok say
  }
}
