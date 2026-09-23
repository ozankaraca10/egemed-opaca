import { useRef } from 'react'

export interface SegOption<T extends string> { id: T; label: string }

/** Segmented control. `variant="filter"`: aria-pressed düğme grubu (rozet filtreleri);
 *  `variant="tabs"`: role=tablist + ok tuşları (dönem sekmeleri, `purple` seçili tonu). */
export function GamiSeg<T extends string>({ options, value, onChange, label, variant = 'filter', purple = false }: {
  options: SegOption<T>[]
  value: T
  onChange: (id: T) => void
  label: string
  variant?: 'filter' | 'tabs'
  purple?: boolean
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const tabs = variant === 'tabs'
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (!tabs || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    e.preventDefault()
    const next = (i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length
    refs.current[next]?.focus()
    onChange(options[next].id)
  }
  return (
    <div className={`gami-seg${purple ? ' purple' : ''}`} role={tabs ? 'tablist' : 'group'} aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.id}
          ref={(el) => { refs.current[i] = el }}
          type="button"
          {...(tabs
            ? { role: 'tab', 'aria-selected': o.id === value, tabIndex: o.id === value ? 0 : -1 }
            : { 'aria-pressed': o.id === value })}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
