import { IconCheckCircle, IconChevronRight, IconFlame } from '../icons'
import { GamiAvatar } from './GamiAvatar'
import type { GamiView } from '../../gamification/useGami'
import type { LeaderboardView } from '../../gamification/types'

const tr = (n: number) => n.toLocaleString('tr-TR')

function LevelRing({ pct, children }: { pct: number; children: React.ReactNode }) {
  const c = 2 * Math.PI * 28
  return (
    <div className="gami-level-ring">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="track" cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle className="prog" cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(c * Math.max(0, Math.min(1, pct))).toFixed(1)} 999`} transform="rotate(-90 32 32)" />
      </svg>
      {children}
    </div>
  )
}

/** Başarılarım profil şeridi (tasarım promptu §4): seviye/XP · seri · değerlendirme sayısı · ortalama · haftalık sıra. */
export function GamiProfileStrip({ view, periodAssessments, periodPractice, periodAvg, periodLabel, week, onLeaderboard }: {
  view: GamiView
  periodAssessments: number
  periodPractice: number
  periodAvg: number | null
  periodLabel: string
  week: LeaderboardView | null
  onLeaderboard: () => void
}) {
  const { level, streak, state } = view
  const span = level.levelEndXp - level.levelStartXp
  const me = week?.rows.find((r) => r.isMe)
  const ranked = week?.rows.filter((r) => r.rank !== null).length ?? 0
  const topPct = me?.rank && ranked ? Math.max(1, Math.ceil((me.rank / ranked) * 100)) : null
  const pass = periodAvg !== null && periodAvg >= 80
  return (
    <div className="results-summary-strip gami-profile">
      <div className="rs-box">
        <div className="gami-level">
          <LevelRing pct={level.xpIntoLevel / span}>
            <GamiAvatar id="me" name={state.profile.public ? state.profile.displayName ?? 'Sen' : null} />
          </LevelRing>
          <div>
            <b>Seviye {level.level}</b>
            <small>{tr(level.xpIntoLevel)} / {tr(span)} XP</small>
          </div>
        </div>
        <span className="rs-lbl">Sonraki seviyeye {tr(level.xpToNext)} XP</span>
      </div>
      <div className="rs-box gami-streak">
        <div className="rs-num"><IconFlame width={20} height={20} /> {streak.current} gün</div>
        <span className="gami-sub">En uzun seri {streak.longest} gün</span>
        <span className="rs-lbl">Günlük seri</span>
      </div>
      <div className="rs-box">
        <div className="rs-num">{periodAssessments}</div>
        <span className="gami-sub">+{periodPractice} uygulama vakası</span>
        <span className="rs-lbl">Değerlendirme oturumu</span>
      </div>
      <div className="rs-box">
        {periodAvg === null ? (
          <div className="rs-num">—</div>
        ) : (
          <div className={`rs-status ${pass ? 'pass' : 'fail'}`}><IconCheckCircle width={16} height={16} /> %{Math.round(periodAvg)}</div>
        )}
        <span className="gami-sub">Eşik 80 · {periodLabel}</span>
        <span className="rs-lbl">Ortalama başarı</span>
      </div>
      <button className="rs-box gami-rank-box" type="button" onClick={onLeaderboard}>
        {me?.rank ? (
          <div className="rs-num">{me.rank}. <span className="gami-sub">/ {ranked}</span></div>
        ) : (
          <div className="rs-num">—</div>
        )}
        <span className="gami-sub">{me?.rank && topPct ? `İlk %${topPct} içinde · bu hafta` : 'Bu hafta sıralamada değilsin'}</span>
        <span className="gami-link">Liderlik Tahtası <IconChevronRight width={14} height={14} /></span>
      </button>
    </div>
  )
}
