/** EGEMED Opaca — aylık ödül yapılandırması (mock) ve geçmiş kazananlar (yol haritası §4, tasarım
 *  promptu §5.1). Kohort ve asgari deneme sayısı KARAR BEKLİYOR taslaktı; kullanıcı kararıyla kohort
 *  artık 1–6'nın tamamı, asgari değerlendirme taslak olarak 4 kalıyor (bkz. docs/GAMIFICATION-HANDOFF.md).
 *  Bu dosyadaki veriler `docs/mockups/gami-mock-data.mjs`'teki `reward`/`history` ile içerik olarak
 *  uyumludur. Saf veri + saf okuma fonksiyonları; `now` her zaman parametre. */

import type { MonthlyReward, RewardWinner } from './types'
import { monthKeyTr } from './time'

const SEPTEMBER_2026: MonthlyReward = {
  month: '2026-09',
  title: 'Girişimsel Radyolojide bir girişime gözlemci olarak katılım',
  description:
    "Ayın ilk 3'ü, Radyoloji AD öğretim üyesi eşliğinde bir girişimsel işlemi gözlemleme fırsatı kazanır.",
  sponsor: 'Radyoloji Anabilim Dalı',
  winnersCount: 3,
  eligibility: { cohorts: [1, 2, 3, 4, 5, 6], minAssessments: 4, requirePublicName: true },
  terms: [
    'Uygun kohortlar: Dönem 1–6 öğrencileri.',
    'Ay içinde en az 4 değerlendirme oturumu tamamlanmalıdır.',
    'Puan: ay içindeki en iyi 3 değerlendirmenin ortalaması.',
    'Eşitlikte bu puana önce ulaşan öne geçer.',
    'Sıralamada adla görünmek (anonim olmamak) zorunludur.',
    'Kazananlarla fakülte e-postası üzerinden iletişim kurulur.',
    'Ödül devredilemez; hasta onamı ve klinik uygunluğa bağlıdır, tarih Radyoloji AD ile planlanır.',
    'Kopya veya kural ihlalinde hak kaybedilir.',
  ],
}

/** Ay anahtarına ('YYYY-MM') göre yapılandırılmış aylık ödüller. Yalnız burada tanımlı aylar vardır;
 *  başka bir ay için `monthlyRewardFor` null döner (o ay ödül yapılandırılmamış demektir). */
export const MONTHLY_REWARDS: Record<string, MonthlyReward> = {
  '2026-09': SEPTEMBER_2026,
}

/** Ay için yapılandırılmış ödül; yoksa (yeni ay henüz yapılandırılmadıysa) o aydan önceki en son yapılandırılmış
 *  ödül aynı koşullarla o ay için geçerli sayılır — ödül ay başında kendiliğinden kaybolmaz. Hiç yoksa null. */
export function monthlyRewardFor(month: string): MonthlyReward | null {
  if (MONTHLY_REWARDS[month]) return MONTHLY_REWARDS[month]
  const prev = Object.keys(MONTHLY_REWARDS).filter((m) => m < month).sort().at(-1)
  return prev ? { ...MONTHLY_REWARDS[prev], month } : null
}

/** Geçmiş kazananlar (demo verisi — docs/mockups/gami-mock-data.mjs `history` ile aynı isimler). */
export const REWARD_WINNERS_HISTORY: RewardWinner[] = [
  { month: '2026-08', rank: 1, displayName: 'Mert Tunç', score: 92.7, isMe: false },
  { month: '2026-08', rank: 2, displayName: 'Deniz Kaya', score: 90.1, isMe: false },
  { month: '2026-08', rank: 3, displayName: 'Burak Demir', score: 88.4, isMe: false },
  { month: '2026-07', rank: 1, displayName: 'Ece Sarı', score: 91.5, isMe: false },
  { month: '2026-07', rank: 2, displayName: 'Can Öztürk', score: 89.9, isMe: false },
  { month: '2026-07', rank: 3, displayName: 'Elif Şahin', score: 87.2, isMe: false },
  { month: '2026-06', rank: 1, displayName: 'Deniz Kaya', score: 93.0, isMe: false },
  { month: '2026-06', rank: 2, displayName: 'Zeynep Arslan', score: 90.6, isMe: false },
  { month: '2026-06', rank: 3, displayName: 'Kerem Aydın', score: 88.8, isMe: false },
]

/** `now`'dan geriye (dahil) son N ayın kazananları, en yeni ay önce. */
export function rewardWinnersHistory(lastNMonths: number, now: Date): RewardWinner[] {
  const currentMonth = monthKeyTr(now)
  const months = Array.from(new Set(REWARD_WINNERS_HISTORY.map((w) => w.month)))
    .filter((m) => m < currentMonth)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, lastNMonths)
  const monthSet = new Set(months)
  return REWARD_WINNERS_HISTORY.filter((w) => monthSet.has(w.month)).sort(
    (a, b) => (a.month === b.month ? a.rank - b.rank : a.month < b.month ? 1 : -1)
  )
}
