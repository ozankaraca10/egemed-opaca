import { useEffect, useState } from 'react'
import { useStore } from '../core/store'
import { bus } from '../core/events'
import { Footer } from '../ui/chrome'
import { ConfirmModal } from '../ui/ConfirmModal'
import { IconArrowRight, IconInfo } from '../ui/icons'
import { computeMetrics } from '../data/metrics'
import sourcesData from '../data/sources.json'

const M = computeMetrics()
const VAL_SHORT = (sourcesData as { module: { validationShort?: string } }).module.validationShort
  ?? 'Radyoloji Anabilim Dalı öğretim üyelerince valide edilmiştir.'

const FS_PROMPT_KEY = 'opaca.fsPromptDone'

/** A1: açılışta tam ekran önerisi — ConfirmModal kalıbıyla, "Tekrar sorma" onay kutusu ile. */
function FullscreenPrompt() {
  const [open, setOpen] = useState(false)
  const [dontAsk, setDontAsk] = useState(false)

  useEffect(() => {
    const fsEnabled = !!document.fullscreenEnabled
    if (!fsEnabled || document.fullscreenElement) return
    let done = false
    try {
      done = localStorage.getItem(FS_PROMPT_KEY) === '1'
    } catch {
      done = false
    }
    if (done) return
    const t = window.setTimeout(() => setOpen(true), 500)
    return () => window.clearTimeout(t)
  }, [])

  const ack = () => {
    if (!dontAsk) return
    try {
      localStorage.setItem(FS_PROMPT_KEY, '1')
    } catch {
      /* localStorage erişilemez — sessizce yut */
    }
  }
  const confirm = () => {
    ack()
    setOpen(false)
    document.documentElement.requestFullscreen?.().catch(() => undefined)
  }
  const cancel = () => {
    ack()
    setOpen(false)
  }

  return (
    <ConfirmModal
      open={open}
      title="Tam ekran önerilir"
      message="EGEMED Opaca en iyi deneyimi tam ekranda sunar. İstediğiniz zaman üst çubuktaki tam ekran düğmesi ya da F tuşuyla değiştirebilirsiniz."
      confirmLabel="Tam ekrana geç"
      cancelLabel="Böyle devam et"
      onConfirm={confirm}
      onCancel={cancel}
    >
      <label className="tut-again">
        <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
        Tekrar sorma
      </label>
    </ConfirmModal>
  )
}

/** Başlangıç ekranı: marka, değer önerisi, veri odaklı güven kutuları. */
export function StartScreen() {
  const { dispatch } = useStore()
  const begin = () => {
    bus.emit({ type: 'simulation_started', at: Date.now() })
    dispatch({ type: 'goto', screen: 'modes' })
  }
  const whyBoxes = [
    {
      label: `${M.images} radyolojik görüntü`,
      desc: M.datasetsUsed ? `${M.datasetsUsed} açık veri setinden, lisansı ve atfı belgelenmiş.` : 'Veri setleri içe aktarıldığında burada listelenir.',
    },
    { label: `${M.expertImages} radyolog etiketli film`, desc: `${M.annotatedImages} filmde bulgunun yeri uzman tarafından işaretlenmiş. ${VAL_SHORT}` },
    { label: `${M.totalCases} vaka · ${M.zones} okuma bölgesi`, desc: 'Her oturumda rastgele 10 vaka; rapor tabanlı etiketler değerlendirmeye girmez.' },
  ]
  return (
    <div className="screen start-hero-screen">
      <div className="hero-glow" aria-hidden="true" />
      <div className="start-hero">
        <div className="start-card">
          <div className="start-card-inner">
            <img className="hero-logo" src="brand/logo-horizontal-web.png" alt="EGEMED Opaca — Radyolojik Görüntüleme Simülatörü" />
            <h1 className="hero-title">Radyolojik görüntüyü sistematik okumayı gerçek verilerle öğrenin.</h1>
            <p className="hero-sub">
              Akciğer grafisi ve toraks BT; {M.libraryItems} konu başlığı, ABCDE okuma rehberi ve görüntü
              üzerinde işaretleme; SCORM uyumlu ölçme ve değerlendirme.
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
        </div>
      </div>
      <Footer />
      <FullscreenPrompt />
    </div>
  )
}
