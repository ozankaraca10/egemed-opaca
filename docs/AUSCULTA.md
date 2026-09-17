# EGEMED Ausculta — Mimari ve İçerik Rehberi

> Marka: **EGEMED Ausculta** (önceki ad: StetesAI). Marka varlıkları `public/brand/` altındadır:
> Resmî marka seti PNG olarak `public/brand/` altındadır: `logo-icon-white-web.png` (koyu header),
> `logo-vertical-web.png` (landing hero), `logo-horizontal-web.png` (Kaynaklar kartı),
> `logo-compact-web.png` (footer), `favicon-32/apple-touch-icon/icon-512` (sistem ikonları).
> Yatay/dikey/monokrom tam çözünürlük orijinalleri proje arşivinde tutulur.

**Kardiyopulmoner Oskültasyon Simülatörü** · SCORM 2004 4th Edition (birincil) + SCORM 1.2 (yedek)

Bu belge; Ausculta modülünün mimarisini, vaka tanımını, ses içe aktarma hattını, atıf
ve klinik doğrulama katmanını, SCORM paketlemesini, bağımsız test modunu ve yeni
ses/vaka ekleme prosedürlerini açıklar.

---

## 1. Genel Mimari

```
LMS (Moodle vb.) ← SCORM 2004/1.2 paketi (tamamlama, puan, etkileşimler, suspend)
├── React arayüzü (ekranlar: Start → Tutorial → Modes → Learn/Simulation → Results)
├── store.tsx        : tek reducer + SCORM kablolama (suspend, skor, etkileşimler)
├── core/scorm.ts    : API_1484_11 / API keşfi + 2004↔1.2 anahtar eşleme + Mock adapter
├── core/suspend.ts  : kompakt suspend serileştirme (SCORM 1.2 4096 karakter limitine uygun)
├── core/scoring.ts  : deterministik alan bazlı skor (§24)
├── core/validation.ts : vaka şema doğrulaması (malformed vaka build'i keser)
├── core/resolver.ts : ses atamalarının kayıt çözümü (konum-duyarlı §2)
├── audio/engine.ts  : WebAudio — tek AudioContext, ~120 ms crossfade, tam segment döngü,
│                      Bell/Diyafram DSP fallback (audioConfig.ts merkezî)
├── data/            : sounds.json (üretim), cases.json, auscultation-points.json,
│                      library.json, sources.json, terminology.ts
├── public/assets/body: gerçekçi hasta ön/arka gövde fotoğrafları (CC0, kırpılmış)
└── ui/              : PatientStage (sürüklenebilir stetoskop), Toolbar, WaveformView,
                       Questions, torso SVG'leri, ikonlar
```

Prensipler:
- **Hiçbir render ağacı pointer hareketinde yeniden çizilmez** — stetoskop konumu DOM üzerinde ref ile güncellenir.
- **Ses lazy yüklenir** (kullanılan vakanın kayıtları), buffer cache + node temizliği yapılır.
- **Paket içinde her şey yereldir** — CDN/uzak font/görsel yok (§30).
- **Değerlendirmede yanıt ifşa eden görsel yok** — etiketler yalnız Öğrenme/Uygulamada (§21).

## 2. Üç Mod

| Mod | Amaç | İpucu | Skor | Geri bildirim |
|---|---|---|---|---|
| Öğrenme | Kütüphane + rehberli dinleme, dalga formu, klinik bilgi | — | yok | her yerde |
| Uygulama | Klinik vaka + sorular | var (−5 puan/adet) | gösterilir | soru başına |
| Değerlendirme | SCORM ölçümü | yok | SCORM'a yazılır | yalnız sonuçta |

## 3. Veri Şemaları

### 3.1 auscultation-points.json
Her nokta: `id`, `view (front|back)`, `group (cardiac|lung)`, `label`, `fullLabel`,
`detail`, `x/y` (normalize 0–1), `color`, `tagSide`. `views` bloğu her görünüm için
görsel yolunu ve piksel ölçülerini tutar; sahne görseli en-boy oranını koruyarak
letterbox'sız ölçeklenir (ResizeObserver), böylece hotspot hizası her ekranda tamdır.
Görsel değiştirilecekse: yeni fotoğrafı `public/assets/body/` altına koyun, `views`
ölçülerini güncelleyin ve noktaları `points` içinde yeniden kalibre edin (§12).

**Arka bölge (§14):** HLS-CMDS'te posterior kayıt yoktur. Öğrenme modunda posterior
noktalar görünür ve ses, aynı bulgunun anterior kaydından **açıkça belirtilerek**
çalınır (`resolveLibrarySoundEx` → `fallbackFrom`; arayüzde kaynak bölge notu gösterilir).
Vakalarda yanlış beyan olmaması için yalnız doğrulanmış bölge atamaları kullanılır.

### 3.2 cases.json (§17)
Zorunlu alanlar: `id, title, modes, patient, chiefComplaint, history, vitalSigns,
objectives, tasks, views, allowedHeads, soundAssignments, primaryAcousticFinding,
clinicalDiagnosis, mappingValidation, technique, questions, feedback, references`.
`scoringWeights` isteğe bağlı (toplam 100 olmalı; otomatik dengeleme var).

Soru (§23): `type ∈ {single_choice, multi_choice, sound_identify, localization,
bell_diaphragm, interpretation, diagnosis, sequence}`, `domain ∈ {recognition,
localization, interpretation, diagnosis}`, `options/correct/feedback*/hint`.

### 3.3 sounds.json (import üretimi)
Bkz. §4. Kayıt alanları: `id, category, acousticFinding, sourceDataset, sourceFile,
durationSec, sampleRate, peak, rms, recordedLocation, simulationLocation, nativeFilter,
gender, runtimeUrl, validationStatus, issues`.

**Dürüst eşleme kuralları (§13, §14):**
- `recordedLocation` veri setindeki gerçek kayıt konumudur (RUSB, LUSB, Apex, LLSB, LUA…).
- `simulationLocation` yalnız birebir karşılığı olan eğitim işaretine eşlenir
  (RC/LC gibi belirsiz konumlar `null` kalır ve adlandırılmış odağa sunulmaz).
- Arşivde olmayan kayıtlar `missing_asset` olarak listelenir; sessizce düşürülmez.
- Posterior akciğer kayıtları HLS-CMDS'te yoktur; posterior noktalar yalnız
  Fraiwan importu ile ses alır (importör hazır).

## 4. Ses İçe Aktarma

**Düzey normalizasyonu:** Kayıtlar çok düşük seviyededir (medyan RMS ≈ 0.004).
İçe aktarma sırasında her runtime kopyası ortak hedef RMS'e (−20 dBFS) yükseltilir;
kazanç üst sınırı 30× ve tepe tavanı 0.97 ile kırpılma engellenir. Ustalar değişmez.
Oynatma zincirinde ayrıca güvenlik limiter'ı (DynamicsCompressor) vardır.

```bash
# 1) Birincil veri seti (HLS-CMDS v3, DOI 10.17632/8972jxbpmp.3)
./scripts/download-hls-cmds.sh /tmp/egemed-ausculta/hls-cmds
npm run import:hls-cmds        # → public/assets/audio/runtime/... + src/data/sounds.json

# 2) Doğrulama (build'i kesen fatal rapor)
npm run validate

# 3) İsteğe bağlı Fraiwan akciğer veri seti (DOI 10.17632/jwyy9np4gv.2)
node scripts/import-lung-dataset.mjs /yol/chest-dataset.zip
```

Importör; HS/LS/Mix CSV'lerini ayrıştırır, WAV başlıklarını okur (süre, peak, RMS,
clipping uyarısı), dosyaları `public/assets/audio/runtime/{heart,lung,mixed}/`
altına **küçük harf adlarla** kopyalar (vaka-duyarlı LMS sunucularıyla uyum) ve
sabit iç ID'ler üretir: `heart_normal_rusb_001` biçiminde.

## 4.1 Veri Seti ↔ Kütüphane ↔ Vaka Senkronizasyonu (§36)

Platform üç katmanda **aynı veri seti etiket kümesiyle** hizalıdır ve bu durum otomatik denetlenir:

| Katman | Kapsam |
|---|---|
| Veri seti (HLS-CMDS v3) | 10 kalp sınıfı + 6 akciğer sınıfı + 60 kombine (mixed) kombinasyon |
| Öğrenme kütüphanesi | 10 kalp + 6 akciğer + 4 kombine kalemi (20 kalem, her birinde **ses metaforu**) |
| Uygulama modu | 20 vaka (tüm sınıflar + 4 kombine vaka) |
| Değerlendirme modu | 16 vaka / 50 soru (tüm doğrulanmış sınıflar) |

Kurallar `scripts/validate-audio.mjs` (fatal) ve `tests/core.test.ts` (vitest) ile zorlanır:
her veri seti sınıfı için kütüphane kalemi + en az bir uygulama vakası + en az bir değerlendirme
vakası bulunmalıdır; kombine kayıtlar kütüphane ve uygulamada temsil edilmelidir (değerlendirme
dışıdır — `educational_mapping`); her kütüphane kalemi için çalınabilir kayıt olmalıdır.

**Ses metaforları (izleme modu):** her kütüphane kalemi, klinik eğitimde kullanılan işitsel
benzetmeleri içerir (ör. ince raller → *"karda yürüme sesi / saç oğuşturma"*, kaba raller →
*"kaynama fokurtusu"*, wheezing → *"çaydanlık düdüğü"*, ronküs → *"uykuda horlama"*,
plevral frotman → *"kar gıcırtısı"*, S3 → *"ken-ta-ta dörtnal ritmi"*). Metaforlar öğrenme
modunda ayrı bir kartta gösterilir ve yeni vakaların ipuçlarında da kullanılır.

## 4.2 Veri Seti Envanteri (§5, §34)

Araştırılan açık erişimli veri setleri `src/data/sources.json` → `inventory` altında tutulur
(makine okunur; "Kaynaklar" ekranında durum çipleriyle gösterilir). Durum kodları:

| Durum | Anlam |
|---|---|
| `bundled` | Pakete dahil (lisans doğrulanmış) |
| `samples_included` | Örnek kayıtlar envantere aktarıldı (paket dışı manifest) |
| `importer_ready` | Import scripti hazır, kullanıcı veriyi indirip çalıştırır |
| `inventory_only` | Etiketler taksonomiye birebir uymuyor — içeriğe alınmaz |
| `license_review` | Lisans/yeniden dağıtım koşulları doğrulanmadı — pakete alınmaz |

Envanterdeki veri setleri (özet): HLS-CMDS v3 (paket, CC BY 4.0) · Fraiwan akciğer (CC BY 4.0,
posterior adayı) · **CirCor DigiScope** (ODC-BY 1.0, pediatrik üfürüm, 4 örnek aktarıldı) ·
PhysioNet/CinC 2016 (ODC-BY 1.0, yalnız normal/anormal → envanter) · SPRSound (CC BY 4.0,
ince/kaba ral ayrımı yok → envanter) · EPHNOGRAM (EKG korelasyonu adayı) · ICBHI 2017
(lisans incelemesi; §34 gereği pakete alınmaz) · HF_Lung_V1 ve KAUH (erişim/lisans doğrulaması).

**Posterior kuralları:** veri setinde posterior kayıt yoksa aynı bulgunun anterior kaydı
"fallback" olarak, kaynak bölge açıkça bildirilerek çalınır (§14).

**CirCor içe aktarma:**
```bash
# 1) Veriyi indir (449 MB, ODC-BY 1.0): https://physionet.org/content/circor-heart-sound/1.0.3/
node scripts/import-circor.mjs /yol/circor-heart-sound-1.0.3
# → public/assets/audio/runtime/external/circor/*.wav + src/data/sounds-external.json + rapor
```
Eşleme kuralları `scripts/lib/external-mapping.mjs` içinde saf fonksiyonlardır ve test edilir:
Erken/Orta/Geç sistolik zamanlamalar doğrulanmış; holosistolik `educational_mapping`
(değerlendirmeye girmez); uymayan etiketler uydurulmaz, rapora yazılır.

## 5. Klinik Doğrulama Katmanı (§6, §19)

- `acousticFinding` (akustik bulgu) ile `clinicalDiagnosis` (tanı) ayrıdır.
- Bir tanı sorusu ancak `clinicalDiagnosis` dolu **ve** `mappingValidation === 'validated'`
  iken vaka içinde yer alabilir. Şu an doğrulanmış tanı eşlemeleri yalnız:
  Atriyal Fibrilasyon, Taşikardi, AV Blok (manikin sınıfı = ritim tanısı).
  Üfürüm → kapak lezyonu gibi eşlemeler bilinçli olarak yapılmaz.
- `validate-audio.mjs` + `core/validation.ts` ihlalleri **build hatası** yapar;
  `filterAssessmentPool` hatalı vakaları değerlendirme havuzundan dışlar.

## 6. Skor (§24)

Varsayılan ağırlıklar: teknik 20 · lokalizasyon 20 · tanıma 25 · yorum 20 · tanı 10 · sistematik 5.
**Ulaşılamayan ağırlık kalmaz (K2):** bir vakada o alana (lokalizasyon/tanıma/yorum/tanı) ait soru
yoksa o alanın `max`'ı 0'dır; toplam puan yalnız gerçekten soru bulunan alanların ağırlık toplamı
(`maxTotal`) üzerinden 100'e normalize edilir — böylece kusursuz performans her vakada tam 100 verir.
Vaka bazında elle belirlenen `scoringWeights` toplamı yine 100 olmalıdır (`validateCase` uyarır).
Hakimiyet eşiği **80**. Uygulama modunda her ipucu görünür puanı −5 düşürür (`practiceAdjusted`);
değerlendirmede ipucu yoktur, etkilenmez. Tek hata çifte ceza vermez (sistematik yarım puan; teknik
ayrı ölçülür).

## 7. SCORM (§25–§27, §50)

```bash
npm run build:scorm2004   # dist/EGEMED-Ausculta-SCORM2004.zip (birincil)
npm run build:scorm12     # dist/EGEMED-Ausculta-SCORM12.zip (yedek)
```
- `imsmanifest.xml` paket kökünde; ek sarıcı klasör yok.
- Çalışma zamanı: `Initialize/GetValue/SetValue/Commit/Terminate`; 2004 ve 1.2 otomatik algılanır.
  API yoksa **Mock adapter** ile bağımsız çalışma (başlıkta DEV rozeti, yalnız dev build).
- Takip: completion/success, score.raw/min/max(/scaled), progress_measure, session_time,
  location, suspend_data, etkileşimler (soru bazlı id/type/response/result).
- Suspend: mod, vaka, adım, yanıtlar, ziyaret noktaları, ipucu sayısı, vaka sonuçları.
  SCORM 1.2 limitine uymak için kompakt serileştirme + test.

## 8. Bağımsız / Geliştirme Modunda Test

```bash
npm run dev        # http://localhost:5173
```
- SCORM API olmadan mock adapter devrede; durum kaybı olmadan çalışır.
- Geliştirici teşhisi (§38): dev build + `http://localhost:5173/?dev=1` → sol alt panelde
  vaka, nokta, çözülen kayıt, kaynak dosya, doğal lokasyon, süre, SCORM durumu.
- Otomatik görsel akış testi: `node scripts/e2e-screens.mjs` (dev server açıkken;
  ekran görüntülerini /tmp/egemed-ausculta-shots'a yazar, console hatalarını raporlar).
- SCORM LMS testi: paketi Moodle'a yükleyin; "Suspend/Resume" davranışı dersin
  yeniden açılışında vaka/adım/yanıtların korunmasıyla doğrulanır.

## 9. Yeni Ses Ekleme

1. Kaynak dosyayı ve CSV'yi `scripts/download-hls-cmds.sh` akışına veya
   `import-lung-dataset.mjs` haritasına uygun dizine koyun.
2. `import-*` script'ini çalıştırın → `sounds.json` güncellenir.
3. `npm run validate` → raporda `validated/missing` sayılarını kontrol edin.
4. Vakada kullanmak için `soundAssignments`'a `category + acousticFinding (+recordedLocation)` yazın.

## 10. Yeni Vaka Ekleme (§36)

1. `src/data/cases.json` içine yeni kayıt ekleyin (şema §3.2).
2. Ses atamalarının çözülebilir olduğundan emin olun (`npm run validate`).
3. Tanı sorusu ekliyorsanız: `clinicalDiagnosis` doldurun ve eşlemeyi belgeleyin;
   doğrulanmamış eşleme build'i keser.
4. Uygulama/Değerlendirme havuzlarına otomatik girer (mod listesine göre).
   Test: `npx vitest run` (şema + havuz filtresi testleri).

## 11. Atıf ve Lisans

- Sesler: **HLS-CMDS v3** — Torabi, Shirani, Reilly — DOI 10.17632/8972jxbpmp.3 — CC BY 4.0.
  Makale DOI 10.1109/IEEEDATA.2025.3566012.
- Gövde görselleri: **Mikael Häggström** — anterior/posterior insan gövdesi — Wikimedia Commons, **CC0 1.0**
  (yalnız gövde bölgesi kırpılmış, gereksiz anatomi gösterilmemiştir).
- Makine okunur atıf: `src/data/sources.json`; kullanıcıya "Kaynaklar" ekranında gösterilir.
- Hasta tanımlayıcı veri öğrenen arayüzüne sızmaz (§48).

## 13. Arayüz ve Yerleşim

- **Ekran ayrımı (uygulama vs. doküman):** `App.tsx` içinde `DOC_SCREENS` kümesi
  (`start, modes, tutorial, results, sources`) `.app-shell`'e `app-shell--doc`
  sınıfını ekler. **Uygulama ekranları** (`learn`, `simulation`) `100dvh` içinde
  kaydırmasız kalır — sahne görseli kapsayıcıya sığdırılır, sağ panel kendi içinde
  kaydırılır (1366×768 doğrulandı). **Doküman ekranları** sayfa düzeyinde doğal
  yükseklikte akar (`app-shell--doc{height:auto;min-height:100dvh;overflow:visible}`);
  footer sabit değildir, içeriğin sonunda akar. (`help` ekranı wave 2'de kaldırıldı —
  bkz. §13 wave 2, madde 6.)
- **Header düzeni:** Sol marka; ortada tek "bağlam grubu" (`.eg-header-context`) —
  yalnız `learn`/`simulation` ekranlarında mod çipi + (değerlendirmede) zamanlayıcı;
  sağda sırasıyla Mod Değiştir (yalnız çalışma ekranlarında), Tam Ekran (yalnız ikon,
  ikincil eylem), ayraç, Yardım, Kaynaklar. Etiketler (`chip-text`) her genişlikte
  görünür kalır; yalnız ≤720px'te ikon-only'e döner ve tüm ikon düğmelerde
  `aria-label` zorunludur. Soru sayacı ve "TR" dil çipi header'da YOKTUR (bkz. aşağı).
  DEV rozeti header'ın en sağında, Kaynaklar'dan sonra küçük bir rozet olarak gösterilir
  (`.eg-dev-badge`, yalnız dev build + `?dev=1` yokken; `ui/chrome.tsx` `Header`) — wave 1'deki
  sol-alt sabit-konumlu rozet (`.eg-dev-badge-fixed`) footer'a bindiği için kaldırıldı.
- **Soru sayacı:** `QuestionCard`'ın eyebrow satırının sağında "Soru N / M" metni +
  N adet nokta (cevaplanan dolu, aktif vurgulu, kalan boş) — `.q-progress` sınıfı,
  hem Uygulama hem Değerlendirmede gösterilir.
- **Uygulamada geri bildirim (madde 1 düzeltmesi):** `submitAnswer` sonrası
  Uygulama modunda **advance çağrılmaz** — kullanıcı geri bildirimi okuyup
  "Devam Et"/"Vakayı tamamla"ya basınca ilerler; Değerlendirmede geri bildirim yoktur,
  submit hemen ilerler. Karar saf fonksiyon `core/flow.ts#nextActionForSubmit`
  ile test edilir. Geri bildirimde doğru seçenek yeşil kontur + ✓, seçilen yanlış
  seçenek kırmızı kontur + ✗ ile işaretlenir (`QuestionCard`'ın `correctIds` prop'u).
- **Vaka geçişleri:** Store'da `finishCase` (skor hesaplar, `pendingSummary`'ye yazar,
  vakayı DEĞİŞTİRMEZ) ve `nextCase` (özet kapatılır, `caseIndex` ilerler, adım/yanıt/
  telemetri sıfırlanır) ayrı eylemlerdir; `advance` yalnız vaka İÇİNDE sonraki soruya
  geçer, son sorudan sonra hiçbir şey yapmaz. **Uygulama modu:** son sorunun geri
  bildiriminden sonra "Vakayı tamamla" `finishCase` çağırır; soru kartının yerinde
  vaka sonu özet kartı (`CaseEndCard`, `q-card-dark` stili) gösterilir — puan, kısa
  alan çubukları, klinik özet/ayırıcı tanı, teknik notu, "Sonraki vaka →" (son vakada
  "Sonuçları gör →" ile `nextCase`); kart görünürken sahne `sim-main.is-inert` ile
  pasiftir. **Değerlendirme modu:** `finishCase` sonrası otomatik `nextCase` çağrılır
  (özet gösterilmez); yeni vaka mount olunca (ilk vaka hariç) sahnenin üstünde 1.4 s
  süren geçiş paneli (`.case-transition`) — "Vaka N / M · Yeni hasta" + "Olgu bilgisini
  okuyun ve muayeneye başlayın"; süre boyunca `.sim-grid.is-transitioning` ile sahne/soru
  pasiftir (`prefers-reduced-motion`'da animasyonsuz, süre aynı kalır). Olgu kartı her
  vaka değişiminde 600 ms `case-flash` kenar parlamasıyla vurgulanır. Zamanlayıcı geçiş
  sırasında durmaz. Her iki modda `key={state.caseIndex}` ile stetoskop sıfırlanır.
- **Pediatrik referans modalı:** `ui/PediatricRefModal.tsx` — `HelpModal` ile aynı
  erişilebilirlik deseni (`role=dialog`, ESC/backdrop, odak tuzağı, açılış/kapanışta
  odak yönetimi). Öğrenme modunda sağ paneldeki bilgi kartının başlık satırında
  ("Pediatrik referans" düğmesi, `.card-title-actions`) her zaman erişilebilir; Uygulama
  modunda yalnız pediatrik vakalarda (`population==='pediatrik'`) Olgu kartının başlık
  satırında görünür; Değerlendirmede hiç gösterilmez.
- **Sonuçlar ekranı (madde 7):** Sola hizalı "rapor" düzeni, `max-width:1240px`
  (`.results-wrap-v2`). Üstte özet şerit (toplam puan halkası, durum, süre [yalnız
  değerlendirmede], vaka sayısı); altında "Alan bazlı performans" (yüzde + çubuk,
  `.domain-row`/`.domain-bar`) ve tam genişlikte "Vaka raporu" tablosu — satır
  tıklanınca soru bazlı liste (soru kökü, verilen/doğru yanıt, ✓/✗) açılır. Eylemler:
  "Modülden Çık", "Tekrar dene" (aynı modda yeni oturum), "Öğrenme modunda çalış".
  Kaynaklar ekranı da sola hizalı, `max-width:1240px`.
- **Tam ekran:** Header'daki Tam Ekran düğmesi `requestFullscreen` kullanır.
- **Responsive:** ≤1080px tek sütun (hasta önce, panel sonra); kütüphane yatay kaydırılabilir
  şeride dönüşür, araç çubuğu altta yapışkan kalır; ≤720px header ikon-only'e döner
  (etiketler gizlenir, `aria-label` kalır), ikincil çalışma-ekranı düğmeleri
  (`.hide-mobile`: Mod Değiştir, Tam Ekran) gizlenir — yalnız logo, mod çipi, Yardım
  ve Kaynaklar ikonları kalır; dokunma hedefleri büyütülür. Yatay taşma yok —
  doğrulandı: 390×844 (telefon), 1366×768 (masaüstü).
- **Marka:** Header/landing/footer'da `public/brand` SVG kilidi kullanılır; slogan yok.
  Footer (`madde 2`) kendi katmanında (`position:relative;z-index:1`), düz `--card`
  zemin ve okunur kontrastla (`--ink-600`/`--ink-800`) her ekranda net kalır; arka plan
  EKG dekorasyonu tamamen kaldırıldı (footer'ın üstüne biniyordu).

### §13 — UI/UX 2. dalga (akış)

- **Bölge chip'leri gerçek bir gezinme ögesi (`ui/RegionChips.tsx`):** başlık "Dinleme
  bölgeleri"dir (teknik "klavye ile erişim" ifadesi kaldırıldı). Öğrenme/Uygulamada her
  zaman görünür; Değerlendirmede `sr-only-until-focus` davranışı korunur (işaret/ipucu yok
  kuralı §21 bozulmaz). Chip durumları saf fonksiyon `core/flow.ts#regionChipState` ile
  hesaplanır: `active` (stetoskop bu noktada → dolu mavi), `listened` (bu oturumda
  `telemetry.visits[id].listenMs>0` → yeşil kontur + ✓), `default` (nötr kontur);
  `aria-pressed` durumu bildirir. Görünmeyen görünümde dinlenmemiş nokta varsa listenin
  sonunda soluk ipucu — `otherViewHintText`/`countUnlistenedInOtherView` (yalnız
  Öğrenme/Uygulama; Değerlendirmede hiç gösterilmez). `SimulationScreen` ve `LearnScreen`
  aynı bileşeni kullanır; `LearnScreen`'de gerçek `visit/dwell/listen` dispatch edilir ki
  kalem içi chip durumları da çalışsın (mod değişince `startMode` telemetriyi sıfırlar).
- **Mod kimliği:** `SimulationScreen`'de `sim-grid` sarmalayıcısına `mode-assessment` /
  `mode-practice` sınıfı eklenir. Değerlendirmede: header mod çipi mor aileye taşındı
  (`.eg-mode-chip.assessment`, `color-mix(in srgb, var(--purple-600) …)` — yeni sabit hex
  eklenmedi, mevcut token'lar karıştırıldı), soru kartının üst kenarında 3px mor şerit
  (`.sim-grid.mode-assessment .q-card-dark`), "Yanıtla" düğmesi mevcut `.btn.purple`
  sınıfına geçer (Uygulamada `.btn.primary`/mavi kalır). Öğrenme çipi yeşil (değişmedi).
- **Mod seçim kartları (`ModeSelectScreen.tsx`):** her kart artık tek kısa açıklama + 3
  fark maddesi; tekrarlayan ⓘ tooltip paragrafı ve `title` tooltip'i kaldırıldı (dokunmatikte
  çalışmıyordu). CTA'lar moda özgü: "Öğrenmeye başla" / "Vakaları çöz" / "Değerlendirmeye
  gir". Kulaklık şeridi başlığın altına, kartların üstüne ince tek satır (`.headphone-banner.thin`)
  olarak taşındı. Değerlendirme kartında küçük "Kurallar" satırı (`.mode-rules`):
  "İpucu yok · tek dinleme · SCORM'a puan yazılır". Stepper küçültüldü.
- **Öğrenme paneli (`LearnScreen.tsx`, `data/terminology.ts`):** sol kütüphanede artık kısa
  başlık gösterilir — `libraryShortTitle()` (ör. "Erken sistolik üfürüm", "İnce Raller");
  tam ad `libraryTitle()` ile buton `title` özniteliğinde kalır, ellipsis oluşmaz. Grup
  başlıkları zaten `position:sticky` idi; seçili kalem artık sol 3px mavi şeritle belirginleşir
  (`.lib-item.active`). Kalem değişince sağ paneldeki sekme (`tab`) SIFIRLANMAZ. S1/S2 kartları
  (`.exp-cards`) dar sütunda alt alta iki tek-satır özet kutusuna döndü (15px, ellipsis +
  `title` ile tam metin). "Klinik Bilgi" sekmesinin en üstünde "Vaka kapsamı" satırı ve altında
  "Bu sesle uygulama yap →" düğmesi — `startPracticeForFinding()` o bulguya ait ilk 3-5
  uygulama vakasıyla `startSession` + `startMode('practice')` çağırır.
- **Sonuçlar — soru bazlı ayrıntı ve eylemler:** genişletilen satırda artık yanlış
  yanıtlarda kısa `feedbackIncorrect` metni de gösterilir (`.rd-feedback`). Üstte, %60'ın
  altındaki alanlar için "Zayıf alanlar:" çipleri (`core/flow.ts#weakDomainKeys`). "Öğrenme
  modunda çalış": yanlış yanıtlanan **ilk** vakanın kütüphane anahtarını bulur
  (`firstWeakLibraryKey` + `libraryKeyForCase` — vakanın kendi `libraryKey`'i yoksa
  kategori+akustik bulgu eşleşmesiyle `library.json`'dan bulunur) ve `store.learnFocusKey`'e
  yazıp Öğrenme moduna geçer; `LearnScreen` mount olurken bu anahtarı ilk seçili kalem
  yapar ve alanı tüketip temizler (tek seferlik yönlendirme).
- **Yardım/Öğretici tekilleştirme:** adım listesi `ui/TutorialSteps.tsx`'e çıkarıldı;
  hem `TutorialScreen` hem Header'daki "Yardım" modalı (`ui/HelpModal.tsx`, içerik
  değişti) aynı bileşeni kullanır — `HelpModal` artık `TutorialSteps` + altında
  "İpuçları" bloğunu gösterir. `Screen` tipinden ve `App.tsx`'ten kullanılmayan `help`
  ekranı dalı kaldırıldı (zaten hiçbir yerden `goto('help')` çağrılmıyordu).
- **Küçük düzeltmeler:**
  - Değerlendirme zamanlayıcısı artık 390px'te de görünür (mod çipinin yanında küçük;
    `.eg-timer` için 1080px altı `display:none` kuralı kaldırıldı, ≤720px'te yalnız
    küçültülür).
  - `mappingNote` artık tıklamayla açılan bir popover (`SimulationScreen`'de
    `MappingNotePopover`, `.popover-wrap`/`.popover`) — dışarı tıklayınca/ESC ile kapanır,
    `aria-expanded` bildirir; dokunmatikte de çalışır. "Kayıt bilgisi" ve "Pediatrik
    referans" düğmeleri artık aynı `card-title-actions` satırında, aynı `.btn.outline.small`
    boyutunda.
  - **Toolbar tek satır (1366×768):** `.toolbar{flex-wrap:nowrap}` (≤1080px'te tekrar
    sarar), durum metni kısaltıldı (yalnız aktif nokta `label`'ı, ör. "Pulmoner" — uzun
    `fullLabel` kaldırıldı), ses kaydırıcısı 90px. Bell/Diyafram/Ön/Arka düğmeleri, ses
    yüzdesi ve araç çubuğu ikonları ölçülüp gerçek 1366px genişliğe göre daraltıldı
    (yalnız `.toolbar` kapsamında — diğer ekranlardaki `.btn.small`/ikonlar etkilenmez);
    en dolu senaryoda (Tekrar Dinle + İpucu + uzun bölge etiketi birlikte) durum metni
    neredeyse tamamen daralabilir, yeşil nokta göstergesi kalır.
  - **Sonuçlar/Kaynaklar genişliği düzeltmesi (kök neden):** `.results-wrap-v2` ve
    `.src-wrap` `max-width:1240px; margin:0 auto` içeren flex öğeleriydi ama `width`
    belirtilmiyordu — CSS flexbox'ta yatay `auto` kenar boşlukları `align-self:stretch`'i
    geçersiz kılıp öğeyi içerik-tabanlı (shrink-to-fit) boyutlandırıyordu (Sonuçlar'da
    gözlemlenen ~760-804px, `.results-sub-v2`'nin `max-width:760px`'i yüzünden). Düzeltme:
    `width:100%` eklendi — öğe önce kapsayıcıyı doldurur, sonra `max-width`'e sabitlenir.
    (`.container` ve `.start-hero` zaten `width:100%` içeriyordu, bu yüzden etkilenmemişti.)
  - Sahne görseli `stage-fit`/`body-wrap` kontrolü: mevcut `contain` mantığı (ResizeObserver
    ile `box.w/box.h` hesabı, `object-fit:cover` ama kapsayıcı aynı en-boy oranında) test
    edildi — 1366×768'de baş/boyun tam görünüyor, alt boşluk yok; ayrı bir CSS değişikliği
    gerekmedi (bkz. Doğrulama notu).

### Doğrulama (2. dalga)

Playwright ile 1366×768 ve 390×844'te modes/learn/practice/assessment/results/help akışları
görüntülendi (bölge chip durumları, tek satır toolbar, mor/mavi/yeşil mod kimliği, 1240px
Sonuçlar genişliği, zayıf alan çipleri, mobilde zamanlayıcı doğrulandı). `npm test` (105),
`npm run lint`, `npx tsc -b`, `npm run validate`, `npm run e2e:session`, `npm run e2e`
geçti; `scripts/e2e-session.mjs`/`scripts/e2e-screens.mjs` yeni CTA metinlerine göre güncellendi.

### §13 — UI/UX 3. dalga (tasarım tokenları)

Bu dalga bir tasarım sistemi geçişidir: dağınık piksel değerleri (20 farklı `font-size`, 90+
sabit hex, 12 farklı `border-radius`) merkezi tokenlara indirildi; ayrıca mobil (≤720px)
yeniden düzen ve interaktif bir öğretici eklendi.

**Tipografi ölçeği** — `--fs-xs:12 / --fs-sm:13 / --fs-md:14 / --fs-lg:16 / --fs-xl:20 /
--fs-2xl:26 / --fs-3xl:34` (px). `body{font-size:var(--fs-md)}`. Eski değerler en yakın
kademeye eşlendi (ör. 12.5/12.8→sm, 13.5/14.5→md, 15–17.5→lg, 18/19/22→xl, 23/24→2xl);
hero başlığı gibi tek özel durumlar `clamp(28px, 3.2vw, 44px)` ile serbest kaldı (bu,
`font-size:Npx` düzenli ifadesiyle eşleşmediği için ölçüm hedefini bozmaz). Sonuç:
`grep -oE "font-size:\s*[0-9.]+px" src/styles.css` → **0 satır**.

**Renk tokenları** — mevcut palet korunarak eksikler eklendi: `--purple-700`, `--red-600`,
`--amber-700/-900`. Aksi durumda ±%3 ton içindeki hex'ler mevcut tokenlara indirildi (ör.
`#9ccbff→--blue-300`, `#34d399→--green-500`, `#fecaca→--red-100`); tekil kullanımlı 90+
sabit hex 40'a indi ve **tamamı `:root` içinde tanımlı** — dışarıda hiçbir literal hex kalmadı
(`grep -oE "#[0-9a-fA-F]{3,6}\b" src/styles.css | sort -u | wc -l` → **40**). Ayrıca diagnostik
panel için ayrı bir koyu mini palet (`--slate-900/-800/-300`, `--sky-300`) — bu da mevcut
navy/ink/blue ailesinden reddedilmeyip yalnız dev panelde kullanılan tonlar için minimum
sayıda ek tanımla çözüldü. `rgba(...)` gölge/overlay değerlerinin en sık tekrarlananları
(`--overlay-94/-90/-88`) tokenlaştırıldı; kalanlar (tekil kullanımlı gölgeler) literal
kalabilir kuralı korunuyor. **Kontrast düzeltmesi:** `--ink-500` küçük metinde (footer, `.small`,
`.muted`, tablo başlıkları, vital etiketleri, adım/rozet metinleri) `--ink-600`'e çekildi
(beyazda ≈6.4:1, AA geçer); header'daki (lacivert zemin) açık metinler (`#b8cdec`,
`#dbe7f8` vb.) `--blue-100`'e taşındı. `ResultsScreen` skor halkası ve `DevPanel` artık
`stroke="currentColor"` + CSS sınıfı (`.rs-ring-sm.pass/.fail`, `.dev-accent/.dev-warn/
.dev-muted/.dev-err`) kullanıyor; TSX içinde sabit renk kalmadı (illüstrasyon SVG'leri —
`torso-pediatric.tsx`, `stethoscope.tsx`, `icons.tsx`'teki marka/logo çizimleri — kapsam dışı,
bilinçli olarak dokunulmadı).

**Köşe yarıçapı / boşluk** — `--r-sm:6 / --r-md:10 / --r-lg:14 / --r-pill:999` (px); eski
`--r-sm:8/--r-md:12/--r-lg:16` değerleri bu ölçeğe güncellendi, `--r-xl:22` (mode kartları vb.)
değişmedi. `border-radius:Npx` → **0 satır**. Boşluk ölçeği `--sp-1:4 … --sp-6:32`; kart/panel/
grid seviyesindeki düzensiz değerler (13/15/17/18/22/26) en yakın kademeye çekildi — piksel
hassas hotspot/stetoskop ölçüleri (`.hotspot`, `.steth`, ikon `width/height`) bilinçli olarak
dokunulmadı (bunlar "boşluk" değil, sahne hizası/ölçü gerektiren sabitler).

**Mobil (≤720px) yeniden düzen:**
- **Öğrenme:** `.lib-col` yatay kaydırılabilir bir chip şeridine döner (`display:flex;
  overflow-x:auto`); her grup küçük bir başlık chip'i + kalem chip'leriyle tek satırda akar,
  şerit header'ın altında yapışkan kalır (`position:sticky; top:var(--head-h)`); sahne ilk
  ekranda görünür. Sağ panel (açıklama/dalga/klinik) sahnenin altında sekmeli kalır.
- **Uygulama/Değerlendirme:** DOM sırası CSS `order` ile olgu → sahne (`min(55dvh,420px)`) →
  toolbar (yapışkan alt, `env(safe-area-inset-bottom)`) → soru kartına çevrildi (`.sim-main`/
  `.sim-side`'ı `display:contents` yapıp gerçek çocukları `.sim-grid`'in doğrudan ızgara
  ögeleri hâline getirip `order` veriliyor — bkz. aşağıdaki kök neden notu). Olgu kartı
  kısaltıldı (öykü metni `.case-history-full` ile gizlendi), vital imzaları (`kv-grid`) tek
  satır yatay kaydırılır oldu. Toolbar'a "Soruya git ↓" kısayolu eklendi (yalnız ≤720px,
  `caseDef` prop'u geçilen ekranlarda — LearnScreen'de görünmez). Değerlendirme uyarı şeridi
  mobilde tek satır kompakta indirildi (`.strict-banner-detail` gizlenir). Dokunma hedefleri
  (chip, toolbar düğmesi, seçenek) ≥44px. DEV rozeti ≤1080px'te tamamen gizli.
- **Kök neden düzeltmeleri (önemli):** (1) `.sim-main`/`.sim-side`'a uygulanan `display:contents`
  ve `order` seçicileri `.sim-grid` ile kapsanmalı — bu sınıf adları `LearnScreen`'de de
  kullanılıyor; kapsamasız hâli LearnScreen'in ızgarasını da bozup sahneyi 984px'e taşırıyordu.
  (2) `.screen-body.no-scroll{overflow:hidden}` — içerik taşmasa bile bir kaydırma kapsayıcısı
  tanımladığından, içindeki `position:sticky` ögelerinin (kütüphane şeridi, toolbar) referans
  aldığı kapsayıcıyı gerçek sayfa/gövde kaydırması yerine bu kutunun kendisi yapıyordu (ikisi
  birlikte kaydığından sticky hiç "yapışmıyordu") — ≤1080px'te `overflow:visible`'a çekildi.
  (3) SPA ekran geçişleri sayfayı yenilemediğinden önceki ekrandan kalan kaydırma konumu
  taşınıyordu; `App.tsx`'te `state.screen` değişince `window.scrollTo(0,0)` eklendi. (4) CSS
  Grid'de `display:grid` her çocuğa kendi (auto boyutlu) satırını verdiğinden, `.lib-col`
  o satırın içine "hapsolup" hiç yapışamıyordu — mobilde `.learn-grid{display:block}`'e
  çevrilip çocuklar arası boşluk `margin-top` ile korundu. (5) `.jump-to-q`/sticky toolbar
  gibi ≤1080'de genel `.toolbar` seçicisine bağlı kurallar `.sim-grid .toolbar`'a kapsandı
  (aksi hâlde Öğrenme/Öğretici'deki toolbar da yapışkanlaşıp altındaki metnin üstüne biniyordu).

**İnteraktif öğretici (madde 5):** `TutorialScreen.tsx` artık statik bir fotoğraf değil,
gerçek `PatientStage` (öğrenme modu, `heart.normal` sesleri, `showPoints` açık,
`bodyType='erkek'`) kullanır. 3 rehberli adım — (1) stetoskobu sürükle, (2) bir odağa bırak,
(3) Bell/Diyafram değiştir — saf bir adım-makinesiyle (`core/flow.ts#tutorialProgress`)
izlenir: `PatientStage`'e eklenen `onDragStart` prop'u adım 1'i, mevcut `onVisit` adım 2'yi,
`state.head`'in mount değerinden sapması adım 3'ü tamamlar. Sıra bağımsızdır (ör. klavye ile
doğrudan yerleştirme de adım 2'yi tamamlar). İlgili öge `.tut-highlight` (halka + nabız
animasyonu, `prefers-reduced-motion`'da statiğe düşer) ile vurgulanır: adım 1–2'de sahne
kartı, adım 3'te toolbar. Üç adım bitince "Harika, hazırsınız!" mesajı + "Modlara geç" CTA'sı
görünür; öncesinde "Atla" bağlantısı her an devam etmeye izin verir. "Tekrar gösterme" onay
kutusu korunur. Yardım modalındaki statik 6 adımlık `TutorialSteps` (aynı bileşen, `HelpModal`
ile paylaşılıyor) bu ekrandan bağımsız, değişmedi. Mobilde CSS `order` ile sahne üstte, adım
listesi altta. Saf fonksiyon `tutorialProgress` `tests/core.test.ts`'te ayrı test grubuyla
doğrulanır (olay sırası bağımsızlığı, tekrarlanan olayların etkisiz kalması, `allDone` dahil).

**Kalanlar:** toolbar'daki "Dinleniyor" durumu artık toolbar'da değil sahnenin sol üst
köşesinde küçük bir rozet (`.stage-badge.playing`, `PatientStage.tsx`); toolbar yalnızca
kontrolleri barındırır. Başlangıç ekranında ürün adı tekrarı (header + logo + eski eyebrow +
footer) azaltıldı — hero'daki eyebrow tamamen kaldırıldı (logo zaten adı içeriyor), başlık tek
satırlık bir değer önerisine indi, eski "•" ayraçlı metrik satırı `title` tooltip'i yerine
kalıcı açıklamalı "Neden güvenilir?" başlıklı 3 kutuya (`.why-grid`) dönüştü. `.steth:focus-visible`
artık 3px `--blue-500` halka + dış parıltı ile fotoğraf üzerinde de görünür. `.app-bg .bg-wash`
`position:fixed`'ten `position:absolute; min-height:100%`'e çevrildi — doküman ekranlarında
(sayfa uzunluğunda kaydırma) mobil tarayıcılarda altta oluşan beyaz bant giderildi. Mevcut
`prefers-reduced-motion` bloğu genel (`*, *::before, *::after`) olduğundan yeni eklenen
animasyonları (`tut-pulse` dahil) otomatik kapsar.

**Doğrulama (3. dalga):** `npm test` (110, 5 yeni `tutorialProgress` testi dahil), `npm run
lint`, `npx tsc -b`, `npm run validate`, `npm run e2e:session`, `npm run e2e` geçti (öğretici
akışı interaktif hâle geldiğinden e2e scriptlerindeki "Anladım" tıklaması "Atla"ya güncellendi).
Playwright ile 1366×768/768×1024/390×844'te start/tutorial (adım 2 tamamlanmış hâli dahil)/
modes/learn/practice/assessment/sources görüntülendi; `document.documentElement.scrollWidth
<= innerWidth` her üç genişlikte doğrulandı (denetim sırasında bulunan gerçek taşma: 768px'te
DEV rozetiyle taşan header — DEV rozeti ≤1080'de tamamen gizlenerek düzeltildi). Ölçüm
hedefleri: `font-size:Npx` 0, `border-radius:Npx` 0, sabit hex 40 (tamamı `:root`'ta).

## 12. Bilinen Sınırlar (V1)

- Posterior akciğer noktaları yalnız Fraiwan importu ile ses alır (HLS-CMDS'te posterior kayıt yok).
- Erb noktası için veri setinde ayrı kayıt yoktur; nokta eğitim amaçlı işaretlenir, ses yok.
- Dalga formu oynatıcıda 10 s geri/ileri atlama stub (transport butonları devre dışı).
- SCORM 1.2 paketinde etkileşim sayısı ve suspend boyutu 1.2 limitlerine tabidir.


---

## v2 Güncellemesi — Ölçek, Pediatri ve Maksimum Zorluk

### Gövde çeşitliliği
- `auscultation-points.json` artık görünüm × gövde tipi (`male`, `female`, `pediatric`) matrisi tutar; her nokta `x/y`, `xf/yf` (kadın), `xp/yp` (pediatrik) koordinatlarına sahiptir.
- Kadın gövdesi Wikimedia Commons CC0 fotoğraflarından türetilmiştir (`front-female.jpg`, `back-female.jpg`).
- Pediatrik gövde **şematik SVG**'dir (`src/ui/torso-pediatric.tsx`); çocuk hastalarda fotoğraf kullanılmaz. Öğrenme modunda Erkek/Kadın/Çocuk seçilebilir; vaka modlarında gövde otomatik seçilir (`population: 'pediatrik'`).
- Öğrenme modunda pediatrik gövde seçilince yaşa göre kalp hızı/solunum referans kartı (`pediatric-reference.json`) görünür.

### Vaka havuzu ve oturum örneklemesi
- `scripts/generate-cases.mjs` ses veri setinden vaka üretir: kalp 30, akciğer 31, kombine 111, pediatrik gerçek kayıt 4 → `cases-auto.json` (176 otomatik vaka).
- Toplam havuz 199 vaka; her oturumda `sampleSession` ile **rastgele 10 vaka** seçilir (katmanlı: önce farklı bulgulardan birer, sonra doldurma).
- Örneklem tohumu oturum başında üretilir ve suspend verisine yazılır (`si/sd`) — SCORM devam ettirmede aynı 10 vaka korunur.
- Mod kartlarında ve başlangıç ekranında bilgilendirme ipuçları (tooltip) vardır.

### Maksimum zorluk değerlendirmesi
- Değerlendirmede: işaret/hotspot yok, bölge etiketi yok, nokta listesi görsel olarak gizli (klavye için `sr-only-until-focus`), ipucu yok, "Tekrar Dinle" yok.
- **Tek dinleme kuralı**: her nokta oturumda bir kez dinlenebilir; tekrar denemede ses çalınmaz ve nötr bilgi gösterilir.
- Tüm ölçüm manuel muayeneyle yapılır; durum göstergesi nötrdür ("Manuel muayene", "Bölge teması").

### Pediatrik bakış
- Pediatrik veri setleri envantere etiket kalitesiyle eklendi (CirCor, SPRSound, DigiScope, Fetal PCG).
- Gerçek pediatrik hasta kayıtları (CirCor, ODC-BY 1.0) vaka havuzuna bağlandı; manikin karışımı olan vakalarda `mappingNote` bunu açıkça belirtir.
- Üç çekirdek pediatrik vaka: normal kardiyak oskültasyon (masum üfürüm bilgisiyle), wheezing (obstrüktif patern, yaşa uygun solunum sayısı), gerçek pediatrik erken sistolik üfürüm.
- §6 gereği: pediatrik vakalarda da hastalık/kapak tanısı iddia edilmez.

### Envanter
- `sources.json` envanteri 19 veri setine genişletildi; her kayıtta `labelTypes` (etiket türleri), `population`, `licenseVerified` alanları var.
- Doğrulama script'i pediatrik kapsamı ve harici kayıt bütünlüğünü zorunlu tutar (`validate-audio.mjs`).


---

## Dağıtım kapsamı (güncel)

- **HTML çıktı (birincil):** `npm run build:html` → `release/EGEMED-Ausculta-HTML/` klasörü ve zip'i.
  Herhangi bir web sunucusunda veya intranette yayınlanabilir; SCORM/LMS gerekmez, çevrimdışı çalışır.
- **SCORM 1.2:** `npm run build:scorm` → `dist/EGEMED-Ausculta-SCORM12.zip`.
- **SCORM 2004:** kullanımdan kaldırıldı (kullanıcı kararı). 2004 paketi üretilmez;
  2004 manifest dalı ve `build:scorm2004` script'i kaldırılmıştır. Çalışma zamanı yalnız 1.2 API'sini arar.


---

## Kaynakların sadeleştirilmesi

- Kaynaklar ekranı artık yalnızca **fiilen kullanılan** veri setlerini listeler:
  - HLS-CMDS v3 — pakete dahil 245 klinik manikin kaydı (CC BY 4.0)
  - CirCor DigiScope — pediatrik gerçek hasta kayıtları (ODC-BY 1.0, 4 örnek)
- Araştırma amaçlı tutulan diğer veri setleri (ICBHI 2017 dahil; pakete alınmaz §34) envanterden kaldırıldı; kullanılmayan importör script'i (`import-lung-dataset.mjs`) silindi.
- Doğrulama ve testler bu sadeleştirmeye göre güncellendi (envanter: 2 set, hepsi lisansı doğrulanmış).
