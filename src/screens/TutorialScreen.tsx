import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../core/store'
import { engine } from '../audio/engineSingleton'
import { resolveLibrarySoundEx } from '../core/resolver'
import { tutorialProgress, type TutorialEvent } from '../core/flow'
import pointsData from '../data/auscultation-points.json'
import libraryData from '../data/library.json'
import type { AuscultationPoint, SoundRecord } from '../core/types'
import { PatientStage, type StageHandle } from '../ui/PatientStage'
import { Toolbar } from '../ui/Toolbar'
import { Footer, EcgDeco } from '../ui/chrome'
import { IconArrowRight, IconCheck } from '../ui/icons'

/** İlk kullanım öğreticisi (§45, madde 5 — wave 3): artık statik bir fotoğraf değil, gerçek
 *  `PatientStage` (öğrenme modu, heart.normal sesleri) üzerinde 3 rehberli adım: (1) stetoskobu
 *  sürükle, (2) bir odağa bırak, (3) Bell/Diyafram değiştir. İlerleme saf `tutorialProgress`
 *  fonksiyonuyla hesaplanır (bkz. core/flow.ts) — bileşen yalnız olayları toplayıp bu fonksiyona
 *  besler. Üç adım tamamlanınca kutlama mesajı + "Modlara geç" CTA'sı görünür. "Atla" bağlantısı
 *  her an adımları atlayıp devam etmeye izin verir; "Tekrar gösterme" onay kutusu korunur.
 *  Yardım modalındaki statik 6 adımlık `TutorialSteps` listesi bu ekrandan bağımsız, değişmedi. */

const STEP_TEXT = [
  { title: 'Stetoskobu sürükleyin', desc: 'Sağdaki hasta üzerinde stetoskopu tıklayıp sürüklemeye başlayın.' },
  { title: 'Bir odağa bırakın', desc: 'İşaretli oskültasyon noktalarından birinin üzerine bırakın — ses otomatik çalar.' },
  { title: 'Bell veya Diyaframı değiştirin', desc: 'Alt araç çubuğundan stetoskop kafasını değiştirin.' },
] as const

const points = pointsData.points as AuscultationPoint[]
const heartNormal = (libraryData.groups as unknown as { items: { key: string; bestPoints: string[] }[] }[])
  .flatMap((g) => g.items)
  .find((it) => it.key === 'heart.normal')
const tutorialFilterIds = heartNormal?.bestPoints

export function TutorialScreen() {
  const { state, dispatch } = useStore()
  const [dontShow, setDontShow] = useState(false)
  const [events, setEvents] = useState<TutorialEvent[]>([])
  const stageRef = useRef<StageHandle>(null)
  const initialHead = useRef(state.head)

  const progress = useMemo(() => tutorialProgress(events), [events])
  const addEvent = (e: TutorialEvent) => setEvents((prev) => (prev.includes(e) ? prev : [...prev, e]))

  // adım 3: head store'da global — öğretici mount olduğundaki değerden farklılaşınca tamamlanır
  useEffect(() => {
    if (state.head !== initialHead.current) addEvent('head')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.head])

  const soundFor = (pointId: string): SoundRecord | null =>
    resolveLibrarySoundEx('heart', 'normal', pointId).record

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
              <h1 className="tut-title">Nasıl Kullanılır?</h1>
              <p className="tut-lead">Aşağıdaki 3 adımı sağdaki hasta üzerinde bizzat deneyerek geçin.</p>
              <p className="tut-sub">Her adımı tamamladığınızda işaretlenir — sırayla yapmak zorunlu değildir.</p>

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
                  <strong>Harika, hazırsınız!</strong> Artık simülatörü kullanmayı biliyorsunuz.
                </div>
              )}

              <div className="tut-footer">
                <label className="tut-again">
                  <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
                  Tekrar gösterme
                </label>
                {progress.allDone ? (
                  <button className="btn primary" onClick={finish}>
                    Modlara geç <IconArrowRight />
                  </button>
                ) : (
                  <button className="hero-link tut-skip" onClick={finish}>
                    Atla
                  </button>
                )}
              </div>
            </div>

            <div className={`stage-card tut-stage-col ${progress.currentStep < 2 ? 'tut-highlight' : ''}`}>
              <PatientStage
                ref={stageRef}
                points={points}
                filterIds={tutorialFilterIds}
                view="front"
                head={state.head}
                volume={state.volume}
                showPoints
                showLabels
                bodyType="erkek"
                mode="learn"
                engine={engine}
                soundFor={soundFor}
                onVisit={() => addEvent('snap')}
                onDwell={() => undefined}
                onListen={() => undefined}
                onPlayingChange={() => undefined}
                onDragStart={() => addEvent('drag')}
              />
              <div className={progress.currentStep === 2 && !progress.allDone ? 'tut-highlight' : ''}>
                <Toolbar stageRef={stageRef} activePoint={null} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
