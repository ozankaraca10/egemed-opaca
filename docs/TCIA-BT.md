# TCIA LIDC-IDRI — Toraks BT kesit yığınları (Opaca)

Bu belge, EGEMED Opaca'ya eklenen **gerçek toraks BT kesit yığınlarının** kaynağını, lisansını,
üretim komutlarını, seçilen serileri ve bilinmesi gereken sınırlamaları anlatır. Üretim betiği
`scripts/tcia/prepare_ct.py`; nodül işaretleme ayrıştırıcısı `scripts/tcia/parse_annotations.py`;
seri listesi `fixtures/tcia-series.json`; çıktılar `public/assets/ct/<id>/<pencere>/NNN.webp` ve
`reports/tcia/<id>.json` + `reports/tcia/manifest.json`.

## 1. Kaynak ve lisans

- **Veri seti:** LIDC-IDRI (Lung Image Database Consortium and Image Database Resource Initiative),
  The Cancer Imaging Archive (TCIA) üzerinden dağıtılıyor.
- **Lisans:** **CC BY 3.0** — <https://creativecommons.org/licenses/by/3.0/>. Bu tur içinde TCIA
  koleksiyon sayfası (<https://www.cancerimagingarchive.net/collection/lidc-idri/>) yeniden
  indirilip HTML içinde `CC BY 3.0` → `https://creativecommons.org/licenses/by/3.0/` bağlantısı
  doğrulandı (bkz. aşağıdaki "Lisans doğrulama kanıtı").
- **Zorunlu atıf metni** (tam metin, `reports/tcia/*.json` ve `manifest.json` içindeki
  `license.attribution` alanına aynen kopyalandı):

  > Armato SG III, McLennan G, Bidaut L, McNitt-Gray MF, Meyer CR, Reeves AP, Zhao B, Aberle DR,
  > Henschke CI, Hoffman EA, Kazerooni EA, MacMahon H, van Beeke EJT, Yankelevitz D, Biancardi AM,
  > Bland PH, Brown MS, Engelmann RM, Laderach GE, Max D, Pais RC, Qing DPY, Roberts RY, Smith AR,
  > Starkey A, Batra P, Caligiuri P, Farooqi A, Gladish GW, Jude CM, Munden RF, Petkovska I, Quint LE,
  > Schwartz LH, Sundaram B, Dodd LE, Fenimore C, Gur D, Petrick N, Freymann J, Kirby J, Hughes B,
  > Casteele AV, Gupte S, Sallam M, Heath MD, Kuhn MH, Dharaiya E, Burns R, Fryd DS, Salganicoff M,
  > Anand V, Shreter U, Vastagh S, Croft BY. Data From LIDC-IDRI [Data set]. The Cancer Imaging
  > Archive (2015). <https://doi.org/10.7937/K9/TCIA.2015.LO9QL9SX> — Clark K, Vendt B, Smith K,
  > Freymann J, Kirby J, Koppel P, Moore S, Phillips S, Maffitt D, Pringle M, Tarbox L, Prior F. The
  > Cancer Imaging Archive (TCIA): Maintaining and Operating a Public Information Repository.
  > Journal of Digital Imaging, 26(6), 1045-1057 (2013). DOI: 10.1007/s10278-013-9622-7

## 2. Kaynak API'ler

- Seri listesi (anahtarsız): `GET https://services.cancerimagingarchive.net/nbia-api/services/v1/getSeries?Collection=LIDC-IDRI&Modality=CT&format=json`
- Seri indirme (DICOM ZIP, anahtarsız): `GET https://services.cancerimagingarchive.net/nbia-api/services/v1/getImage?SeriesInstanceUID=<UID>`
- Nodül işaretlemeleri (XML paketi, ayrı indirme, anahtarsız): `https://www.cancerimagingarchive.net/wp-content/uploads/LIDC-XML-only.zip`
  (~9 MB, 1319 XML; yalnız kök etiketi `{http://www.nih.gov}LidcReadMessage` olanlar BT
  okumasıdır — `{http://www.nih.gov/idri}IdriReadMessage` akciğer grafisi okumasıdır ve
  kullanılmaz). **Bu paket depoya girmez**, yalnızca yerel/geçici bir klasöre açılıp
  `--xml-dir` ile `prepare_ct.py`'ye verilir.

## 3. Kurulum ve üretim komutları

```bash
cd "/Users/ozankaraca/Documents/EGEMED SIM/egemed-opaca"
python3 -m venv scripts/tcia/.venv
scripts/tcia/.venv/bin/pip install -r scripts/tcia/requirements.txt

# (Yalnız nodül serisi için) LIDC-XML-only paketini indir ve aç:
curl -L -o /tmp/LIDC-XML-only.zip \
  https://www.cancerimagingarchive.net/wp-content/uploads/LIDC-XML-only.zip
unzip -q /tmp/LIDC-XML-only.zip -d /tmp/lidc-xml

# ct_intro_01: 88 kesitlik toraks aralığı (sliceRange), her 3. kesit -> 30 kare
scripts/tcia/.venv/bin/python scripts/tcia/prepare_ct.py \
  --only ct_intro_01 --every 3 --size 512 --quality 78

# nodule_mass_01: tüm seri, her 4. kesit + nodül kesitleri zorla eklenir -> 42 kare
scripts/tcia/.venv/bin/python scripts/tcia/prepare_ct.py \
  --only nodule_mass_01 --every 4 --size 512 --quality 78 --xml-dir /tmp/lidc-xml

# Yalnızca manifest'i yeniden üretmek icin:
scripts/tcia/.venv/bin/python scripts/tcia/prepare_ct.py --manifest-only
```

`prepare_ct.py` yeniden çalıştırılabilir: `reports/tcia/<id>.json` zaten varsa o seri atlanır
(`--force` ile yeniden üretilir). `--dry-run` yalnızca indirip kesit sayısını raporlar, kare
üretmez. Geçici DICOM/zip dosyaları her seri sonunda otomatik silinir (`--work-dir` ile geçici
klasör konumu değiştirilebilir; varsayılan sistem tmp'idir, depoya hiçbir ham DICOM girmez).

## 4. Pencereleme — ÖNEMLİ uyarı

Kareler, DICOM piksel değerlerinden (`HU = piksel × RescaleSlope + RescaleIntercept`) **önceden**
iki sabit pencereyle render edilmiş **statik WebP görüntülerdir**:

| Pencere | Center (C) | Width (W) | Kullanım |
|---|---|---|---|
| `lung` (akciğer) | −600 | 1500 | Parankim, nodül, amfizem/hiperinflasyon |
| `mediastinum` (mediasten) | 50 | 350 | Büyük damarlar, kalp, lenf nodu, plevral/perikardiyal sıvı |

**Uygulama tarafında gerçek zamanlı HU pencereleme YOKTUR.** FilmViewer yalnızca önceden
üretilmiş iki pencere setinden birini gösterip kesitler arasında gezinebilir; kullanıcı
kaydırıcıyla keyfi bir C/W değeri seçemez. Bu, statik SCORM/HTML paket bütçesi ve tarayıcıda
DICOM çözümleme bağımlılığı gerektirmeme kararının bilinçli bir sonucudur. İleride gerçek
pencereleme isteniyorsa ham HU verisinin (örn. 16-bit PNG ya da Float32Array) ayrıca üretilip
istemciye taşınması gerekir — bu turda **yapılmadı**.

## 5. Kesit seyreltme

Ham LIDC-IDRI serileri ~100–200 aksiyel kesit içerir. Öğretim amacıyla ve paket boyutunu
sınırlamak için kesitler seyreltilir:
- `ct_intro_01`: toraksla ilgisiz üst-abdomen kuyruğunu dışlamak için önce `sliceRange:[12,100]`
  ile kırpıldı (133 → 88 kesit), sonra **her 3. kesit** alındı → 30 kare.
- `nodule_mass_01`: kırpma yapılmadı (133 kesit), **her 4. kesit** alındı (33 kare) **+ nodülü
  kapsayan 8 ek kesit zorla eklendi** (nodül civarında seyreltme sıklaştırıldı) → toplam 42 kare.

Bu, gerçek bir BT tarayıcısındaki kesit yoğunluğunun **öğretim amaçlı bir alt örneklemesidir**;
klinik pratikte radyolog tüm kesitleri (1–2.5 mm aralıklarla) inceler. Simülatörde "kesit
kaydırma" hareketi bu nedenle gerçek bir taramadan daha "sıçramalı" hissettirebilir —
FilmViewer'da bu net biçimde belirtilmeli (bkz. §8).

## 6. Nodül işaretlemeleri (LIDC XML) — kaynak, uzlaşı, koordinat sistemi

`scripts/tcia/parse_annotations.py`, LIDC-XML-only paketindeki `LidcReadMessage` dosyalarını
ayrıştırır:

- Her seri için **1–4 bağımsız radyolog okuması** (`readingSession`) bulunur; her okuma
  `unblindedReadNodule` (≥3 mm nodül; 9 alanlı 1–5 ölçekli `characteristics` + kesit başına bir
  `roi`/kontur) ve `nonNodule` (<3 mm, tek nokta) içerir. **Bu turda yalnız `unblindedReadNodule`
  kullanıldı; `nonNodule` (<3 mm) ve akciğer grafisi okumaları (`IdriReadMessage`) yok sayıldı.**
- **Uzlaşı (consensus):** aynı nodülün farklı okuyucular tarafından işaretlenmiş kopyaları,
  ROI'lerin piksel-merkezi (mm'ye `PixelSpacing` ile çevrilmiş) ve `imageZposition`'dan oluşan
  **3B merkez arası mesafe < 5 mm** eşiğiyle union-find kümelenir (`parse_annotations.cluster_nodules`).
  `readerCount` = kümeyi oluşturan bağımsız okuma sayısı. **≥3 okuyucu → değerlendirmeye uygun
  konsensus; 1–2 okuyucu → yalnız öğrenme amaçlı (düşük güven).** `nodule_mass_01`'deki tek nodül
  **4/4 okuyucu** tarafından işaretlendi (tam konsensus).
- **Kesit eşleştirme:** her ROI'nin `imageSOP_UID`'si, indirilen DICOM kesitlerinin
  `SOPInstanceUID`'siyle eşleştirilir. En güçlü kümenin (en yüksek `readerCount`, eşitlikte en çok
  ROI'li okuma) **kapsadığı tüm kesitler**, normal "her N. kesit" seyreltmesine bakılmaksızın kare
  setine **zorla eklenir** — böylece nodül asla atlanmaz ve seyreltme nodül çevresinde sıklaşır.
- **Koordinat sistemi:** `edgeMap` noktaları orijinal DICOM piksel ızgarasında (bu seri için
  512×512) verilir. `parse_annotations.py`, `x/Columns` ve `y/Rows` ile **0–1 aralığına normalize
  eder** — çıktı kare boyutundan (768, 512, …) bağımsızdır, FilmViewer hangi boyutta render ederse
  etsin `polygon`/`centroid`/`bbox` doğrudan çarpılarak kullanılabilir. Ayrıca hesaplanmış
  **centroid** (poligon nokta ortalaması) ve **bbox** (`x,y,w,h`, min/max) verilir.
- **`characteristics` ölçekleri (ham 1–5, `reports/tcia/nodule_mass_01.json` →
  `characteristicsScale` alanında da tekrarlanır):**

  | Alan | Anlamı |
  |---|---|
  | subtlety | 1=çok belirsiz … 5=belirgin (kolayca fark edilir) |
  | internalStructure | 1=yumuşak doku … 5=süt/kalsifik yoğunluk |
  | calcification | 1=patlamış mısır … 6=kalsifikasyon yok |
  | sphericity | 1=lineer/düzensiz … 5=yuvarlak |
  | margin | 1=zayıf tanımlı … 5=keskin sınırlı |
  | lobulation | 1=yok … 5=belirgin |
  | spiculation | 1=yok … 5=belirgin |
  | texture | 1=tam ground-glass … 5=tam solid |
  | malignancy | 1=çok düşük olasılık … 5=çok yüksek olasılık |

  **`malignancy` dahil hiçbir characteristic değeri öğrenciye "kanser tanısı/olasılığı" olarak
  SUNULMAMALIDIR.** Bunlar 4 radyoloğun görsel/öznel izlenimidir; **patolojik (biyopsi/cerrahi)
  doğrulama LIDC-IDRI'de YOKTUR.** `manifest.json`'daki her `annotations[]` kaydında
  `"source": "expert_bbox"` ve `readerCount`/`readerIds` alanları bu sınırı açıkça taşır; UI bu
  değerleri "radyolog izlenimi (doğrulanmamış)" ibaresiyle göstermelidir.

## 7. Seçilen seriler ve gerekçe

### `ct_intro_01` — Normal/anatomi
- **Kaynak:** LIDC-IDRI-0225, seri `1.3.6.1.4.1.14519.5.2.1.6279.6001.161073793312426102774780216551` (133 kesit).
- **Neden seçildi:** Trakea/karina, aortik ark, büyük damarlar, dört kalp boşluğu ve hilus
  düzeyleri net ve simetrik biçimde ayırt ediliyor; apeksten diyaframa dengeli geçiş var; belirgin
  odak lezyon, efüzyon ya da pnömotoraks **gözlenmedi**. `lung` ve `mediastinum` pencerelerindeki
  30'ar kare tek tek `Read` ile görsel olarak incelendi (bkz. §9 metodoloji).
- **Not:** Hiçbir bulgu iddia edilmiyor; `docs/klinik-degerlendirme-listesi.csv`'ye "hekim onayı
  bekliyor" kaydı olarak eklenmesi öneriliyor (bkz. ana rapor).

### `nodule_mass_01` — Nodül
- **Kaynak:** LIDC-IDRI-0191, seri `1.3.6.1.4.1.14519.5.2.1.6279.6001.194766721609772924944646251928` (133 kesit).
- **Neden seçildi:** XML tarafında **≥3 okuyucu konsensuslu, tek kümeli (nClusters=1)** nodül
  serileri önce taranıp kısa listeye alındı (bkz. §9); bu seri readerCount=4/4, ortalama
  subtlety=5.0 (en belirgin), ortalama malignancy=4.75 ile listenin en güçlü adayıydı. Sonrasında
  DICOM indirilip kesit ~43–45 (orijinal instance 44–46) düzeyinde sağ alt lob perihiler
  yerleşimli, spiküle konturlu, ~1.5–2 cm boyutunda bir nodül **gözle doğrulandı** (bkz. §9,
  ekran görüntüsü incelemesi).
- Nodül, 42 karelik setin **10–20. indekslerinde** (11 kesit) görünür durumda; bu kesitler XML
  eşleştirmesiyle zorla kare setine eklendi (bkz. §6).

### Bulunamayan konular — `emphysema` / `airspace_opacity` / plevral efüzyon / pnömotoraks
**Bu turda net, kendinden emin bir örnek bulunamadı.** Ayrıntı ve yöntem için ana ajan raporuna
(→ "Şüpheli noktalar / bulunamayan konular") bakınız; özetle: 80–200 kesitli 503 uygun seriden
~48'i (iki bağımsız katmanlı örneklem + PE-protokolü ile çekilmiş 2 hedefli aday) akciğer
penceresinde gözle tarandı; hiçbirinde kendinden emin biçimde sınıflandırılabilecek amfizem
(büllöz yıkım), konsolidasyon, plevral efüzyon ya da pnömotoraks görülmedi. LIDC-IDRI esasen bir
**akciğer kanseri tarama kohortu** olduğundan bu akut/kronik parankim-plevra bulguları düşük
prevalanstadır. Bir aday (LIDC-IDRI-0760, PE-protokolü dışı, genel örneklemden) diffüz
retiküler/bal peteği benzeri bir patern gösterdi ancak bu, istenen iki kategoriden (amfizem/
konsolidasyon) hiçbirine güvenle oturmadığından ve LIDC'de bu paterni doğrulayacak bir uzman
etiketi bulunmadığından **kullanılmadı** — brifteki "emin olmadığın bulguya tanı adı verme"
kuralı gereği dışlandı.

## 8. v3 tarafında bağlama (FilmViewer)

Bu betik `src/`e dokunmaz. v3 agent'ının `FilmViewer`/`ImageRecord.stack` desteğine bağlarken:
- `reports/tcia/manifest.json`'daki kayıtlar `ImageRecord.stack` alanına **birebir** uyacak
  şekilde üretildi (`stack: [{window, label, frames[]}]`, `annotations: [{finding, frameIndex,
  window, polygon, centroid, bbox, readerCount, readerIds, characteristics, source}]`).
- FilmViewer, `stack[i].frames[frameIndex]` dizisini bir "sine-loop" gibi oynatmalı/kaydırmalı;
  pencere seçici (lung/mediastinum) iki `stack` girdisi arasında geçiş yapmalı.
- `annotations[].polygon`/`centroid`/`bbox` **0–1 normalize** — render edilen `<img>`/`<canvas>`
  boyutuyla çarpılarak SVG/canvas üzerine çizilmeli. Lokalizasyon sorusu ("nodülü işaretleyin")
  için `bbox` ya da `centroid` + toleranslı bir yarıçap kullanılabilir.
- `annotations[].characteristics` ve `readerCount` UI'da **"radyolog izlenimi, patoloji
  doğrulaması yok"** notuyla gösterilmeli; `malignancy` alanı öğrenciye doğrudan "tanı" olarak
  sunulmamalı.
- `license` alanı (attribution + sourceUrl + patientId + seriesUID) görüntü altyazısında ya da bir
  "kaynak" ikonunda gösterilmeli (CC BY 3.0 atıf zorunluluğu).

## 9. Seçim metodolojisi (özet)

1. `getSeries` ile 1018 LIDC-IDRI CT serisi listelendi; 80–200 kesitli 503 seri filtrelendi.
2. Nodül adayları için LIDC-XML-only paketindeki 1036 `LidcReadMessage` dosyası ayrıştırılıp
   80–200 kesitli serilerle eşleştirildi; ≥3 okuyucu konsensuslu, tek kümeli, yüksek subtlety'li
   461 aday arasından en güçlüsü (LIDC-IDRI-0191) DICOM indirilip gözle doğrulandı.
3. Normal anatomi + diğer patolojiler için iki bağımsız stratifiye örneklem (toplam 46 seri,
   hasta ID'sine göre eşit aralıklı) + 2 hedefli "PE protokolü" adayı indirildi; her serinin
   akciğer penceresi karelerinden oluşan kontakt sayfası (30 kare/ızgara) üretilip `Read` aracıyla
   tek tek incelendi; şüpheli kareler tam çözünürlükte ayrıca açıldı.
4. Seçilen 2 seri için nihai kareler üretildi, nodül serisi için XML tabanlı kesit zorlama
   uygulandı, toplam boyut (4.0 MB) bütçe (≤10 MB) içinde doğrulandı.
