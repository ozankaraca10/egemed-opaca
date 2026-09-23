/** EGEMED Opaca — 28 rozet tanımı ve değerlendirme (yol haritası §5).
 *  Saf fonksiyon; zaman yalnız `evaluateBadges`'in `at` damgası için kullanılır (dışarıdan verilir). */

import type { Stats } from './stats'
import { RULES } from './rules'

export type BadgeCategory = 'topic' | 'skill' | 'streak' | 'learn' | 'milestone'
export type BadgeTier = 'bronze' | 'silver' | 'gold'

export interface BadgeProgress {
  value: number
  max: number
}

export interface BadgeDef {
  id: string
  cat: BadgeCategory
  icon: string
  name: string
  tier?: BadgeTier
  desc: string
  progress: (stats: Stats) => BadgeProgress
}

const topic = (id: string, max: number): ((s: Stats) => BadgeProgress) => (s) => ({ value: s.topicCorrect[id] ?? 0, max })

/** "podium" v1'de asla kazanılamaz (demo akranlarla gösterilir) — ilerlemesi her zaman 0/1 döner. */
const neverEarnable: (s: Stats) => BadgeProgress = () => ({ value: 0, max: 1 })

export const BADGES: BadgeDef[] = [
  // beceri
  {
    id: 'sharp-eye-1', cat: 'skill', icon: 'Target', name: 'Keskin Göz', tier: 'bronze',
    desc: `Değerlendirmede ${RULES.badges.sharpEye[0]} isabetli lokalizasyon.`,
    progress: (s) => ({ value: s.localizationHits, max: RULES.badges.sharpEye[0] }),
  },
  {
    id: 'sharp-eye-2', cat: 'skill', icon: 'Target', name: 'Keskin Göz', tier: 'silver',
    desc: `Değerlendirmede ${RULES.badges.sharpEye[1]} isabetli lokalizasyon.`,
    progress: (s) => ({ value: s.localizationHits, max: RULES.badges.sharpEye[1] }),
  },
  {
    id: 'sharp-eye-3', cat: 'skill', icon: 'Target', name: 'Keskin Göz', tier: 'gold',
    desc: `Değerlendirmede ${RULES.badges.sharpEye[2]} isabetli lokalizasyon.`,
    progress: (s) => ({ value: s.localizationHits, max: RULES.badges.sharpEye[2] }),
  },
  {
    id: 'systematic', cat: 'skill', icon: 'Scan', name: 'Sistematik Okuyucu',
    desc: 'Bir vakada ABCDE sırasını eksiksiz izle.',
    progress: (s) => ({ value: s.abcdeCompleteCount, max: 1 }),
  },
  {
    id: 'film-quality', cat: 'skill', icon: 'Film', name: 'Film Kalitesi',
    desc: `${RULES.badges.filmQuality} vakada film kalitesi sorusunu doğru yanıtla.`,
    progress: (s) => ({ value: s.qualityCorrect, max: RULES.badges.filmQuality }),
  },
  {
    id: 'fast-accurate', cat: 'skill', icon: 'Clock', name: 'Hızlı ve Doğru',
    desc: 'Süre sınırının yarısında 90+ puan.',
    progress: (s) => ({ value: s.fastPerfectCount, max: 1 }),
  },
  {
    id: 'interpreter', cat: 'skill', icon: 'Doc', name: 'Klinik Yorumcu',
    desc: `${RULES.badges.interpreter} vakada klinik yorum sorusunu doğru yanıtla.`,
    progress: (s) => ({ value: s.interpretationCorrect, max: RULES.badges.interpreter }),
  },
  // konu
  { id: 'pleura', cat: 'topic', icon: 'Lungs', name: 'Plevra Dedektifi', desc: `${RULES.badges.pleura} pnömotoraks/efüzyon vakasını doğru tanı.`, progress: topic('pleura', RULES.badges.pleura) },
  { id: 'cardiac', cat: 'topic', icon: 'Heart', name: 'Kalp Gölgesi', desc: `${RULES.badges.cardiac} kardiyomegali vakasını doğru tanı.`, progress: topic('cardiac', RULES.badges.cardiac) },
  { id: 'nodule', cat: 'topic', icon: 'Brain', name: 'Nodül Avcısı', desc: `${RULES.badges.nodule} nodül/kitle vakasını doğru tanı.`, progress: topic('nodule', RULES.badges.nodule) },
  { id: 'tb', cat: 'topic', icon: 'Lungs', name: 'Tüberküloz Okuru', desc: `${RULES.badges.tb} tüberküloz vakasını doğru tanı.`, progress: topic('tb', RULES.badges.tb) },
  { id: 'pediatric', cat: 'topic', icon: 'User', name: 'Pediatri', desc: `${RULES.badges.pediatric} pediatrik vakayı doğru tanı.`, progress: topic('pediatric', RULES.badges.pediatric) },
  { id: 'diaphragm', cat: 'topic', icon: 'Diaphragm', name: 'Diyafram Bilgesi', desc: `${RULES.badges.diaphragm} diyafram konusu vakasını doğru tanı.`, progress: topic('diaphragm', RULES.badges.diaphragm) },
  { id: 'bone', cat: 'topic', icon: 'Bone', name: 'Kemik Gözü', desc: `${RULES.badges.bone} kırık vakasını doğru tanı.`, progress: topic('bone', RULES.badges.bone) },
  { id: 'vascular', cat: 'topic', icon: 'Wave', name: 'Damar Yolu', desc: `${RULES.badges.vascular} pulmoner vasküler vakayı doğru tanı.`, progress: topic('vascular', RULES.badges.vascular) },
  // seri
  { id: 'streak-3', cat: 'streak', icon: 'Flame', name: '3 Günlük Seri', desc: '3 gün üst üste en az bir oturum.', progress: (s) => ({ value: s.streakLongest, max: RULES.badges.streak[0] }) },
  { id: 'streak-7', cat: 'streak', icon: 'Flame', name: '7 Günlük Seri', desc: '7 gün üst üste en az bir oturum.', progress: (s) => ({ value: s.streakLongest, max: RULES.badges.streak[1] }) },
  { id: 'streak-30', cat: 'streak', icon: 'Flame', name: 'Ay Boyu Seri', desc: '30 gün üst üste en az bir oturum.', progress: (s) => ({ value: s.streakLongest, max: RULES.badges.streak[2] }) },
  { id: 'marathon', cat: 'streak', icon: 'Chart', name: 'Maraton', desc: `${RULES.badges.marathon} değerlendirme oturumu tamamla.`, progress: (s) => ({ value: s.assessmentCount, max: RULES.badges.marathon }) },
  // öğrenme
  { id: 'explorer', cat: 'learn', icon: 'Book', name: 'Öğrenme Kaşifi', desc: `Öğrenme modunda ${RULES.badges.explorerTopics} farklı konu incele.`, progress: (s) => ({ value: s.learnTopicsCount, max: RULES.badges.explorerTopics }) },
  { id: 'ct-explorer', cat: 'learn', icon: 'Diaphragm', name: 'BT Kaşifi', desc: 'Bir toraks BT kesit yığınını baştan sona tara.', progress: (s) => ({ value: s.ctStacksCompletedCount, max: 1 }) },
  { id: 'practice-grit', cat: 'learn', icon: 'Graduation', name: 'Uygulama Azmi', desc: `Uygulama modunda ${RULES.badges.practiceGrit} vaka çöz.`, progress: (s) => ({ value: s.practiceCaseTotal, max: RULES.badges.practiceGrit }) },
  // kilometre taşı
  { id: 'first-step', cat: 'milestone', icon: 'Chart', name: 'İlk Adım', desc: 'İlk değerlendirme oturumunu tamamla.', progress: (s) => ({ value: s.assessmentCount, max: 1 }) },
  { id: 'threshold', cat: 'milestone', icon: 'CheckCircle', name: 'Eşik Aşıldı', desc: 'Bir değerlendirmede ilk kez 80 ve üzeri puan.', progress: (s) => ({ value: s.bestAssessmentScore, max: RULES.badges.thresholdScore }) },
  { id: 'no-hints', cat: 'milestone', icon: 'Lightbulb', name: 'İpucusuz', desc: `Uygulamada ipucu kullanmadan ${RULES.badges.noHintsCaseMin} vakalık oturum.`, progress: (s) => ({ value: s.noHintPracticeSessionCount, max: 1 }) },
  { id: 'perfect', cat: 'milestone', icon: 'Star', name: 'Kusursuz Oturum', desc: 'Bir değerlendirmede 100 puan.', progress: (s) => ({ value: s.perfectSessionCount, max: 1 }) },
  { id: 'podium', cat: 'milestone', icon: 'Medal', name: 'Podyum', desc: "Aylık sıralamada ilk 3'e gir.", progress: neverEarnable },
  { id: 'all-topics', cat: 'milestone', icon: 'Trophy', name: 'Tüm Konular', desc: 'Kütüphanedeki her konuda en az bir doğru.', progress: (s) => ({ value: s.allTopicsCoveredCount, max: s.allTopicsTotal }) },
]

/** Rozet asla geri alınmaz: `prevEarned` içindekiler yeniden değerlendirilmez ("podium" hariç,
 *  o zaten hiçbir zaman değerlendirilmez). Yalnız YENİ kazanılan rozetleri döner — çağıran taraf
 *  `[...prevEarned, ...yeniler]` birleştirerek kalıcı hâle getirir. */
export function evaluateBadges(
  stats: Stats,
  prevEarned: { id: string; at: string }[],
  now: Date
): { id: string; at: string }[] {
  const prevIds = new Set(prevEarned.map((e) => e.id))
  const nowIso = now.toISOString()
  const newlyEarned: { id: string; at: string }[] = []
  for (const b of BADGES) {
    if (b.id === 'podium') continue // v1'de kazanılamaz (demo)
    if (prevIds.has(b.id)) continue
    const { value, max } = b.progress(stats)
    if (max > 0 && value >= max) newlyEarned.push({ id: b.id, at: nowIso })
  }
  return newlyEarned
}
