import { useStore } from '../core/store'
import { bus } from '../core/events'
import { Footer } from '../ui/chrome'
import { IconArrowRight, IconInfo } from '../ui/icons'
import { computeMetrics } from '../data/metrics'

const M = computeMetrics()

/** Başlangıç ekranı: marka, değer önerisi, veri odaklı güven kutuları. */
export function StartScreen() {
  const { dispatch } = useStore()
  const begin = () => {
    bus.emit({ type: 'simulation_started', at: Date.now() })
    dispatch({ type: 'goto', screen: 'modes' })
  }
  const whyBoxes = [
    {
      label: `${M.images} akciğer grafisi`,
      desc: M.datasetsUsed ? `${M.datasetsUsed} açık veri setinden, lisansı ve atfı belgelenmiş.` : 'Veri setleri içe aktarıldığında burada listelenir.',
    },
    { label: `${M.expertImages} radyolog etiketli film`, desc: `${M.annotatedImages} filmde bulgunun yeri uzman tarafından işaretlenmiş.` },
    { label: `${M.totalCases} vaka · ${M.zones} okuma bölgesi`, desc: 'Her oturumda rastgele 10 vaka; rapor tabanlı etiketler değerlendirmeye girmez.' },
  ]
  return (
    <div className="screen start-hero-screen">
      <div className="hero-glow" aria-hidden="true" />
      <img className="hero-bg-seal" src="brand/ege-tip-logo.png" alt="" aria-hidden="true" onError={(e) => { e.currentTarget.style.display = 'none' }} />
      <div className="start-hero">
        <img className="hero-logo" src="brand/logo-vertical-web.png" alt="EGEMED Opaca — Radyolojik Görüntüleme Simülatörü" />
        <h1 className="hero-title">Akciğer grafisini sistematik okumayı gerçek filmlerle öğrenin.</h1>
        <p className="hero-sub">
          {M.libraryItems} konu başlığı, ABCDE okuma rehberi ve görüntü üzerinde işaretleme;
          SCORM uyumlu ölçme ve değerlendirme.
        </p>
        <button className="hero-cta" onClick={begin}>
          Simülatörü başlat <IconArrowRight />
        </button>
        <div className="hero-links">
          <button className="hero-link" onClick={() => dispatch({ type: 'goto', screen: 'tutorial' })}>Nasıl kullanılır?</button>
          <span className="hero-link-sep" aria-hidden="true" />
          <button className="hero-link" onClick={() => dispatch({ type: 'goto', screen: 'sources' })}>
            <IconInfo /> Hakkında ve kaynaklar
          </button>
        </div>
        <div className="why-section" aria-label="Neden güvenilir?">
          <p className="why-title">Neden güvenilir?</p>
          <div className="why-grid">
            {whyBoxes.map((w) => (
              <div className="why-box" key={w.label}>
                <b>{w.label}</b>
                <span>{w.desc}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="hero-display-hint">En iyi görüntü için ekran parlaklığını artırın ve ortam ışığını azaltın.</p>
      </div>
      <Footer />
    </div>
  )
}
