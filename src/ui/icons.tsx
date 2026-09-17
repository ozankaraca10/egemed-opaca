/** Inline SVG ikon seti — uzak bağımlılık yok (§30). */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (p: P) => ({ xmlns: 'http://www.w3.org/2000/svg', width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p })

export const IconStethoscope = (p: P) => (
  <svg {...base(p)}><path d="M4.8 2.3A6 6 0 0 0 10 8v3a4 4 0 0 0 8 0v-1" /><path d="M18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path d="M14 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M14 19h2a4 4 0 0 0 4-4" /></svg>
)
export const IconHeart = (p: P) => <svg {...base(p)}><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l6.5 6.5z" /><path d="M3.2 12h5l1.8-3 2 5 2-4 1.5 2h5" /></svg>
export const IconLungs = (p: P) => (
  <svg {...base(p)}><path d="M12 3v7c0 2-1 3-3 3" /><path d="M12 10c0-2-1-3-3-3" /><path d="M12 3v7c0 2 1 3 3 3" /><path d="M12 10c0-2-1-3-3-3" /><path d="M8 11c-2 0-4 2-4 5 0 2 1 4 3 4 2 0 4-1 4-3v-6z" /><path d="M16 11c2 0 4 2 4 5 0 2-1 4-3 4-2 0-4-1-4-3v-6z" /></svg>
)
export const IconPlay = (p: P) => <svg {...base(p)} fill="currentColor" stroke="none"><path d="M8 5.5v13l11-6.5z" /></svg>
export const IconPause = (p: P) => <svg {...base(p)} fill="currentColor" stroke="none"><rect x="6" y="5" width="4.5" height="14" rx="1.2" /><rect x="13.5" y="5" width="4.5" height="14" rx="1.2" /></svg>
export const IconBack10 = (p: P) => <svg {...base(p)}><path d="M11 4 5 9l6 5" /><path d="M5 9h9a5 5 0 0 1 0 10H8" /></svg>
export const IconFwd10 = (p: P) => <svg {...base(p)}><path d="M13 4l6 5-6 5" /><path d="M19 9h-9a5 5 0 0 0 0 10h6" /></svg>
export const IconVolume = (p: P) => <svg {...base(p)}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></svg>
export const IconVolumeX = (p: P) => <svg {...base(p)}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M22 9l-6 6" /><path d="M16 9l6 6" /></svg>
export const IconHeadphones = (p: P) => <svg {...base(p)}><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><rect x="3" y="14" width="4" height="7" rx="2" /><rect x="17" y="14" width="4" height="7" rx="2" /></svg>
export const IconBell = (p: P) => <svg {...base(p)}><path d="M12 3a6 6 0 0 0-6 6v4l-2 4h16l-2-4V9a6 6 0 0 0-6-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
export const IconDiaphragm = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="9" r="5" /><circle cx="12" cy="9" r="2" /><path d="M12 14v3" /><path d="M8 20h8" /><path d="M12 17a3 3 0 0 0-3 3" /></svg>
)
export const IconDatabase = (p: P) => <svg {...base(p)}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>
export const IconNetwork = (p: P) => <svg {...base(p)}><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M12 7.5v4M7 17l3.5-4M17 17l-3.5-4" /></svg>
export const IconMonitor = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
export const IconShieldCheck = (p: P) => <svg {...base(p)}><path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z" /><path d="m9 12 2 2 4-4" /></svg>
export const IconGraduation = (p: P) => <svg {...base(p)}><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11.5V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" /></svg>
export const IconChart = () => <svg {...base({})}><rect x="4" y="12" width="3.6" height="8" rx="1" /><rect x="10.2" y="7" width="3.6" height="17" rx="1" transform="translate(0 -2)" /><rect x="16.4" y="10" width="3.6" height="14" rx="1" transform="translate(0 0)" /></svg>
export const IconCheckCircle = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 5-6" /></svg>
export const IconXCircle = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg>
export const IconCheck = (p: P) => <svg {...base(p)}><path d="m5 12 5 5 9-10" /></svg>
export const IconInfo = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r="0.5" fill="currentColor" /></svg>
export const IconHelpCircle = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.34c-.9.34-1.4 1-1.4 1.66" /><circle cx="11.9" cy="16.8" r="0.4" fill="currentColor" /></svg>
export const IconGlobe = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></svg>
export const IconUser = (p: P) => <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
export const IconBook = (p: P) => <svg {...base(p)}><path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19a2 2 0 0 0 2 2h13" /></svg>
export const IconClock = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
export const IconTarget = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
export const IconLightbulb = (p: P) => <svg {...base(p)}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 1 3.7 10.7c-.7.6-1 1.4-1 2.3h-4c0-.9-.3-1.7-1-2.3A6 6 0 0 1 12 3z" /></svg>
export const IconDoc = (p: P) => <svg {...base(p)}><path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" /><path d="M14 2v4h4" /><path d="M8 12h8M8 16h8" /></svg>
export const IconExit = (p: P) => <svg {...base(p)}><path d="M15 4h4v16h-4" /><path d="M11 8l-4 4 4 4" /><path d="M7 12h10" /></svg>
export const IconChevronRight = (p: P) => <svg {...base(p)}><path d="m9 5 7 7-7 7" /></svg>
export const IconChevronLeft = (p: P) => <svg {...base(p)}><path d="M15 5l-7 7 7 7" /></svg>
export const IconArrowRight = (p: P) => <svg {...base(p)}><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></svg>
export const IconReplay = (p: P) => <svg {...base(p)}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
export const IconTrophy = (p: P) => (
  <svg {...base(p)}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 5H5a3 3 0 0 0 3 5M16 5h3a3 3 0 0 1-3 5" /><path d="M12 13v4M8 21h8M10 17h4l1 4H9z" /></svg>
)
export const IconWave = (p: P) => <svg {...base(p)}><path d="M2 12h3l2-6 3 12 3-9 2.5 5.5L18 9l2 3h2" /></svg>
export const IconBodyFront = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="4.5" r="2" /><path d="M8 8h8v6l-1.5 9h-2l-.5-7-.5 7h-2L8 14z" /><path d="M8 8l-2.5 2M16 8l2.5 2" /></svg>
)
export const IconBodyBack = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="4.5" r="2" /><path d="M8 8h8v6l-1.5 9h-2L12 16l-.5 7h-2L8 14z" /><path d="M9 9.5h6M9.5 12h5" /></svg>
)
export const IconDrag = (p: P) => <svg {...base(p)}><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-2.5a1.5 1.5 0 0 1 3 0V13" /></svg>
export const IconFingerTap = (p: P) => <svg {...base(p)}><path d="M10 12V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M13 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5.4-3.4L2 14" /></svg>
export const IconCompare = (p: P) => <svg {...base(p)}><path d="M8 3v18M16 3v18" /><path d="M2 9h4M18 9h4M2 15h4M18 15h4" /></svg>
export const IconBrain = (p: P) => <svg {...base(p)}><path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5.5A3 3 0 0 0 5 12a3 3 0 0 0 1.5 5.2A2.8 2.8 0 0 0 9 21c1.2 0 2-.8 2-2V5a2 2 0 0 0-2-2z" /><path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 3 5.5 3 3 0 0 1-2 5.5 2.8 2.8 0 0 1-2.5 4c-1.2 0-2-.8-2-2V5a2 2 0 0 1 .5-2z" /></svg>
export const IconSource = (p: P) => <svg {...base(p)}><path d="M12 6c-1.5-1.8-3.6-2-6-2v14c2.4 0 4.5.2 6 2 1.5-1.8 3.6-2 6-2V4c-2.4 0-4.5.2-6 2z" /><path d="M12 6v14" /></svg>
export const IconLogo = (p: P) => (
  <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" {...p}>
    <circle cx="20" cy="20" r="19" fill="#fff" />
    <circle cx="20" cy="20" r="19" fill="none" stroke="#0d346f" strokeWidth="0" />
    <path d="M12 22.5c0-4.7 3.6-8.5 8-8.5s8 3.8 8 8.5-3.6 8.5-8 8.5" fill="none" stroke="#0d346f" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="20" cy="31" r="2.6" fill="#0d346f" />
    <path d="M13 13.5c2-2.8 4.4-4.2 7-4.2 3.2 0 5.4 1.4 7 4.2" fill="none" stroke="#1673e6" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M20 9.2v5.2" stroke="#1673e6" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)
export const IconFullscreen = (p: P) => <svg {...base(p)}><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
export const IconFullscreenExit = (p: P) => <svg {...base(p)}><path d="M3 8h3a2 2 0 0 0 2-2V3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M21 16h-3a2 2 0 0 0-2 2v3" /></svg>
export const IconEcg = (p: P) => (
  <svg viewBox="0 0 340 90" {...p} fill="none" stroke="#1673e6" strokeWidth="2">
    <path d="M0 45h60l8-22 10 44 12-22h40l8-22 10 44 12-22h40l8-22 10 44 12-22h40l8-22 10 44 12-22h27" opacity=".55" />
  </svg>
)

export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </svg>
)

export const IconSwap = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8h13l-3-3" />
    <path d="M20 16H7l3 3" />
  </svg>
)
export const IconFilm = (p: P) => (
  <svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M12 6v9" /><path d="M12 8c-2.5 0-4.5 1.5-5 5-.3 2 .3 3.5 2 3.5 2 0 3-1.5 3-3.5" /><path d="M12 8c2.5 0 4.5 1.5 5 5 .3 2-.3 3.5-2 3.5-2 0-3-1.5-3-3.5" /></svg>
)
export const IconScan = (p: P) => (
  <svg {...base(p)}><path d="M4 8V5a1 1 0 0 1 1-1h3" /><path d="M16 4h3a1 1 0 0 1 1 1v3" /><path d="M20 16v3a1 1 0 0 1-1 1h-3" /><path d="M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M3 12h18" /></svg>
)
export const IconBone = (p: P) => (
  <svg {...base(p)}><path d="M17 10c.7.7 2 .7 2.8-.2a2 2 0 0 0-1.4-3.3 2 2 0 0 0-3.3-1.4c-.9.8-.9 2.1-.2 2.8L8.1 14.9c-.7-.7-2-.7-2.8.2a2 2 0 0 0 1.4 3.3 2 2 0 0 0 3.3 1.4c.9-.8.9-2.1.2-2.8z" /></svg>
)
