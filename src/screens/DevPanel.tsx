import { useMemo } from 'react'
import { useStore } from '../core/store'
import { bus } from '../core/events'
import { resolveCaseSounds } from '../core/resolver'
import { ALL_CASES } from '../data/pool'

/** Geliştirici teşhis paneli (§38). Üretim öğrenci arayüzünde GÖRÜNMEZ; yalnız dev build + ?dev=1.
 *  wave 2 madde 0: DEV rozeti artık header'ın sağ ucunda gösterilir (bkz. ui/chrome.tsx Header) —
 *  footer'a binen eski sabit-konumlu rozet kaldırıldı. */
export function DevPanel() {
  const { state, runtime } = useStore()
  // D8: caseIndex havuz sıralamasına değil, tek doğruluk kaynağı currentCaseId'ye göre çözülür.
  const current = ALL_CASES.find((c) => c.id === state.currentCaseId)
  const resolved = useMemo(
    () => (current ? resolveCaseSounds(current.soundAssignments) : {}),
    [current]
  )
  const log = bus.getLog().slice(-8)

  // yalnız dev build + ?dev=1 ile açılır (§38)
  if (!runtime?.flags.dev) return null
  if (typeof window !== 'undefined' && !window.location.search.includes('dev=1')) return null

  return (
    <aside className="dev-panel" aria-label="Geliştirici teşhisi">
      <h4>
        <span>Ausculta DEV</span>
        <button className="close" title="Kapat">✕</button>
      </h4>
      <dl>
        <dt>Ekran</dt>
        <dd>{state.screen}</dd>
        <dt>Mod</dt>
        <dd>{state.mode}</dd>
        <dt>Vaka</dt>
        <dd>{current?.id ?? '-'}</dd>
        <dt>Adım</dt>
        <dd>{state.step}</dd>
        <dt>SCORM</dt>
        <dd>{runtime.flags.scormVersion} {runtime.flags.scormAvailable ? '(algılandı)' : '(mock)'}</dd>
        <dt>Head</dt>
        <dd>{state.head}</dd>
        <dt>View</dt>
        <dd>{state.view}</dd>
      </dl>
      <div className="scroller">
        {log.map((e, i) => (
          <div key={i}>· {e.type}{(e as { caseId?: string }).caseId ? ` ${String((e as { caseId?: string }).caseId)}` : ''}</div>
        ))}
      </div>
      {current && (
        <div className="dev-panel-sounds">
          <strong className="dev-accent">Ses haritası</strong>
          {current.soundAssignments.map((a) => {
            const rec = resolved[a.pointId]
            return (
              <div key={a.pointId} className="dev-panel-row">
                <div className="dev-warn">{a.pointId}</div>
                {rec ? (
                  <>
                    <div>→ {rec.id}</div>
                    <div className="dev-muted">
                      src: {rec.sourceFile} | lok: {rec.recordedLocation} | dur: {rec.durationSec}s
                    </div>
                  </>
                ) : (
                  <div className="dev-err">→ kayıt yok (eksik)</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}
