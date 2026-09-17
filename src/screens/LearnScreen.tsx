import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../core/store'
import { examplesFor, isExpertSource } from '../core/images'
import { ZONES } from '../data/zones'
import { ALL_CASES, poolFor } from '../data/pool'
import { LIBRARY_GROUPS, LIBRARY_ITEMS, LABEL_SOURCE_TEXT, VIEW_TEXT, findingShort, type LibraryItem } from '../data/terminology'
import { FilmViewer, type FilmViewerHandle } from '../ui/FilmViewer'
import { ZoneChips } from '../ui/ZoneChips'
import { Footer, EcgDeco } from '../ui/chrome'
import { IconDoc, IconInfo, IconArrowRight, IconLungs, IconHeart, IconBone, IconScan, IconFilm, IconChevronLeft, IconChevronRight } from '../ui/icons'

/** Öğrenme modu: kütüphane + film görüntüleyici. Skor ve süre yok. */

const LEARN_DWELL_MS = 800

export function LearnScreen() {
  const { state, dispatch } = useStore()
  const [selectedKey, setSelectedKey] = useState<string>(() => state.learnFocusKey ?? LIBRARY_ITEMS[0].key)
  const [tab, setTab] = useState<'desc' | 'film' | 'clin'>('desc')
  const [exampleIdx, setExampleIdx] = useState(0)
  const [showExpert, setShowExpert] = useState(true)
  const [activeZones, setActiveZones] = useState<string[]>([])
  const viewerRef = useRef<FilmViewerHandle>(null)

  useEffect(() => {
    if (state.learnFocusKey) dispatch({ type: 'setLearnFocus', key: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const item = LIBRARY_ITEMS.find((it) => it.key === selectedKey) ?? LIBRARY_ITEMS[0]
  const examples = useMemo(() => {
    if (item.key === 'technique.projection') {
      // PA ve AP örneklerini dönüşümlü sun
      const pa = examplesFor(null, 'PA')
      const ap = examplesFor(null, 'AP')
      const out = []
      for (let i = 0; i < Math.max(pa.length, ap.length) && out.length < 12; i++) {
        if (pa[i]) out.push(pa[i])
        if (ap[i]) out.push(ap[i])
      }
      return out
    }
    return examplesFor(item.finding).slice(0, 24)
  }, [item])
  const image = examples[exampleIdx] ?? examples[0]

  useEffect(() => {
    setExampleIdx(0)
    document.querySelector('.lib-item.active')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selectedKey])

  const coverage = useMemo(() => {
    if (!item.finding) return { p: 0, a: 0 }
    const list = ALL_CASES.filter((c) => c.primaryFinding === item.finding)
    return { p: list.filter((c) => c.modes.includes('practice')).length, a: list.filter((c) => c.modes.includes('assessment')).length }
  }, [item])

  const startPractice = () => {
    const ids = poolFor('practice').filter((c) => c.primaryFinding === item.finding).slice(0, 5).map((c) => c.id)
    if (!ids.length) return
    dispatch({ type: 'startSession', practiceIds: ids, assessmentIds: state.session.assessmentIds, seed: (Date.now() % 2147483647) | 0 })
    dispatch({ type: 'startMode', mode: 'practice' })
  }

  const onZoneEnter = useCallback((ids: string[]) => dispatch({ type: 'zoneEnter', zoneIds: ids }), [dispatch])
  const onZoneDwell = useCallback((ids: string[], ms: number) => dispatch({ type: 'zoneDwell', zoneIds: ids, dwellMs: ms }), [dispatch])
  const annotationFinding = item.finding && item.finding !== 'normal' ? item.finding : null
  const hasExpertBox = !!image && !!annotationFinding && image.annotations.some((a) => a.finding === annotationFinding && isExpertSource(a.source))

  return (
    <>
      <EcgDeco />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container tall screen-body no-scroll">
          <div className="learn-grid">
            <nav className="lib-col" aria-label="Öğrenme kütüphanesi">
              <h2>Kütüphane</h2>
              <p className="lib-sub">Konu seçin, filmi okuyun.</p>
              {LIBRARY_GROUPS.map((g) => (
                <div className="lib-group" key={g.id}>
                  <div className="g-title"><GroupIcon group={g.id} />{g.title}</div>
                  <div className="lib-items">
                    {g.items.map((it) => (
                      <button
                        key={it.key}
                        className={`lib-item ${it.key === selectedKey ? 'active' : ''}`}
                        onClick={() => setSelectedKey(it.key)}
                        aria-current={it.key === selectedKey}
                        title={it.title}
                      >
                        <span className="ic"><GroupIcon group={g.id} /></span>
                        <span className="lib-main">
                          <b>{it.short}</b>
                          <span>{it.sub}</span>
                        </span>
                        <span className="lib-right">
                          <span className="lib-count" title="Örnek film sayısı">{countFor(it)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="sim-main">
              <div className="stage-card film-card">
                <div className="film-card-head">
                  <div className="example-nav" role="group" aria-label="Örnek filmler">
                    <button type="button" className="icon-btn" disabled={examples.length < 2} onClick={() => setExampleIdx((i) => (i - 1 + examples.length) % examples.length)} aria-label="Önceki örnek">
                      <IconChevronLeft width={16} height={16} />
                    </button>
                    <span className="example-count">{examples.length ? `Örnek ${exampleIdx + 1} / ${examples.length}` : 'Örnek film yok'}</span>
                    <button type="button" className="icon-btn" disabled={examples.length < 2} onClick={() => setExampleIdx((i) => (i + 1) % examples.length)} aria-label="Sonraki örnek">
                      <IconChevronRight width={16} height={16} />
                    </button>
                  </div>
                  {annotationFinding && (
                    <label className="points-toggle">
                      <input type="checkbox" checked={showExpert} onChange={(e) => setShowExpert(e.target.checked)} disabled={!hasExpertBox} />
                      {hasExpertBox ? 'Uzman işaretlemesini göster' : 'Bu filmde uzman işaretlemesi yok'}
                    </label>
                  )}
                </div>
                {image ? (
                  <FilmViewer
                    ref={viewerRef}
                    image={image}
                    zones={ZONES}
                    showZones={state.showZones}
                    showAnnotations={showExpert && hasExpertBox}
                    annotationFinding={annotationFinding}
                    onZoneEnter={onZoneEnter}
                    onZoneDwell={onZoneDwell}
                    onActiveZones={setActiveZones}
                    onTool={(tool) => dispatch({ type: 'toolUsed', tool })}
                    onToggleZones={() => dispatch({ type: 'toggleZones' })}
                  />
                ) : (
                  <div className="film-empty-card">
                    <IconFilm width={28} height={28} />
                    <p>Bu konu için henüz örnek film içe aktarılmadı.</p>
                    <p className="small">Radyolog etiketli filmler için <code>npm run import:nih</code> ya da <code>npm run import:rsna</code> çalıştırın.</p>
                  </div>
                )}
                <ZoneChips
                  zones={ZONES}
                  visits={state.telemetry.visits}
                  activeZones={activeZones}
                  minDwellMs={LEARN_DWELL_MS}
                  highlight={item.bestZones}
                  onSelect={(id) => viewerRef.current?.focusZone(id)}
                />
              </div>
            </div>

            <div className="sim-side">
              <div className="card">
                <div className="card-title-row">
                  <div className="ic"><GroupIcon group={item.group} /></div>
                  <h3>{item.title}</h3>
                  <div className="card-title-actions"><span className="badge blue">{item.badge}</span></div>
                </div>
                <div className="tabbar info-tabs" role="tablist">
                  <button role="tab" aria-selected={tab === 'desc'} className={tab === 'desc' ? 'active' : ''} onClick={() => setTab('desc')}><IconDoc /> Açıklama</button>
                  <button role="tab" aria-selected={tab === 'film'} className={tab === 'film' ? 'active' : ''} onClick={() => setTab('film')}><IconFilm /> Film bilgisi</button>
                  <button role="tab" aria-selected={tab === 'clin'} className={tab === 'clin' ? 'active' : ''} onClick={() => setTab('clin')}><IconScan /> Klinik</button>
                </div>
                {tab === 'desc' && (
                  <div className="info-body">
                    <p>{item.description}</p>
                    <div className="metaphor-card mt-12">
                      <span className="m-ic"><IconScan width={20} height={20} /></span>
                      <div>
                        <b>Radyolojik ipucu</b>
                        <p>{item.sign}</p>
                      </div>
                    </div>
                    <div className="note-strip mt-12">
                      <IconInfo />
                      <span><b>Okurken:</b> {item.readingTip}</span>
                    </div>
                  </div>
                )}
                {tab === 'film' && (
                  <div className="info-body">
                    {image ? (
                      <dl className="film-meta">
                        <dt>Kaynak</dt><dd>{image.sourceDataset} · {image.sourceFile}</dd>
                        <dt>Projeksiyon</dt><dd>{VIEW_TEXT[image.viewPosition]}</dd>
                        <dt>Hasta</dt><dd>{image.ageYears != null ? `${image.ageYears} yaş` : 'yaş bilinmiyor'}{image.sex ? `, ${image.sex === 'F' ? 'kadın' : 'erkek'}` : ''}</dd>
                        <dt>Etiketler</dt>
                        <dd>
                          <ul className="label-list">
                            {Object.entries(image.findings).map(([f, src]) => (
                              <li key={f} className={isExpertSource(src) ? 'expert' : 'nlp'}>
                                {findingShort(f)} <span>{LABEL_SOURCE_TEXT[src] ?? src}</span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                        <dt>Hekim onayı</dt><dd>{image.clinicalReview === 'onayli' ? 'Onaylı' : 'Beklemede'}</dd>
                      </dl>
                    ) : (
                      <p>Film seçilmedi.</p>
                    )}
                    <p className="src-line"><IconInfo /> Rapor metninden otomatik çıkarılan etiketler öğrenme amaçlı gösterilir; değerlendirmede kullanılmaz.</p>
                  </div>
                )}
                {tab === 'clin' && (
                  <div className="info-body">
                    <div className="klin-strip"><IconScan /><span>{item.clinical}</span></div>
                    {item.finding && (
                      <>
                        <p className="src-line">
                          Vaka kapsamı: {coverage.p ? `${coverage.p} uygulama vakası` : 'uygulama vakası yok'}
                          {coverage.a ? `, ${coverage.a} değerlendirme vakası` : ''}
                        </p>
                        {coverage.p > 0 && (
                          <button type="button" className="btn outline small" onClick={startPractice}>
                            Bu konuda uygulama yap <IconArrowRight width={14} height={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}

function countFor(it: LibraryItem): number {
  if (it.key === 'technique.projection') return examplesFor(null, 'PA').length + examplesFor(null, 'AP').length
  return examplesFor(it.finding).length
}

function GroupIcon({ group, size = 17 }: { group: string; size?: number }) {
  if (group === 'cardiac') return <IconHeart width={size} height={size} />
  if (group === 'bone') return <IconBone width={size} height={size} />
  if (group === 'technique') return <IconScan width={size} height={size} />
  return <IconLungs width={size} height={size} />
}
