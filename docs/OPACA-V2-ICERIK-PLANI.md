# EGEMED Opaca v2 — Hekim geri bildirimi, UÇEP hizalaması ve açık veri planı

Tarih: 21 Eylül 2026. Kaynak: Kardiyoloji/Radyoloji öğretim üyeleri geri bildirimi (16 başlık) + açık veri araştırması.
Bu belge tasarım kararıdır; uygulama `scripts/import-*.mjs`, `src/data/library.json`, `src/data/findings.json`,
`src/data/sources.json` ve ilgili ekranlarda yapılır. Tıbbi metinler hekim onayına tabidir
(`docs/klinik-degerlendirme-listesi.csv`).

## 1. Hekim geri bildirimi → modül eşlemesi

| # | İstek | Karşılık (öğrenme konusu / vaka havuzu / arayüz) | Görüntü kaynağı |
|---|---|---|---|
| 1 | Normal grafi özellikleri ve çeşitleri (yan, ayakta, tele), çekim özellikleri | **Yeni grup "Teknik ve normal anatomi"**: PA (tele, 180 cm, ayakta), AP (yatak başı/portabl), **lateral**, ekspiryum grafisi, supin; her tür için "nasıl tanınır / kalp boyutu neden değişir" | NIH (`ViewPosition` PA/AP), Google panel normalleri; Commons CC0 normal PA + lateral |
| 2 | Film bilgisinin özellikleri | **Film bilgisi paneli** (yeni arayüz): hasta kimliği/tarih, taraf işareti (R/L), projeksiyon, pozisyon, ekspozisyon, inspirasyon derinliği (kot sayımı), rotasyon (klavikula–spinöz), penetrasyon (vertebra görünürlüğü). Sistematik okumaya "0. adım" olarak eklenir; film kalitesi sorusu bu alanlardan üretilir | NIH DICOM meta (ViewPosition, PatientAge/Sex); inspirasyon/rotasyon değerleri radyolog gözden geçirmesi gerektirir → `quality` alanı |
| 3 | Lateral grafi | Konu: lateral anatomi (retrosternal/retrokardiyak alan, vertebra yoğunluk gradyanı, diyafram profilleri, sinüsler); vaka havuzunda "projeksiyon tanıma" sorusu | Commons CC0 lateral normal; hiatal herni lateral (CC BY-SA); Kermany'de lateral yok |
| 4 | Pnömoni | Mevcut "havalı alan opasitesi" konusu genişletilir: lober/bronkopnömoni, hava bronkogramı, siluet işareti; pediatrik alt bölüm | NIH bbox Pneumonia (120, uzman kutulu → değerlendirme uygun); Kermany pediatrik (CC BY 4.0); RSNA (kullanıcıda varsa `import:rsna`) |
| 5 | Tüberküloz (2×) | Yeni konu: primer/postprimer TB — üst lob infiltrat, kavite, fibrotik sekel, kalsifik granülom, miliyer örüntü | **Montgomery** (radyolog okuması metni ile), **Shenzhen** (TB/normal etiketi) |
| 6 | KOAH | Yeni konu: hiperinflasyon (>10 arka kot), düz diyafram, retrosternal hava artışı (lateral), damla kalp, büller | NIH Emphysema (NLP → yalnız öğrenme/uygulama), Commons |
| 7 | Yabancı cisim | Yeni konu: aspirasyon (pediatrik, radyolusen cisim → hava hapsi, ekspiryum grafisi) vs yutulan radyoopak cisim (coin: koronal/sagital yönelim → özofagus/trakea) | Commons (CoinAP/CoinL CC BY-SA 3.0, aspiration CC BY 3.0) |
| 8 | Skolyoz | Yeni konu: Cobb açısı kavramı, rotasyon, kardiyak gölge yalancı büyümesi, film okuma tuzakları | Commons (lisans filtreli arama "scoliosis x-ray") |
| 9 | Kot kırıkları | Mevcut "kemik kırığı" konusu → alt bölüm: kot kırığı, flail chest, eşlik eden pnömotoraks/hemotoraks | Commons (PD/CC0) |
| 10 | Klavikula kırıkları | Alt bölüm: orta 1/3 kırık, deplasman, çocukta yeşil ağaç | Commons (CC BY 3.0) |
| 11 | Diyafram anomalileri ve herni | Yeni konu: eventrasyon, paralizi (yükselmiş hemidiyafram), hiatal herni (retrokardiyak hava-sıvı seviyesi), Bochdalek/Morgagni, travmatik rüptür | NIH Hernia (NLP), Commons (hiatal PA/lateral, Bochdalek PD, Morgagni CC BY 2.5) |
| 12 | Krup | Pediatrik konu: **boyun AP grafisi** steeple (kalem ucu) işareti; epiglottit ayrımı (lateral boyun) | Commons (steeple sign CC BY-SA 3.0) |
| 13 | Toraks BT | Yeni grup "BT'ye giriş": aksiyel kesit anatomisi, akciğer/mediasten penceresi, tipik bulguların BT karşılığı (nodül, efüzyon, pnömotoraks, emboli). Statik anahtar görüntüler; tam BT yığını görüntüleyicisi kapsam dışı (v3) | Commons (CC BY/BY-SA aksiyel kesitler); isteğe bağlı LIDC-IDRI (TCIA, CC BY 3.0) |
| 14 | Pulmoner emboli | Yeni konu: grafide çoğunlukla normal; Westermark, Hampton hump, Fleischner işaretleri; kesin tanı BTPA (dolum defekti) | Commons (BTPA CC BY 2.0 / CC BY-SA 4.0) |
| 15 | UÇEP solunum hastalıkları hizalaması | Her konuya `ucep` alanı: UÇEP-2020 çekirdek hastalık adı ve önerilen öğrenme düzeyi (Ö/T/TT/A/İ). Değerler **hekim onayı bekleyen öneri** olarak işaretlenir (`ucepStatus: "öneri"`) | — |
| 16 | Pediatrik solunum (UÇEP) | Pediatrik alt bölümler: pnömoni, yabancı cisim, krup; pediatrik filmler artık havuza `population: pediatrik` ile ayrı katman olarak girer (değerlendirmede yalnız uzman etiketli) | Kermany (CC BY 4.0), Commons |

## 2. Açık veri envanteri ve edinim yolu (doğrulandı, 21 Eylül 2026)

| Set | Erişim | Lisans | Kullanım | Edinim betiği |
|---|---|---|---|---|
| NIH ChestX-ray14 (112k, BBox 984, ViewPosition) | Hugging Face aynası `alkzar90/NIH-Chest-X-ray-dataset` — `data/images/images_0XX.zip` (ZIP; **HTTP Range** destekli) + `BBox_List_2017.csv` + `Data_Entry_2017_v2020.csv` | Kısıtlama yok; atıf (NIH CC) | Uzman kutulu 8 bulgu (değerlendirme), panel normalleri, NLP etiketleri (öğrenme/uygulama), projeksiyon | `scripts/import-nih-remote.mjs`: merkezî dizini okuyup yalnız seçilen PNG'leri Range ile çeker (uzak-zip) |
| Google/NIH panel etiketleri (1.9k) | torchxrayvision `google2019_nih-chest-xray-labels.csv.gz` (GitHub raw) | CC BY 4.0 (makale eki) | Normal/bulgu uzman kararı | aynı betik |
| NLM Montgomery (138) | archive.org `academictorrents_ac786f…/NLM-MontgomeryCXRSet.zip` (617 MB; Range destekli) | NLM: araştırma/eğitim, atıf (Jaeger 2014) | TB, normal, radyolog okuma metni | `scripts/import-nlm-tb.mjs` |
| NLM Shenzhen (662) | archive.org `academictorrents_462728e…/ChinaSet_AllFiles.zip` (3.77 GB; Range ile seçmeli) | aynı | TB/normal | aynı |
| Kermany pediatrik (5.8k) | archive.org `pneumonia_chest_xray` (train.zip 1.1 GB; Range ile seçmeli) | CC BY 4.0 (Mendeley) | Pediatrik pnömoni/normal | `scripts/import-pediatric.mjs` |
| Wikimedia Commons | API `action=query&generator=search` + `imageinfo.extmetadata` (lisans/yazar) | Dosya bazında: yalnız CC0/PD/CC BY/CC BY-SA; NC/ND **alınmaz** | Nadir/özel konular (krup, yabancı cisim, skolyoz, klavikula, kot, herni, PE, BT, lateral) | `scripts/import-commons.mjs` (küratörlü liste `fixtures/commons-list.json`) |
| Kullanıcıda varsa: RSNA pnömoni (Kaggle), PadChest, VinDr-CXR, CheXpert | Kayıt/DUA | Değişken | Skolyoz/kot/klavikula/lateral için geniş havuz | mevcut `import:rsna`; diğerleri v3 |

Görüntü işleme: uzun kenar 1024 px, WebP q80, `public/assets/xray/runtime/`; toplam paket hedefi ≤ 60 MB
(NIH ~200, TB ~120, pediatrik ~60, Commons ~40 → ~420 film).

## 3. Veri modeli değişiklikleri
- `images.json` kayıt: `projection` (PA|AP|LAT|NECK_AP|CT_AXIAL), `population` (yetişkin|pediatrik), `bodyPart`
  (toraks|boyun), `modality` (XR|CT), `labelSource`, `findings[]`, `bbox[]`, `quality{inspiration,rotation,
  penetration}` (radyolog gözden geçirmesiyle), `license{name,url,author,attribution}`, `datasetId`.
- `findings.json`: yeni bulgular `tuberculosis_cavity`, `tuberculosis_fibrosis`, `miliary`, `hyperinflation`,
  `foreign_body_radiopaque`, `air_trapping`, `scoliosis`, `rib_fracture`, `clavicle_fracture`, `hiatal_hernia`,
  `elevated_hemidiaphragm`, `steeple_sign`, `westermark`, `hampton_hump`, `ct_filling_defect`.
- `library.json`: gruplar → `technique` (genişletildi), `pleura`, `parenchyma` (+pnömoni alt türleri, TB, KOAH),
  `cardiac`, `diaphragm` (yeni), `bone` (+kot, klavikula, skolyoz), `pediatric` (yeni: krup, yabancı cisim,
  pediatrik pnömoni), `vascular` (yeni: PE), `ct` (yeni). Her konuda `ucep`, `ucepStatus`, `images[]` (örnek
  filmler), `pitfalls[]`.
- Film bilgisi: `reading-zones.json` adımlarına `"0": "Film bilgisi ve kalite"` eklenir; `FilmViewer` üstünde
  **Film bilgisi paneli** (kimlik/tarih sentetik yer tutucu, taraf işareti overlay'i, projeksiyon, kalite
  ölçütleri) — değerlendirmede kalite soruları bu panelden.

## 4. Soru/vaka üretimi
- Değerlendirme: yalnız uzman etiketli (NIH bbox, panel, Montgomery/Shenzhen radyolog okuması). Commons görüntüleri
  yalnız öğrenme ve uygulama (tek görüntü, tanı bilgisi yazar açıklamasına dayanır).
- Yeni soru tipleri: projeksiyon/pozisyon tanıma (PA/AP/lateral/ekspiryum), film kalitesi (inspirasyon/rotasyon/
  penetrasyon — `quality` alanı doluysa), bulgu tanıma (mevcut), lokalizasyon (bbox), "bir sonraki tetkik" (PE →
  BTPA; yabancı cisim → ekspiryum/lateral) bilgi sorusu (kütüphane şablonu).
- Pediatrik ve yetişkin havuzlar ayrı katmanlarda örneklenir (10 vakada en fazla 2 pediatrik).

## 5. Sınırlar ve hekim onayı gerektirenler
- UÇEP düzeyleri öneri; Commons görüntülerinin tanı doğruluğu yükleyen açıklamasına dayanır → hekim gözden geçirme
  listesine eklenir. BT için tam yığın görüntüleyici v3'e bırakıldı. NLP etiketli NIH filmleri değerlendirmede
  kullanılmaz (mevcut kural korunur).
