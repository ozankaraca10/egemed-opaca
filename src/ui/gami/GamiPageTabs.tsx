import { useRef } from 'react'
import { useStore } from '../../core/store'
import { IconAward, IconChart } from '../icons'

type Tab = 'achievements' | 'leaderboard'
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'achievements', label: 'Başarılarım', icon: <IconAward width={16} height={16} /> },
  { id: 'leaderboard', label: 'Liderlik Tahtası', icon: <IconChart /> },
]

/** Başarılarım ↔ Liderlik Tahtası alt gezinmesi (tasarım promptu §3). Ok tuşlarıyla sekme değişir. */
export function GamiPageTabs({ active }: { active: Tab }) {
  const { dispatch } = useStore()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const go = (id: Tab) => dispatch({ type: 'goto', screen: id })
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    refs.current[next]?.focus()
    go(TABS[next].id)
  }
  return (
    <div className="gami-pagetabs" role="tablist" aria-label="Oyunlaştırma">
      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => { refs.current[i] = el }}
          role="tab"
          type="button"
          aria-selected={t.id === active}
          tabIndex={t.id === active ? 0 : -1}
          onClick={() => go(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  )
}
