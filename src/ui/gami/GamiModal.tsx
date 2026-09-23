import { useEffect, useRef, type ReactNode } from 'react'
import { IconClose } from '../icons'

/** Ortak pencere (ConfirmModal kalıbı): Esc kapatır, odak tuzağı, kapanınca odak `returnTo`'ya döner. */
export function GamiModal({ title, onClose, returnTo, children }: { title: string; onClose: () => void; returnTo?: HTMLElement | null; children: ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const prev = returnTo ?? (document.activeElement as HTMLElement | null)
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const f = cardRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])')
      if (!f || !f.length) return
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose, returnTo])
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal-card" ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button ref={closeRef} className="modal-close" type="button" aria-label="Kapat" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
