# EGEMED Ausculta — Denetim Bilgilendirmesi

Bu dosya, projeyi denetleyecek yapay zekâ/insan denetçi için hazırlanmıştır.
Denetime başlamadan önce **README.md** ve **docs/AUSCULTA.md** okunmalıdır.

## Proje nedir?
Tıp fakültesi öğrencileri için Türkçe, tarayıcı tabanlı **kardiyopulmoner oskültasyon
simülatörü**. Statik site olarak (LMS'siz) veya SCORM 1.2 paketi olarak çalışır.

- Teknoloji: Vite + React 19 + TypeScript, ses için Web Audio API, testler vitest,
  lint oxlint, e2e için playwright-core (yalnız scriptlerde).
- Dağıtım çıktıları: `npm run build:html` (bağımsız HTML) ve `npm run build:scorm` (SCORM 1.2).
- SCORM 2004 **kapsam dışıdır** ve paketlenmez.

## Dizin haritası
| Yol | İçerik |
|---|---|
| `src/screens/` | Ekranlar: Start, Tutorial, ModeSelect, Learn, Simulation, Results, Sources, DevPanel |
| `src/ui/` | Bileşenler: PatientStage (stetoskop/hotspot), Questions, Toolbar, HelpModal, torso-pediatric, icons |
| `src/core/` | store (durum+SCORM runtime), resolver (ses çözümleme), scoring, session (rastgele örnekleme), suspend, scorm, types, validation |
| `src/data/` | Vaka havuzu (`cases.json` + `cases-auto.json`), kütüphane (`library.json`), ses envanteri (`sounds.json`, `sounds-external.json`), kaynaklar (`sources.json`), metrikler, pediatrik referans |
| `scripts/` | `generate-cases.mjs` (veri setinden vaka üretimi), `validate-audio.mjs` (zorunlu bütünlük denetimi), `build-html.mjs`, `build-scorm.mjs`, `e2e-screens.mjs`, `e2e-session.mjs`, importörler |
| `tests/core.test.ts` | 67 test: senkronizasyon, skorlama, SCORM, tıbbi tutarlılık, suspend, örnekleme |
| `docs/` | Mimari/ilke dokümanı ve hekim gözden geçirme listesi (CSV) |

## Komutlar
```bash
npm install
npm test              # vitest (67 test)
npm run validate      # ses/kaynak bütünlüğü — ölümcül hatalarda çıkar
npm run lint
npx tsc -b
npm run dev           # geliştirme sunucusu (http://localhost:5173)
npm run e2e           # ekranların görsel/konsol denetimi
npm run e2e:session   # 10 vakalık değerlendirmeyi uçtan uca koşar
npm run build:html    # release/EGEMED-Ausculta-HTML(.zip)
npm run build:scorm   # dist/EGEMED-Ausculta-SCORM12.zip
```

## Denetim kapsamı (istenen)
UI, UX, güvenlik, SCORM 1.2 uyumu, mantık (logic) ve **tıbbi tutarlılık**.
Her bulgu için: önem derecesi (kritik/orta/düşük), kanıt (`dosya:satır`), önerilen düzeltme.

## Bilinçli tasarım kararları (bulgu değildir)
- **Çocuk fotoğrafı kullanılmaz**; pediatrik gövde şematik/anatomik illüstrasyondur (etik).
- **Cinsiyet seçici yoktur**; gövde erkek, pediatrik vakalarda çocuk gövdesidir.
- Değerlendirmede **tek dinleme** kuralı, işaret/ipucu yokluğu bilinçlidir.
- Klinik tanı iddiası yalnız doğrulanmış eşlemelerde (AF, taşikardi, AV blok) yapılır;
  üfürüm–kapak lezyonu eşlemesi **yapılmaz** (kanıt yetersizliği).
- ICBHI 2017 gibi yeniden dağıtıma kapalı veri setleri pakete **alınmaz**.
- Ses verileri depoda tutulmaz (lisans/boyut); `scripts/import-*` ile üretilir. Bu nedenle
  ses dosyaları olmadan `npm run dev` sessiz çalışır, arayüz ve mantık testleri etkilenmez.

## Denetim sonrası düzeltmeler (2026-09-16)

Aşağıdaki bulgular doğrulanıp uygulandı (bulgu kodu → dosya → ne yapıldı):

| Kod | Dosya | Düzeltme |
|---|---|---|
| K1 | `src/core/session.ts`, `src/ui/Questions.tsx`, `src/screens/SimulationScreen.tsx` | Soru seçenekleri artık `caseId+qid` tohumlu Fisher–Yates ile karıştırılır (`shuffledOptions`); doğru yanıt hep "a" olma önyargısı kalktı. |
| K2 | `src/core/scoring.ts`, `src/core/validation.ts` | `fraction()` soru bulunmayan alan için `max:0` döner (ulaşılamayan puan yok); `validateCase` artık ağırlığı >0 olup sorusu olmayan alanlar için uyarı verir. |
| K3 | `src/core/store.tsx`, `src/screens/SimulationScreen.tsx` | `buildSuspend`/`restore` yalnız AKTİF modun oturum listesini taşır; liste boşsa `SimulationScreen` aynı tohumla `sampleSession` çağırıp kalıcı hale getirir. |
| K4 | `src/core/store.tsx` | `startMode` artık `caseResults`, `assessmentTimer`'ı sıfırlar, `attempts`'i artırır. |
| K5 | `scripts/generate-cases.mjs` | Kütüphane anahtarı `category.acousticFinding` ile indekslenir; `heart.normal`/`lung.normal` çakışması giderildi. |
| O1 | `src/core/store.tsx` | `init()` yalnız boş/`not attempted`/`unknown` lesson_status'ta `incomplete` yazar. |
| O2 | `src/core/store.tsx` | Etkileşim `type` hep `choice`; 1.2 ayırıcı `,`, 2004 `[,]`; `id` = `caseId.qid`; dizin `cmi.interactions._count`'tan başlar. |
| O3 | `src/core/store.tsx` | `terminate()` tamamlanmadıysa `cmi.exit='suspend'`, tamamlandıysa `''` yazar. |
| O4 | `src/ui/PatientStage.tsx` | Head değişiminde, hak kullanılmış ve ses çalmıyorsa yeniden dinleme başlatılmaz (tek dinleme kuralı). |
| O5 | `scripts/generate-cases.mjs`, `src/data/cases.json` | Dinlemeyle yanıtlanamayan lokalizasyon soruları kaldırıldı; ağırlık recognition/interpretation'a dağıtıldı (toplam 100). |
| O6 | `src/core/store.tsx`, `src/ui/chrome.tsx`, `src/ui/ConfirmModal.tsx` | `fresh=1` yalnız DEV'de etkili; değerlendirmede marka/"Mod Değiştir" önce `ConfirmModal` onayı ister. |
| O7 | `src/core/resolver.ts`, `src/screens/SimulationScreen.tsx` | `assessmentPointFilter` fallback (kaynağı farklı bölge) noktalarını değerlendirmede filtreler/bölge listesinden çıkarır. |
| O8 | `scripts/generate-cases.mjs`, `src/data/cases.json` | Ritim sınıflarında zamanlama yerine ritim sorusu; eşdeğer zamanlama etiketleri distraktörden çıkarıldı; AF geri bildirimi düzeltildi; Carvallo bulgusu eklendi; pediatrik başlık/ağırlık/vital düzeltmeleri; `mappingNote` artık uygulamada gösteriliyor. |
| O9 | `src/core/store.tsx` | `advance` reducer'ında uygulama modunda `practiceAdjusted` ile ipucu cezası uygulanır, hakimiyet yeniden hesaplanır. |
| O10 | `src/styles.css` | ≤1500px'te alt başlık, ≤1440px'te çip metinleri gizlenir; 1366×768'de header taşmıyor (ekran görüntüsüyle doğrulandı). |
| O11 | `src/screens/SimulationScreen.tsx` | Olgu cümlesi `{yaş} yaşında {cinsiyet} hasta. Başvuru: {şikayet}. {öykü}` biçimine alındı (lowercase birleştirme kaldırıldı). |
| O12 | `src/ui/PatientStage.tsx` | `placeSeqRef` sayacıyla ses yükleme sırası yarışı önlendi; yerleştirme değişirse eski `await` sonucu sessizce durdurulur. |
| D1 | `src/ui/PatientStage.tsx` | Stetoskop artık ok tuşlarıyla %2 adımla taşınır, Enter/Space en yakın noktaya yerleştirir. |
| D2 | `src/ui/HelpModal.tsx` | Açılışta odak kapat düğmesine taşınır, kapanışta önceki odağa döner, Tab odak tuzağı eklendi. |
| D3 | `src/ui/Questions.tsx` | Tek seçim `role="radio"`+`aria-checked`, çok seçim `role="checkbox"`+`aria-checked`; ok tuşlarıyla gezinme. |
| D5 | `src/ui/HelpModal.tsx`, `src/screens/StartScreen.tsx`, `src/screens/TutorialScreen.tsx`, `README.md`, `docs/AUSCULTA.md` | Eski gövde-seçici/SCORM 2004/sabit sayı metinleri güncellendi; "Steteskop"→"Stetoskop"; §6 skor cümlesi gerçek davranışa göre yeniden yazıldı. |
| D6 | `src/data/cases.json`, `src/data/library.json`, `scripts/generate-cases.mjs` | Yazım/terim birliği düzeltmeleri (inspirasyon/ekspirasyon, diyastolik, türbülan, müzikal, vb.). |
| D8 | `src/screens/DevPanel.tsx` | `cases[state.caseIndex]` → `ALL_CASES.find(c => c.id === state.currentCaseId)`. |
| D9 | `src/App.tsx` | Doğrulama ve `StoreProvider` artık `ALL_CASES` (havuzun tamamı) üzerinde çalışır. |
| D10 | `src/audio/engine.ts`, `src/audio/audioConfig.ts` | Çift `connect(gain)` kaldırıldı; "native eşleşirse bypass" yorumu gerçek davranışa göre düzeltildi. |
| D11 | `scripts/lib/inject-csp.mjs`, `scripts/build-html.mjs`, `scripts/build-scorm.mjs` | CSP enjeksiyonu ortak yardımcıya taşındı ve HTML çıktısına da uygulandı; manifest dosya adları XML-escape edilir. |
| D12 | `src/core/store.tsx`, `src/screens/ResultsScreen.tsx` | `ScormRuntime.terminated` bayrağı eklendi (sonrası no-op); çıkışta LMS içindeyse `terminate()+window.close()`, değilse yalnız başlangıç ekranına dönülür. |
| e2e | `scripts/e2e-screens.mjs` | `Arka Görünüm` seçicisi `^Arka$` ile güncellendi. |

Tasarım kararları (tek dinleme kuralı, cinsiyet seçici yok, pediatrik gövde şematik, üfürüm→kapak
lezyonu eşlemesi yok, SCORM 2004 kapsam dışı) değiştirilmedi. Testler 67→83'e çıkarıldı; tümü,
`npm run validate`, `npm run lint`, `npx tsc -b`, `npm run e2e` ve `npm run e2e:session` yeşil.

## İleri seviye denetim
Tam kapsamlı, çok disiplinli denetim istemi için: **docs/DENETIM-ILERI.md** (kopyala-yapıştır).

## Hazır denetim istemi (kopyala-yapıştır)
> Bu depoyu UI, UX, güvenlik, SCORM 1.2, mantık ve tıbbi tutarlılık açılarından denetle.
> Önce README.md ve docs/AUSCULTA.md'yi oku; oradaki ilkeleri ölçüt kabul et.
> `npm test`, `npm run validate`, `npm run lint`, `npx tsc -b` komutlarını çalıştır ve
> sonuçları raporla. Ardından kod ve veri üzerinde şunları ara:
> (1) erişilebilirlik ve klavye kullanımı, (2) taşma/kırpılma/okunabilirlik sorunları,
> (3) XSS/enjeksiyon/ağ sızıntısı riskleri, (4) SCORM 1.2 alan eşlemeleri ve suspend_data
> boyut güvenliği, (5) durum yönetimi/kenar durum hataları, (6) soru kök ve seçeneklerinde
> Türkçe anlam bozuklukları ile tıbbi tutarsızlıklar (örn. yaşa uygun vital aralıkları,
> tanı iddiası sınırları). Her bulgu için önem derecesi, `dosya:satır` kanıtı ve somut
> düzeltme önerisi ver; sonunda önceliklendirilmiş bir eylem listesi üret.
