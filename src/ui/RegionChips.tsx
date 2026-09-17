import type { AuscultationPoint, PatientView, PointVisit } from '../core/types'
import { regionChipState } from '../core/flow'

/** madde 1 (wave 2): "Bölge listesi" artık gerçek bir gezinme ögesi — SimulationScreen ve
 *  LearnScreen tarafından ortak kullanılır. Durumlar: aktif (stetoskop üstünde, dolu mavi),
 *  dinlenmiş (bu oturumda en az bir kez ses çalındı, ✓), varsayılan (kontur). */
interface Props {
  points: AuscultationPoint[]
  view: PatientView
  pointIds?: string[]
  activePoint: string | null
  visits: Record<string, Pick<PointVisit, 'listenMs'> | undefined>
  onSelect: (pointId: string) => void
  /** Değerlendirmede: klavye odaklanana kadar ekran okuyucu dışında gizli (§21 kuralı korunur) */
  hideUntilFocus?: boolean
  /** Diğer görünümde dinlenmemiş nokta varsa soluk ipucu metni (yalnız Öğrenme/Uygulama) */
  otherViewHint?: string | null
  title?: string
}

export function RegionChipList({
  points, view, pointIds, activePoint, visits, onSelect, hideUntilFocus, otherViewHint, title = 'Dinleme bölgeleri',
}: Props) {
  const visible = points.filter((p) => p.view === view && (!pointIds || pointIds.includes(p.id)))
  const wrapCls = hideUntilFocus ? 'sr-only-until-focus' : ''
  return (
    <>
      <div className={`region-list-title ${wrapCls}`}>{title}</div>
      <div className={`region-list ${wrapCls}`}>
        {visible.map((p) => {
          const st = regionChipState(p.id, activePoint, visits)
          return (
            <button
              key={p.id}
              type="button"
              className={st === 'active' ? 'is-active' : st === 'listened' ? 'is-listened' : ''}
              aria-pressed={st === 'active'}
              onClick={() => onSelect(p.id)}
            >
              {st === 'listened' && <span className="rc-check" aria-hidden="true">✓</span>}
              {p.fullLabel}
            </button>
          )
        })}
        {otherViewHint && <span className="region-list-hint">{otherViewHint}</span>}
      </div>
    </>
  )
}
