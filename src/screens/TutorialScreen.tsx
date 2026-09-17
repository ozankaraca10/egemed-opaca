import { useMemo, useState } from 'react'
import { useStore } from '../core/store'
import { IMAGES } from '../core/images'
import { ZONES } from '../data/zones'
import { tutorialProgress, type TutorialEvent } from '../core/flow'
import type { Point } from '../core/geometry'
import { FilmViewer } from '../ui/FilmViewer'
import { Footer, EcgDeco } from '../ui/chrome'
import { IconArrowRight, IconCheck } from '../ui/icons'

/** İlk kullanım öğreticisi: gerçek görüntüleyici üzerinde üç rehberli adım. */

const STEP_TEXT = [
  { title: 'Filmi yakınlaştırın', desc: 'Fare tekerleğini ya da alttaki + düğmesini kullanın; sürükleyerek kaydırın.' },
  { title: 'Pencereyi değiştirin', desc: 'Pencere listesinden Kemik ya da Akciğer seçin veya parlaklık/kontrastı ayarlayın.' },
  { title: 'Film üzerine işaret koyun', desc: 'İşaretle aracı açık; filmde herhangi bir noktaya tıklayın.' },
] as const

const demoImage = IMAGES.find((r) => r.validationStatus === 'validated' && r.viewPosition === 'PA') ?? IMAGES[0]

export function TutorialScreen() {
  const { dispatch } = useStore()
  const [dontShow, setDontShow] = useState(false)
  const [events, setEvents] = useState<TutorialEvent[]>([])
  const [mark, setMark] = useState<Point | null>(null)
  const progress = useMemo(() => tutorialProgress(events), [events])
  const add = (e: TutorialEvent) => setEvents((prev) => (prev.includes(e) ? prev : [...prev, e]))

  const finish = () => {
    if (dontShow) dispatch({ type: 'tutorialDone', done: true })
    dispatch({ type: 'tutorialSeen' })
    dispatch({ type: 'goto', screen: 'modes' })
  }

  return (
    <>
      <EcgDeco />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container screen-body">
          <div className="tutorial-wrap">
            <div className="tut-text-col">
              <h1 className="tut-title">Nasıl kullanılır?</h1>
              <p className="tut-lead">Üç adımı sağdaki film üzerinde deneyin.</p>
              <p className="tut-sub">Tamamlanan adımlar işaretlenir; sıra zorunlu değildir.</p>
              <div className="tut-steps tut-steps-live">
                {STEP_TEXT.map((s, i) => (
                  <div className={`tut-step ${progress.steps[i] ? 'done' : ''} ${!progress.steps[i] && progress.currentStep === i ? 'active' : ''}`} key={s.title}>
                    <span className="num">{progress.steps[i] ? <IconCheck width={14} height={14} /> : i + 1}</span>
                    <div>
                      <h5>{s.title}</h5>
                      <p>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              {progress.allDone && (
                <div className="tut-celebrate" role="status">
                  <strong>Hazırsınız.</strong> Vakalarda okuma bölgeleri incelendikçe listede işaretlenir.
                </div>
              )}
              <div className="tut-footer">
                <label className="tut-again">
                  <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
                  Tekrar gösterme
                </label>
                {progress.allDone ? (
                  <button className="btn primary" onClick={finish}>Modlara geç <IconArrowRight /></button>
                ) : (
                  <button className="hero-link tut-skip" onClick={finish}>Atla</button>
                )}
              </div>
            </div>
            <div className={`stage-card film-card tut-stage-col ${progress.allDone ? '' : 'tut-highlight'}`}>
              <FilmViewer
                image={demoImage}
                zones={ZONES}
                showZones
                showAnnotations={false}
                markEnabled
                mark={mark}
                onMark={(p) => { setMark(p); add('mark') }}
                onTool={(t) => { if (t === 'zoom') add('zoom'); if (t === 'window') add('window') }}
                label="Öğretici film görüntüleyici"
              />
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
