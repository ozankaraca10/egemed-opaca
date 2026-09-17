import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuscultationPoint, SoundRecord } from '../core/types'
import pointsData from '../data/auscultation-points.json'
import libraryData from '../data/library.json'
import { engine } from '../audio/engineSingleton'
import { resolveLibrarySound, resolveLibrarySoundEx } from '../core/resolver'
import { useStore } from '../core/store'
import { libraryTitle, libraryShortTitle, librarySub } from '../data/terminology'
import { ALL_CASES, poolFor } from '../data/pool'
import { countUnlistenedInOtherView, otherViewHintText } from '../core/flow'
import { PatientStage, type StageHandle } from '../ui/PatientStage'
import { RegionChipList } from '../ui/RegionChips'
import { WaveformView } from '../ui/WaveformView'
import { Toolbar } from '../ui/Toolbar'
import { Footer, EcgDeco } from '../ui/chrome'
import { PediatricRefModal } from '../ui/PediatricRefModal'
import { IconHeart, IconLungs, IconWave, IconDoc, IconStethoscope, IconInfo, IconCompare, IconArrowRight } from '../ui/icons'

/** Öğrenme modu (§3A): kütüphane + simülatör. Skor yok; rehberli, sınırsız dinleme. */

interface LibItemFull {
  key: string
  category: string
  acousticFinding: string
  description: string
  metaphor?: string
  s1?: string
  s2?: string
  phase?: string
  clinical: string
  bestPoints: string[]
  group: string
}

export function LearnScreen() {
  const { state, dispatch } = useStore()
  // madde 5 (wave 2): Sonuçlar ekranından "Öğrenme modunda çalış" ile gelindiğinde ilgili
  // kalem seçili açılır (tek seferlik — tüketilince store'daki alan temizlenir).
  const [selectedKey, setSelectedKey] = useState<string>(() => state.learnFocusKey ?? 'heart.normal')
  const [tab, setTab] = useState<'desc' | 'wave' | 'clin'>('desc')
  useEffect(() => {
    if (state.learnFocusKey) dispatch({ type: 'setLearnFocus', key: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const stageRef = useRef<StageHandle>(null)
  const [activePoint, setActivePoint] = useState<string | null>(null)
  const [pedModalOpen, setPedModalOpen] = useState(false)

  const points = pointsData.points as AuscultationPoint[]
  const items = useMemo(() => {
    const out: Record<string, LibItemFull> = {}
    for (const g of libraryData.groups)
      for (const it of g.items) out[it.key] = { ...(it as unknown as LibItemFull), group: g.id }
    return out
  }, [])
  const item = items[selectedKey]
  const isHeart = item.group === 'heart'
  const isMixed = item.group === 'mixed'

  // vaka kapsamı (sağ panel bilgi satırı §36)
  const coverage = useMemo(() => {
    const m: Record<string, { p: number; a: number }> = {}
    for (const c of ALL_CASES) {
      const k = c.primaryAcousticFinding
      if (!m[k]) m[k] = { p: 0, a: 0 }
      if (c.modes.includes('practice')) m[k].p++
      if (c.modes.includes('assessment')) m[k].a++
    }
    return m
  }, [])
  const cov = coverage[item.acousticFinding] ?? { p: 0, a: 0 }

  // madde 4 (wave 2): "Bu sesle uygulama yap" — bu bulguya ait ilk 3-5 uygulama vakasından
  // tek vakalık(a yakın) bir oturum başlatır, sonra Uygulama moduna geçer.
  const startPracticeForFinding = () => {
    const matches = poolFor('practice').filter((c) => c.primaryAcousticFinding === item.acousticFinding)
    const ids = matches.slice(0, 5).map((c) => c.id)
    if (!ids.length) return
    const seed = (Date.now() % 2147483647) | 0
    dispatch({ type: 'startSession', practiceIds: ids, assessmentIds: state.session.assessmentIds, seed })
    dispatch({ type: 'startMode', mode: 'practice' })
  }

  // kalem değişince önceki sesi durdur
  useEffect(() => {
    engine.stop()
  }, [selectedKey])

  // madde 4 (wave 3): mobilde kütüphane yatay şerittir — seçili kalem şeritte ortalanır
  useEffect(() => {
    document.querySelector('.lib-item.active')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selectedKey])

  const stageSounds = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof resolveLibrarySoundEx>>()
    const resolve = (pointId: string) => {
      if (cache.has(pointId)) return cache.get(pointId)!
      const res = resolveLibrarySoundEx(item.category, item.acousticFinding, pointId)
      cache.set(pointId, res)
      return res
    }
    return { resolve }
  }, [item])

  const soundsForStage = (pointId: string): SoundRecord | null => stageSounds.resolve(pointId).record
  const activeFallback = activePoint ? stageSounds.resolve(activePoint).fallbackFrom : undefined

  const title = libraryTitle(item.key)
  const libSound = resolveLibrarySound(item.category, item.acousticFinding)

  return (
    <>
      <EcgDeco />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container tall screen-body no-scroll">
          <div className="learn-grid">
            <div className="lib-col">
              <h2>{isMixed ? 'Kombine Sesler' : isHeart ? 'Kalp Sesleri' : 'Akciğer Sesleri'}</h2>
              <p className="lib-sub">Dinle, tanı, öğren.</p>
              {libraryData.groups.map((g) => (
                <div className="lib-group" key={g.id}>
                  <div className="g-title">
                    <GroupIcon group={g.id} />
                    {g.title}
                  </div>
                  <div className="lib-items">
                    {g.items.map((it) => (
                      <button
                        key={it.key}
                        className={`lib-item ${it.key === selectedKey ? 'active' : ''}`}
                        onClick={() => setSelectedKey(it.key)}
                        title={libraryTitle(it.key)}
                      >
                        <span className="ic"><GroupIcon group={g.id} /></span>
                        <span className="lib-main">
                          <b>{libraryShortTitle(it.key)}</b>
                          <span>{librarySub(it.key)}</span>
                        </span>
                        <span className="lib-right"><span className="chev">›</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="sim-main">
              <div className="stage-card">
                <PatientStage
                  ref={stageRef}
                  points={points}
                  filterIds={item.bestPoints}
                  view={state.view}
                  head={state.head}
                  volume={state.volume}
                  showPoints
                  showLabels
                  bodyType="erkek"
                  mode="learn"
                  engine={engine}
                  soundFor={soundsForStage}
                  onVisit={(pointId) => dispatch({ type: 'visit', pointId })}
                  onDwell={(pointId, dwellMs) => dispatch({ type: 'dwell', pointId, dwellMs })}
                  onListen={(pointId, listenMs) => dispatch({ type: 'listen', pointId, listenMs })}
                  onPlayingChange={(_playing, pt) => setActivePoint(pt)}
                />
                <RegionChipList
                  points={points}
                  view={state.view}
                  pointIds={item.bestPoints}
                  activePoint={activePoint}
                  visits={state.telemetry.visits}
                  onSelect={(pointId) => stageRef.current?.placeAt(pointId)}
                  otherViewHint={otherViewHintText(
                    state.view,
                    countUnlistenedInOtherView(points, item.bestPoints, state.view, state.telemetry.visits)
                  )}
                />
                {activeFallback && (
                  <div className="note-strip" style={{ marginTop: 8 }}>
                    <IconInfo width={17} height={17} />
                    <span className="small">
                      Bu bölge için veri setinde doğrudan kayıt yok; aynı bulgunun{' '}
                      <strong>{points.find((x) => x.id === activeFallback)?.fullLabel}</strong> kaydı çalınmaktadır.
                    </span>
                  </div>
                )}
              </div>
              <Toolbar stageRef={stageRef} activePoint={activePoint} />
            </div>

            <div className="sim-side">
              <div className="card">
                <div className="card-title-row">
                  <div className="ic"><GroupIcon group={item.group} /></div>
                  <h3>{title}</h3>
                  <div className="card-title-actions">
                    <span className="badge blue">{findingBadge(item.key)}</span>
                    <button type="button" className="btn outline small ped-ref-btn" onClick={() => setPedModalOpen(true)}>
                      <IconInfo width={14} height={14} /> Pediatrik referans
                    </button>
                  </div>
                </div>
                <div className="tabbar info-tabs">
                  <button className={tab === 'desc' ? 'active' : ''} onClick={() => setTab('desc')}>
                    <IconDoc /> Açıklama
                  </button>
                  <button className={tab === 'wave' ? 'active' : ''} onClick={() => setTab('wave')}>
                    <IconWave /> Dalga Formu
                  </button>
                  <button className={tab === 'clin' ? 'active' : ''} onClick={() => setTab('clin')}>
                    <IconStethoscope /> Klinik Bilgi
                  </button>
                </div>
                {tab === 'desc' && (
                  <div className="info-body">
                    <p>{item.description}</p>
                    {item.metaphor && (
                      <div className="metaphor-card mt-12">
                        <span className="m-ic"><IconWave width={20} height={20} /></span>
                        <div>
                          <b>Ses metaforu</b>
                          <p>{item.metaphor}</p>
                        </div>
                      </div>
                    )}
                    {isHeart && item.s1 && item.s2 && (
                      <div className="exp-cards mt-12">
                        <div className="exp-card" title={`S1: ${item.s1}`}>
                          <span className="chip s1">S1</span>
                          <p>{item.s1}</p>
                        </div>
                        <div className="exp-card" title={`S2: ${item.s2}`}>
                          <span className="chip s2">S2</span>
                          <p>{item.s2}</p>
                        </div>
                      </div>
                    )}
                    {!isHeart && item.phase && (
                      <div className="note-strip mt-12">
                        <IconWave />
                        <span>{item.phase}</span>
                      </div>
                    )}
                  </div>
                )}
                {tab === 'wave' && (
                  libSound ? (
                    <WaveformView sound={libSound} engine={engine} head={state.head} title="Örnek ses kaydı (tam segment)" />
                  ) : (
                    <div className="note-strip">
                      <IconInfo /> Bu bulgu için kullanılabilir kayıt bulunamadı (veri seti eksikliği). Kütüphanenin diğer kalemlerini deneyin.
                    </div>
                  )
                )}
                {tab === 'clin' && (
                  <div className="info-body">
                    <p className="src-line" style={{ marginTop: 0 }}>
                      <IconCompare />
                      Vaka kapsamı: {cov.p > 0 ? `${cov.p} uygulama vakası` : 'vaka yok'}
                      {cov.a > 0 ? `, ${cov.a} değerlendirme vakası` : ''}
                    </p>
                    {cov.p > 0 && (
                      <button type="button" className="btn outline small mb-12" onClick={startPracticeForFinding}>
                        Bu sesle uygulama yap <IconArrowRight width={14} height={14} />
                      </button>
                    )}
                    <div className="klin-strip mt-12">
                      <IconStethoscope />
                      <span>{item.clinical}</span>
                    </div>
                    <p className="src-line">
                      <IconInfo />
                      Kaynak: HLS-CMDS v3 — CC BY 4.0 (DOI 10.17632/8972jxbpmp.3)
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
      <Footer />
      <PediatricRefModal open={pedModalOpen} onClose={() => setPedModalOpen(false)} />
    </>
  )
}

function GroupIcon({ group, size = 17 }: { group: string; size?: number }) {
  if (group === 'heart') return <IconHeart width={size} height={size} />
  if (group === 'mixed') return <IconCompare width={size} height={size} />
  return <IconLungs width={size} height={size} />
}

function findingBadge(key: string): string {
  if (key.startsWith('mixed')) return 'Kombine'
  if (key === 'heart.normal') return 'S1 – S2'
  if (key === 'heart.s3') return 'S3'
  if (key === 'heart.s4') return 'S4'
  if (key.startsWith('heart.murmur')) return 'Üfürüm'
  if (key === 'heart.atrial_fibrillation') return 'Ritim'
  if (key === 'heart.tachycardia') return 'Hız'
  if (key === 'heart.av_block') return 'İletim'
  return 'Ses'
}
