# EGEMED Opaca™ — Radyolojik Görüntüleme Simülatörü

EGEMED Opaca, Ege Üniversitesi Tıp Fakültesi Dekanlığı tarafından mezuniyet öncesi tıp eğitimi için
geliştirilen, tarayıcı tabanlı bir **akciğer grafisi (ve toraks BT) okuma simülatörüdür**. Ağırlıklı
hedef kitle yetişkin frontal (PA/AP) akciğer grafisi okumayı öğrenen tıp fakültesi öğrencileridir;
ikinci sürümle lateral grafi, boyun grafisi ve statik toraks BT anahtar kesitleri de eklenmiştir.
Opaca, **EGEMED SIM** ürün ailesinin (Pulse · Ausculta · Opaca) radyoloji modülüdür; mimarisi
**EGEMED Ausculta**'dan çatallanmıştır (SCORM çalışma zamanı, tohumlu örnekleme, alan bazlı puanlama
ve paketleme altyapısı ortaktır). Arayüz dili ve etkileşim kalıpları ailenin ortak şablon deposuna
dayanır: [egemed-sim-ui-ux-framework](https://github.com/ozankaraca10/egemed-sim-ui-ux-framework).

React 19 + Vite + TypeScript ile geliştirilmiştir. Statik site olarak ya da SCORM 1.2 paketi olarak çalışır.

## Özellikler

| Mod | İçerik |
|---|---|
| Öğrenme | 10 grupta 33 konu: temel okuma (sistematik okuma, projeksiyon, normal, lateral grafi), plevra, parankim, kalp ve mediasten, kemik ve yumuşak doku, tüberküloz, diyafram, pediatrik solunum (krup, epiglottit, yabancı cisim), pulmoner vasküler (emboli bulguları), toraks BT'ye giriş. Örnek filmler, ABCDE okuma bölgeleri, uzman işaretlemesi, film bilgisi paneli, BT kesit yığınları |
| Uygulama | Oturum başına rastgele 10 vaka; film üzerinde sabit yarıçaplı daire ile işaretleme, ipucu (−5), her yanıttan sonra geri bildirim, uzman kutusu ve ıskalama oku |
| Değerlendirme | Yalnız radyolog etiketli yetişkin filmleri; bölge katmanı, uzman kutusu ve ipucu kapalı; vaka başına 180 sn; puan SCORM'a yazılır |

- Görüntü havuzu: bu depoda `src/data/images.json` içinde **597 görüntü kaydı** doğrulandı — kaynak
  veri setine göre dağılım: NIH ChestX-ray14 252, NLM TB (Montgomery/Shenzhen) 228, Kermany pediatrik
  59, Europe PMC 31, Wikimedia Commons 25 (7'si tekil BT görüntüsü), TCIA LIDC-IDRI 2 (gerçek toraks
  BT kesit **serisi**).
- Vaka havuzu: `src/data/cases-auto.json` içinde **187 vaka** doğrulandı; bunların **123'ü**
  değerlendirme moduna uygun (`modes` alanı `assessment` içerenler), tamamı uygulama moduna uygun.
- **BT yığın (stack) görüntüleyici:** TCIA LIDC-IDRI serileri için akciğer (C−600/W1500) ve mediasten
  (C50/W350) pencereleri önceden render edilmiş kesit dizisi olarak sunulur; fare tekerleği/ok
  tuşlarıyla kesit gezinme (`src/ui/FilmViewer.tsx`, `ImageRecord.stack`).
- **≥3 seçenek kapısı:** Değerlendirme modundaki çoktan seçmeli sorular en az `MIN_ASSESSMENT_OPTIONS`
  seçenek içermek zorundadır; azsa paketleme durur (`scripts/validate-images.mjs`).
- Bulgu taksonomisi (`src/data/findings.json`) ve ABCDE okuma bölgeleri (`src/data/reading-zones.json`)
  uygulama ve içe aktarma betiklerinin tek doğruluk kaynağıdır.

## Hızlı başlangıç

Test edilen araçlar: Node.js v24.20.0 (bu ortamda doğrulandı; `package.json` içinde sabit bir
`engines` kısıtı yoktur), npm. React 19.2, Vite 8.3, TypeScript 6.0 — sürümler `package.json`'dan.

```bash
npm install
npm run dev             # http://localhost:5173  (?dev=1 teşhis paneli, ?fresh=1 devam kaydını yok sayar)
npm test                # vitest
```

### Görüntü havuzunu oluşturma

Yeni bir klonda uygulamanın görüntüleri yoktur; önce aşağıdaki veri edinim zincirini çalıştırın
(yalnız hızlı bir geliştirme denemesi için `npm run import:sample` 2 NIH örnek filmiyle küçük bir havuz kurar).

Görüntüler depoya girmez: `.gitignore` içindeki `public/assets/xray/runtime/` kuralıyla git dışıdır
(içe aktarıcılar 1024 px gri WebP üretir ve `src/data/images.json` envanterini günceller). Tam veri
edinim sırası:

```bash
npm run import:all      # NIH (remote) → NIH etiket zenginleştirme → NLM TB → pediatrik → Commons → TCIA → vaka üretimi
npm run import:europepmc # Europe PMC açık erişim figürleri (zincirde değil; ayrıca çalıştırın, ardından npm run cases)
npm run enrich:nih       # yalnız NIH rapor etiketi zenginleştirmesini yeniden çalıştırmak için
npm run import:tcia      # yalnız TCIA LIDC-IDRI BT serilerini yeniden içe aktarmak için
npm run cases            # scripts/generate-cases.mjs — src/data/cases-auto.json + docs/klinik-degerlendirme-listesi.csv
npm run validate         # ölümcül hata → çıkış kodu 1
```

`npm run import:all`, `scripts/import-nih-remote.mjs → scripts/enrich-nih-labels.mjs →
scripts/import-nlm-tb.mjs → scripts/import-pediatric.mjs → scripts/import-commons.mjs →
scripts/import-tcia.mjs → scripts/generate-cases.mjs` zincirini tek komutta çalıştırır
(`package.json` script tanımından); `enrich:nih`, `import:tcia` ve `cases` bu adımları ayrı ayrı
yeniden çalıştırmak için tek başına da kullanılabilir. Ayrıca hedefe özel içe aktarıcılar:
`import:nih`, `import:rsna` (RSNA Pneumonia, DICOM/PNG), `import:nih-remote`, `import:nlm-tb`,
`import:pediatric`, `import:commons`, `import:europepmc`.

```bash
# NIH ChestX-ray14 (+ isteğe bağlı Google panel etiketleri)
npm run import:nih -- /veri/nih --google /veri/google/test_labels.csv --google /veri/google/validation_labels.csv --cap 40 --replace
# RSNA Pneumonia Detection Challenge (DICOM ya da PNG)
npm run import:rsna -- /veri/rsna --cap 40 --replace
```

`--cap`, bulgu başına alınacak en fazla film sayısıdır (paket boyutu); film başına ~40–70 KB
hesaplanabilir.

## Paketleme

```bash
npm run build:scorm     # release/EGEMED-Opaca-SCORM12.zip (validate + tsc + vite build)
npm run build:html      # release/EGEMED-Opaca-HTML.zip (LMS'siz)
npm run e2e              # dev sunucusu açıkken ekran görüntüsü duman testi (CHROMIUM_PATH)
npm run e2e:click-stability
```

## Depo yapısı

```
egemed-opaca/
├── src/
│   ├── core/        tipler, geometri (normalize koordinat), yanıt/skor, doğrulama, suspend, SCORM, durum
│   ├── ui/           FilmViewer.tsx (yakınlaştırma/kaydırma, pencere ön ayarı, BT yığın gezinme,
│   │                 negatif, işaretleme, ölçüm, bölge telemetrisi), FilmInfoPanel, ekran bileşenleri
│   ├── screens/       Mod seçimi, öğrenme, uygulama, değerlendirme, sonuç ekranları
│   └── data/           findings.json (taksonomi), reading-zones.json (ABCDE), library.json, sources.json,
│                        cases.json, cases-auto.json (187 vaka), images.json (597 kayıt)
├── scripts/
│   ├── import-nih.mjs, import-nih-remote.mjs, import-rsna.mjs, import-nlm-tb.mjs,
│   │   import-pediatric.mjs, import-commons.mjs, import-europepmc.mjs, import-tcia.mjs   İçe aktarıcılar
│   ├── enrich-nih-labels.mjs    NIH rapor etiketi zenginleştirme
│   ├── generate-cases.mjs        Vaka üretici (güvenli çeldirici seçimi, seçenek/lokalizasyon soruları)
│   ├── validate-images.mjs       Doğrulama (≥3 seçenek kapısı, lisans/kaynak denetimi)
│   ├── audit-duplicates.mjs      Yinelenen görüntü/hasta ve soru tekrarı denetimi
│   ├── build-scorm.mjs, build-html.mjs   Paketleme
│   ├── e2e-screens.mjs, e2e-v2-screens.mjs, e2e-v3-screens.mjs, e2e-click-stability.mjs   E2E testleri
│   ├── lib/                      Ortak yardımcılar (vaka seçimi, uzak ZIP okuyucu, lisans süzgeci, NLM anahtar sözcükleri, DICOM, CSV)
│   └── tcia/                     TCIA BT hattı (`prepare_ct.py`, `parse_annotations.py`)
├── fixtures/
│   ├── nih-sample/                2 NIH geliştirme filmi (atıf README'de)
│   ├── tcia-series.json, commons-list.json, epmc-terms.json   İçe aktarma seçim listeleri
├── docs/
│   ├── OPACA.md                    Mimari ve eğitim ilkeleri (kapsamlı)
│   ├── TCIA-BT.md                   TCIA LIDC-IDRI BT kesit yığınları — kaynak, lisans, üretim
│   ├── DENETIM.md                   Bağımsız denetim komutları ve değişmezler
│   ├── OPACA-V2-ICERIK-PLANI.md      V2 içerik genişletme planı
│   └── klinik-degerlendirme-listesi.csv   Vaka başına hekim onayı ve soru envanteri
├── tests/           core.test.ts, scripts.test.ts, remote-zip.test.ts (vitest)
├── brand-src/        EGEMED Opaca logo setinin özgün PNG dosyaları (8 dosya); web türevleri `public/brand/`
├── reports/tcia/      TCIA üretim raporları ve manifest (git izlenir; diğer reports/* git dışı)
└── release/, build/, dist/   Paketleme çıktıları (git dışı; yeniden üretilir)
```

Not: Kök dizinde ayrı bir logo ZIP arşivi (`EGEMED_OPACA_Logo_Set.zip`) yoktur; aynı özgün PNG'ler
`brand-src/` altında tutulur.

## Bilimsel ilke: bulgu ≠ tanı, etiket kaynağı ayrı tutulur

Her bulgu etiketi kaynağıyla saklanır (`LabelSource`): radyolog paneli, radyolog kutusu, radyolog
okuması, BT doğrulaması ya da **rapor metninden otomatik çıkarım (NLP)**. NLP etiketleri yalnız meta
veri ve uygulama içindir; değerlendirme havuzuna giremez, lokalizasyon puanlamasında kullanılmaz.
NIH'nin "No Finding" etiketi "normal" sayılmaz; normal filmler uzman kaynaklıdır: NLM TB radyolog
okuması, NIH Google radyolog paneli (panelin 4 bulguyu dışladığı **ve** NIH raporunun "No Finding"
dediği filmler) ve Kermany uzman etiketi. Ayrıntı: [`docs/OPACA.md`](docs/OPACA.md) §3.

## İçerik ve veri kaynakları

`src/data/sources.json` → `datasets` alanından (tam atıf metinleri dosyada ve uygulamanın "Hakkında"
ekranında):

| Veri seti | Lisans | Doğrulandı mı | Kullanım |
|---|---|---|---|
| NIH ChestX-ray14 (Wang ve ark., CVPR 2017) | Kısıtlama yok, atıf koşullu | ✓ | Görüntüler + radyolog kutuları (BBox_List_2017); NLP etiketleri yalnız meta veri |
| Google Health — NIH panel etiketleri (Majkowska ve ark., Radiology 2020) | Atıf koşullu | **hayır** — lisans metni incelemede | Kırık, pnömotoraks, havalı alan opasitesi, nodül/kitle panel kararı |
| NLM Montgomery/Shenzhen TB (Jaeger ve ark., 2014) | NLM, araştırma/eğitim, atıf koşullu | ✓ | Montgomery (138 film, tümü) + Shenzhen (90 film, seçmeli), radyolog okuması |
| Kermany pediatrik (Kermany ve ark., Cell 2018) | CC BY 4.0 | ✓ | Pediatrik normal/pnömoni; yalnız öğrenme/uygulama, değerlendirmeye girmez |
| Wikimedia Commons (küratörlü, görüntü başına atıf) | Dosya bazında CC0/PD/CC BY/CC BY-SA; NC/ND alınmaz | ✓ | Nadir/özel konular (krup, yabancı cisim, skolyoz, kırık, BT örnekleri vb.); değerlendirmeye girmez |
| Europe PMC açık erişim vaka figürleri | Yalnız CC BY/CC BY-SA/CC0 | ✓ | Örneği az/hiç olmayan konular; hekim onayı bekler; değerlendirmeye girmez |
| TCIA LIDC-IDRI (Armato ve ark.) | CC BY 3.0 | ✓ | Gerçek toraks BT kesit yığınları + 4 radyoloğun nodül konturu; yalnız öğrenme modu |

Yalnız fiilen görüntü alınan veri setleri listelenir; `validate`, atfı olup hiç kullanılmayan veri seti
bulursa hata verir.
Google panel etiketleriyle üretilen paket, `sources.json` içindeki `licenseVerified` işareti
doğrulanana kadar `validate` adımında durur (`OPACA_ALLOW_LICENSE_REVIEW=1` yalnız yerel geliştirme içindir).

**Kullanım uyarısı (`sources.json` → `disclaimer`, aynen):**

> "Görüntüler açık veri setlerinden alınmıştır ve kimliksizleştirilmiştir. Bulgu etiketlerinin
> kaynağı her vakada belirtilir; rapor metninden otomatik çıkarılan etiketler değerlendirmede
> kullanılmaz. Simülasyon eğitim amaçlıdır; tek başına klinik tanı koymak için kullanılamaz."

**Validasyon ifadesi (`sources.json` → `module.validationStatement`):**

> "Simülatörün tüm tıbbi içerik ve görüntü validasyonları Ege Üniversitesi Tıp Fakültesi Radyoloji
> Anabilim Dalı öğretim üyelerince yapılmıştır."

## Pedagojik ve teknik tasarım kararları

- **Öneri ≠ kilit:** Mod seçimi kilitlenmez; aile genelinde ortak ilke (Ausculta'dan devralınmıştır, `docs/OPACA.md` §2).
- **Tohumlu seçenek permütasyonu ve örnekleme:** Görüntü kimliğinden türeyen deterministik PRNG ile
  çeldirici seçimi her çalıştırmada aynı kalır (`scripts/generate-cases.mjs`); K1 seçenek karıştırma,
  K3/K4 oturum/suspend kuralları Ausculta'dan devralınmıştır.
- **Güvenli çeldirici ilkesi:** Çeldiriciler yalnız "güvenli" bulgulardan seçilir — uzmanın
  bulunmadığını belirttiği bulgular, radyoloğun normal dediği filmde herhangi bir bulgu, uzman
  pozitifi olan filmde "normal", NIH raporunda geçmeyen bulgu; güvenli aday azsa seçenek sayısı
  azalır (en az 2 üretimde, **değerlendirmede en az `MIN_ASSESSMENT_OPTIONS` = 3**). NIH filmlerinde
  raporda geçmeyen bulgular (`enrich-nih-labels.mjs`), Montgomery TB filmlerinde radyoloğun serbest
  metninde geçmeyen bulgular güvenli sayılır; Shenzhen kısa-kod okumalarında bu yol kullanılmaz. Güvenli
  adaylar arasında ayırıcı tanı önceliği uygulanır (`DIFFERENTIALS`, `scripts/lib/case-selection.mjs`).
  Anahtar her zaman uzman etiketli ana bulgudur.
- **≥3 seçenek kapısı:** Değerlendirme vakalarında yetersiz seçenekli soru paketlemeyi durdurur
  (fatal hata, `scripts/validate-images.mjs` → `hasEnoughOptions`).
- **BT yığın görüntüleyici:** TCIA serileri akciğer/mediasten pencereleriyle önceden render edilmiş
  kesit dizisi olarak sunulur; `stack` alanı yoksa görüntüleyici geriye dönük uyumlu şekilde tek
  kareli bir yığın gibi davranır (`src/core/types.ts`, `src/ui/FilmViewer.tsx`).
- **Soru tekrarı kuralları:** Görüntüye bağlı sorular (bulgu tanıma, lokalizasyon, film kalitesi) her
  görüntüde farklıdır; bilgi soruları her konu için birden çok varyanttan dağıtılır. Bir bilgi sorusu
  varyantı havuzda en fazla 4 vakada kullanılır, bir oturumda aynı bilgi sorusu iki kez çıkmaz (1000
  rastgele oturumla test edilir), bulgudan bağımsız genel sorular vakaların en fazla %10'unda yer alır
  (`scripts/audit-duplicates.mjs`, `scripts/validate-images.mjs`).
- **Dosya adı sızıntısı yok:** Bazı kaynak adları bulguyu ele verir (Kermany `bacteria`/`virus`, NLM
  `_0`/`_1` = normal/TB, Commons açıklayıcı adları). Paketleme sırasında röntgen görüntüleri içerik
  özetiyle `assets/xray/r/<sha1-12>.webp` adına çevrilir (`scripts/lib/obfuscate-images.mjs`);
  `npm run dev` okunur adları korur.
- **Lokalizasyon (hotspot):** Öğrenci sabit yarıçaplı bir daire yerleştirir (görüntü kısa kenarının %8'i).
  İsabet: daire merkezi uzman kutusunun içinde **ve** kutu merkezine uzaklığı yarı köşegenin %60'ından
  az. Uzman kutusu görüntünün %35'inden büyükse o görüntüden lokalizasyon sorusu üretilmez
  (`src/core/geometry.ts`).
- **Film bilgisi paneli:** Taraf işareti (sentetik, açıkça etiketli), projeksiyon, pozisyon ve film
  kalitesi ölçütleri; kimlik/tarih alanları sentetik yer tutucudur. BT serilerinde yöntem, pencere,
  radyolog uzlaşısı ve okuyucu morfoloji puanları gösterilir; malignite puanı gösterilmez, patoloji
  doğrulaması olmadığı belirtilir (`src/ui/FilmInfoPanel.tsx`).
- **Pediatrik ve yazar-açıklamalı (author_caption) içerik sınırı:** Pediatrik filmler uygulama
  modunda otomatik vakaların en fazla %15'ini oluşturur ve hiçbir zaman değerlendirme havuzuna
  girmez; Commons/Europe PMC kaynaklı `author_caption` etiketli görüntüler de aynı şekilde
  değerlendirme dışıdır (`scripts/lib/pediatric-ratio.mjs`, `scripts/validate-images.mjs`).
- **En iyi puan ve tam ekran önerisi, SCORM 1.2 tek SCO ve `suspend_data` sınırı:** Ausculta'dan
  devralınan çalışma zamanı; suspend verisi SCORM 1.2'nin 4000 karakterlik sınırına sığacak şekilde
  kademeli küçültülür (K3/K4), tamamlanmış LMS durumu ezilmez (`docs/DENETIM.md`).

## Oyunlaştırma (bayrak arkasında, v1)

Başarılarım (seviye/XP, seri, haftalık hedefler, alan performansı, 28 rozet) ve Liderlik Tahtası (dönem/kohort,
podyum, Ayın Ödülü) **varsayılan olarak kapalıdır**; kapalıyken arayüz ve SCORM davranışı birebir aynıdır.

- Açmak: tarayıcıda `?gami=1`; pakete gömmek için derlemede `VITE_GAMI=1`
  (ör. `VITE_GAMI=1 OPACA_ALLOW_LICENSE_REVIEW=1 npm run build:scorm`).
- Demo durumları: `?gami=1&demo=full|empty|winner` (bellek içinde; gerçek veriye dokunmaz).
- Veri: kişisel ilerleme tarayıcıda `localStorage` (`opaca.gami.v1`); SCORM'a hiçbir şey yazılmaz. Ad SCORM öğrenci
  adından ("Soyad, Ad" → "Ad Soyad"), öğrenci anonim görünmeyi seçebilir.
- **Sınır:** pakette sunucu olmadığından sınıf sıralaması gerçek değildir — kendi sonuçların + deterministik demo akranlar;
  her ekranda "Demo verisi" etiketi var. Gerçek sıralama için `GamificationRepo`'nun sunucu (ör. xAPI/LRS) uygulaması gerekir.
- Kod: `src/gamification/` (saf kurallar, `rules.ts` tek sayısal kaynak), `src/ui/gami/`, `src/styles-gami.css`,
  `src/screens/{Achievements,Leaderboard}Screen.tsx`. Belgeler: `docs/GAMIFICATION-*.md`, onaylı tasarım `docs/mockups/gami.html`.
- Görüntüler: `npm run e2e:gami` (6 durum × 1440/768/360, taşma denetimi).

## Test ve kalite güvencesi

```bash
npm test                       # vitest — bu depoda çalıştırıldı
npm run validate                 # görüntü/vaka doğrulaması (≥3 seçenek kapısı dahil)
npm run audit:dupes              # yinelenen görüntü/hasta ve soru tekrarı denetimi
npm run e2e                      # ekran görüntüsü duman testi
npm run e2e:click-stability      # tıklama kararlılığı denetimi
```

Bu depoda `npx vitest run` çalıştırıldı: **3 test dosyası, 119 test — tamamı geçti** (709 ms).
Denetlenmesi gereken değişmezler (rapor-NLP etiketinin değerlendirmede ana bulgu olamaması,
lokalizasyon puanının yalnız uzman kutusuna dayanması, değerlendirmede uzman kutusu/okuma
bölgesi/ipucunun gizlenmesi, otomatik vakaların klinik öykü/tanı üretmemesi, lisansı doğrulanmamış
veri setinin paketlemeyi durdurması, suspend verisinin 4000 karaktere sığması) `docs/DENETIM.md`
içinde listelidir.

## Belgeler

- [`docs/OPACA.md`](docs/OPACA.md) — Mimari, kapsam, Ausculta'dan taşınanlar, etiket kaynağı
  kuralları, soru üretimi ve puanlama mantığı.
- [`docs/TCIA-BT.md`](docs/TCIA-BT.md) — TCIA LIDC-IDRI BT kesit yığınlarının kaynağı, lisansı,
  üretim komutları, seçilen seriler ve sınırlamalar.
- [`docs/DENETIM.md`](docs/DENETIM.md) — Bağımsız denetim komutları ve denetlenmesi gereken değişmezler.
- [`docs/OPACA-V2-ICERIK-PLANI.md`](docs/OPACA-V2-ICERIK-PLANI.md) — V2 içerik genişletme planı.
- [`docs/klinik-degerlendirme-listesi.csv`](docs/klinik-degerlendirme-listesi.csv) — Vaka başına
  hekim onayı ve soru envanteri.
- [`fixtures/nih-sample/README.md`](fixtures/nih-sample/README.md) — Geliştirme örneği atıf notu.

## Bekleyen işler

- `docs/klinik-degerlendirme-listesi.csv` vakalarının ve Commons/Europe PMC görüntülerinin hekim onayı;
  "Tıbbi İçerik Validasyonu" ekibinin isimleri.
- Google panel etiketlerinin lisans metninin doğrulanması.
- Rotasyon/inspirasyon/penetrasyon değerlendirmesi (`images.json` → `quality`) için radyolog gözden geçirmesi.
- Az örnekli konular için ek görüntü (hiperinflasyon, yükselmiş hemidiyafram, lateral grafi yalnız 7 film)
  ve BT'de amfizem/konsolidasyon/efüzyon serileri (LIDC-IDRI dışında bir TCIA koleksiyonu gerekir).
- TÜRKPATENT'te "Opaca" marka araştırması.

## Katkıda bulunanlar

`src/data/sources.json` → `credits` alanından:

| Rol | Kişi |
|---|---|
| Yazılım geliştirme, öğretim ve ölçme-değerlendirme tasarımı | Doç. Dr. Ozan KARACA |
| Öğretim Tasarımı ve Tıbbi Danışmanlık | Prof. Dr. Hatice ŞAHİN, Prof. Dr. Burcu BARUTÇUOĞLU, Prof. Dr. İpek KAPLAN BULUT |
| Tıbbi İçerik Validasyonu | belirlenecek (3 kişi) |

**Kurum:** Ege Üniversitesi Tıp Fakültesi Dekanlığı.

## Lisans

Depoda ayrı bir `LICENSE` dosyası yoktur. **Tüm hakları saklıdır © 2026 Ege Üniversitesi Tıp
Fakültesi Dekanlığı.** Üçüncü taraf veri setlerinin (NIH ChestX-ray14, NLM TB, Kermany — CC BY 4.0,
Wikimedia Commons — dosya bazında, Europe PMC — CC BY/CC BY-SA/CC0, TCIA LIDC-IDRI — CC BY 3.0)
kendi lisansları ayrıca geçerlidir; atıf metinleri `src/data/sources.json` içindedir. Google panel
etiketlerinin lisansı henüz doğrulanmamıştır ve `licenseVerified: false` ile işaretlidir.
