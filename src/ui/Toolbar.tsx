import { useState } from 'react'
import type { CaseDef, Question, StethHead } from '../core/types'
import { useStore } from '../core/store'
import { bus } from '../core/events'
import { engine } from '../audio/engineSingleton'
import type { StageHandle } from './PatientStage'
import { IconBell, IconDiaphragm, IconVolume, IconVolumeX, IconLightbulb, IconBodyFront, IconBodyBack } from './icons'

/** Alt araç çubuğu (§20): Bell/Diyafram · Ön/Arka · Ses düzeyi · Tekrar dinle · İpucu.
 *  madde 6 (wave 3): dinleme durumu göstergesi buradan kalktı — sahnenin sol üst köşesinde
 *  küçük bir rozet olarak gösterilir (`.stage-badge`, bkz. PatientStage.tsx); toolbar yalnız
 *  kontrolleri barındırır, en dolu senaryoda daralmaz. */

interface Props {
  caseDef?: CaseDef
  stageRef: React.RefObject<StageHandle | null>
  activePoint: string | null
  question?: Question
  onHint?: () => void
  /** değerlendirme: ipucu, tekrar dinleme ve durum göstergeleri kapalı */
  strict?: boolean
}

export function Toolbar({ caseDef, stageRef, activePoint, question, onHint, strict = false }: Props) {
  const { state, dispatch } = useStore()
  const heads = (caseDef?.allowedHeads ?? ['bell', 'diaphragm']) as StethHead[]
  const [muted, setMuted] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)
  const showHint = !strict && !!question?.hint && !hintOpen && state.hintsUsed === 0

  const setHead = (h: StethHead) => {
    dispatch({ type: 'setHead', head: h })
  }

  return (
    <>
      {hintOpen && question?.hint && (
        <div className="hint-box" role="note">
          <IconLightbulb />
          <span>
            {question.hint}
            <span className="muted small"> (İpucu kullanıldı — puanı -5)</span>
          </span>
        </div>
      )}
      <div className="toolbar" role="toolbar" aria-label="Oskültasyon araçları">
        <div className="head-toggle" role="group" aria-label="Stetoskop kafası seçimi">
          {heads.map((h) => (
            <button
              key={h}
              className={state.head === h ? 'active' : ''}
              onClick={() => setHead(h)}
              aria-pressed={state.head === h}
              title={h === 'bell' ? 'Bell — düşük frekans vurgusu' : 'Diyafram — orta/yüksek frekans vurgusu'}
            >
              {h === 'bell' ? <IconBell /> : <IconDiaphragm />}
              {h === 'bell' ? 'Bell' : 'Diyafram'}
            </button>
          ))}
        </div>
        <div className="tool-sep" />
        <div className="view-toggle">
          <button
            className={state.view === 'front' ? 'active' : ''}
            onClick={() => { dispatch({ type: 'setView', view: 'front' }); bus.emit({ type: 'view_changed', view: 'front', at: Date.now() }) }}
          >
            <IconBodyFront /> Ön
          </button>
          <button
            className={state.view === 'back' ? 'active' : ''}
            onClick={() => { dispatch({ type: 'setView', view: 'back' }); bus.emit({ type: 'view_changed', view: 'back', at: Date.now() }) }}
          >
            <IconBodyBack /> Arka
          </button>
        </div>
        <div className="tool-sep" />
        <div className="vol-group">
          <button
            aria-label={muted ? 'Sesi aç' : 'Sesi kıs'}
            onClick={() => {
              const m = !muted
              setMuted(m)
              engine.setMuted(m)
            }}
            style={{ background: 'none', border: 0, color: 'inherit', display: 'flex', padding: 2 }}
          >
            {muted ? <IconVolumeX /> : <IconVolume />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(state.volume * 100)}
            aria-label="Ses düzeyi"
            onChange={(e) => {
              const v = Number(e.target.value) / 100
              dispatch({ type: 'setVolume', volume: v })
              engine.setVolume(v)
            }}
          />
          <span className="pct">%{Math.round(state.volume * 100)}</span>
        </div>
        {!strict && (
          <>
            <div className="tool-sep" />
            <button
              className="btn outline small"
              onClick={() => {
                dispatch({ type: 'replay' })
                stageRef.current?.replay()
                if (activePoint) bus.emit({ type: 'sound_replayed', pointId: activePoint, at: Date.now() })
              }}
              disabled={!activePoint}
            >
              <IconVolume /> Tekrar Dinle
            </button>
          </>
        )}
        {/* madde 4 (wave 3): mobilde toolbar sahnenin altında, soru kartının üstünde yapışkan
            kalır — soruya hızlı erişim için küçük bir kısayol düğmesi (yalnız ≤720px'te görünür;
            yalnız Uygulama/Değerlendirme'de — LearnScreen bu prop'u vermez) */}
        {caseDef && (
          <button
            type="button"
            className="btn outline small jump-to-q"
            onClick={() => document.querySelector('.sim-side .q-card-dark, .sim-side .case-end-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Soruya git ↓
          </button>
        )}
        <div className="spacer" style={{ flex: 1 }} />
        {showHint && (
          <button
            className="btn outline small"
            title="İpucu kullanımı -5 puan"
            onClick={() => {
              onHint?.()
              setHintOpen(true)
            }}
          >
            <IconLightbulb /> İpucu
          </button>
        )}
      </div>
    </>
  )
}
