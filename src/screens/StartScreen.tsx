import { useStore } from '../core/store'
import { engine } from '../audio/engineSingleton'
import { bus } from '../core/events'
import { Footer } from '../ui/chrome'
import { IconArrowRight, IconHeadphones, IconInfo } from '../ui/icons'
import { computeMetrics } from '../data/metrics'

const M = computeMetrics()

/** Başlangıç ekranı (§44): ortalanmış marka hero'su, envanter metrikleri, kulaklık önerisi,
 *  ses düzeyi kontrolü ve mod seçimine giriş. */

export function StartScreen() {
  const { dispatch } = useStore()

  const playTone = async () => {
    // Nötr, tanısal olmayan ses düzeyi kontrol tonu (§32)
    const ctx = await engine.ensureContext()
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.frequency.value = 440
    osc.type = 'sine'
    osc.connect(g)
    g.connect(ctx.destination)
    const t = ctx.currentTime
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.2, t + 0.05)
    g.gain.setValueAtTime(0.2, t + 0.7)
    g.gain.linearRampToValueAtTime(0, t + 0.8)
    osc.start(t)
    osc.stop(t + 0.85)
  }

  const begin = () => {
    engine.ensureContext().catch(() => undefined)
    bus.emit({ type: 'simulation_started', at: Date.now() })
    dispatch({ type: 'goto', screen: 'modes' })
  }

  // madde 6 (wave 3): eski "•" ayraçlı metrik satırı title tooltip'e dayanıyordu (dokunmatikte
  // çalışmıyordu) — artık "Neden güvenilir?" başlıklı 3 kutu, her biri kalıcı açıklama satırıyla.
  const whyBoxes: { label: string; desc: string }[] = [
    { label: `${M.datasets} veri seti`, desc: 'HLS-CMDS v3 + CirCor — lisansı doğrulanmış klinik kaynaklar.' },
    { label: `${M.bundledRecordings} klinik kayıt`, desc: 'Pakete dahil, gerçek hasta/manikin oskültasyon kaydı.' },
    { label: `${M.totalCases} vaka · ${M.assessmentQuestions} soru`, desc: `Her oturumda rastgele 10 vaka; ${M.pediatricCases} pediatrik vaka dahil.` },
  ]

  return (
    <div className="screen start-hero-screen">
      <div className="hero-glow" aria-hidden="true" />
      {/* Kurum logosu: solda silik, büyük arka plan (public/brand/ege-tip-logo.png; dosya yoksa görünmez) */}
      <img
        className="hero-bg-seal"
        src="brand/ege-tip-logo.png"
        alt=""
        aria-hidden="true"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
      <div className="start-hero">
        <img
          className="hero-logo"
          src="brand/logo-vertical-web.png"
          alt="EGEMED Ausculta — Kardiyopulmoner Oskültasyon Simülatörü"
        />
        {/* madde 6 (wave 3): ürün adı logoda zaten var — ayrı bir eyebrow/isim tekrarı yok;
            başlık artık tek satırlık bir değer önerisi */}
        <h1 className="hero-title">Gerçek kayıtlarla kalp ve akciğer sesini keşfedin.</h1>
        <p className="hero-sub">
          {M.soundClasses} ses sınıfı, yetişkin ve pediatrik gövde üzerinde sistematik oskültasyon;
          SCORM uyumlu ölçme ve değerlendirme.
        </p>
        <button className="hero-cta" onClick={begin}>
          Simülatörü başlat <IconArrowRight />
        </button>
        <div className="hero-links">
          <button className="hero-link" onClick={() => dispatch({ type: 'goto', screen: 'tutorial' })}>
            Nasıl kullanılır?
          </button>
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
        <button className="hero-audio-hint" onClick={() => void playTone()}>
          <IconHeadphones />
          Oskültasyon seslerini doğru değerlendirebilmek için kulaklık kullanmanız önerilir.
          <span className="hero-audio-check">Ses düzeyi kontrol</span>
        </button>
      </div>
      <Footer />
    </div>
  )
}
