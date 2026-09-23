import type { ScoringWeights } from '../../core/types'
import { IconCheckCircle, IconDoc, IconFilm, IconLungs, IconScan, IconTarget } from '../icons'

/** Alan etiketleri ve ikonları — ResultsScreen'deki `domainRows` ile aynı sıra/etiket (o dosyaya dokunulmaz).
 *  ResultsScreen değişirse burası da güncellenmeli (tests/gamification/domainMeta.test.ts eşitliği denetler). */
export const DOMAIN_META: { key: keyof ScoringWeights; label: string; icon: React.ReactNode }[] = [
  { key: 'technique', label: 'Okuma kapsamı', icon: <IconScan /> },
  { key: 'systematic', label: 'ABCDE sırası', icon: <IconScan /> },
  { key: 'quality', label: 'Film kalitesi', icon: <IconFilm /> },
  { key: 'recognition', label: 'Bulgu tanıma', icon: <IconLungs /> },
  { key: 'localization', label: 'Lokalizasyon', icon: <IconTarget /> },
  { key: 'interpretation', label: 'Klinik yorum', icon: <IconDoc /> },
  { key: 'diagnosis', label: 'Tanı (varsa)', icon: <IconCheckCircle /> },
]
/** "zayıf" rozeti eşiği (tasarım promptu §4: <%60). */
export const WEAK_DOMAIN_PCT = 60
