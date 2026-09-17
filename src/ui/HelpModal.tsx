import { useEffect, useRef } from 'react'
import { IconClose } from './icons'
import { TutorialSteps } from './TutorialSteps'

/** Yardım penceresi (popup). Üstteki "Yardım" düğmesinden açılır; X, ESC veya
 *  arka plana tıklayarak kapanır. madde 6 (wave 2): içerik artık TutorialScreen ile aynı
 *  TutorialSteps bileşenini kullanır (tekilleştirme) + altında "İpuçları" bloğu. */
export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    // D2: açılışta odak kapat düğmesine taşınır, kapanışta önceki odağa döner
    prevFocusRef.current = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab' && cardRef.current) {
        const focusables = Array.from(
          cardRef.current.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])')
        ).filter((el) => !el.hasAttribute('disabled'))
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prevFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Yardım" onClick={onClose}>
      <div className="modal-card help-modal" ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Nasıl Kullanılır?</h3>
          <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Yardım penceresini kapat" title="Kapat">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <TutorialSteps />
          <div className="help-tips">
            <b>İpuçları</b>
            <ul>
              <li>En iyi deneyim için kulaklık kullanın; ses düzeyi denetimi alt araç çubuğundadır, başlangıç ekranında kulaklık test tonu vardır.</li>
              <li>Bölge listesini klavyeyle de kullanabilirsiniz (Tab ile odaklanın).</li>
              <li>Çalma sırasında sağdaki paneldeki Dalga Formu sekmesi ve turuncu ipucu düğmesi öğrenmeyi destekler.</li>
              <li>Geliştiriciler, kaynaklar ve lisanslar için üstteki “Hakkında” düğmesine bakın.</li>
            </ul>
          </div>
          <p className="help-note">Bu simülatör eğitim amaçlıdır; tanı koydurmaz. Klinik karar her zaman hasta bağlamıyla verilir.</p>
        </div>
      </div>
    </div>
  )
}
