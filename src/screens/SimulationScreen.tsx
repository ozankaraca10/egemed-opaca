import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuscultationPoint, CaseDef, CaseResult, Question, ScoringWeights } from '../core/types'
import pointsData from '../data/auscultation-points.json'
import { ALL_CASES, poolFor } from '../data/pool'
import { sampleSession, SESSION_SIZE } from '../core/session'
import type { BodyType } from '../ui/PatientStage'
import { engine } from '../audio/engineSingleton'
import { resolveCaseSoundsEx, resolveCaseSounds, assessmentPointFilter } from '../core/resolver'
import { useStore, computeAggregate } from '../core/store'
import { nextActionForSubmit, countUnlistenedInOtherView, otherViewHintText } from '../core/flow'
import { bus } from '../core/events'
import { PatientStage, type StageHandle } from '../ui/PatientStage'
import { Toolbar } from '../ui/Toolbar'
import { QuestionCard, FeedbackCard } from '../ui/Questions'
import { RegionChipList } from '../ui/RegionChips'
import { Footer, EcgDeco } from '../ui/chrome'
import { PediatricRefModal } from '../ui/PediatricRefModal'
import { IconDoc, IconArrowRight, IconInfo } from '../ui/icons'

/** Simülasyon ekranı — Uygulama & Değerlendirme (§3B, §3C): hasta solda, olgu/görev/soru sağda. */

const cases = ALL_CASES
const points = pointsData.points as AuscultationPoint[]

export function SimulationScreen() {
  const { state, dispatch, runtime } = useStore()
  // oturum örneklemi: rastgele 10 vaka (yoksa havuzun tamamı)
  const sessionIds = state.mode === 'assessment' ? state.session.assessmentIds : state.session.practiceIds
  const byId = new Map(cases.map((c) => [c.id, c]))
  const sessionCases = sessionIds.map((id) => byId.get(id)).filter((c): c is CaseDef => !!c)
  const caseList = sessionCases.length ? sessionCases : poolFor(state.mode)
  const caseDef = caseList[state.caseIndex] ?? caseList[0]

  // K3: SCORM devam ettirmede oturum örneklemi boş kalırsa (eski/bozuk suspend verisi),
  // aynı tohumla yeniden üretip kalıcı hale getir — tohum korunuyorsa aynı 10 vaka çıkar.
  useEffect(() => {
    if (sessionCases.length > 0 || state.mode === 'learn') return
    const seed = state.session.seed || Date.now()
    const ids = sampleSession(poolFor(state.mode), seed, SESSION_SIZE)
    dispatch({
      type: 'startSession',
      practiceIds: state.mode === 'practice' ? ids : state.session.practiceIds,
      assessmentIds: state.mode === 'assessment' ? ids : state.session.assessmentIds,
      seed,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCases.length, state.mode])
  const stageRef = useRef<StageHandle>(null)
  const [activePoint, setActivePoint] = useState<string | null>(null)
  const [pedModalOpen, setPedModalOpen] = useState(false)

  const isAssessment = state.mode === 'assessment'
  const resolved = useMemoSounds(caseDef)
  // O7: değerlendirmede kaydı gerçekten o bölgeden alınmamış (posterior fallback) noktalar sunulmaz
  const pointIds = useMemo(
    () => (isAssessment ? assessmentPointFilter(caseDef.soundAssignments) : caseDef.soundAssignments.map((a) => a.pointId)),
    [caseDef, isAssessment]
  )
  const q: Question | undefined = caseDef.questions[state.step]
  const canSubmit = !!q && (state.answers[q.id]?.length ?? 0) > 0
  const revealed = q ? !!state.revealed[q.id] : false
  const isPediatricCase = (caseDef as CaseDef & { population?: string }).population === 'pediatrik'

  // vaka bitince: aggregate + SCORM raporu + sonuç ekranı
  useEffect(() => {
    if (state.caseIndex < caseList.length) return
    const agg = computeAggregate(state.caseResults)
    if (state.mode === 'assessment') {
      runtime?.reportScore(agg.total, agg.mastery, true)
      bus.emit({ type: 'assessment_completed', total: agg.total, at: Date.now() })
    }
    dispatch({ type: 'setResults', results: state.caseResults })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.caseIndex])

  const shownAtRef = useRef<Record<string, number>>({})

  // görüntülenen vakayı store'a bildir (havuz/ders fark edilmez; tek doğruluk kaynağı)
  useEffect(() => {
    if (!caseDef) return
    dispatch({ type: 'caseMount', caseDef })
    bus.emit({ type: 'case_started', caseId: caseDef.id, mode: state.mode, at: Date.now() })
    void resolveCaseSounds(caseDef.soundAssignments)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseDef.id])

  // madde 5: olgu kartı yeni vakada 600ms kısa vurgu (kenar parlaması)
  const [caseFlash, setCaseFlash] = useState(false)
  useEffect(() => {
    setCaseFlash(true)
    const t = window.setTimeout(() => setCaseFlash(false), 600)
    return () => window.clearTimeout(t)
  }, [caseDef.id])

  // madde 5: değerlendirmede vaka değişince 1.4s geçiş paneli (ilk vaka hariç); süre boyunca
  // sahne/soru pasif. prefers-reduced-motion animasyonu kapatır, süre aynı kalır (global CSS).
  const [transitioning, setTransitioning] = useState(false)
  const firstCaseRef = useRef(true)
  useEffect(() => {
    if (!isAssessment) return
    if (firstCaseRef.current) {
      firstCaseRef.current = false
      return
    }
    setTransitioning(true)
    const t = window.setTimeout(() => setTransitioning(false), 1400)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseDef.id])

  // madde 5: değerlendirmede geri bildirim/özet kartı gösterilmez — finishCase'in hemen
  // ardından otomatik olarak sıradaki vakaya geçilir (bkz. yukarıdaki geçiş paneli).
  useEffect(() => {
    if (!isAssessment || !state.pendingSummary) return
    dispatch({ type: 'nextCase' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAssessment, state.pendingSummary])

  const primaryAction = () => {
    if (!q) return
    const action = nextActionForSubmit(state.mode, revealed, isLastQuestion(caseDef, q))
    if (action === 'advance') {
      dispatch({ type: 'advance' })
      return
    }
    if (action === 'finish') {
      dispatch({ type: 'finishCase' })
      return
    }
    if (!canSubmit) return
    const given = state.answers[q.id] ?? []
    const correct = isCorrect(q, given)
    dispatch({ type: 'submitAnswer', qid: q.id, correct })
    // saveInteractions çağrısı her iki modda son soru GÖNDERİLDİĞİNDE yapılır (submit anında)
    if (isLastQuestion(caseDef, q)) {
      const now = Date.now()
      const latency: Record<string, number> = {}
      for (const qq of caseDef.questions) {
        const t0 = shownAtRef.current[qq.id]
        if (t0) latency[qq.id] = now - t0
      }
      runtime?.saveInteractions(caseDef.id, caseDef.questions, state.answers, latency)
    }
    if (action === 'submit-then-finish') dispatch({ type: 'finishCase' })
    else if (action === 'submit-then-advance') dispatch({ type: 'advance' })
    // action === 'submit' (uygulama, ilk tık): yalnız gönderilir — geri bildirim gösterilir, İLERLEME YOK
  }

  const showCaseEndCard = state.mode === 'practice' && !!state.pendingSummary

  return (
    <>
      <EcgDeco />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container tall screen-body no-scroll">
          <div
            className={[
              'sim-grid',
              isAssessment ? 'wide-left mode-assessment' : 'mode-practice',
              transitioning ? 'is-transitioning' : '',
            ].join(' ')}
          >
            {transitioning && (
              <div className="case-transition" role="status" aria-live="polite">
                <div className="case-transition-card">
                  <div className="ct-big">Vaka {state.caseIndex + 1} / {caseList.length} · Yeni hasta</div>
                  <div className="ct-sub">Olgu bilgisini okuyun ve muayeneye başlayın.</div>
                </div>
              </div>
            )}
            <div className={`sim-main ${showCaseEndCard ? 'is-inert' : ''}`}>
              {isAssessment && (
                <div className={`strict-banner ${state.caseIndex > 0 ? 'compact' : ''}`} role="alert">
                  {state.caseIndex === 0 ? (
                    <>
                      <strong>Manuel muayene modu.</strong>
                      {/* madde 4 (wave 3): mobilde tek satır kompakt kalması için ayrıntı metni gizlenir */}
                      <span className="strict-banner-detail"> Her bölge yalnızca <b>bir kez</b> dinlenebilir; işaretleme, ipucu ve tekrar dinleme yoktur.</span>
                    </>
                  ) : (
                    <span><strong>Manuel muayene</strong> · tek dinleme</span>
                  )}
                </div>
              )}
              <div className="stage-card">
                <div className="stage-top stage-top-right">
                  {state.mode !== 'assessment' ? (
                    <label className="points-toggle">
                      <input type="checkbox" checked={state.showPoints} onChange={(e) => dispatch({ type: 'togglePoints', show: e.target.checked })} />
                      Dinleme noktalarını göster
                    </label>
                  ) : null}
                </div>
                <PatientStage
                  key={state.caseIndex}
                  ref={stageRef}
                  points={points}
                  filterIds={pointIds}
                  bodyType={((caseDef as CaseDef & { population?: string }).population === 'pediatrik' ? 'pediatrik' : 'erkek') as BodyType}
                  strict={isAssessment}
                  view={state.view}
                  head={state.head}
                  volume={state.volume}
                  showPoints={state.mode !== 'assessment' && state.showPoints}
                  showLabels={state.mode !== 'assessment' && state.showPoints}
                  mode={state.mode}
                  engine={engine}
                  soundFor={(pointId) => resolved.sounds[pointId] ?? null}
                  onVisit={(pointId) => { dispatch({ type: 'visit', pointId }); bus.emit({ type: 'auscultation_started', pointId, at: Date.now() }) }}
                  onDwell={(pointId, dwellMs) => dispatch({ type: 'dwell', pointId, dwellMs })}
                  onListen={(pointId, listenMs) => dispatch({ type: 'listen', pointId, listenMs })}
                  onPlayingChange={(_playing, pt) => setActivePoint(pt)}
                />
                <RegionChipList
                  points={points}
                  view={state.view}
                  pointIds={pointIds}
                  activePoint={activePoint}
                  visits={state.telemetry.visits}
                  onSelect={(pointId) => stageRef.current?.placeAt(pointId)}
                  hideUntilFocus={isAssessment}
                  otherViewHint={
                    isAssessment
                      ? null
                      : otherViewHintText(state.view, countUnlistenedInOtherView(points, pointIds, state.view, state.telemetry.visits))
                  }
                />
                {!isAssessment && activePoint && resolved.fallbacks[activePoint] && (
                  <div className="note-strip" style={{ marginTop: 0 }}>
                    <IconInfo width={16} height={16} />
                    <span className="small">
                      Bu bölge için doğrulanmış posterior kayıt yok; aynı bulgunun{' '}
                      <strong>{points.find((x) => x.id === resolved.fallbacks[activePoint])?.fullLabel}</strong> kaydı
                      çalınmaktadır.
                    </span>
                  </div>
                )}
              </div>
              <Toolbar
                caseDef={caseDef}
                stageRef={stageRef}
                activePoint={activePoint}
                question={state.mode === 'practice' ? q : undefined}
                onHint={() => dispatch({ type: 'useHint' })}
                strict={isAssessment}
              />
            </div>

            <div className="sim-side">
              <div className={`card ${caseFlash ? 'case-flash' : ''}`}>
                <div className="card-title-row">
                  <div className="ic"><IconDoc /></div>
                  <h3>Olgu</h3>
                  <div className="card-title-actions">
                    <span className="badge blue">Vaka {state.caseIndex + 1}/{caseList.length}</span>
                    {!isAssessment && caseDef.mappingNote && <MappingNotePopover note={caseDef.mappingNote} />}
                    {!isAssessment && isPediatricCase && (
                      <button type="button" className="btn outline small ped-ref-btn" onClick={() => setPedModalOpen(true)}>
                        <IconInfo width={14} height={14} /> Pediatrik referans
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ marginTop: 0 }}>
                  <strong>{caseDef.patient.age} yaşında {caseDef.patient.sex} hasta.</strong> <b>Başvuru:</b> {caseDef.chiefComplaint}.{' '}
                  {/* madde 4 (wave 3): mobilde olgu kartı kısa kalsın diye öykü metni gizlenir (yaş/cinsiyet/başvuru yeterli) */}
                  <span className="case-history-full">{caseDef.history}</span>
                </p>
                <div className="kv-grid">
                  {caseDef.vitalSigns.hr && <KV k="Kalp hızı" v={`${caseDef.vitalSigns.hr}/dk`} />}
                  {caseDef.vitalSigns.rr && <KV k="Solunum" v={`${caseDef.vitalSigns.rr}/dk`} />}
                  {caseDef.vitalSigns.bp && <KV k="TA" v={caseDef.vitalSigns.bp} />}
                  {caseDef.vitalSigns.spo2 && <KV k="SpO₂" v={`%${caseDef.vitalSigns.spo2}`} />}
                  {caseDef.vitalSigns.temp && <KV k="Ateş" v={caseDef.vitalSigns.temp} />}
                </div>
              </div>

              {showCaseEndCard && state.pendingSummary ? (
                <CaseEndCard
                  summary={state.pendingSummary}
                  caseDef={caseDef}
                  caseNumber={state.caseIndex + 1}
                  totalCases={caseList.length}
                  isLast={state.caseIndex + 1 >= caseList.length}
                  onNext={() => dispatch({ type: 'nextCase' })}
                />
              ) : q && (
                <div className="card q-card-dark">
                  <QuestionCard
                    q={q}
                    caseId={caseDef.id}
                    value={state.answers[q.id] ?? []}
                    onChange={(values) => dispatch({ type: 'answer', qid: q.id, values })}
                    revealed={revealed}
                    index={state.step}
                    total={caseDef.questions.length}
                  />
                  {state.mode === 'practice' && revealed && (
                    <FeedbackCard correct={isCorrect(q, state.answers[q.id] ?? [])} q={q} given={state.answers[q.id] ?? []} />
                  )}
                  <div className="q-nav">
                    <button
                      className={`btn ${isAssessment ? 'purple' : 'primary'}`}
                      style={{ flex: 1 }}
                      onClick={primaryAction}
                      disabled={!canSubmit && !(state.mode === 'practice' && revealed)}
                    >
                      {state.mode === 'practice' && revealed
                        ? isLastQuestion(caseDef, q) ? 'Vakayı tamamla' : 'Devam Et'
                        : 'Yanıtla'} <IconArrowRight />
                    </button>
                  </div>
                </div>
              )}

              {state.mode === 'practice' && !showCaseEndCard && (
                <div className="note-strip">
                  <IconInfo />
                  <span>İpucu kullanmak uygulama puanınızı düşürür. Değerlendirme modunda ipucu yoktur.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
      <PediatricRefModal open={pedModalOpen} onClose={() => setPedModalOpen(false)} />
    </>
  )
}

/** madde 5: uygulama modunda vaka bitince gösterilen özet kartı — soru kartının yerinde,
 *  sahne "pasif" hâlde. Skoru, alan bazlı kısa çubukları, klinik özeti/ayırıcı tanıyı ve
 *  teknik notunu gösterir; "Sonraki vaka" ile nextCase dispatch edilir. */
function CaseEndCard({
  summary, caseDef, caseNumber, totalCases, isLast, onNext,
}: {
  summary: CaseResult
  caseDef: CaseDef
  caseNumber: number
  totalCases: number
  isLast: boolean
  onNext: () => void
}) {
  const rows: { key: keyof ScoringWeights; label: string }[] = [
    { key: 'technique', label: 'Teknik' },
    { key: 'localization', label: 'Lokalizasyon' },
    { key: 'recognition', label: 'Tanıma' },
    { key: 'interpretation', label: 'Yorum' },
  ]
  return (
    <div className="card q-card-dark case-end-card">
      <div className="case-end-head">
        <h2>Vaka {caseNumber} / {totalCases} tamamlandı</h2>
        <span className="case-end-score">{Math.round(summary.total)} / 100</span>
      </div>
      <div className="case-end-bars">
        {rows.map((d) => {
          const v = summary.domains[d.key]
          if (!v || v.max === 0) return null
          const pct = Math.round((v.earned / v.max) * 100)
          return (
            <div className="ce-bar-row" key={d.key}>
              <span>{d.label}</span>
              <span className="ce-bar"><i style={{ width: `${pct}%` }} /></span>
              <span className="ce-pct">%{pct}</span>
            </div>
          )
        })}
      </div>
      {caseDef.feedback?.summary && (
        <div className="case-end-block">
          <b>Klinik özet</b>
          <p>{caseDef.feedback.summary}</p>
        </div>
      )}
      {caseDef.feedback?.differential && (
        <div className="case-end-block">
          <b>Ayırıcı düşünceler</b>
          <p>{caseDef.feedback.differential}</p>
        </div>
      )}
      {caseDef.feedback?.techniqueNotes && <p className="case-end-note">{caseDef.feedback.techniqueNotes}</p>}
      <div className="q-nav">
        <button className="btn primary" style={{ flex: 1 }} onClick={onNext}>
          {isLast ? 'Sonuçları gör' : 'Sonraki vaka'} <IconArrowRight />
        </button>
      </div>
    </div>
  )
}

/** madde 7 (wave 2): kayıt bilgisi artık tıklamayla açılan bir popover — dokunmatikte de
 *  çalışır (title tooltip yerine). Dışarı tıklayınca / ESC ile kapanır. */
function MappingNotePopover({ note }: { note: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="popover-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn outline small mapping-note-btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <IconInfo width={14} height={14} /> Kayıt bilgisi
      </button>
      {open && (
        <div className="popover" role="note">
          {note}
        </div>
      )}
    </div>
  )
}

/* vaka bazında ses haritası + fallback bilgisi (dürüst posterior eğitimi §14) */
function useMemoSounds(caseDef: CaseDef) {
  return useMemo(() => resolveCaseSoundsEx(caseDef.soundAssignments), [caseDef])
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  )
}

function isCorrect(q: Question, given: string[]): boolean {
  return given.length > 0 && q.correct.length === given.length && given.every((g) => q.correct.includes(g))
}

function isLastQuestion(caseDef: CaseDef, q?: Question): boolean {
  return !!q && caseDef.questions[caseDef.questions.length - 1]?.id === q.id
}
