# EGEMED Opaca™ — Başarılarım & Liderlik Tahtası: Tasarım Spesifikasyonu ve Yönetim Promptu

> **Yönetici:** Claude Opus 5.5 · **Uygulayıcı:** Claude Sonnet 5
> Bu belge `GAMIFICATION-YOL-HARITASI.md`'nin **§3 (UI/UX yerleşimi)** bölümünün yerine geçer.
> Diğer bölümler (§2 değişmezler, §4 veri katmanı, §5 rozetler, §7–9 çalışma kuralları) aynen geçerlidir.
> Referans görsel: `docs/mockups/gami-referans-ai.png` (kullanıcının yüklediği AI görseli).
> **Bu görselden yalnız bilgi mimarisi alınır; renk, font, ikon, gölge, avatar fotoğrafı ve düzen
> iskeleti (sol menü) ALINMAZ.** Görsel dil tamamen `src/styles.css` tokenlarından gelir.

---

## 0. Opus başlangıç promptu (kopyala-yapıştır)

```
Rolün: EGEMED Opaca oyunlaştırma arayüzünün tasarım sahibi ve teknik yöneticisisin.
Kodu Sonnet 5 yazacak; sen görev kartı verip teslimleri denetleyeceksin.

Girdiler:
- docs/GAMIFICATION-YOL-HARITASI.md  (değişmezler, veri katmanı, rozetler, kart şablonu)
- docs/GAMIFICATION-TASARIM-PROMPT.md (bu belge: iki ekranın tasarımı)
- docs/mockups/gami-referans-ai.png  (yalnız içerik/bilgi mimarisi referansı)
- src/styles.css, src/styles-v2.css, src/ui/chrome.tsx, src/screens/ResultsScreen.tsx,
  src/screens/ModeSelectScreen.tsx, egemed-sim-ui-ux-framework/docs/01,02,04 ve components/*

Sıra:
1) Faz T0'ı kendin yap: statik HTML tasarım referansını üret (bu belge §7) ve kullanıcıya
   onaylat. Onay gelmeden Sonnet'e UI kartı verme.
2) Veri katmanı (yol haritası Faz 1) bitmemişse önce onu tamamlat.
3) Bu belgedeki §8 kart listesini sırayla Sonnet'e ver; her teslimde §9'u uygula.
Kural: Referans AI görselindeki herhangi bir renk kodu, gradyan, emoji veya fotoğraf koda
giremez. Şüphede kalırsan mevcut Opaca ekranlarındaki karşılığını kullan.
```

---

## 1. AI görselinden ne alıyoruz, ne değiştiriyoruz

| AI görselinde | Opaca'da | Gerekçe |
|---|---|---|
| Sol dikey menü (Ana Sayfa, Simülasyon…) | **Yok.** Opaca'da gezinme lacivert `eg-header` üzerinden | Aile şablonunda sidebar yok; mevcut akışı bozar |
| 6 ayrı ekran | **2 ekran + 1 sonuç kartı** (aşağıda) | Kişisel İlerleme + Rozetler + Hedefler aynı soruyu yanıtlıyor: "ben nasılım?" |
| "Oyunlaştırma Ana Ekranı" (tanıtım) | Başarılarım'ın **ilk ziyaret/boş durum** görünümü | Ayrı ekran gereksiz tıklama |
| Sıralama = Toplam XP | Sıralama = **Dönem puanı** (değerlendirme, en iyi 3 ort.); XP yalnız ikincil sütun | XP çok çalışmayı, dönem puanı yeterliği ölçer (yol haritası §4) |
| Gerçekçi insan avatar fotoğrafları | **Baş harfli daire avatar** (takma addan), renk kullanıcı kimliğinden türetilir | Gizlilik; demo verisi gerçek kişi izlenimi vermemeli |
| "Yeni Hedef Ekle" (serbest hedef) | **Haftalık 3 sistem hedefi** (öğrenci ekleyemez, v1) | Kapsamı dar tut; hedefler rozet mantığıyla aynı motordan çıkar |
| Konfetili modal "Tebrikler!" | Sonuç ekranında **satır içi "Kazanımlar" kartı**, hafif giriş animasyonu | Sonuç raporunu gölgelememek; modal kapatma yükü yok |
| Motto/slogan satırları, dağ illüstrasyonu | Kaldırılır | Opaca'nın klinik-sade dilinde yok |
| Emoji/renkli dolu rozet ikonları | `icons.tsx` stilinde **stroke SVG**, dairesel tonlu zemin | `mode-card .ic` kalıbıyla aynı aile |

---

## 2. Tasarım dili eşlemesi (yalnız mevcut tokenlar)

**Anlam → renk (tüm ekranlarda tutarlı):**

| Anlam | Zemin | Ön plan | Mevcut emsal |
|---|---|---|---|
| XP / seviye | `--blue-50` / `--blue-100` | `--blue-600`, çubuk `domain-bar` gradyanı | Uygulama modu kartı |
| Sıralama / değerlendirme | `--purple-50` / `--purple-100` | `--purple-600` | Değerlendirme modu kartı, `.btn.purple` |
| Rozet / ödül | `--orange-100` | `--amber-700`, vurgu `--orange-500` | `.badge.orange` |
| Tamamlandı / başarılı | `--green-50` / `--green-100` | `--green-600` | `rs-status.pass`, `.btn.green` |
| Kilitli / pasif | `--blue-50` | `--ink-400`, opaklık .55 | `.badge.gray` |

**Madalyalar:** 1. `--orange-500` zemin + `--amber-700` çerçeve; 2. `--ink-300` zemin + `--ink-600`;
3. `--amber-700` zemin %70 + `--card` yazı. Hepsi SVG madalya, emoji değil.

**Yapı taşları (yeniden kullan, yeniden yazma):**
`.card`, `.rs-box`, `.rs-ring-sm` (seviye halkası), `.rs-lbl`, `.rs-num`, `.domain-row` + `.domain-bar`
(alan performansı ve hedef çubukları), `.badge.*`, `.btn.primary|purple|outline|small`,
`.results-wrap-v2` (sayfa genişliği 1240 px), `.results-title-v2` / `.results-sub-v2` (başlıklar),
`.table-scroll` + `.report-table-v2` (liderlik tablosu), `.mode-card .ic` (dairesel ikon zemini),
`ConfirmModal`/`HelpModal` kalıbı (rozet detayı). Tipografi: yalnız `--fs-*`; boşluk: yalnız `--sp-*`;
köşe: `--r-*`; gölge: `--shadow-card`.

Yeni sınıflar `src/styles-gami.css` içinde, `gami-` önekiyle; yalnız yukarıdakilerin yetmediği yerde.

---

## 3. Gezinme

```
eg-header:  [Opaca logo] Radyolojik Görüntüleme Simülatörü ··· [🏆 Başarılarım] | [Yardım] [Kaynaklar]
                                                                 (simülasyon ekranında render edilmez)

Başarılarım ve Liderlik Tahtası kardeş ekranlardır; ikisinin de başında aynı alt gezinme:
┌──────────────────────────────────────────┐
│ ( Başarılarım )  ( Liderlik Tahtası )     │  ← gami-pagetabs: role="tablist", seçili = --navy-800 zemin
└──────────────────────────────────────────┘
```

- `Screen` birleşimine `'achievements' | 'leaderboard'` eklenir; ikisi de `DOC_SCREENS`'e.
- Header çipi her zaman Başarılarım'a gider. Mobilde yalnız kupa ikonu (`aria-label="Başarılarım"`).
- Giriş noktaları: Header çipi · Mod seçimi değerlendirme kartındaki satır (→ Liderlik Tahtası) ·
  Sonuç ekranındaki Kazanımlar kartı (→ Başarılarım, "Sıralamaya bak" ikincil → Liderlik Tahtası).
- Her iki ekranın sonunda mevcut `Footer`; arka planda `EcgDeco` yerine aynı sade zemin.

---

## 4. Ekran A — Başarılarım (`screen: 'achievements'`)

Kapsayıcı: `.results-wrap-v2`. Masaüstü (≥1024 px) ızgarası:

```
┌ Demo verisi şeridi (badge.orange tonunda, kapatılabilir değil) ───────────────────────────┐
│ Başarılarım                                              [Son 30 gün ▾]  (dönem seçici)    │
│ results-sub-v2: "Değerlendirme ve uygulama oturumlarından kazandığın ilerleme."            │
├───────────────── PROFİL ŞERİDİ (results-summary-strip, 5 rs-box) ─────────────────────────┤
│ [Avatar+ring  │ [Seri          │ [Değerlendirme │ [Ortalama      │ [Bu hafta             │
│  Seviye 5     │  🔥yok→SVG      │  28 oturum     │  başarı %85    │  12. / 84             │
│  320/500 XP]  │  3 gün]        │  +42 uygulama] │  (80 eşiği)]   │  İlk %15 → Liderlik]  │
├──────────────── İLERLEME (8 kolon) ─────────────┬──────── BU HAFTANIN HEDEFLERİ (4) ───────┤
│ Değerlendirme puanı (çizgi, --purple-600)       │ ◯ 5 değerlendirme oturumu    ▬▬▬░ 3/5   │
│ + XP (ikincil, --blue-400, kesikli)             │ ✓ Ortalama başarı ≥ %80   Tamamlandı    │
│ yatay 80 eşik çizgisi (--green-600, noktalı)    │ ◯ 2 yeni rozet kazan         ▬░░ 1/2    │
│ saf SVG, ipucu (tooltip) odakla da açılır       │ "Pazartesi 00:00'da yenilenir" (--ink-500)│
├──────────────── ALAN BAZLI PERFORMANS (6) ──────┼──────── SON KAZANILAN ROZETLER (6) ──────┤
│ domain-row × 7 (ResultsScreen ile aynı etiket    │ 3 rozet yatay + "Tümünü gör ↓"          │
│ ve ikonlar); <%60 olanlar badge.orange "zayıf"   │                                          │
├──────────────── ROZET KOLEKSİYONU (12 kolon) ───────────────────────────────────────────────┤
│ [Tümü] [Kazanılanlar] [Devam edenler] [Kilitli]                          12 / 28 kazanıldı  │
│ ┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐   (auto-fill, min 150 px)          │
│ │ (ic)  ││ (ic)  ││ (ic)  ││ (ic)  ││ (ic)  ││ (ic)  │                                     │
│ │ Ad    ││ Ad    ││ Ad    ││ Ad    ││ 🔒 Ad ││ 🔒 Ad │                                     │
│ │ tarih ││ ▬▬░7/10│ ...                                                                    │
│ └───────┘└───────┘└───────┘└───────┘└───────┘└───────┘                                     │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Bileşenler**

- **`GamiProfileStrip`** — `.results-summary-strip` + 5 `.rs-box`. İlk kutu: baş harf avatarı
  (48 px) etrafında `rs-ring-sm` tarzı XP ilerleme halkası (--blue-600), altında "Seviye 5",
  `320 / 500 XP`, "Sonraki seviyeye 180 XP" (`.rs-lbl`). Son kutu tıklanabilir (buton semantiği),
  mor aksan, Liderlik Tahtası'na gider.
- **`GamiProgressChart`** — saf SVG, `viewBox` ile duyarlı; x ekseni TR tarih biçimi ("8 Eyl");
  veri yoksa gri boş durum. Dönem seçici: *Son 30 gün · Son 12 hafta · Akademik yıl*.
  Tablo alternatifi: grafiğin altında görsel olarak gizli (`sr-only`) veri tablosu.
- **`GamiWeeklyGoals`** — 3 satır; her satır `.domain-row` ızgarası (ikon · metin · çubuk · değer).
  Tamamlanan satır `--green-50` zemin, sağda `badge.green` "Tamamlandı".
- **`GamiDomainPanel`** — ResultsScreen'deki `domainRows` dizisini ortak bir modüle taşımadan
  **kopyalama**; bunun yerine etiket/ikon eşlemesini `src/ui/gami/domainMeta.ts`'ye çıkar ve
  ResultsScreen'e dokunma (dokunulmaz değil ama bu fazda kapsam dışı).
- **`GamiBadgeGrid` + `GamiBadgeCard`** — kart: `.card` tabanı, üstte 56 px dairesel ikon zemini
  (`.mode-card .ic` ölçüsü, rozet rengine göre ton), ad (`--fs-md`, 700), tek satır açıklama
  (`--fs-xs`, `--ink-600`, 2 satırda kes), altta kazanma tarihi **veya** ilerleme çubuğu **veya**
  kilit satırı. Kademeli rozetlerde (bronz/gümüş/altın) ikon zemininin çerçevesi madalya rengi.
  Filtre sekmeleri `gami-seg` (segmented control). Tıklama → rozet detay penceresi
  (`HelpModal` kalıbı): büyük ikon, kural metni, ilerleme, kazanma tarihi, varsa
  "Bu konuyu öğrenme modunda çalış" (`.btn.green.small`).
- **İlk ziyaret / boş durum** — hiç deneme yoksa profil şeridi ve grafik yerine tek `.card`:
  başlık "Başarılarım burada birikecek", 4 dairesel ikonlu kısa madde (XP kazan · Rozet topla ·
  Sıralamada yüksel · İlerlemeni izle — AI görselindeki tanıtım bloğunun karşılığı), altında
  `.btn.purple` "Değerlendirmeye gir". Rozet ızgarası yine görünür (hepsi kilitli) — hedef göstermek için.

**Duyarlılık:** <1024 px: iki sütunlu satırlar alt alta; profil şeridi 2×3 ızgara (`auto-fit`
zaten yapar); <600 px: rozet ızgarası min 132 px, grafik yüksekliği 180 px.

---

## 5. Ekran B — Liderlik Tahtası (`screen: 'leaderboard'`)

```
┌ Demo verisi şeridi ───────────────────────────────────────────────────────────────────────┐
│ Liderlik Tahtası                                                                           │
│ "Değerlendirme modundaki en iyi 3 denemenin ortalamasıyla sıralanır (en az 2 deneme)."    │
│ [Bugün][Bu hafta][Bu ay][Akademik yıl]                        [Tüm dönemler ▾]  22–28 Eyl  │
├──────────────────────────── PODYUM (yalnız ≥3 kişi varsa) ─────────────────────────────────┤
│            ┌────────┐                                                                      │
│ ┌────────┐ │  (1)   │ ┌────────┐     ortadaki kart 16 px yüksek; üst kenar 4 px madalya rengi│
│ │  (2)   │ │  DK    │ │  (3)   │     avatar 56 px baş harf; takma ad; "Dönem puanı 94,3"     │
│ │  AY    │ │ 94,3   │ │  MT    │     (--fs-2xl, 800, tabular-nums); alt satır "Seviye 12 ·  │
│ │ 91,0   │ │        │ │ 89,7   │      6 deneme" (--fs-xs, --ink-500)                         │
│ └────────┘ └────────┘ └────────┘                                                           │
├──────────────────────────── TABLO (.report-table-v2) ──────────────────────────────────────┤
│  #  │ Kullanıcı          │ Dönem puanı │ Deneme │ Seviye │ Toplam XP                        │
│  4  │ (ES) Ece S.        │   88,0      │   5    │   9    │ 1.780                            │
│ ... │                                                                                      │
│  10 │ (AÖ) Anonim öğrenci│   80,1      │   3    │   4    │   680                            │
│  ⋯  │  (ayırıcı satır, yalnız "ben" ilk 10 dışındaysa)                                      │
│  11 │ ...                                                                                  │
│ ▌12 │ (ÖK) Sen · takma_ad│   79,4 ▲3   │   4    │   5    │   920   ← --purple-50 zemin,     │
│  13 │ ...                                          sol 3 px --purple-600 kenar               │
│  15 │ ...                                                                                  │
├──────────────────────────── GİZLİLİK KARTI ────────────────────────────────────────────────┤
│ 🔒(SVG) Sıralamada "Anonim öğrenci" olarak görünüyorsun.   Takma ad: [ özgür_kartal  ]      │
│         [ ] Sıralamada takma adımla görün                           (.btn.outline.small Kaydet)│
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Bileşenler**

- **`GamiPeriodTabs`** — `gami-seg` segmented control; seçili segment `--purple-600` zemin, beyaz
  yazı (değerlendirme rengi). Sağda kohort `<select>` (`.btn.outline.small` görünümünde) ve
  dönemin tarih aralığı (`--fs-xs`, `--ink-500`, TR biçimi).
- **`GamiPodium`** — 3 `.card`; sıra 2-1-3 görsel, DOM sırası 1-2-3 (ekran okuyucu doğru okusun,
  görsel sıra `order` ile). <600 px'de podyum tek satırlık yatay kaydırmasız 3 mini kart.
  "Ben" podyumdaysa kartın çerçevesi `--purple-600`.
- **`GamiLeaderboardTable`** — `.table-scroll` + `.report-table-v2`; puan sütunu sağa hizalı,
  `tabular-nums`, TR ondalık virgül (`toLocaleString('tr-TR')`). Önceki döneme göre değişim
  yalnız "ben" satırında: ▲ `--green-600`, ▼ `--red-500`, — `--ink-400` (renk + metin, yalnız renk değil).
  <600 px: tablo yerine kart listesi (sıra · avatar · ad · puan; ikincil bilgiler alt satırda).
- **`GamiPrivacyCard`** — `.card`, `--blue-50` zemin. Anahtar varsayılan kapalı. Takma ad:
  2–24 karakter, boşluk kırpılır, hata mesajı satır içi. Kaydet → repo.updateMe → tablo anında
  güncellenir. Gerçek ad hiçbir yerde gösterilmez.
- **Boş/az veri durumları:** dönemde kimse yoksa "Bu dönemde henüz sıralamaya giren yok";
  "ben" asgari 2 denemeye ulaşmadıysa tablo altında `badge.gray` "Sıralamaya girmek için bu dönem
  1 değerlendirme daha tamamla" + `.btn.purple.small` "Değerlendirmeye gir".
- **Yükleniyor:** satır iskeletleri (`--blue-50` → `--card` nabız; reduced-motion'da sabit).

### 5.1 Ayın Ödülü (Liderlik Tahtası'nın parçası)

Her ay, aylık sıralamanın ilk 3'ü somut bir ödül kazanır. İlk ödül örneği:
**"Girişimsel Radyolojide bir girişime gözlemci olarak katılım"** (Radyoloji AD ile). Ödül metni,
görseli ve koşulları kodda sabit değil, **yapılandırmadan** gelir; her ay değişebilir.

**Yerleşim:** Sayfa başlığı ile dönem sekmeleri arasında, tüm genişlikte `GamiRewardBanner`.
Dönem sekmesi *Bu ay* değilken banner **kompakt tek satıra** iner ("Bu ayın ödülü: … · 8 gün kaldı ·
Aylık sıralamayı gör →"). *Bu ay* seçiliyken tam hâli görünür:

```
┌ gami-reward (card; sol 4 px --orange-500 kenar; --orange-100 → --card yatay yumuşak zemin) ─────┐
│ (ic: ödül SVG,   EYLÜL 2026 ÖDÜLÜ  (rs-lbl, --amber-700)                                       │
│  amber daire)    Girişimsel Radyolojide bir girişime gözlemci olarak katılım  (--fs-xl, 800)   │
│                  Ayın ilk 3'ü, Radyoloji AD öğretim üyesi eşliğinde bir girişimsel işlemi      │
│                  gözlemleme fırsatı kazanır.  (--fs-md, --ink-600)                              │
│                                                                                                 │
│  [⏱ Kapanışa 8 gün 4 saat]   [Senin durumun: 12. sıra · ilk 3'e 6,2 puan]   [Katılım koşulları] │
│   badge.gray                  badge.purple benzeri (gami-)                     .btn.outline.small│
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **"Senin durumun" çipinin durumları:**
  - İlk 3'teyse: "Şu an ödül sırasındasın — 2." (yeşil ton).
  - Sıralamada ama ilk 3 dışında: "İlk 3'e X puan".
  - Uygun değilse, nedeni açıkça yazılır:
    - "Uygunluk için bu ay 2 değerlendirme daha tamamla",
    - "Ödüle aday olmak için sıralamada takma adınla görünmelisin" (gizlilik kartına kaydırır),
    - "Bu ödül Dönem 4–6 öğrencilerine açıktır".
- **Podyum:** Dönem *Bu ay* iken podyum kartlarının üstünde küçük `badge.orange` "Ödül adayı" etiketi.
  Uygun olmayan bir kullanıcı ilk 3'te ise o kart etiketsiz kalır. Ödül, **uygun olanlar arasında**
  ilk 3'e gider; bu kural koşullar penceresinde açıkça yazar.
- **Geri sayım:** Ayın son günü 23:59:59 Europe/Istanbul. Dakikada bir güncellenir.
  `aria-live` kapalıdır (ekran okuyucuyu rahatsız etmesin).
- **Katılım koşulları penceresi** (`HelpModal` kalıbı), yapılandırmadan okunan maddeler:
  - Uygun kohortlar.
  - Aylık asgari değerlendirme sayısı.
  - Puanlama: en iyi 3 değerlendirmenin ortalaması.
  - Eşitlik kuralı: önce ulaşan öne geçer.
  - Sıralamada takma adla görünme şartı.
  - Kazananlarla fakülte e-postası üzerinden iletişim kurulacağı.
  - Ödülün devredilemeyeceği; hasta onamı ve klinik uygunluğa bağlı olduğu, tarihin AD ile planlanacağı.
  - Kopya veya kural ihlalinde hak kaybı.
- **Geçmiş kazananlar:** Tablonun altında "Önceki ayların kazananları" başlıklı katlanır bölüm.
  Son 3 ay gösterilir; her ay için ödül adı ve 3 takma ad + madalya yer alır. Gerçek ad yoktur.
- **Ay kapanınca (sonraki ayın ilk 3 günü):** "Ben" kazananlardan biriyse Başarılarım'ın en üstünde
  `--green-50` zeminli tebrik kartı çıkar: "Eylül 2026 ödülünü kazandın! Radyoloji AD seninle
  fakülte e-postandan iletişime geçecek." Mock veride bu durum `?gami=1&demoWinner=1` ile gösterilebilir.
- **Başka giriş noktaları:**
  - Mod seçimi değerlendirme kartındaki `extra` satırına ikinci satır: "Bu ayın ödülü · 8 gün kaldı".
  - Kazanımlar kartındaki sıralama kutusu, *Bu hafta* yerine ay sonuna 7 günden az kaldığında *Bu ay*
    sırasını gösterir ("Ödül sırası: 4.").

**Veri sözleşmesi** (`src/gamification/types.ts`'e eklenir; mock değerleri `src/gamification/rewards.ts`):

```ts
export interface MonthlyReward {
  month: string                    // '2026-09'
  title: string                    // 'Girişimsel Radyolojide bir girişime gözlemci olarak katılım'
  description: string
  sponsor: string                  // 'Radyoloji Anabilim Dalı'
  winnersCount: number             // 3
  eligibility: {
    cohorts: (3 | 4 | 5 | 6)[]     // örn. [4, 5, 6] — KARAR BEKLİYOR
    minAssessments: number         // örn. 4 — KARAR BEKLİYOR
    requirePublicNickname: boolean // true
  }
  terms: string[]                  // pencere maddeleri
}
export interface RewardWinner { month: string; rank: 1 | 2 | 3; displayName: string; score: number; isMe: boolean }
export type EligibilityReason = 'eligible' | 'min_assessments' | 'cohort' | 'private_profile'

// GamificationRepo'ya eklenir:
getMonthlyReward(month: string): Promise<MonthlyReward | null>
getRewardWinners(lastNMonths: number): Promise<RewardWinner[]>
```

Uygunluk ve "uygunlar arasında ilk 3" hesabı `ranking.ts` içinde saf fonksiyon olarak yazılır
(`rewardStandings(view, reward, profiles)`). Testlerde bulunması gerekenler: uygun olmayan birinin
ilk 3'te olması, eşitlik, asgari denemenin tam sınırda olması, ayın son saniyesi.

---

## 6. Sonuç ekranı — "Kazanımlar" kartı (ekran değil)

`ResultsScreen`'de `.results-summary-strip`'in hemen **altına** tek `.card`:

```
┌ Bu oturumda kazandıkların ───────────────────────────────────────────────────────────────┐
│ [(ic) Keskin Göz     ] [ +120 XP          ] [ Seviye 5          ] [ Bu hafta 12. ▲3     ] │
│ [ Yeni rozet         ] [ +20 başarı bonusu] [ ▬▬▬▬░░ 320/500    ] [ (yalnız değerl.)    ] │
│                               [Başarılarımı gör →  .btn.primary.small] [Sıralamaya bak  .btn.outline.small] │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- Yeni rozet yoksa ilk kutu en yakın rozetin ilerlemesini gösterir ("Keskin Göz'e 3 isabet kaldı").
- Kutular 80 ms arayla yukarı-kayarak belirir; `prefers-reduced-motion`'da animasyon yok.
- Konfeti: yalnız yeni rozet **ve** mastery varsa, 1,2 sn, CSS-only, kartın içinde; reduced-motion'da yok.
- Mevcut sonuç ekranı öğelerinin sırası/metni değişmez.

---

## 7. Faz T0 — Statik tasarım referansı (Opus kendisi yapar)

Kodlamadan önce `docs/mockups/gami.html` üret:

- Tek dosya; `src/styles.css`'in `:root` bloğunu ve kullanılan sınıfları (`.card`, `.rs-box`,
  `.domain-row`, `.badge`, `.btn`, `.report-table-v2`, `.eg-header`) **birebir kopyalar**, üzerine
  taslak `gami-*` kuralları ekler. Böylece referans ile gerçek uygulama aynı tokenları kullanır.
- İçerik: Başarılarım (dolu), Başarılarım (boş durum), Liderlik Tahtası (ben 12. sırada),
  Liderlik Tahtası (360 px), Sonuç Kazanımlar kartı. Sahte verisi mock üretici çıktısıyla uyumlu.
- Kullanıcıya ekran görüntüleriyle sun, geri bildirim al, `gami-*` kurallarını kesinleştir.
  Onaylanan CSS Sonnet'e K-A1'de `src/styles-gami.css` başlangıcı olarak verilir.

---

## 8. Görev kartları (Sonnet)

Önkoşul: yol haritası Faz 1 (saf veri katmanı + testler) tamam.

| Kart | İş | Kabul |
|---|---|---|
| **K-A1** | `styles-gami.css` (T0'dan), `Screen` genişletme, `DOC_SCREENS`, `App.tsx` render, `GamiPageTabs`, Header çipi (bayrak arkasında) | Bayrak kapalı: e2e görüntüsü değişmez; açık: iki ekran arasında sekme gezinmesi, simülasyonda çip yok |
| **K-A2** | `GamiAvatar` (baş harf + kimlikten türetilmiş ton; tonlar yalnız mavi/mor/yeşil/amber token ailelerinden), `GamiSeg`, `GamiDemoBanner`, `domainMeta.ts` | Birim testi: aynı kimlik → aynı ton; Türkçe baş harf (İ, Ş, Ç) doğru |
| **K-A3** | `GamiProfileStrip` + boş durum kartı | Seviye/XP değerleri `xp.ts`'ten; hiç deneme yokken boş durum |
| **K-A4** | `GamiProgressChart` (saf SVG) + dönem seçici + sr-only tablo | 0, 1, 60 veri noktasıyla doğru çizim; 360 px'de taşma yok |
| **K-A5** | `GamiWeeklyGoals` (hedef tanımları `src/gamification/goals.ts`, saf + testli) + `GamiDomainPanel` | Pazartesi TR 00:00 sıfırlama testi |
| **K-A6** | `GamiBadgeCard`, `GamiBadgeGrid`, filtreler, rozet detay penceresi, "Bu konuyu çalış" akışı | Klavye ile ızgara ve pencere; Esc kapatır; odak geri döner |
| **K-B1** | `GamiPeriodTabs` + kohort seçici + tarih aralığı | 4×5 kombinasyon hatasız; ok tuşlarıyla sekme gezinmesi |
| **K-B2** | `GamiPodium` | DOM sırası 1-2-3, görsel 2-1-3; <3 kişi → podyum gizli |
| **K-B3** | `GamiLeaderboardTable` (masaüstü tablo + mobil kart listesi, ayırıcı, "ben" vurgusu, değişim oku) | "ben" ilk 10'da / dışında / sıralamaya girmemiş üç durumu doğru |
| **K-B4** | `GamiPrivacyCard` | Anahtar/takma ad değişince tablo anında güncellenir; doğrulama mesajları |
| **K-B5** | `MonthlyReward` tipleri, `rewards.ts` mock, `rewardStandings` + testler, repo metotları | Uygun olmayan ilk-3 kullanıcıda ödül sırası doğru kayar; ay sınırı TR saatine göre |
| **K-B6** | `GamiRewardBanner` (tam + kompakt), geri sayım, "Senin durumun" çipi, podyum "Ödül adayı" etiketi | 4 durum (ilk 3 / aday / uygun değil ×3 neden) doğru metin; *Bu ay* dışı sekmede kompakt |
| **K-B7** | Katılım koşulları penceresi, geçmiş kazananlar bölümü, Başarılarım tebrik kartı (`demoWinner`), ModeSelect ikinci satır | Klavye/Esc; gerçek ad hiçbir yerde yok |
| **K-C1** | ResultsScreen "Kazanımlar" kartı + `recordAttempt` (idempotent) + animasyonlar; ModeSelect değerlendirme kartına `extra` satırı | Mevcut sonuç öğeleri aynı; reduced-motion'da animasyon yok |
| **K-D1** | `scripts/e2e-gami-screens.mjs` (T0'daki 5 durum, 1440 ve 360 px), README notu | Görüntüler T0 referansıyla görsel olarak tutarlı |

---

## 9. Opus tasarım denetimi (her UI teslimine ek olarak)

- [ ] AI görselinden renk/gradyan/emoji/fotoğraf sızmadı; tüm renkler `var(--…)`
- [ ] Anlam→renk eşlemesi (§2) tutarlı: XP mavi, sıralama mor, rozet amber, tamam yeşil
- [ ] Yeni bileşen, mevcut bir sınıfla yapılabilecekken yeni sınıf icat etmedi
- [ ] Başlık hiyerarşisi `results-title-v2` / kart başlıkları mevcut sonuç ekranıyla aynı ölçekte
- [ ] Sayılar `tabular-nums`, TR biçimi (ondalık virgül, binlik nokta), tarihler TR
- [ ] Hiçbir bilgi yalnız renkle iletilmiyor (değişim oku + metin, kilit ikonu + metin)
- [ ] 360 / 768 / 1440 px ekran görüntüleri T0 referansıyla karşılaştırıldı
- [ ] Değerlendirme simülasyonu sırasında hiçbir oyunlaştırma öğesi yok
- [ ] Ödül metni/koşulları kodda sabit değil, `MonthlyReward` yapılandırmasından geliyor
- [ ] Ödül uygunluğu reddedildiğinde nedeni kullanıcıya açık ve eyleme dönük söyleniyor
- [ ] "Demo verisi" şeridi her iki ekranda ve Kazanımlar kartında (küçük `badge.orange`) var
