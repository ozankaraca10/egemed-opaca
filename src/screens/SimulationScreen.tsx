import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CaseDef, CaseResult, Question, ScoringWeights } from '../core/types'
import { ALL_CASES, poolFor } from '../data/pool'
import { ZONES } from '../data/zones'
import { sampleSession, SESSION_SIZE } from '../core/session'
import { getImage } from '../core/images'
import { isAnswerCorrect } from '../core/answers'
import { decodeMark, encodeMark } from '../core/geometry'
import { useStore, computeAggregate } from '../core/store'
import { nextActionForSubmit, isTimedOut, remainingSec } from '../core/flow'
import { bus } from '../core/events'
import { FilmViewer, type FilmViewerHandle } from '../ui/FilmViewer'
import { ZoneChips } from '../ui/ZoneChips'
import { QuestionCard, FeedbackCard } from '../ui/Questions'
import { Footer, EcgDeco } from '../ui/chrome'
import { ConfirmModal } from '../ui/ConfirmModal'
import { IconDoc, IconArrowRight, IconInfo, IconLightbulb, IconClock, IconChevronLeft } from '../ui/icons'
import { LABEL_SOURCE_TEXT, VIEW_TEXT, findingShort } from '../data/terminology'

/** Uygulama ve Değerlendirme: film solda, olgu/soru sağda. */

export const DEFAULT_CASE_TIME_SEC = 180

export function SimulationScreen() {
  const { state, dispatch, runtime } = useStore()
  const isAssessment = state.mode === 'assessment'
  const sessionIds = isAssessment ? state.session.assessmentIds : state.session.practiceIds
  const byId = useMemo(() => new Map(ALL_CASES.map((c) => [c.id, c])), [])
  const sessionCases = sessionIds.map((id) => byId.get(id)).filter((c): c is CaseDef => !!c)
  const caseList = sessionCases.length ? sessionCases : poolFor(state.mode).slice(0, SESSION_SIZE)
  const caseDef: CaseDef | undefined = caseList[state.caseIndex] ?? caseList[0]

  // K3: devam ettirmede oturum listesi boşsa aynı tohumla yeniden üret
  useEffect(() => {
    if (sessionCases.length > 0 || state.mode === 'learn') return
    const seed = state.session.seed || Date.now() % 2147483647
    const ids = sampleSession(poolFor(state.mode), seed, SESSION_SIZE)
    if (!ids.length) return
    dispatch({
      type: 'startSession',
      practiceIds: state.mode === 'practice' ? ids : state.session.practiceIds,
      assessmentIds: state.mode === 'assessment' ? ids : state.session.assessmentIds,
      seed,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCases.length, state.mode])

  // oturum bitti → sonuç
  useEffect(() => {
    if (!caseList.length || state.caseIndex < caseList.length) return
    const agg = computeAggregate(state.caseResults)
    if (isAssessment) {
      runtime?.reportScore(agg.total, agg.mastery, true)
      bus.emit({ type: 'assessment_completed', total: agg.total, at: Date.now() })
    }
    dispatch({ type: 'setResults', results: state.caseResults })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.caseIndex])

  if (!caseDef) {
    return (
      <>
        <EcgDeco />
        <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
          <div className="container screen-body">
            <div className="card empty-state">
              <h2>Bu modda henüz vaka yok</h2>
              <p>
                Vaka havuzu görüntü envanterinden üretilir. Veri setini içe aktarıp vakaları yeniden üretin:
                <code> npm run import:nih -- &lt;klasör&gt;</code> ve <code>npm run cases</code>.
              </p>
              <button className="btn primary" onClick={() => dispatch({ type: 'goto', screen: 'modes' })}>Mod seçimine dön</button>
            </div>
          </div>
        </div>
        <Footer />
      </>
    )
  }
  return <CaseView key={`${state.mode}-${state.caseIndex}-${caseDef.id}`} caseDef={caseDef} total={caseList.length} />
}

function CaseView({ caseDef, total }: { caseDef: CaseDef; total: number }) {
  const { state, dispatch, runtime } = useStore()
  const isAssessment = state.mode === 'assessment'
  const image = getImage(caseDef.imageId)
  const viewerRef = useRef<FilmViewerHandle>(null)
  const [activeZones, setActiveZones] = useState<string[]>([])
  const [hintOpen, setHintOpen] = useState(false)
  const shownAtRef = useRef<Record<string, number>>({})
  // A4: uygulama modunda oturum içinden yeni örneklem / yeniden başlatma — yanıt verilmişse onay istenir.
  const [resampleAction, setResampleAction] = useState<'new' | 'retry' | null>(null)
  const hasProgress = Object.keys(state.answers).length > 0 || state.hintsUsed > 0 || state.caseResults.length > 0
  const doNewSample = useCallback(() => {
    const seed = (Date.now() % 2147483647) | 0
    const practiceIds = sampleSession(poolFor('practice'), seed, SESSION_SIZE)
    dispatch({ type: 'startSession', practiceIds, assessmentIds: state.session.assessmentIds, seed })
    dispatch({ type: 'startMode', mode: 'practice' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, state.session.assessmentIds])
  const doRestartSession = useCallback(() => {
    dispatch({ type: 'startMode', mode: 'practice' })
  }, [dispatch])
  const requestResample = (action: 'new' | 'retry') => {
    if (!hasProgress) {
      if (action === 'new') doNewSample()
      else doRestartSession()
      return
    }
    setResampleAction(action)
  }
  const confirmResample = () => {
    if (resampleAction === 'new') doNewSample()
    else if (resampleAction === 'retry') doRestartSession()
    setResampleAction(null)
  }
  const q: Question | undefined = caseDef.questions[state.step]
  const revealed = q ? !!state.revealed[q.id] : false
  const given = q ? state.answers[q.id] ?? [] : []
  const canSubmit = !!q && given.length > 0
  const summaryOpen = !!state.pendingSummary
  const timeLimit = isAssessment ? caseDef.timeLimitSec ?? DEFAULT_CASE_TIME_SEC : undefined

  useEffect(() => {
    dispatch({ type: 'caseMount', caseDef })
    bus.emit({ type: 'case_started', caseId: caseDef.id, mode: state.mode, at: Date.now() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (q && !shownAtRef.current[q.id]) shownAtRef.current[q.id] = Date.now()
    setHintOpen(false)
  }, [q])

  // değerlendirmede özet gösterilmez → hemen sonraki vaka
  useEffect(() => {
    if (isAssessment && state.pendingSummary) dispatch({ type: 'nextCase' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAssessment, state.pendingSummary])

  const saveInteractions = () => {
    const now = Date.now()
    const latency: Record<string, number> = {}
    for (const qq of caseDef.questions) if (shownAtRef.current[qq.id]) latency[qq.id] = now - shownAtRef.current[qq.id]
    runtime?.saveInteractions(caseDef.id, caseDef.questions, state.answers, image, latency)
  }

  // vaka süre sınırı: dolunca verilmiş yanıtlarla vaka kapanır
  const timedOut = isTimedOut(state.caseElapsed, timeLimit)
  useEffect(() => {
    if (!timedOut || summaryOpen || state.currentCaseId !== caseDef.id) return
    bus.emit({ type: 'case_timeout', caseId: caseDef.id, at: Date.now() })
    saveInteractions()
    dispatch({ type: 'finishCase' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedOut, state.currentCaseId])

  const primaryAction = () => {
    if (!q) return
    const isLast = caseDef.questions[caseDef.questions.length - 1]?.id === q.id
    const action = nextActionForSubmit(state.mode, revealed, isLast)
    if (action === 'advance') return dispatch({ type: 'advance' })
    if (action === 'finish') return dispatch({ type: 'finishCase' })
    if (!canSubmit) return
    dispatch({ type: 'submitAnswer', qid: q.id, correct: isAnswerCorrect(q, given, image) })
    if (isLast) saveInteractions()
    if (action === 'submit-then-finish') dispatch({ type: 'finishCase' })
    else if (action === 'submit-then-advance') dispatch({ type: 'advance' })
  }

  const markEnabled = !!q && q.type === 'localization' && !revealed && !summaryOpen
  const mark = q?.type === 'localization' ? decodeMark(given[0]) : null
  // uzman kutuları: uygulamada lokalizasyon yanıtı açıldıktan sonra ya da vaka sonu özetinde
  const revealAnnotations = !isAssessment && ((q?.type === 'localization' && revealed) || summaryOpen)
  const annotationFinding = q?.type === 'localization' ? q.targetFinding : caseDef.primaryFinding

  const onZoneEnter = useCallback((ids: string[]) => dispatch({ type: 'zoneEnter', zoneIds: ids }), [dispatch])
  const onZoneDwell = useCallback((ids: string[], ms: number) => dispatch({ type: 'zoneDwell', zoneIds: ids, dwellMs: ms }), [dispatch])
  const remaining = remainingSec(state.caseElapsed, timeLimit)
  const primarySource = image?.findings[caseDef.primaryFinding]

  return (
    <>
      <EcgDeco />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container tall screen-body no-scroll">
          <div className={`sim-grid ${isAssessment ? 'mode-assessment' : 'mode-practice'}`}>
            <div className={`sim-main ${summaryOpen ? 'is-inert' : ''}`}>
              {isAssessment && state.caseIndex === 0 && (
                <div className="strict-banner" role="alert">
                  <strong>Değerlendirme.</strong>
                  <span className="strict-banner-detail"> Okuma bölgesi katmanı, uzman işaretlemesi ve ipucu kapalı; her vaka için süre sınırı vardır.</span>
                </div>
              )}
              <div className="stage-card film-card">
                {/* V13: ABCDE bölge şeması BT'ye uymuyor (bilinen sınırlılık) — showZones BT vakalarında kapalı */}
                <FilmViewer
                  ref={viewerRef}
                  image={image}
                  zones={ZONES}
                  showZones={!isAssessment && state.showZones && image?.modality !== 'CT' && q?.type !== 'localization'}
                  showAnnotations={revealAnnotations}
                  annotationFinding={annotationFinding}
                  strict={isAssessment}
                  markEnabled={markEnabled}
                  mark={mark}
                  onMark={(p) => {
                    if (!q) return
                    dispatch({ type: 'answer', qid: q.id, values: [encodeMark(p)] })
                    bus.emit({ type: 'mark_placed', qid: q.id, at: Date.now() })
                  }}
                  onZoneEnter={onZoneEnter}
                  onZoneDwell={onZoneDwell}
                  onActiveZones={setActiveZones}
                  onTool={(tool) => dispatch({ type: 'toolUsed', tool })}
                  onToggleZones={isAssessment ? undefined : () => dispatch({ type: 'toggleZones' })}
                  inert={summaryOpen}
                />
                <ZoneChips
                  zones={ZONES}
                  visits={state.telemetry.visits}
                  activeZones={activeZones}
                  minDwellMs={caseDef.technique.minDwellMs}
                  onSelect={(id) => viewerRef.current?.focusZone(id)}
                  hideUntilFocus={isAssessment}
                />
              </div>
            </div>

            <div className="sim-side">
              {state.topicReturn && !isAssessment && (
                <button type="button" className="btn outline small topic-return" onClick={() => dispatch({ type: 'returnToTopic' })}>
                  <IconChevronLeft width={14} height={14} /> Görüntüye dön: {state.topicReturn.title}
                </button>
              )}
              <div className="card case-card">
                <div className="card-title-row">
                  <div className="ic"><IconDoc /></div>
                  <h3>Olgu</h3>
                  <div className="card-title-actions">
                    <span className="badge blue">Vaka {state.caseIndex + 1}/{total}</span>
                    {remaining != null && (
                      <span className={`badge ${remaining <= 30 ? 'orange' : 'purple'} case-timer`} aria-live="off">
                        <IconClock width={13} height={13} /> {fmtSec(remaining)}
                      </span>
                    )}
                    {!isAssessment && <SourcePopover text={sourceNote(caseDef, primarySource)} />}
                  </div>
                </div>
                <p className="case-line">
                  <strong>{patientLine(caseDef)}</strong> {caseDef.chiefComplaint}
                  <span className="case-history-full"> {caseDef.history}</span>
                </p>
                <div className="kv-grid">
                  <KV k="Projeksiyon" v={VIEW_TEXT[image?.viewPosition ?? 'unknown']} />
                  {caseDef.vitalSigns.hr && <KV k="Nabız" v={`${caseDef.vitalSigns.hr}/dk`} />}
                  {caseDef.vitalSigns.rr && <KV k="Solunum" v={`${caseDef.vitalSigns.rr}/dk`} />}
                  {caseDef.vitalSigns.spo2 && <KV k="SpO₂" v={`%${caseDef.vitalSigns.spo2}`} />}
                  {caseDef.vitalSigns.temp && <KV k="Ateş" v={caseDef.vitalSigns.temp} />}
                </div>
                {/* A4: uygulama modunda oturum içi örneklem kontrolleri (Pulse case-view paritesi) */}
                {!isAssessment && (
                  <div className="sim-resample-row">
                    <button type="button" className="btn outline small" onClick={() => requestResample('new')}>
                      Yeni 10 vaka örneklemi
                    </button>
                    <button type="button" className="btn outline small" onClick={() => requestResample('retry')}>
                      Oturumu yeniden başlat
                    </button>
                  </div>
                )}
              </div>

              {summaryOpen && !isAssessment && state.pendingSummary ? (
                <CaseEndCard
                  summary={state.pendingSummary}
                  caseDef={caseDef}
                  caseNumber={state.caseIndex + 1}
                  totalCases={total}
                  isLast={state.caseIndex + 1 >= total}
                  onNext={() => dispatch({ type: 'nextCase' })}
                />
              ) : q && (
                <div className="card q-card-dark">
                  <QuestionCard
                    q={q}
                    caseId={caseDef.id}
                    value={given}
                    onChange={(values) => dispatch({ type: 'answer', qid: q.id, values })}
                    revealed={revealed}
                    index={state.step}
                    total={caseDef.questions.length}
                  />
                  {hintOpen && q.hint && (
                    <div className="hint-box" role="note">
                      <IconLightbulb />
                      <span>{q.hint} <span className="muted small">(ipucu: −5 puan)</span></span>
                    </div>
                  )}
                  {state.mode === 'practice' && revealed && (
                    <FeedbackCard correct={isAnswerCorrect(q, given, image)} q={q} given={given} />
                  )}
                  <div className="q-nav">
                    {state.mode === 'practice' && q.hint && !hintOpen && !revealed && (
                      <button
                        className="btn outline small"
                        onClick={() => { dispatch({ type: 'useHint' }); setHintOpen(true) }}
                        title="İpucu kullanımı −5 puan"
                      >
                        <IconLightbulb /> İpucu
                      </button>
                    )}
                    <button
                      className={`btn ${isAssessment ? 'purple' : 'primary'}`}
                      style={{ flex: 1 }}
                      onClick={primaryAction}
                      disabled={!canSubmit && !(state.mode === 'practice' && revealed)}
                    >
                      {state.mode === 'practice' && revealed
                        ? caseDef.questions[caseDef.questions.length - 1]?.id === q.id ? 'Vakayı tamamla' : 'Devam et'
                        : 'Yanıtla'} <IconArrowRight />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
      <ConfirmModal
        open={resampleAction !== null}
        title="Yeni örneklem alınsın mı?"
        message="Bu oturumdaki yanıtlar silinir; ilerleme ve en iyi puan korunur."
        confirmLabel="Evet, devam et"
        cancelLabel="Vazgeç"
        onConfirm={confirmResample}
        onCancel={() => setResampleAction(null)}
      />
    </>
  )
}

function CaseEndCard({ summary, caseDef, caseNumber, totalCases, isLast, onNext }: {
  summary: CaseResult
  caseDef: CaseDef
  caseNumber: number
  totalCases: number
  isLast: boolean
  onNext: () => void
}) {
  const rows: { key: keyof ScoringWeights; label: string }[] = [
    { key: 'technique', label: 'Okuma kapsamı' },
    { key: 'systematic', label: 'ABCDE sırası' },
    { key: 'quality', label: 'Film kalitesi' },
    { key: 'recognition', label: 'Bulgu tanıma' },
    { key: 'localization', label: 'Lokalizasyon' },
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
      <div className="case-end-block">
        <b>
          {caseDef.mappingValidation === 'validated'
            ? `Ana bulgu: ${findingShort(caseDef.primaryFinding)}`
            : `Rapor etiketi (doğrulanmamış): ${findingShort(caseDef.primaryFinding)}`}
        </b>
        <p>{caseDef.feedback.summary}</p>
      </div>
      {caseDef.feedback.differential && (
        <div className="case-end-block">
          <b>Ayırıcı düşünceler</b>
          <p>{caseDef.feedback.differential}</p>
        </div>
      )}
      {caseDef.feedback.techniqueNotes && <p className="case-end-note">{caseDef.feedback.techniqueNotes}</p>}
      <div className="q-nav">
        <button className="btn primary" style={{ flex: 1 }} onClick={onNext}>
          {isLast ? 'Sonuçları gör' : 'Sonraki vaka'} <IconArrowRight />
        </button>
      </div>
    </div>
  )
}

function SourcePopover({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    // V4: fare popover'ın (buton+metin) tamamından ayrılınca otomatik kapanır — açık kalmış bir popover
    // altındaki başka bir düğmeyi (ör. "Oturumu yeniden başlat") geometrik olarak örtüp ilk tıklamayı
    // yutmasın diye. Yalnız popover'ı kapatan bir tıklama fazladan gerekmez.
    <div className="popover-wrap" ref={wrapRef} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="btn outline small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconInfo width={14} height={14} /> Görüntü kaynağı
      </button>
      {open && <div className="popover" role="note">{text}</div>}
    </div>
  )
}

function sourceNote(c: CaseDef, src: string | undefined): string {
  const img = getImage(c.imageId)
  const parts = [
    img ? `Kaynak: ${img.sourceDataset} (${img.sourceFile}).` : 'Görüntü kaydı bulunamadı.',
    `Ana bulgu etiketi: ${src ? LABEL_SOURCE_TEXT[src] ?? src : 'yok'}.`,
  ]
  if (c.mappingNote) parts.push(c.mappingNote)
  return parts.join(' ')
}

function patientLine(c: CaseDef): string {
  const age = c.patient.age != null ? `${c.patient.age} yaşında` : 'Yaşı bilinmeyen'
  const sex = c.patient.sex ? `${c.patient.sex} hasta.` : 'hasta.'
  return `${age} ${sex}`
}

function fmtSec(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  )
}
