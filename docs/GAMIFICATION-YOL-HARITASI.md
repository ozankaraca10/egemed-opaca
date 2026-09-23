# EGEMED Opaca — Oyunlaştırma Yol Haritası (TASLAK v0.1)

> Özgün yol haritası dosyası bulunamadığı için Claude Opus 5.5 tarafından 23 Eyl 2026'da taslak olarak
> yazıldı. Tasarım: `docs/GAMIFICATION-TASARIM-PROMPT.md` (§3 UI/UX yerleşimi oradadır). Kullanıcı
> kararları: `docs/GAMIFICATION-HANDOFF.md`. Buradaki sayısal kurallar tek yerde, `src/gamification/rules.ts`
> içinde sabit olarak durur; değiştirmek için yalnız o dosya düzenlenir.

## 1. Kapsam ve gerçekçi sınır

- Opaca bağımsız (self-contained) bir SCORM 1.2 paketidir; **sunucu yoktur**. Kişisel oyunlaştırma verisi
  (XP, seviye, seri, rozet, deneme geçmişi) tarayıcıda `localStorage`'da tutulur (cihaz/tarayıcı başına).
- **Sınıf sıralaması gerçek veriyle ancak bir sunucu (ör. LRS/xAPI veya kurum API'si) ile mümkündür.** v1'de
  liderlik tablosu, öğrencinin kendi gerçek sonuçları + **deterministik demo akranlarla** oluşturulur ve her
  yerde "Demo verisi" etiketi taşır. Veri erişimi `GamificationRepo` arayüzünün arkasındadır; sunucu gelince
  yalnız repo uygulaması değişir.

## 2. Değişmezler

1. SCORM davranışı değişmez: puan, `lesson_status`, `suspend_data` şeması ve yazma sırası aynı kalır.
   Oyunlaştırma SCORM'a hiçbir şey yazmaz.
2. Değerlendirme simülasyonu sırasında hiçbir oyunlaştırma öğesi görünmez (header çipi dahil).
3. Özellik bayrak arkasındadır: `?gami=1` ya da derleme sabiti `VITE_GAMI=1`. Bayrak kapalıyken arayüz ve e2e
   ekran görüntüleri bugünküyle birebir aynıdır.
4. Demo verisi her ekranda açıkça etiketlenir.
5. Kurallar saf fonksiyondur: zaman parametre olarak verilir (`now: Date`), içeride `Date.now()` yok.
   Saat dilimi Europe/Istanbul; Türkiye 2016'dan beri sabit UTC+3 olduğundan sabit ofset kullanılır.
6. Ad: SCORM `cmi.core.student_name` (Moodle "Soyad, Ad" → "Ad Soyad"). Öğrenci "Anonim öğrenci" olarak
   görünmeyi seçebilir. Ad LMS dışına gönderilmez.
7. `localStorage` yoksa veya bozuksa oyunlaştırma sessizce boş durumla çalışır; uygulama asla kırılmaz.
8. Yeni sınıflar `src/styles-gami.css`'te `gami-` önekiyle; renkler yalnız `src/styles.css` tokenlarından.

## 3. UI/UX

`docs/GAMIFICATION-TASARIM-PROMPT.md` §1–§9 ve onaylı T0 referansı `docs/mockups/gami.html`.

## 4. Veri katmanı (`src/gamification/`)

| Dosya | İçerik |
|---|---|
| `types.ts` | Aşağıdaki tipler + `MonthlyReward`, `RewardWinner`, `EligibilityReason` (tasarım promptu §5.1; `requirePublicName`) |
| `rules.ts` | Tüm sayısal kurallar (XP, seviye eğrisi, eşikler, hedefler, sıralama asgari deneme) |
| `time.ts` | TR takvimi: gün anahtarı, hafta başı (Pzt 00:00), ay, akademik yıl (1 Eyl–31 Ağu), dönem aralıkları |
| `xp.ts` | Deneme → XP; toplam XP → seviye/ilerleme |
| `streak.ts` | Günlük seri (güncel, en uzun) |
| `goals.ts` | Haftalık 3 sistem hedefi ve ilerlemeleri |
| `badges.ts` | 28 rozet tanımı + `evaluateBadges(stats, prevEarned, now)` |
| `stats.ts` | Deneme geçmişinden toplu istatistik (rozet/hedef girdisi) |
| `ranking.ts` | Dönem puanı, sıralama, `rewardStandings()` |
| `rewards.ts` | Aylık ödül yapılandırması (mock) ve geçmiş kazananlar |
| `storage.ts` | `opaca.gami.v1` okuma/yazma, sürüm ve bozuk veri koruması |
| `repo.ts` | `GamificationRepo` arayüzü + `LocalRepo` (kendi verin) + demo akranları birleştirme |
| `mock.ts` | Deterministik (tohumlu) demo akranları; `docs/mockups/gami-mock-data.mjs` ile uyumlu |
| `demo.ts` | `?gami=1&demo=full|empty|winner` için hazır profil durumları |

### 4.1 Tipler

```ts
type Mode = 'practice' | 'assessment'
interface AttemptRecord {
  id: string                 // idempotensi: mode + sessionSeed + caseIds birleşiminin karması
  mode: Mode
  finishedAt: string         // ISO
  score: number              // 0–100, aggregateResults().total
  mastery: boolean
  caseCount: number
  hintsUsed: number
  durationMs: number
  domains: Partial<Record<DomainKey, number>>        // yüzde 0–100
  findings: { finding: string; correct: boolean }[]  // vaka başına ana bulgu ve bulgu sorusunun doğruluğu
  localizationHits: number
  abcdeComplete: number      // okuma sırası tam izlenen vaka sayısı
  qualityCorrect: number
  interpretationCorrect: number
  fastPerfect: boolean       // süre sınırının yarısında ≥90
}
interface LearnActivity { topics: string[]; ctStacksCompleted: string[] }
interface GamiProfile { displayName: string | null; public: boolean; cohort: 1 | 2 | 3 | 4 | 5 | 6 | null }
interface GamiStateV1 { v: 1; attempts: AttemptRecord[]; learn: LearnActivity; earned: { id: string; at: string }[]; profile: GamiProfile }
```
`attempts` en fazla 500 kayıt tutar (en eskiler düşer; kazanılmış rozetler korunur).

### 4.2 XP ve seviye (`rules.ts`)

- Uygulama: vaka başına 5 XP, ustalık (mastery) vakası +5, ipucu başına −2 (vaka başına en az 0).
- Değerlendirme: vaka başına 10 XP; oturum puanı ≥ 80 ise +20 başarı bonusu.
- Öğrenme: bir konu ilk kez incelendiğinde 2 XP (konu başına bir kez).
- Seviye eğrisi: n. seviyenin genişliği `100 × n` XP (1: 0–100, 2: 100–300, 3: 300–600, 4: 600–1000, 5: 1000–1500 …).

### 4.3 Seri ve hedefler

- Seri: art arda TR takvim günleri; o gün en az bir tamamlanmış oturum (uygulama ya da değerlendirme).
  Bugün veya dün etkinlik varsa seri sürer.
- Haftalık hedefler (Pazartesi 00:00 TR yenilenir): (1) 5 değerlendirme oturumu; (2) haftalık değerlendirme
  ortalaması ≥ %80 (en az 1 oturum); (3) bu hafta 2 yeni rozet.

### 4.4 Sıralama

- Dönem puanı: dönem içindeki en iyi 3 değerlendirmenin ortalaması (1 ondalık). Sıralamaya girmek için en az
  2 değerlendirme.
- Eşitlik: bu puana önce ulaşan (en iyi 3'ü tamamlayan denemenin zamanı) öne geçer.
- Dönemler: Bugün · Bu hafta · Bu ay · Akademik yıl (1 Eyl–31 Ağu). Kohort filtresi: Tümü, Dönem 1–6.
- Ödül: uygun olanlar arasında ilk `winnersCount`; uygunluk sırası: kohort → asgari deneme → adla görünme.
  Kohort: **tüm sınıflar, Dönem 1–6** (kullanıcı kararı, 23 Eyl 2026). Aylık asgari değerlendirme **KARAR BEKLİYOR**
  (taslak: 4).

## 5. Rozetler (28 — taslak, `docs/mockups/gami-mock-data.mjs` ile aynı)

Kategoriler: konu (mavi), beceri (mor), seri (amber), öğrenme (yeşil), kilometre taşı (lacivert).
Yalnız değerlendirme modundaki doğru yanıtlar konu/beceri rozetlerine sayılır; seri ve öğrenme rozetleri tüm
modlardan beslenir.

| Kimlik | Ad | Kat. | Koşul |
|---|---|---|---|
| sharp-eye-1/2/3 | Keskin Göz (bronz/gümüş/altın) | beceri | 10 / 25 / 50 isabetli lokalizasyon |
| systematic | Sistematik Okuyucu | beceri | 1 vakada ABCDE sırası tam |
| film-quality | Film Kalitesi | beceri | 10 doğru film kalitesi sorusu |
| fast-accurate | Hızlı ve Doğru | beceri | süre sınırının yarısında ≥ 90 |
| interpreter | Klinik Yorumcu | beceri | 10 doğru klinik yorum sorusu |
| pleura | Plevra Dedektifi | konu | 5 doğru pnömotoraks/efüzyon |
| cardiac | Kalp Gölgesi | konu | 5 doğru kardiyomegali |
| nodule | Nodül Avcısı | konu | 10 doğru nodül/kitle |
| tb | Tüberküloz Okuru | konu | 10 doğru tüberküloz bulgusu |
| pediatric | Pediatri | konu | 5 doğru pediatrik vaka |
| diaphragm | Diyafram Bilgesi | konu | 5 doğru diyafram konusu vakası |
| bone | Kemik Gözü | konu | 5 doğru kırık |
| vascular | Damar Yolu | konu | 3 doğru pulmoner vasküler vaka |
| streak-3/7/30 | 3 Günlük / 7 Günlük / Ay Boyu Seri | seri | 3 / 7 / 30 gün |
| marathon | Maraton | seri | 50 değerlendirme |
| explorer | Öğrenme Kaşifi | öğrenme | 10 farklı konu incelendi |
| ct-explorer | BT Kaşifi | öğrenme | 1 BT kesit yığını baştan sona |
| practice-grit | Uygulama Azmi | öğrenme | 20 uygulama vakası |
| first-step | İlk Adım | kilometre | ilk değerlendirme |
| threshold | Eşik Aşıldı | kilometre | ilk kez ≥ 80 |
| no-hints | İpucusuz | kilometre | ipucusuz 10 vakalık uygulama oturumu |
| perfect | Kusursuz Oturum | kilometre | bir değerlendirmede 100 |
| podium | Podyum | kilometre | aylık sıralamada ilk 3 (demo akranlarla v1'de gösterilir, kazanılamaz) |
| all-topics | Tüm Konular | kilometre | 33 konunun her birinde en az bir doğru |

Bulgu → konu eşlemesi `src/data/findings.json` ve `library.json` gruplarından türetilir (sabit liste değil).

## 6. Fazlar

- **Faz 1 (P2):** `src/gamification/` saf modülleri + vitest. UI yok, mevcut dosyalara dokunulmaz.
- **Faz 2 (P3–P5):** tasarım promptu §8 kartları K-A1 → K-D1.

## 7–9. Çalışma kuralları

`docs/GAMIFICATION-HANDOFF.md` → "Çalışma kuralları". Her kart: `npx tsc -b`, `npx vitest run`, e2e;
bayrak kapalıyken mevcut e2e görüntüleri değişmemeli.
