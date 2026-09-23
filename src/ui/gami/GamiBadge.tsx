import { useEffect, useRef, useState } from 'react'
import * as Icons from '../icons'
import { GamiSeg } from './GamiSeg'
import { CATEGORY_LABEL, TIER_LABEL, trDate, type BadgeView } from '../../gamification/badgeView'
import type { BadgeCategory } from '../../gamification/badges'

type IconName = keyof typeof Icons
function BadgeIcon({ name, size }: { name: string; size: number }) {
  const C = (Icons as Record<string, (p: { width?: number; height?: number }) => React.ReactElement>)[`Icon${name}` as IconName]
  return C ? <C width={size} height={size} /> : null
}

const badgeName = (v: BadgeView) => (v.def.tier ? `${v.def.name} · ${TIER_LABEL[v.def.tier]}` : v.def.name)
const stateText = (v: BadgeView) =>
  v.state === 'earned' ? `kazanıldı ${trDate(v.earnedAt!)}` : v.state === 'progress' ? `ilerleme ${v.value}/${v.max}` : `kilitli, koşul: ${v.rule}`

export function GamiBadgeIc({ v, size = 'md' }: { v: BadgeView; size?: 'sm' | 'md' | 'lg' }) {
  const cls = v.state === 'earned' ? (v.def.tier ? ` tier-${v.def.tier}` : '') : v.state === 'progress' ? ' progress' : ' locked'
  const px = size === 'lg' ? 40 : size === 'sm' ? 22 : 28
  return (
    <span className={`gami-badge-ic gami-cat-${v.def.cat}${cls}${size === 'sm' ? ' sm' : ''}`} aria-hidden="true">
      <BadgeIcon name={v.def.icon} size={px} />
      {v.state === 'locked' && <span className="lock"><Icons.IconLock width={12} height={12} /></span>}
    </span>
  )
}

/** Rozet kartı (T0 onaylı tasarım): kategori renkli madalyon, kategori etiketi, ad, açıklama, alt satır. */
export function GamiBadgeCard({ v, onOpen }: { v: BadgeView; onOpen: (v: BadgeView, el: HTMLButtonElement) => void }) {
  const state = v.state === 'earned' ? 'is-earned' : v.state === 'progress' ? 'is-progress' : 'is-locked'
  return (
    <button
      className={`gami-badge gami-cat-${v.def.cat} ${state}`}
      type="button"
      aria-label={`${badgeName(v)} (${CATEGORY_LABEL[v.def.cat]}) — ${stateText(v)}`}
      onClick={(e) => onOpen(v, e.currentTarget)}
    >
      <GamiBadgeIc v={v} />
      <span className="cat">{CATEGORY_LABEL[v.def.cat]}</span>
      <span className="nm">{badgeName(v)}</span>
      <span className="ds">{v.def.desc}</span>
      <span className="ft">
        {v.state === 'earned' && <><Icons.IconCheck width={13} height={13} /> {trDate(v.earnedAt!)}</>}
        {v.state === 'progress' && <><span className="domain-bar"><i style={{ width: `${(v.value / v.max) * 100}%` }} /></span><span>{v.value}/{v.max}</span></>}
        {v.state === 'locked' && <><Icons.IconLock width={13} height={13} /> {v.rule}</>}
      </span>
    </button>
  )
}

type Filter = 'all' | 'earned' | 'progress' | 'locked'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tümü' }, { id: 'earned', label: 'Kazanılanlar' }, { id: 'progress', label: 'Devam edenler' }, { id: 'locked', label: 'Kilitli' },
]

/** Rozet koleksiyonu: filtre, sayaç, kategori lejantı, ızgara, detay penceresi. */
export function GamiBadgeGrid({ views, onStudy, id }: { views: BadgeView[]; onStudy: (key: string) => void; id?: string }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<{ v: BadgeView; from: HTMLButtonElement } | null>(null)
  const shown = filter === 'all' ? views : views.filter((v) => v.state === filter)
  const earned = views.filter((v) => v.state === 'earned').length
  return (
    <section className="card" id={id} aria-labelledby="gami-badges-t">
      <div className="gami-card-head">
        <h3 id="gami-badges-t">Rozet koleksiyonu</h3>
        <GamiSeg options={FILTERS} value={filter} onChange={setFilter} label="Rozet filtresi" />
        <span className="gami-count">{earned} / {views.length} kazanıldı</span>
      </div>
      <div className="gami-cat-legend" aria-label="Rozet kategorileri">
        {(Object.keys(CATEGORY_LABEL) as BadgeCategory[]).map((c) => <span key={c} className={`gami-cat-${c}`}><i />{CATEGORY_LABEL[c]}</span>)}
      </div>
      <div className="gami-badge-grid">
        {shown.map((v) => <GamiBadgeCard key={v.def.id} v={v} onOpen={(bv, el) => setOpen({ v: bv, from: el })} />)}
      </div>
      {shown.length === 0 && <p className="gami-note">Bu filtrede rozet yok.</p>}
      {open && <GamiBadgeDetail v={open.v} returnTo={open.from} onClose={() => setOpen(null)} onStudy={onStudy} />}
    </section>
  )
}

/** Son kazanılan 3 rozet (kompakt). */
export function GamiRecentBadges({ views, onAll, onStudy }: { views: BadgeView[]; onAll: () => void; onStudy: (key: string) => void }) {
  const [open, setOpen] = useState<{ v: BadgeView; from: HTMLButtonElement } | null>(null)
  const recent = views.filter((v) => v.state === 'earned').slice(0, 3)
  return (
    <>
      {recent.length ? (
        <div className="gami-recent">{recent.map((v) => <GamiBadgeCard key={v.def.id} v={v} onOpen={(bv, el) => setOpen({ v: bv, from: el })} />)}</div>
      ) : (
        <p className="gami-note">Henüz rozet yok — ilk değerlendirmen "İlk Adım" rozetini getirir.</p>
      )}
      <p className="gami-note"><button className="gami-link" type="button" onClick={onAll}>Tümünü gör <Icons.IconChevronRight width={14} height={14} /></button></p>
      {open && <GamiBadgeDetail v={open.v} returnTo={open.from} onClose={() => setOpen(null)} onStudy={onStudy} />}
    </>
  )
}

/** Rozet detay penceresi (ConfirmModal kalıbı: Esc kapatır, odak tuzağı, kapanınca odak karta döner). */
export function GamiBadgeDetail({ v, returnTo, onClose, onStudy }: { v: BadgeView; returnTo: HTMLElement; onClose: () => void; onStudy: (key: string) => void }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const f = cardRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
      if (!f || !f.length) return
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); returnTo.focus() }
  }, [onClose, returnTo])
  const left = v.max - v.value
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gami-bd-t" onClick={onClose}>
      <div className="modal-card" ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 id="gami-bd-t">Rozet</h3>
          <button ref={closeRef} className="modal-close" type="button" aria-label="Kapat" onClick={onClose}><Icons.IconClose /></button>
        </div>
        <div className="modal-body">
          <div className={`gami-badge-detail gami-cat-${v.def.cat}`}>
            <GamiBadgeIc v={v} size="lg" />
            <span className="cat">{CATEGORY_LABEL[v.def.cat]} rozeti</span>
            <h4>{badgeName(v)}</h4>
            <p className="rule">{v.def.desc}{v.def.cat === 'topic' || v.def.cat === 'skill' ? ' Yalnız değerlendirme modundaki doğru yanıtlar sayılır.' : ''}</p>
            {v.state === 'earned' ? (
              <span className="badge green">Kazanıldı · {trDate(v.earnedAt!)}</span>
            ) : v.def.id === 'podium' ? (
              <span className="gami-count">Sunucu bağlantısı gelince kazanılabilir (şu an demo sıralama).</span>
            ) : (
              <>
                <span className="domain-bar" aria-hidden="true"><i style={{ width: `${(v.value / v.max) * 100}%` }} /></span>
                <span className="gami-count">{v.value} / {v.max} — {left} kaldı</span>
              </>
            )}
            {v.studyKey && v.state !== 'earned' && (
              <button className="btn green small" type="button" onClick={() => { onClose(); onStudy(v.studyKey!) }}>
                <Icons.IconBook width={16} height={16} /> Bu konuyu öğrenme modunda çalış
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
