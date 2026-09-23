import { useEffect, useRef, type ReactNode } from 'react'

/** Küçük onay penceresi (§ O6). HelpModal ile aynı desen: ESC kapatır, odak yönetimi
 *  yapılır (açılışta ilk odaklanılabilir öğeye taşınır, kapanışta önceki odağa döner).
 *  A1: isteğe bağlı `children` (ör. "Tekrar sorma" onay kutusu) mesaj ile eylem satırı
 *  arasına eklenir; odak tuzağı bu ek denetimleri de kapsayacak şekilde dinamik hesaplanır. */
interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

export function ConfirmModal({ open, title, message, confirmLabel = 'Çık', cancelLabel = 'Vazgeç', onConfirm, onCancel, children }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key === 'Tab') {
        const focusables = cardRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusables || !focusables.length) return
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
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="modal-card confirm-modal" ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>{message}</p>
          {children}
          <div className="confirm-actions">
            <button ref={cancelRef} className="btn" onClick={onCancel}>{cancelLabel}</button>
            <button className="btn primary" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
