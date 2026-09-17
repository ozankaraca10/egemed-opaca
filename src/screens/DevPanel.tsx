import { useStore } from '../core/store'
import { bus } from '../core/events'
import { getImage } from '../core/images'
import { ALL_CASES } from '../data/pool'

/** Geliştirici teşhis paneli — yalnız dev build + ?dev=1. */
export function DevPanel() {
  const { state, runtime } = useStore()
  if (!runtime?.flags.dev) return null
  if (typeof window !== 'undefined' && !window.location.search.includes('dev=1')) return null
  const current = ALL_CASES.find((c) => c.id === state.currentCaseId)
  const img = getImage(current?.imageId)
  const log = bus.getLog().slice(-8)
  return (
    <aside className="dev-panel" aria-label="Geliştirici teşhisi">
      <h4><span>Opaca DEV</span></h4>
      <dl>
        <dt>Ekran</dt><dd>{state.screen}</dd>
        <dt>Mod</dt><dd>{state.mode}</dd>
        <dt>Vaka</dt><dd>{current?.id ?? '-'}</dd>
        <dt>Adım</dt><dd>{state.step}</dd>
        <dt>SCORM</dt><dd>{runtime.flags.scormVersion} {runtime.flags.scormAvailable ? '(algılandı)' : '(mock)'}</dd>
        <dt>Görüntü</dt><dd>{img ? `${img.id} · ${img.viewPosition} · ${img.width}×${img.height}` : '-'}</dd>
        <dt>Kutular</dt><dd>{img?.annotations.length ?? 0}</dd>
        <dt>Bölgeler</dt><dd>{state.telemetry.order.join(' › ') || '-'}</dd>
        <dt>Vaka süresi</dt><dd>{Math.round(state.caseElapsed / 1000)} sn</dd>
      </dl>
      <div className="scroller">
        {log.map((e, i) => (
          <div key={i}>· {e.type}</div>
        ))}
      </div>
    </aside>
  )
}
