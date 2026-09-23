import { DOMAIN_META, WEAK_DOMAIN_PCT } from './domainMeta'
import type { AttemptRecord } from '../../gamification/types'

/** Alan bazlı performans: dönemdeki değerlendirmelerin alan yüzdelerinin ortalaması (ResultsScreen etiketleri). */
export function GamiDomainPanel({ assessments }: { assessments: AttemptRecord[] }) {
  const rows = DOMAIN_META.map((d) => {
    const vals = assessments.map((a) => a.domains[d.key]).filter((v): v is number => typeof v === 'number')
    return { ...d, pct: vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null }
  }).filter((r) => r.pct !== null)
  if (rows.length === 0) return <p className="gami-note">Bu dönemde değerlendirme oturumu yok.</p>
  return (
    <div className="domain-rows gami-domains">
      {rows.map((r) => (
        <div className="domain-row" key={r.key}>
          <span className="dr-ic">{r.icon}</span>
          <span className="dr-lbl">{r.label}{r.pct! < WEAK_DOMAIN_PCT && <> <span className="badge orange">zayıf</span></>}</span>
          <span className="domain-bar" aria-hidden="true"><i style={{ width: `${r.pct}%` }} /></span>
          <span className="dr-pct">%{r.pct}</span>
        </div>
      ))}
    </div>
  )
}
