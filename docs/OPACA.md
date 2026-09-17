# EGEMED Opaca — Mimari ve eğitim ilkeleri

## 1. Kapsam
- Hedef kitle: mezuniyet öncesi tıp öğrencileri. Yalnız yetişkin, frontal (PA/AP) akciğer grafisi.
- Pediatrik filmler içe aktarılır ama vaka havuzuna alınmaz (`population: pediatrik`).
- Klinik tanı sorusu yoktur: mevcut açık setlerde doğrulanmış tanı eşlemesi bulunmaz.

## 2. Ausculta'dan taşınanlar
SCORM çalışma zamanı ve düzeltmeleri (O1 tamamlanmış durumu ezmeme, O2 etkileşim tipi/ayırıcı/dizin, O3 çıkış
değeri, D12 sonlandırma sonrası yazmama), kademeli küçülen suspend verisi (K3 aktif mod listesi, K4 yeni oturum
sıfırlama), tohumlu 10 vakalık katmanlı örnekleme ve seçenek karıştırma (K1), alan bazlı bağımsız puanlama
(K2 ulaşılamaz ağırlık yok), uygulamada ipucu cezası (O9), paketleme ve CSP enjeksiyonu, tasarım dili.

| Ausculta | Opaca |
|---|---|
| Ses kaydı (`sounds.json`) | Görüntü kaydı (`images.json`) |
| Oskültasyon noktası | ABCDE okuma bölgesi (`reading-zones.json`, şematik) |
| Dinleme süresi | Bölgede inceleme süresi (imleç ya da klavye odağı) |
| Bell/diyafram | Pencere ön ayarı, parlaklık/kontrast, negatif |
| Tek dinleme kuralı | Vaka başına süre sınırı (180 sn) |
| Akustik bulgu ≠ tanı | Radyografik bulgu ≠ tanı; etiket kaynağı ayrımı |

## 3. Etiket kaynağı kuralları
| Kaynak | Örnek | Uygulama | Değerlendirme | Lokalizasyon |
|---|---|---|---|---|
| `expert_bbox` | NIH BBox, RSNA kutuları | ✓ | ✓ | ✓ |
| `expert_panel` | Google panel kararı | ✓ | ✓ | — |
| `expert_reading` | RSNA "Normal" | ✓ | ✓ | — |
| `report_nlp` | NIH 14 etiket | yalnız film kalitesi ve bilgi sorusu | ✗ | ✗ |

Birleştirme önceliği: uzman kaynak NLP'yi ezer, NLP uzmanı ezemez; uzman negatifi NLP pozitifini siler.

## 4. Soru üretimi (`scripts/generate-cases.mjs`)
1. **Bulgu tanıma** — yalnız uzman kaynaklı ana bulguda. Çeldiriciler "güvenli" olmalı: uzmanın yok dediği
   bulgu; radyoloğun normal dediği filmde herhangi bir bulgu; uzman pozitifi olan filmde "normal"; NIH raporunda
   geçmeyen bulgu. Güvenli çeldirici sayısı azsa seçenek sayısı azalır (en az 2).
2. **Lokalizasyon** — ana bulgu için uzman kutusu varsa. İşaret, kutu kenarından %2 toleransla isabet sayılır;
   birden çok kutudan herhangi biri yeterlidir. SCORM'a `fill-in` olarak `x43y55` biçiminde yazılır.
3. **Film kalitesi** — projeksiyon (DICOM `ViewPosition`). İnspirasyon/rotasyon yalnız radyolog gözden
   geçirmesi `images.json` → `quality` alanına işlendiyse.
4. **Klinik yorum** — `library.json` şablonu (bilgi sorusu; filmdeki etiketin doğruluğuna dayanmaz).

## 5. Puanlama
Varsayılan ağırlıklar: okuma kapsamı 10, ABCDE sırası 5, film kalitesi 10, lokalizasyon 25, bulgu tanıma 25,
yorum 15, tanı 10. Vakada sorusu olmayan alanların ağırlığı üretici tarafından sıfırlanır ve fark bulgu
tanımaya eklenir; toplam her zaman 100'dür. Okuma kapsamı, gerekli bölgelerde en az `minDwellMs` inceleme
süresidir. ABCDE sırası tüm bölgeler incelendiyse verilir; adım sırası bozuksa yarı puan.

## 6. Görüntüleyici
- Dönüşüm React dışında (ref) uygulanır; katmanlar görüntüyle aynı dönüşümü paylaşan normalize SVG'dedir.
- Klavye: Tab ile odak, oklar kaydırır, + / − yakınlaştırır, 0 sıfırlar, İşaretle aracında Enter görünüm
  merkezine işaret koyar. Bölge çipleri filmi o bölgeye yakınlaştırır ve incelemeyi başlatır.
- Ölçüm aracı piksel aralığı bilinmediğinden mm vermez; iki ölçümün oranını verir (kardiyotorasik oran).
- Değerlendirmede bölge katmanı, uzman kutusu, bölge etiketi ve ipucu kapalıdır.

## 7. Bilinen sınırlılıklar
- Okuma bölgeleri standart PA filme göre yaklaşıktır; hasta anatomisine göre segmentasyon yoktur.
- İnceleme süresi imleç konumuyla ölçülür; göz izleme değildir.
- Veri setlerinde klinik öykü yoktur; otomatik vakalar öykü uydurmaz.
