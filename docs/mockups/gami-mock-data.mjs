/**
 * T0 demo verisi (docs/mockups/gami.html). İsimler UYDURMADIR (gerçek kişi değildir).
 * Kullanıcı kararı (23 Eyl 2026): sıralamada gerçek ad gösterilir (SCORM cmi.core.student_name, Moodle'da
 * "Soyad, Ad" → "Ad Soyad"); öğrenci isterse "Anonim öğrenci" olarak görünebilir.
 * Faz 1'de src/gamification/mock.ts bu yapıya uyumlu üretilecek. Rozet listesi ve XP değerleri
 * TASLAKTIR — yol haritası §5/§4 geldiğinde hizalanır.
 */

export const ME_ID = 'u-12'

/** Ayın ödülü (MonthlyReward sözleşmesi, tasarım promptu §5.1). Kohort: Dönem 1–6 (kullanıcı kararı). Asgari deneme: taslak 4. */
export const reward = {
  month: '2026-09',
  monthLabel: 'Eylül 2026',
  title: 'Girişimsel Radyolojide bir girişime gözlemci olarak katılım',
  description: "Ayın ilk 3'ü, Radyoloji AD öğretim üyesi eşliğinde bir girişimsel işlemi gözlemleme fırsatı kazanır.",
  sponsor: 'Radyoloji Anabilim Dalı',
  winnersCount: 3,
  eligibility: { cohorts: [1, 2, 3, 4, 5, 6], minAssessments: 4, requirePublicName: true },
  closesIn: '8 gün 4 saat',
  terms: [
    'Tüm sınıflar (Dönem 1–6) katılabilir.',
    'Ay içinde en az 4 değerlendirme oturumu tamamlanmalıdır.',
    'Puan: ay içindeki en iyi 3 değerlendirmenin ortalaması.',
    'Eşitlikte bu puana önce ulaşan öne geçer.',
    'Sıralamada adla görünmek (anonim olmamak) zorunludur.',
    'Kazananlarla fakülte e-postası üzerinden iletişim kurulur.',
    'Ödül devredilemez; hasta onamı ve klinik uygunluğa bağlıdır, tarih Radyoloji AD ile planlanır.',
    'Kopya veya kural ihlalinde hak kaybedilir.',
  ],
}

/** Aylık sıralama (Bu ay). cohort: dönem; public: adıyla görünür mü (false → Anonim öğrenci). */
export const monthly = [
  { id: 'u-01', name: 'Deniz Kaya', score: 94.3, attempts: 6, level: 12, xp: 3420, cohort: 5, public: true },
  { id: 'u-02', name: 'Ayşe Yıldız', score: 91.0, attempts: 3, level: 11, xp: 3105, cohort: 3, public: true },
  { id: 'u-03', name: 'Mert Tunç', score: 89.7, attempts: 5, level: 10, xp: 2710, cohort: 6, public: true },
  { id: 'u-04', name: 'Ece Sarı', score: 88.0, attempts: 5, level: 9, xp: 1780, cohort: 4, public: true },
  { id: 'u-05', name: 'Can Öztürk', score: 86.4, attempts: 4, level: 9, xp: 1690, cohort: 2, public: true },
  { id: 'u-06', name: null, score: 85.9, attempts: 6, level: 8, xp: 1540, cohort: 5, public: false },
  { id: 'u-07', name: 'Zeynep Arslan', score: 84.2, attempts: 4, level: 7, xp: 1310, cohort: 4, public: true },
  { id: 'u-08', name: 'Burak Demir', score: 83.0, attempts: 5, level: 7, xp: 1255, cohort: 6, public: true },
  { id: 'u-09', name: 'Elif Şahin', score: 81.7, attempts: 4, level: 6, xp: 1040, cohort: 1, public: true },
  { id: 'u-10', name: null, score: 80.1, attempts: 3, level: 4, xp: 680, cohort: 5, public: false },
  { id: 'u-11', name: 'Kerem Aydın', score: 79.9, attempts: 4, level: 6, xp: 990, cohort: 5, public: true },
  { id: 'u-12', name: 'Selin Çelik', score: 79.4, attempts: 4, level: 5, xp: 920, cohort: 5, public: true, delta: 3 },
  { id: 'u-13', name: null, score: 78.8, attempts: 4, level: 5, xp: 870, cohort: 4, public: false },
]
export const cohortSize = 84

/** "Uygunlar arasında ilk 3" — Faz 1'de ranking.ts rewardStandings() olarak saf fonksiyon + testler. */
export function rewardStandings(rows, rw) {
  const reason = (r) => {
    if (!rw.eligibility.cohorts.includes(r.cohort)) return 'cohort'
    if (r.attempts < rw.eligibility.minAssessments) return 'min_assessments'
    if (rw.eligibility.requirePublicName && !r.public) return 'private_profile'
    return 'eligible'
  }
  const withReason = rows.map((r) => ({ ...r, reason: reason(r) }))
  const winners = withReason.filter((r) => r.reason === 'eligible').slice(0, rw.winnersCount)
  const cutoff = winners.at(-1)?.score ?? 0
  return { rows: withReason.map((r) => ({ ...r, candidate: winners.includes(r) })), cutoff }
}

export const history = [
  { month: 'Ağustos 2026', title: 'Girişimsel Radyolojide bir girişime gözlemci olarak katılım', winners: ['Mert Tunç', 'Deniz Kaya', 'Burak Demir'] },
  { month: 'Temmuz 2026', title: 'Radyoloji AD vaka toplantısına konuk katılım', winners: ['Ece Sarı', 'Can Öztürk', 'Elif Şahin'] },
  { month: 'Haziran 2026', title: 'Girişimsel Radyolojide bir girişime gözlemci olarak katılım', winners: ['Deniz Kaya', 'Zeynep Arslan', 'Kerem Aydın'] },
]

export const me = {
  id: ME_ID, name: 'Selin Çelik', level: 5, levelXp: 320, levelXpMax: 500, totalXp: 920,
  streakDays: 3, bestStreak: 7, assessments: 28, practice: 42, avgScore: 85, weekRank: 12, weekOf: 84,
}

/** Son 30 gün değerlendirme puanları + kümülatif XP (grafik). */
export const series = [
  ['24 Ağu', 62, 180], ['26 Ağu', 68, 250], ['28 Ağu', 71, 300], ['31 Ağu', 70, 360], ['2 Eyl', 76, 430], ['4 Eyl', 74, 490],
  ['8 Eyl', 79, 560], ['10 Eyl', 82, 640], ['13 Eyl', 80, 700], ['16 Eyl', 85, 780], ['19 Eyl', 88, 860], ['22 Eyl', 86, 920],
]

export const goals = [
  { icon: 'Chart', label: '5 değerlendirme oturumu', value: 3, max: 5 },
  { icon: 'CheckCircle', label: 'Ortalama başarı ≥ %80', value: 1, max: 1, done: true },
  { icon: 'Award', label: '2 yeni rozet kazan', value: 1, max: 2 },
]

export const domains = [
  ['Scan', 'Okuma kapsamı', 92], ['Scan', 'ABCDE sırası', 78], ['Film', 'Film kalitesi', 88], ['Lungs', 'Bulgu tanıma', 84],
  ['Target', 'Lokalizasyon', 71], ['Doc', 'Klinik yorum', 55], ['CheckCircle', 'Tanı (varsa)', 62],
]

/** 28 rozet (TASLAK). cat: topic | skill | streak | learn | milestone. state: earned | progress | locked. tier: bronze | silver | gold. */
export const CATEGORIES = { topic: 'Konu', skill: 'Beceri', streak: 'Seri', learn: 'Öğrenme', milestone: 'Kilometre taşı' }
export const badges = [
  { cat: 'skill', icon: 'Target', name: 'Keskin Göz', tier: 'bronze', desc: 'Değerlendirmede 10 isabetli lokalizasyon.', state: 'earned', date: '19 Eyl 2026', topic: 'Lokalizasyon' },
  { cat: 'milestone', icon: 'CheckCircle', name: 'Eşik Aşıldı', desc: 'Bir değerlendirmede ilk kez 80 ve üzeri puan.', state: 'earned', date: '10 Eyl 2026' },
  { cat: 'streak', icon: 'Flame', name: '3 Günlük Seri', desc: '3 gün üst üste en az bir oturum.', state: 'earned', date: '22 Eyl 2026' },
  { cat: 'milestone', icon: 'Chart', name: 'İlk Adım', desc: 'İlk değerlendirme oturumunu tamamla.', state: 'earned', date: '24 Ağu 2026' },
  { cat: 'skill', icon: 'Scan', name: 'Sistematik Okuyucu', desc: 'Bir vakada ABCDE sırasını eksiksiz izle.', state: 'earned', date: '28 Ağu 2026' },
  { cat: 'topic', icon: 'Lungs', name: 'Plevra Dedektifi', desc: '5 pnömotoraks veya efüzyon vakasını doğru tanı.', state: 'earned', date: '2 Eyl 2026' },
  { cat: 'topic', icon: 'Heart', name: 'Kalp Gölgesi', desc: '5 kardiyomegali vakasını doğru tanı.', state: 'earned', date: '4 Eyl 2026' },
  { cat: 'skill', icon: 'Film', name: 'Film Kalitesi', desc: '10 vakada film kalitesi sorusunu doğru yanıtla.', state: 'earned', date: '8 Eyl 2026' },
  { cat: 'milestone', icon: 'Lightbulb', name: 'İpucusuz', desc: 'Uygulamada ipucu kullanmadan 10 vakalık oturum.', state: 'earned', date: '13 Eyl 2026' },
  { cat: 'learn', icon: 'Book', name: 'Öğrenme Kaşifi', desc: 'Öğrenme modunda 10 farklı konu incele.', state: 'earned', date: '26 Ağu 2026' },
  { cat: 'learn', icon: 'Diaphragm', name: 'BT Kaşifi', desc: 'Bir toraks BT kesit yığınını baştan sona tara.', state: 'earned', date: '31 Ağu 2026' },
  { cat: 'learn', icon: 'Graduation', name: 'Uygulama Azmi', desc: 'Uygulama modunda 20 vaka çöz.', state: 'earned', date: '16 Eyl 2026' },
  { cat: 'skill', icon: 'Target', name: 'Keskin Göz', tier: 'silver', desc: 'Değerlendirmede 25 isabetli lokalizasyon.', state: 'progress', value: 17, max: 25, topic: 'Lokalizasyon' },
  { cat: 'streak', icon: 'Flame', name: '7 Günlük Seri', desc: '7 gün üst üste en az bir oturum.', state: 'progress', value: 3, max: 7 },
  { cat: 'streak', icon: 'Chart', name: 'Maraton', desc: '50 değerlendirme oturumu tamamla.', state: 'progress', value: 28, max: 50 },
  { cat: 'topic', icon: 'Brain', name: 'Nodül Avcısı', desc: '10 nodül/kitle vakasını doğru tanı.', state: 'progress', value: 7, max: 10, topic: 'Nodül / kitle' },
  { cat: 'topic', icon: 'Lungs', name: 'Tüberküloz Okuru', desc: '10 tüberküloz vakasını doğru tanı.', state: 'progress', value: 4, max: 10, topic: 'Tüberküloz' },
  { cat: 'topic', icon: 'User', name: 'Pediatri', desc: '5 pediatrik vakayı doğru tanı.', state: 'progress', value: 2, max: 5, topic: 'Pediatrik solunum' },
  { cat: 'skill', icon: 'Target', name: 'Keskin Göz', tier: 'gold', desc: 'Değerlendirmede 50 isabetli lokalizasyon.', state: 'locked', rule: '50 isabet' },
  { cat: 'streak', icon: 'Flame', name: 'Ay Boyu Seri', desc: '30 gün üst üste en az bir oturum.', state: 'locked', rule: '30 gün' },
  { cat: 'milestone', icon: 'Star', name: 'Kusursuz Oturum', desc: 'Bir değerlendirmede 100 puan.', state: 'locked', rule: '100 puan' },
  { cat: 'milestone', icon: 'Medal', name: 'Podyum', desc: "Aylık sıralamada ilk 3'e gir.", state: 'locked', rule: 'Aylık ilk 3' },
  { cat: 'skill', icon: 'Clock', name: 'Hızlı ve Doğru', desc: 'Süre sınırının yarısında 90+ puan.', state: 'locked', rule: '90+ · yarı süre' },
  { cat: 'topic', icon: 'Diaphragm', name: 'Diyafram Bilgesi', desc: '5 diyafram konusu vakasını doğru tanı.', state: 'locked', rule: '5 vaka' },
  { cat: 'topic', icon: 'Bone', name: 'Kemik Gözü', desc: '5 kırık vakasını doğru tanı.', state: 'locked', rule: '5 vaka' },
  { cat: 'skill', icon: 'Doc', name: 'Klinik Yorumcu', desc: '10 vakada klinik yorum sorusunu doğru yanıtla.', state: 'locked', rule: '10 vaka' },
  { cat: 'topic', icon: 'Wave', name: 'Damar Yolu', desc: '3 pulmoner vasküler vakayı doğru tanı.', state: 'locked', rule: '3 vaka' },
  { cat: 'milestone', icon: 'Trophy', name: 'Tüm Konular', desc: '33 konunun her birinde en az bir doğru.', state: 'locked', rule: '33 konu' },
]
