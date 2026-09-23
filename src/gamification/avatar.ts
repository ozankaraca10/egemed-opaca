/** EGEMED Opaca — avatar tonu (tasarım promptu K-A2). Aynı kimlik her zaman aynı tonu alır; tonlar yalnız
 *  mavi/mor/yeşil/amber token ailelerinden (styles-gami.css `.gami-avatar.t-*`). Anonim kişi gri (`t-anon`). */

export type AvatarTone = 't-blue' | 't-purple' | 't-green' | 't-amber' | 't-anon'
const TONES: AvatarTone[] = ['t-blue', 't-purple', 't-green', 't-amber']

export function avatarTone(id: string, anonymous = false): AvatarTone {
  if (anonymous) return 't-anon'
  let h = 7
  for (const ch of id) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}
