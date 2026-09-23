import { avatarTone } from '../../gamification/avatar'
import { initials } from '../../gamification/repo'

const ANON_INITIALS = 'AÖ'

/** Baş harf avatarı. Ad yoksa (anonim) "AÖ" ve gri ton; ekran okuyucudan gizli (ad zaten yanında yazılı). */
export function GamiAvatar({ id, name, size = 'md' }: { id: string; name: string | null; size?: 'md' | 'lg' }) {
  const anon = !name
  return (
    <span className={`gami-avatar ${avatarTone(id, anon)}${size === 'lg' ? ' lg' : ''}`} aria-hidden="true">
      {anon ? ANON_INITIALS : initials(name)}
    </span>
  )
}
