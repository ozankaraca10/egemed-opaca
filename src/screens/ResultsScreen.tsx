import { Fragment, useState } from 'react'
import { useStore } from '../core/store'
import { Footer, EcgDeco } from '../ui/chrome'
import { aggregateResults } from '../core/scoring'
import { ALL_CASES, poolFor } from '../data/pool'
import { sampleSession, SESSION_SIZE } from '../core/session'
import { firstWeakLibraryKey, libraryKeyForCase, weakDomainKeys } from '../core/flow'
import libraryData from '../data/library.json'
import {
  IconStethoscope, IconLungs, IconWave, IconDoc, IconCheckCircle, IconExit, IconClock, IconChevronRight,
} from '../ui/icons'
import type { ScoringWeights } from '../core/types'

const libraryItems = libraryData.groups.flatMap((g) =>
  g.items.map((it) => ({ key: it.key, category: it.category, acousticFinding: it.acousticFinding }))
)

/** Sonuç ekranı (§24, madde 7): sola hizalı rapor düzeni — özet şerit, alan bazlı yüzde
 *  performans, genişleyebilir vaka raporu tablosu. */

const cases = ALL_CASES

export function ResultsScreen() {
  const { state, dispatch, runtime } = useStore()
  const isAssessment = state.mode === 'assessment'
  const agg = aggregateResults(state.caseResults)
  const last = state.caseResults[state.caseResults.length - 1]
  const total = isAssessment ? agg.total : last?.total ?? 0
  const passed = isAssessment ? agg.mastery : last?.mastery ?? false
  const domains = isAssessment ? agg.domains : last?.domains ?? null
  const [expanded, setExpanded] = useState<string | null>(null)

  const domainRows: { key: keyof ScoringWeights; label: string; icon: React.ReactNode }[] = [
    { key: 'technique', label: 'Oskültasyon tekniği', icon: <IconStethoscope /> },
    { key: 'localization', label: 'Anatomik lokalizasyon', icon: <IconLungs /> },
    { key: 'recognition', label: 'Ses tanımlama', icon: <IconWave /> },
    { key: 'interpretation', label: 'Klinik yorum', icon: <IconDoc /> },
    { key: 'diagnosis', label: 'Tanı (varsa)', icon: <IconCheckCircle /> },
    { key: 'systematic', label: 'Sistematik muayene', icon: <IconStethoscope /> },
  ]

  // D12: gerçek bir LMS içindeyse oturumu sonlandır ve sekmeyi/penceresini kapatmayı dene;
  // bağımsız/mock modda (LMS yok) yalnız başlangıç ekranına dönülür (terminate edilmez).
  const exit = () => {
    if (runtime?.flags.scormAvailable) {
      runtime.terminate()
      window.close()
    }
    dispatch({ type: 'goto', screen: 'start' })
  }

  // madde 7: aynı modda yeni bir oturum (yeni rastgele 10 vaka)
  const retry = () => {
    const seed = (Date.now() % 2147483647) | 0
    const practiceIds = sampleSession(poolFor('practice'), seed, SESSION_SIZE)
    const assessmentIds = sampleSession(poolFor('assessment'), seed + 1, SESSION_SIZE)
    dispatch({ type: 'startSession', practiceIds, assessmentIds, seed })
    dispatch({ type: 'startMode', mode: state.mode })
  }
  // madde 5: yanlış yanıtlanan ilk vakanın öğrenme kütüphanesi kalemi — LearnScreen'i
  // o kaleme odaklı açar (tek seferlik; bkz. core/store.tsx learnFocusKey).
  const weakLearnKey = firstWeakLibraryKey(state.caseResults, (caseId) =>
    libraryKeyForCase(cases.find((c) => c.id === caseId), libraryItems)
  )
  const studyLearn = () => {
    if (weakLearnKey) dispatch({ type: 'setLearnFocus', key: weakLearnKey })
    dispatch({ type: 'startMode', mode: 'learn' })
    dispatch({ type: 'goto', screen: 'learn' })
  }

  // madde 5: %60 altındaki alanlar için küçük "zayıf alan" çipleri
  const weakLabels: Record<string, string> = {
    technique: 'Oskültasyon tekniği',
    localization: 'Lokalizasyon',
    recognition: 'Ses tanımlama',
    interpretation: 'Klinik yorum',
    diagnosis: 'Tanı',
    systematic: 'Sistematik muayene',
  }
  const weakKeys = weakDomainKeys(domains, 60)

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <>
      <EcgDeco />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="results-wrap-v2 screen-body">
          <h1 className="results-title-v2 results-title">
            {isAssessment ? 'Değerlendirme Tamamlandı' : 'Vaka Raporu'}
          </h1>
          <p className="results-sub-v2">
            {passed
              ? 'Tebrikler — performansınız hedefin üzerinde. Bu düzeyi korumak için öğrenme modunda farklı ses sınıflarıyla pratik yapmaya devam edebilirsiniz.'
              : 'Hedef puanın altında kaldınız. Öğrenme modunda ilgili ses sınıflarını tekrar dinleyip uygulama modunda yeniden denemeniz önerilir.'}
          </p>

          {weakKeys.length > 0 && (
            <div className="weak-chip-row" aria-label="Zayıf alanlar">
              <span className="weak-chip-lbl">Zayıf alanlar:</span>
              {weakKeys.map((k) => (
                <span className="badge orange weak-chip" key={k}>{weakLabels[k] ?? k}</span>
              ))}
            </div>
          )}

          <div className="results-summary-strip">
            <div className="rs-box">
              <div className={`rs-ring-sm score-ring ${passed ? 'pass' : 'fail'}`}>
                <svg viewBox="0 0 80 80">
                  <circle className="track" cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="8" />
                  <circle
                    className="prog"
                    cx="40" cy="40" r="34" fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(total / 100) * 2 * Math.PI * 34} 999`}
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <b>{total}</b>
              </div>
              <span className="rs-lbl">Toplam puan</span>
            </div>
            <div className="rs-box">
              <div className={`rs-status ${passed ? 'pass' : 'fail'}`}>
                <IconCheckCircle width={16} height={16} /> {passed ? 'Başarılı' : 'Hedefin altında'}
              </div>
              <span className="rs-lbl">Durum (eşik 80)</span>
            </div>
            {isAssessment && (
              <div className="rs-box">
                <div className="rs-num"><IconClock width={16} height={16} /> {fmtTime(state.assessmentTimer)}</div>
                <span className="rs-lbl">Süre</span>
              </div>
            )}
            <div className="rs-box">
              <div className="rs-num">{state.caseResults.length}</div>
              <span className="rs-lbl">Vaka sayısı</span>
            </div>
          </div>

          <div className="card mt-16">
            <h3 style={{ marginTop: 0 }}>Alan bazlı performans</h3>
            <div className="domain-rows mt-12">
              {domains &&
                domainRows.map((d) => {
                  const v = domains[d.key]
                  if (!v || v.max === 0) return null
                  const pct = Math.round((v.earned / v.max) * 100)
                  return (
                    <div className="domain-row" key={d.key}>
                      <span className="dr-ic">{d.icon}</span>
                      <span className="dr-lbl">{d.label}</span>
                      <span className="domain-bar"><i style={{ width: `${pct}%` }} /></span>
                      <span className="dr-pct">%{pct}</span>
                    </div>
                  )
                })}
            </div>
          </div>

          <div className="card mt-16">
            <h3 style={{ marginTop: 0 }}>Vaka raporu</h3>
            <div className="table-scroll">
              <table className="report-table report-table-v2">
                <thead>
                  <tr>
                    <th />
                    <th>Vaka</th>
                    <th>Puan</th>
                    <th>Sonuç</th>
                    <th>İpucu</th>
                  </tr>
                </thead>
                <tbody>
                  {state.caseResults.map((r) => {
                    const c = cases.find((x) => x.id === r.caseId)
                    const isOpen = expanded === r.caseId
                    return (
                      <Fragment key={r.caseId}>
                        <tr className="report-row" onClick={() => setExpanded(isOpen ? null : r.caseId)}>
                          <td className="report-chev"><IconChevronRight className={isOpen ? 'rot' : ''} width={14} height={14} /></td>
                          <td>{c?.title ?? r.caseId}</td>
                          <td>{Math.round(r.total)}/100</td>
                          <td className={r.mastery ? 'ok' : 'no'}>{r.mastery ? 'Başarılı' : 'Başarısız'}</td>
                          <td>{r.hintsUsed}</td>
                        </tr>
                        {isOpen && (
                          <tr className="report-detail-row">
                            <td colSpan={5}>
                              <ul className="report-detail-list">
                                {r.answers.map((a) => {
                                  const question = c?.questions.find((qq) => qq.id === a.qid)
                                  if (!question) return null
                                  const givenLabels =
                                    a.given.map((id) => question.options.find((o) => o.id === id)?.label).filter(Boolean).join(', ') || '—'
                                  const correctLabels = question.correct
                                    .map((id) => question.options.find((o) => o.id === id)?.label)
                                    .filter(Boolean)
                                    .join(', ')
                                  return (
                                    <li key={a.qid} className={a.correct ? 'ok' : 'no'}>
                                      <span className="rd-q">{question.prompt}</span>
                                      <span className="rd-mark">{a.correct ? '✓' : '✗'}</span>
                                      <span className="rd-given">Verilen yanıt: {givenLabels}</span>
                                      <span className="rd-correct">Doğru yanıt: {correctLabels}</span>
                                      {!a.correct && question.feedbackIncorrect && (
                                        <span className="rd-feedback">{question.feedbackIncorrect}</span>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="results-actions">
            <button className="btn primary" onClick={exit}>
              <IconExit /> Modülden Çık
            </button>
            <button className="btn outline" onClick={retry}>Tekrar dene</button>
            <button className="btn outline" onClick={studyLearn}>Öğrenme modunda çalış</button>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
