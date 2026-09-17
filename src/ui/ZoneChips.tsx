import type { ReadingZone, ZoneVisit } from '../core/types'
import { stepProgress, zoneChipState } from '../core/flow'
import { STEP_TITLES } from '../data/zones'

/** ABCDE okuma listesi (Ausculta RegionChips karşılığı). Çipe tıklamak görüntüyü o bölgeye yakınlaştırır.
 *  Değerlendirmede görsel olarak gizlenir; klavye kullanıcıları için odakta görünür kalır. */
interface Props {
  zones: ReadingZone[]
  visits: Record<string, Pick<ZoneVisit, 'dwellMs'> | undefined>
  activeZones: string[]
  minDwellMs: number
  onSelect: (zoneId: string) => void
  highlight?: string[]
  hideUntilFocus?: boolean
}

const STEPS = ['A', 'B', 'C', 'D', 'E'] as const

export function ZoneChips({ zones, visits, activeZones, minDwellMs, onSelect, highlight, hideUntilFocus }: Props) {
  const progress = stepProgress(zones, visits, minDwellMs)
  return (
    <div className={`zone-chips ${hideUntilFocus ? 'sr-only-until-focus' : ''}`} aria-label="Sistematik okuma bölgeleri">
      {STEPS.map((step) => {
        const list = zones.filter((z) => z.step === step)
        if (!list.length) return null
        const p = progress[step]
        const complete = p && p.done === p.total
        return (
          <div className={`zone-step ${complete ? 'is-complete' : ''}`} key={step}>
            <span className="zone-step-head" title={STEP_TITLES[step]}>
              <b>{step}</b>
              <span className="zone-step-title">{STEP_TITLES[step]}</span>
            </span>
            <span className="zone-step-list">
              {list.map((z) => {
                const st = zoneChipState(z.id, activeZones, visits, minDwellMs)
                const hl = highlight?.includes(z.id)
                return (
                  <button
                    type="button"
                    key={z.id}
                    className={`zone-chip ${st === 'active' ? 'is-active' : st === 'inspected' ? 'is-inspected' : ''} ${hl ? 'is-suggested' : ''}`}
                    aria-pressed={st === 'active'}
                    title={z.detail}
                    onClick={() => onSelect(z.id)}
                  >
                    {st === 'inspected' && <span className="zc-check" aria-hidden="true">✓</span>}
                    {z.label}
                  </button>
                )
              })}
            </span>
          </div>
        )
      })}
    </div>
  )
}
