# EGEMED Opaca™ — Radyolojik Görüntüleme Simülatörü

Mezuniyet öncesi tıp eğitimi için tarayıcı tabanlı **akciğer grafisi okuma** simülatörü. EGEMED serisinin
(Pulse · Ausculta · Praxis · Opaca · Vitro) radyoloji modülüdür; mimarisi EGEMED Ausculta'dan çatallanmıştır.
Statik site olarak ya da SCORM 1.2 paketi olarak çalışır.

## Modlar
| Mod | İçerik |
|---|---|
| Öğrenme | 12 konu (sistematik okuma, PA/AP, normal, pnömotoraks, efüzyon, opasite, nodül, atelektazi, ödem, amfizem, kardiyomegali, kırık); örnek filmler, ABCDE okuma bölgeleri, uzman işaretlemesi |
| Uygulama | Oturum başına rastgele 10 vaka; film üzerinde işaretleme, ipucu (−5), her yanıttan sonra geri bildirim ve uzman kutusu |
| Değerlendirme | Yalnız radyolog etiketli yetişkin filmleri; bölge katmanı, uzman kutusu ve ipucu kapalı; vaka başına 180 sn; puan SCORM'a yazılır |

## Hızlı başlangıç
```bash
npm install
npm run import:sample   # 2 NIH örnek filmi (yalnız öğrenme/uygulama) + vaka üretimi
npm run dev             # http://localhost:5173  (?dev=1 teşhis paneli, ?fresh=1 devam kaydını yok sayar)
npm test                # vitest
```

## Gerçek veriyle havuz oluşturma
Görüntüler depoya girmez (`public/assets/xray/runtime/` git dışı); içe aktarıcılar 1024 px gri WebP üretir ve
`src/data/images.json` envanterini günceller.

```bash
# NIH ChestX-ray14 (+ isteğe bağlı Google panel etiketleri)
npm run import:nih -- /veri/nih --google /veri/google/test_labels.csv --google /veri/google/validation_labels.csv --cap 40 --replace
# RSNA Pneumonia Detection Challenge (DICOM ya da PNG)
npm run import:rsna -- /veri/rsna --cap 40 --replace
npm run cases           # src/data/cases-auto.json + docs/klinik-degerlendirme-listesi.csv
npm run validate        # ölümcül hata → çıkış kodu 1
```

`--cap`, bulgu başına alınacak en fazla film sayısıdır (paket boyutu). Film başına ~40–70 KB hesaplanabilir.

## Paketleme
```bash
npm run build:scorm     # release/EGEMED-Opaca-SCORM12.zip (validate + tsc + vite build)
npm run build:html      # release/EGEMED-Opaca-HTML.zip (LMS'siz)
npm run e2e             # dev sunucusu açıkken ekran görüntüsü duman testi (CHROMIUM_PATH)
```

## Bilimsel ilke: bulgu ≠ tanı, etiket kaynağı ayrı tutulur
Her bulgu etiketi kaynağıyla saklanır (`LabelSource`): radyolog paneli, radyolog kutusu, radyolog okuması,
BT doğrulaması ya da **rapor metninden otomatik çıkarım (NLP)**. NLP etiketleri yalnız meta veri ve uygulama
içindir; değerlendirme havuzuna giremez, lokalizasyon puanlamasında kullanılmaz. NIH'nin "No Finding"
etiketi "normal" sayılmaz; normal filmler radyolog okumasından (RSNA "Normal") gelir. Ayrıntı: `docs/OPACA.md`.

## Veri setleri ve atıf
| Veri seti | Durum | Kullanım |
|---|---|---|
| NIH ChestX-ray14 | İçe aktarıcı hazır | Görüntü havuzu, radyolog kutuları |
| Google panel etiketleri | İçe aktarıcı hazır, **lisans metni incelemede** | 4 bulgu için var/yok |
| RSNA Pneumonia 2018 | İçe aktarıcı hazır | Opasite kutuları, radyolog normal sınıfı |
| SIIM-ACR, JSRT, NLM TB, PadChest-GR | Lisans incelemesinde | Pakete alınmaz |
| VinDr-CXR, MIMIC-CXR, CheXpert | Yalnız envanter | Paylaşım sözleşmesi dağıtımı yasaklar |

Tam atıf metinleri `src/data/sources.json` içinde ve uygulamanın "Hakkında" ekranındadır. Google etiketleriyle
üretilen paket, `sources.json` içindeki `licenseVerified` işareti doğrulanana kadar `validate` adımında durur
(`OPACA_ALLOW_LICENSE_REVIEW=1` yalnız yerel geliştirme içindir).

## Dizin haritası
| Yol | İçerik |
|---|---|
| `src/core/` | tipler, geometri (normalize koordinat), yanıt/skor, doğrulama, suspend, SCORM, durum |
| `src/ui/FilmViewer.tsx` | yakınlaştırma/kaydırma, pencere ön ayarları, negatif, işaretleme, ölçüm, bölge telemetrisi |
| `src/data/` | `findings.json` (taksonomi), `reading-zones.json` (ABCDE), `library.json`, `sources.json`, vakalar, `images.json` |
| `scripts/` | içe aktarıcılar (`lib/dicom.mjs`, `lib/csv.mjs`), vaka üretici, doğrulama, paketleme |
| `fixtures/nih-sample/` | 2 NIH geliştirme filmi (atıf README'de) |
| `brand-src/` | EGEMED Opaca logo setinin özgün dosyaları; `public/brand/` web türevleri |

## Bekleyen işler
- Radyoloji uzmanı katkıcısı ve `docs/klinik-degerlendirme-listesi.csv` hekim onayı.
- Google panel etiketlerinin lisans metninin doğrulanması.
- Rotasyon/inspirasyon değerlendirmesi (`images.json` → `quality`) için radyolog gözden geçirmesi.
- Diyafram altı serbest hava, tüp/kateter ve lateral grafi için veri seti (PadChest-GR adayı).
- TÜRKPATENT'te "Opaca" marka araştırması.

© 2026 Ege Üniversitesi Tıp Fakültesi Dekanlığı. Tüm hakları saklıdır.
