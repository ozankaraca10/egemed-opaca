import { useEffect, useState } from 'react'
import { HelpModal } from './HelpModal'
import { ConfirmModal } from './ConfirmModal'
import { useStore } from '../core/store'
import { IconHelpCircle, IconFullscreen, IconFullscreenExit, IconSwap, IconInfo } from './icons'

export function BrandMark({ size = 30 }: { size?: number }) {
  return <img src="brand/logo-icon-white-web.png" alt="" width={size} height={size} className="brand-mark" />
}

export function Header() {
  const { state, dispatch, runtime } = useStore()
  const [fs, setFs] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // O6: değerlendirme sırasında marka/"Mod Değiştir" doğrudan çıkmaz — önce onay istenir.
  const [exitTarget, setExitTarget] = useState<'start' | 'modes' | null>(null)
  const modeShort = state.mode === 'learn' ? 'Öğrenme' : state.mode === 'practice' ? 'Uygulama' : 'Değerlendirme'
  const modeLabel = `${modeShort} Modu`
  const inAssessment = state.mode === 'assessment' && state.screen === 'simulation'
  const inWorkScreen = state.screen === 'simulation' || state.screen === 'learn'

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFs = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined)
    else document.exitFullscreen?.().catch(() => undefined)
  }

  // A1: "F" kısayolu tam ekranı açar/kapatır — form alanı, sözleşilebilir içerik ya da
  // açık bir pencere (dialog) varken devre dışı; odak düğmelerden herhangi birindeyken de çalışır.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.key.toLowerCase() !== 'f') return
      const t = e.target as HTMLElement | null
      if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return
      if (document.querySelector('.modal-overlay')) return
      e.preventDefault()
      toggleFs()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goStart = () => (inAssessment ? setExitTarget('start') : dispatch({ type: 'goto', screen: 'start' }))
  const goModes = () => (inAssessment ? setExitTarget('modes') : dispatch({ type: 'goto', screen: 'modes' }))
  const confirmExit = () => {
    if (exitTarget) dispatch({ type: 'goto', screen: exitTarget })
    setExitTarget(null)
  }

  return (
    <header className="eg-header">
      <button className="eg-brand" onClick={goStart} aria-label="Ana ekran">
        <BrandMark size={32} />
        <span className="brand-block">
          <span className="brand-top">EGEMED</span>
          <span className="brand-name">Opaca<sup className="tm">™</sup></span>
        </span>
      </button>
      <span className="divider-v app-subtitle-sep" aria-hidden="true" />
      <span className="app-subtitle">Radyolojik Görüntüleme Simülatörü</span>
      <div className="spacer" />
      {/* madde 3: header'ın ortasında tek bir "bağlam grubu" — mod çipi + (değerlendirmede) zamanlayıcı */}
      {inWorkScreen && (
        <div className="eg-header-context">
          {state.screen === 'simulation' && (
            <span className={`eg-mode-chip ${state.mode}`} aria-label={modeLabel}>
              <span className="lbl-full">{modeLabel}</span>
              <span className="lbl-short" aria-hidden="true">{modeShort}</span>
            </span>
          )}
          {state.mode === 'assessment' && state.screen === 'simulation' && (
            <span className="eg-timer" aria-live="off">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
              {fmtTimer(state.assessmentTimer)}
            </span>
          )}
        </div>
      )}
      <div className="spacer" />
      {inWorkScreen && (
        <button
          className="eg-header-chip clickable hide-mobile"
          onClick={goModes}
          aria-label="Mod değiştir"
          title="Mod seçim ekranına dön"
        >
          <IconSwap /> <span className="chip-text">Mod Değiştir</span>
        </button>
      )}
      <button
        className="eg-header-chip clickable hide-mobile"
        onClick={toggleFs}
        aria-label={fs ? 'Tam ekrandan çık' : 'Tam ekran'}
        title={fs ? 'Tam ekrandan çık' : 'Tam ekran (F)'}
      >
        {fs ? <IconFullscreenExit /> : <IconFullscreen />} <span className="chip-text">{fs ? 'Tam ekrandan çık' : 'Tam ekran'}</span>
      </button>
      <span className="divider-v" />
      <button className="eg-header-chip clickable" onClick={() => setHelpOpen(true)} aria-label="Yardım" title="Yardım">
        <IconHelpCircle /> <span className="chip-text">Yardım</span>
      </button>
      <button
        className="eg-header-chip clickable"
        onClick={() => dispatch({ type: 'goto', screen: 'sources' })}
        aria-label="Hakkında"
        title="EGEMED Opaca Hakkında"
      >
        <IconInfo /> <span className="chip-text">Hakkında</span>
      </button>
      {/* wave 2 madde 0: DEV rozeti header'ın en sağında, Hakkında'dan sonra — footer'a hiç binmez */}
      {runtime?.flags.dev && !(typeof window !== 'undefined' && window.location.search.includes('dev=1')) && (
        <span className="eg-dev-badge" title="Geliştirici build — teşhis paneli için ?dev=1 ekleyin">DEV</span>
      )}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ConfirmModal
        open={exitTarget !== null}
        title="Değerlendirmeden çıkılsın mı?"
        message="İlerlemeniz kaydedilir, oturum devam ettirilebilir."
        confirmLabel="Çık"
        cancelLabel="Vazgeç"
        onConfirm={confirmExit}
        onCancel={() => setExitTarget(null)}
      />
    </header>
  )
}

function fmtTimer(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function Footer() {
  return (
    <footer className="eg-footer">
      <div className="footer-left">
        <img src="brand/logo-icon-web.png" alt="" className="footer-seal" />
        <span className="footer-text">
          <span className="footer-brand">EGEMED Opaca<sup className="tm">™</sup></span>
          <span className="footer-sub"> Radyolojik Görüntüleme Simülatörü</span>
          <span className="footer-inst">, Ege Üniversitesi Tıp Fakültesi Dekanlığı tarafından geliştirilmiştir.</span>
          <span className="footer-copy"> Tüm hakları saklıdır © 2026</span>
        </span>
      </div>
      <div className="footer-right">
        <span className="footer-attr2">Görüntüler: NIH Clinical Center (ChestX-ray14) · RSNA/STR açıklamaları</span>
      </div>
    </footer>
  )
}

/** madde 2: EKG dekorasyonu kaldırıldı (footer'ın üstüne biniyordu, her ekranda aynı
 *  yerde içerikle çakışıyordu) — yalnız hafif arka plan yıkaması kalır. */
export function EcgDeco() {
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="bg-wash" />
    </div>
  )
}
