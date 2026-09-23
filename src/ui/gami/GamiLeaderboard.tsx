import { useState } from 'react'
import { IconArrowUp, IconChevronRight, IconClock, IconGift, IconLock } from '../icons'
import { GamiAvatar } from './GamiAvatar'
import { GamiModal } from './GamiModal'
import type { LeaderboardRow, MonthlyReward, RewardWinner, Cohort } from '../../gamification/types'
import type { TableItem, MeStatus } from '../../gamification/leaderboardView'

const tr1 = (n: number | null) => (n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const trInt = (n: number) => n.toLocaleString('tr-TR')
const nameOf = (r: LeaderboardRow) => (r.isPublic ? r.displayName : null)
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
export const monthTitle = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`

/** Değişim oku (yalnız "ben" satırı): renk + metin (yalnız renkle bilgi verilmez). */
export function GamiDelta({ delta }: { delta: number | null }) {
  if (delta === null) return null
  if (delta === 0) return <span className="gami-delta same" aria-label="önceki döneme göre sıra değişmedi">—</span>
  const up = delta > 0
  return (
    <span className={`gami-delta ${up ? 'up' : 'down'}`} aria-label={`önceki döneme göre ${Math.abs(delta)} sıra ${up ? 'yukarı' : 'aşağı'}`}>
      <span style={{ display: 'inline-flex', transform: up ? undefined : 'rotate(180deg)' }}><IconArrowUp width={12} height={12} /></span>{Math.abs(delta)}
    </span>
  )
}

/** Ayın ödülü şeridi: tam (Bu ay) ya da kompakt (diğer sekmeler). Metinler yapılandırmadan (MonthlyReward). */
export function GamiRewardBanner({ reward, compact, countdown, status, onTerms, onMonthly, onStatusAction }: {
  reward: MonthlyReward; compact: boolean; countdown: string; status: MeStatus | null
  onTerms: (el: HTMLElement) => void; onMonthly: () => void; onStatusAction: (a: NonNullable<MeStatus['action']>) => void
}) {
  if (compact) {
    return (
      <div className="card gami-reward compact">
        <span className="gami-badge-ic gami-cat-streak" aria-hidden="true"><IconGift width={16} height={16} /></span>
        <span className="txt">Bu ayın ödülü: <b>{reward.title}</b> · {countdown} kaldı</span>
        <button className="gami-link" type="button" onClick={onMonthly}>Aylık sıralamayı gör <IconChevronRight width={14} height={14} /></button>
      </div>
    )
  }
  const chipCls = status?.tone === 'green' ? 'gami-chip-green' : status?.tone === 'purple' ? 'gami-chip-purple' : 'gray'
  return (
    <section className="card gami-reward" aria-labelledby="gami-rw-t">
      <span className="gami-badge-ic gami-cat-streak" aria-hidden="true"><IconGift width={30} height={30} /></span>
      <div>
        <span className="rs-lbl">{monthTitle(reward.month).toLocaleUpperCase('tr-TR')} ÖDÜLÜ · {reward.sponsor}</span>
        <h2 id="gami-rw-t">{reward.title}</h2>
        <p>{reward.description}</p>
      </div>
      <div className="gami-reward-meta">
        <span className="badge gray" aria-live="off"><IconClock width={14} height={14} /> Kapanışa {countdown}</span>
        {status && (status.action ? (
          <button type="button" className={`badge ${chipCls}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => onStatusAction(status.action!)}>Senin durumun: {status.text}</button>
        ) : (
          <span className={`badge ${chipCls}`}>Senin durumun: {status.text}</span>
        ))}
        <button className="btn outline small" type="button" onClick={(e) => onTerms(e.currentTarget)}>Katılım koşulları</button>
      </div>
    </section>
  )
}

export function GamiRewardTerms({ reward, returnTo, onClose }: { reward: MonthlyReward; returnTo: HTMLElement | null; onClose: () => void }) {
  return (
    <GamiModal title="Katılım koşulları" onClose={onClose} returnTo={returnTo}>
      <p style={{ marginTop: 0 }}><b>{reward.title}</b> — {reward.sponsor}</p>
      <ul>{reward.terms.map((t) => <li key={t}>{t}</li>)}</ul>
      <p className="gami-note">Ödül, koşulları sağlayanlar arasında ilk {reward.winnersCount} kişiye verilir; koşulu sağlamayan biri ilk {reward.winnersCount}'te olsa bile sıradaki uygun kişi ödül sırasına geçer.</p>
    </GamiModal>
  )
}

/** Podyum: DOM sırası 1-2-3 (ekran okuyucu), görsel 2-1-3 (CSS order). */
export function GamiPodium({ rows, candidates }: { rows: LeaderboardRow[]; candidates: Set<string> | null }) {
  const top = rows.filter((r) => r.rank !== null && r.rank <= 3).sort((a, b) => a.rank! - b.rank!)
  if (top.length < 3) return null
  return (
    <ol className="gami-podium" aria-label="İlk 3" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {top.map((r) => (
        <li key={r.id} className={`card gami-podium-card r${r.rank}${r.isMe ? ' me' : ''}`}>
          <span className={`gami-medal m${r.rank}`} aria-label={`${r.rank}. sıra`}>{r.rank}</span>
          {candidates?.has(r.id) && <span className="badge orange">Ödül adayı</span>}
          <GamiAvatar id={r.id} name={nameOf(r)} size="lg" />
          <span className="nm">{r.isMe ? `Sen · ${r.displayName}` : r.displayName}</span>
          <span className="sc">{tr1(r.periodScore)}</span>
          <span className="sc-lbl">Dönem puanı</span>
          <span className="sub">Seviye {r.level} · {r.attemptsCount} deneme</span>
        </li>
      ))}
    </ol>
  )
}

/** Tablo (masaüstü) + kart listesi (<600 px). */
export function GamiLeaderboardTable({ items, candidates, meDelta }: { items: TableItem[]; candidates: Set<string> | null; meDelta: number | null }) {
  if (items.length === 0) return null
  const cand = (r: LeaderboardRow) => candidates?.has(r.id) ? <> <span className="badge orange" style={{ fontSize: 'var(--fs-xs)', padding: '1px 8px' }}>Ödül adayı</span></> : null
  return (
    <>
      <div className="table-scroll gami-lb-table-wrap">
        <table className="report-table report-table-v2 gami-lb-table">
          <caption className="sr-only">Liderlik tablosu</caption>
          <thead><tr><th>#</th><th>Kullanıcı</th><th className="num">Dönem puanı</th><th className="num">Deneme</th><th className="num">Seviye</th><th className="num">Toplam XP</th></tr></thead>
          <tbody>
            {items.map((it, i) => it.kind === 'gap' ? (
              <tr key={`gap-${i}`} className="gap" aria-hidden="true"><td colSpan={6}>⋯</td></tr>
            ) : (
              <tr key={it.row.id} className={it.row.isMe ? 'me' : undefined} aria-current={it.row.isMe ? 'true' : undefined}>
                <td className="rank">{it.row.rank}</td>
                <td><span className="user"><GamiAvatar id={it.row.id} name={nameOf(it.row)} />{it.row.isMe ? <>Sen <small>· {it.row.displayName}</small></> : it.row.displayName}{cand(it.row)}</span></td>
                <td className="num score">{tr1(it.row.periodScore)}{it.row.isMe && <GamiDelta delta={meDelta} />}</td>
                <td className="num">{it.row.attemptsCount}</td>
                <td className="num">{it.row.level}</td>
                <td className="num">{trInt(it.row.totalXp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="gami-lb-cards" aria-label="Liderlik tablosu">
        {items.map((it, i) => it.kind === 'gap' ? <li key={`gap-${i}`} className="gap" aria-hidden="true">⋯</li> : (
          <li key={it.row.id} className={it.row.isMe ? 'me' : undefined}>
            <span className="rank">{it.row.rank}</span>
            <GamiAvatar id={it.row.id} name={nameOf(it.row)} />
            <span className="nm">{it.row.isMe ? `Sen · ${it.row.displayName}` : it.row.displayName}</span>
            <span className="sub">Seviye {it.row.level} · {it.row.attemptsCount} deneme · {trInt(it.row.totalXp)} XP</span>
            <span className="sc">{tr1(it.row.periodScore)}{it.row.isMe && <GamiDelta delta={meDelta} />}</span>
          </li>
        ))}
      </ol>
    </>
  )
}

/** Gizlilik kartı: ad LMS'ten; yalnız "Sıralamada adımı göster" anahtarı + dönem seçimi (takma ad yok). */
export function GamiPrivacyCard({ name, isPublic, cohort, onChange, id }: {
  name: string | null; isPublic: boolean; cohort: Cohort | null; onChange: (patch: { public?: boolean; cohort?: Cohort | null }) => void; id?: string
}) {
  return (
    <div className="card gami-privacy" id={id}>
      <IconLock width={22} height={22} />
      <div className="txt">
        <b>{isPublic ? 'Sıralamada adınla görünüyorsun.' : 'Sıralamada "Anonim öğrenci" olarak görünüyorsun.'}</b>
        <span>Adın Moodle kaydından alınır{name ? ` (${name})` : ''}. İstersen anonim görünebilirsin; ayın ödülüne aday olmak için adınla görünmelisin.</span>
      </div>
      <div className="form">
        <label>Dönemin
          <select className="gami-select" value={cohort ?? ''} onChange={(e) => onChange({ cohort: e.target.value ? (Number(e.target.value) as Cohort) : null })}>
            <option value="">Belirtilmedi</option>
            {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>Dönem {c}</option>)}
          </select>
        </label>
        <label>
          <button className="gami-switch" role="switch" type="button" aria-checked={isPublic} aria-label="Sıralamada adımı göster" onClick={() => onChange({ public: !isPublic })} />
          Sıralamada adımı göster
        </label>
      </div>
    </div>
  )
}

/** Önceki ayların kazananları (katlanır). Yalnız görünen adlar. */
export function GamiRewardHistory({ winners }: { winners: RewardWinner[] }) {
  const [open, setOpen] = useState(false)
  const months = [...new Set(winners.map((w) => w.month))]
  if (!months.length) return null
  return (
    <details className="card gami-history" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><IconChevronRight width={16} height={16} /> Önceki ayların kazananları</summary>
      <div className="gami-history-list">
        {months.map((m) => (
          <div className="gami-history-month" key={m}>
            <b>{monthTitle(m)}</b>
            <ol>{winners.filter((w) => w.month === m).map((w) => (
              <li key={w.rank}><span className={`gami-medal m${w.rank}`} aria-label={`${w.rank}.`}>{w.rank}</span>{w.displayName}</li>
            ))}</ol>
          </div>
        ))}
      </div>
    </details>
  )
}
