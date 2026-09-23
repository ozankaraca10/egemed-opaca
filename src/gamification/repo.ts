/** EGEMED Opaca — `GamificationRepo` arayüzü + `LocalRepo` uygulaması (yol haritası §1, §4, §6).
 *  BU DOSYA storage/repo sınırındadır: `new Date()` kullanımı yalnız burada (ve storage.ts'te)
 *  izinlidir. `GamificationRepo` arayüzünün arkasında bir sunucu/LRS geldiğinde yalnız bu dosyanın
 *  yerine yeni bir uygulama (ör. `RemoteRepo`) geçer; çağıran kod değişmez. */

import type {
  AttemptRecord,
  GamiStateV1,
  Cohort,
  CohortFilter,
  GamiProfile,
  LeaderboardRow,
  LeaderboardView,
  MonthlyReward,
  Period,
  RewardWinner,
} from './types'
import { loadState, saveState } from './storage'
import { computeStats } from './stats'
import { evaluateBadges } from './badges'
import { periodScore, rankRows } from './ranking'
import { periodRangeTr } from './time'
import { DEMO_PEERS, demoPeriodRow } from './mock'
import { monthlyRewardFor, rewardWinnersHistory } from './rewards'

const ME_ID = 'me'
const ANONYMOUS_LABEL = 'Anonim öğrenci'

/** SCORM `cmi.core.student_name` (Moodle biçimi "Soyad, Ad") → "Ad Soyad".
 *  Virgül yoksa (tek kelime ya da zaten "Ad Soyad" biçimi) dizge olduğu gibi (boşlukları
 *  sadeleştirilmiş) döner. Boş/eksik girişte boş dizge döner. */
export function formatLmsName(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const commaIdx = s.indexOf(',')
  if (commaIdx === -1) return s.replace(/\s+/g, ' ')
  const last = s.slice(0, commaIdx).trim()
  const first = s.slice(commaIdx + 1).trim()
  if (!last || !first) return s.replace(/,/g, '').replace(/\s+/g, ' ').trim()
  return `${first} ${last}`
}

/** Görünen addan baş harfler (avatar rozeti için). Türkçe büyük harfe çevirme kurallarını
 *  kullanır (`toLocaleUpperCase('tr-TR')`) — aksi halde 'i' → 'I' olur, 'İ' beklenirdi. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const first = parts[0]
  const last = parts.length > 1 ? parts[parts.length - 1] : null
  const letters = last ? [first[0], last[0]] : [first[0]]
  return letters.map((ch) => ch.toLocaleUpperCase('tr-TR')).join('')
}

export interface GamificationRepo {
  getMe(): Promise<GamiProfile & { id: string }>
  updateMe(patch: Partial<GamiProfile>): Promise<void>
  /** Idempotent: aynı `id`'ye sahip bir deneme ikinci kez eklenmez. */
  recordAttempt(attempt: AttemptRecord): Promise<void>
  /** Öğrenme etkinliği: konu ilk kez incelendi / BT kesit yığını sona kadar tarandı (her biri bir kez sayılır). */
  recordLearn(activity: { topic?: string; ctStack?: string }, now: Date): Promise<void>
  listAttempts(): Promise<AttemptRecord[]>
  getLeaderboard(period: Period, cohort: CohortFilter, now: Date): Promise<LeaderboardView>
  getMonthlyReward(month: string): Promise<MonthlyReward | null>
  getRewardWinners(lastNMonths: number): Promise<RewardWinner[]>
}

export interface LocalRepoOptions {
  /** SCORM `cmi.core.student_name` — profilde henüz bir `displayName` yoksa varsayılan olarak
   *  kullanılır (biçimlendirilerek). LMS dışına gönderilmez; yalnız görünen ad türetimi içindir. */
  lmsStudentName?: string | null
  /** Demo/test: bellek içi durum. Verilirse localStorage'a HİÇ dokunulmaz (kullanıcının gerçek verisi korunur). */
  stateOverride?: GamiStateV1
}

/** v1 depo uygulaması: kendi verisini `localStorage`'dan okur (bkz. storage.ts), liderlik
 *  tablosunu `mock.ts`'teki deterministik demo akranlarla birleştirir ve sonuca her zaman
 *  `isDemo: true` koyar (bkz. yol haritası §1 — sunucu/LRS olmadan gerçek sınıf sıralaması yok). */
export class LocalRepo implements GamificationRepo {
  private lmsStudentName: string | null
  private override: GamiStateV1 | null

  constructor(opts: LocalRepoOptions = {}) {
    this.lmsStudentName = opts.lmsStudentName ?? null
    this.override = opts.stateOverride ?? null
  }

  private load(): GamiStateV1 {
    return this.override ?? loadState()
  }

  private save(s: GamiStateV1): void {
    if (this.override) this.override = s
    else saveState(s)
  }

  /** Senkron anlık görüntü (UI hesaplamaları için). */
  snapshot(): GamiStateV1 {
    return this.load()
  }

  private defaultDisplayName(): string | null {
    return this.lmsStudentName ? formatLmsName(this.lmsStudentName) || null : null
  }

  async getMe(): Promise<GamiProfile & { id: string }> {
    const s = this.load()
    return {
      id: ME_ID,
      displayName: s.profile.displayName ?? this.defaultDisplayName(),
      public: s.profile.public,
      cohort: s.profile.cohort,
    }
  }

  async updateMe(patch: Partial<GamiProfile>): Promise<void> {
    const s = this.load()
    s.profile = { ...s.profile, ...patch }
    this.save(s)
  }

  async recordAttempt(attempt: AttemptRecord): Promise<void> {
    const s = this.load()
    if (s.attempts.some((a) => a.id === attempt.id)) return // idempotent

    s.attempts.push(attempt)
    const finishedAt = new Date(attempt.finishedAt)
    const stats = computeStats(s.attempts, s.learn, s.earned, finishedAt)
    const newlyEarned = evaluateBadges(stats, s.earned, finishedAt)
    s.earned = [...s.earned, ...newlyEarned]

    this.save(s)
  }

  async recordLearn(activity: { topic?: string; ctStack?: string }, now: Date): Promise<void> {
    const s = this.load()
    let changed = false
    if (activity.topic && !s.learn.topics.includes(activity.topic)) {
      s.learn.topics.push(activity.topic)
      changed = true
    }
    if (activity.ctStack && !s.learn.ctStacksCompleted.includes(activity.ctStack)) {
      s.learn.ctStacksCompleted.push(activity.ctStack)
      changed = true
    }
    if (!changed) return
    const stats = computeStats(s.attempts, s.learn, s.earned, now)
    s.earned = [...s.earned, ...evaluateBadges(stats, s.earned, now)]
    this.save(s)
  }

  async listAttempts(): Promise<AttemptRecord[]> {
    return this.load().attempts
  }

  async getLeaderboard(period: Period, cohort: CohortFilter, now: Date): Promise<LeaderboardView> {
    const s = this.load()
    const { start, end } = periodRangeTr(period, now)
    const startIso = start.toISOString()
    const endIso = end.toISOString()
    const myAttemptsInPeriod = s.attempts.filter(
      (a) => a.mode === 'assessment' && a.finishedAt >= startIso && a.finishedAt <= endIso
    )
    const myScore = periodScore(myAttemptsInPeriod)
    const myStats = computeStats(s.attempts, s.learn, s.earned, now)
    const myDisplayName = s.profile.public ? (s.profile.displayName ?? this.defaultDisplayName()) : null

    const meRow: LeaderboardRow = {
      id: ME_ID,
      displayName: myDisplayName ?? ANONYMOUS_LABEL,
      isMe: true,
      cohort: s.profile.cohort,
      periodScore: myScore.score,
      attemptsCount: myScore.attemptsCount,
      reachedAt: myScore.reachedAt,
      totalXp: myStats.totalXp,
      level: myStats.level,
      rank: null,
    }

    const cohortMatches = (c: Cohort | null) => cohort === 'all' || c === cohort
    const peerRows: LeaderboardRow[] = DEMO_PEERS.filter((p) => cohortMatches(p.cohort)).map((p) => {
      const row = demoPeriodRow(p, period, now)
      return {
        id: p.id,
        displayName: p.public && p.displayName ? p.displayName : ANONYMOUS_LABEL,
        isMe: false,
        cohort: p.cohort,
        periodScore: row.periodScore,
        attemptsCount: row.attemptsCount,
        reachedAt: row.reachedAt,
        totalXp: row.totalXp,
        level: row.level,
        rank: null,
      }
    })

    const rows = cohortMatches(s.profile.cohort) ? [...peerRows, meRow] : peerRows
    const ranked = rankRows(rows)

    return { period, cohort, generatedAt: now.toISOString(), isDemo: true, rows: ranked }
  }

  async getMonthlyReward(month: string): Promise<MonthlyReward | null> {
    return monthlyRewardFor(month)
  }

  async getRewardWinners(lastNMonths: number): Promise<RewardWinner[]> {
    return rewardWinnersHistory(lastNMonths, new Date())
  }
}

