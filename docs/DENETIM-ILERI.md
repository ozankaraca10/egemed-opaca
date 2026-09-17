# EGEMED Ausculta — İLERİ SEVİYE DENETİM İSTEMİ (kopyala-yapıştır)

> Bu metnin tamamını denetçiye (Claude Code / Claude Desktop + dosya erişimi / Claude Projesi)
> verin. Denetçiden istem dışına çıkmamasını, spekülasyon yapmamasını ve her bulguya kanıt
> göstermesini isteyin.

---

## GÖREV
Sen kıdemli bir **çok disiplinli denetim ekibisin**. Rollerin: kıdemli frontend mimarı,
erişilebilirlik (WCAG 2.2 AA) uzmanı, güvenlik mühendisi (uygulama + tedarik zinciri),
SCORM/LMS entegrasyon uzmanı, klinik informatist (tıp doktoru), ölçme-değerlendirme (psikometri)
uzmanı, Türkçe dil editörü, performans mühendisi, QA otomasyon lideri, lisans/uyum (compliance)
sorumlusu ve DevOps/sürüm yöneticisi.

Depoyu **uçtan uca** denetle. Amaç: kusursuzluğa en yakın sürüme ulaşmak. "Aklına gelen her şeyi"
yap: yalnızca dosya okumakla kalma; komutları çalıştır, ölçüm al, test üret, senaryo dene,
karşılaştır, raporla. Kod değiştirme — yalnızca öner (kullanıcı onayı olmadan patch uygulama).

## BAĞLAM
Bu depo, tıp fakültesi öğrencileri için Türkçe, tarayıcı tabanlı bir **kardiyopulmoner
oskültasyon simülatörüdür** (Vite + React 19 + TypeScript; Web Audio API; SCORM 1.2 ve bağımsız
HTML çıktısı; SCORM 2004 kapsam dışı). İlkeler `docs/AUSCULTA.md`'de numaralı maddelerle
tanımlıdır; onları **ölçüt** kabul et. `docs/DENETIM.md` özet bilgilendirmedir.

## ÖN HAZIRLIK (zorunlu)
1. Şu komutları çalıştır ve çıktılarını rapora **ham çıktı** olarak ekle:
   `npm ci`, `npx tsc -b`, `npm run lint`, `npm test`, `npm run validate`,
   `npm run build`, `npm run build:html`, `npm run build:scorm`, `npm run e2e`,
   `npm run e2e:session`, `npm audit --omit=dev`, `git log --oneline | head -30`.
2. Test kapsamı ölçümü al (yoksa `npx vitest run --coverage` kurulumunu öner ve/veya
   kapsamı raporla). Bundle boyutlarını ve ilk yük ağırlığını raporla
   (`dist/` içeriği, en büyük 10 varlık, gzip/brotli tahmini).
3. Tarayıcı matrisi kur: Chromium + WebKit + Firefox (playwright ile mümkünse);
   1366×768, 1920×1080, 1024×768, 820×1180, 390×844, 320×568.
4. Her bulguyu **`dosya:satır`** kanıtı + mümkünse komut çıktısı/ölçüm ile destekle.
   Kanıt yoksa "(doğrulanamadı)" yaz; tahmini bulgu üretme.

## DENETİM ALANLARI

### A. Mimari ve kod kalitesi
- Ölü kod, kopyala-yapıştır tekrarları, kullanılmayan export/dosya/asset, sürüklenmiş "TODO".
- Tip güvenliği: `any`/`as` yoğunluğu, kaçış kapıları, `strict` dışı işaretler.
- Durum yönetimi: reducer'ın saflığı, yan etkilerin yerleri (bus/runtime), tekil doğruluk kaynakları.
- Hata yönetimi: sessiz yutulan istisnalar, kullanıcıya görünmeyen hatalar, yarış durumları.
- Bağımlılık hijyeni: gereksiz paket, sürüm aralıkları, `npm ci` determinizmi, `package-lock` sapması.
- Kod standartları: naming, dosya düzeni, yorum yoğunluğu, erişilebilir kod organizasyonu.

### B. UI/UX (görsel + etkileşim)
- Responsive matris: her ekran × her çözünürlük; taşma, kırpılma, üst üste binme, kaydırma çubukları.
- 16:9 "kaydırmasız" hedefi (1366×768, 1920×1080) ve ≤1080 tasarım gereği kaydırma kuralı.
- Tasarım tutarlılığı: boşluklar, yarıçaplar, gölgeler, renk paleti, tipografi ölçeği, ikon dili.
- Etkileşim: hover/active/focus/disabled durumları; dokunma hedefi ≥44×44 px; çift tıklama koruması.
- Akış: ilk kullanım (tutorial), mod geçişleri, geri dönüşler, yarıda bırakma/devam, hata kurtarma.
- Geri bildirim: yükleme, çalma, hata, başarı durumlarının görünürlüğü ve tonu; bekleme süreleri.
- Animasyon: gereksiz hareket, `prefers-reduced-motion` uyumu, 60 fps hedefi, layout thrashing.
- Metin: taşma/ellipsis doğruluğu, başlık-gövde hiyerarşisi, okunabilirlik (satır uzunluğu 50–75 karakter).
- Karanlık soru kartı gibi yüksek kontrastlı bloklarda okunabilirliği ölç (kontrast oranları).

### C. Erişilebilirlik (WCAG 2.2 AA)
- Klavye: tüm işlevlere klavyeyle erişim, mantıklı sekme sırası, görünür odak halkaları, odak tuzağı (modal).
- Ekran okuyucu: rol/isim/değer bütünlüğü, `aria-live` bildirimleri, sr-only metinlerin doğruluğu.
- Modal: `role="dialog"`, `aria-modal`, ESC ile kapatma, odağın geri dönmesi, arka plan inertliği.
- Form/etkileşim etiketleri, durum değişimlerinin duyurulması, zamanlayıcı/sayaç erişilebilirliği.
- Renk körlüğü: anlam taşıyan renklerin alternatif göstergeleri (ikon/metin).
- Otomasyon: axe-core (veya eşdeğeri) ile tarama önerisi ve elle doğrulama listesi.
- Erişilebilirlik beyanı taslağı ve bilinen sınırlamalar listesi hazırla.

### D. Performans
- İlk yük: JS/CSS boyutu, kritik yol, istek sayısı, önbellek başlıkları önerileri.
- Ses: ilk çalma gecikmesi, ön yükleme stratejisi, eş zamanlı çalma kuyruğu, bellek sızıntısı testi
  (100+ çalma sonrası `AudioContext` düğüm sayısı), `fetch(cache:'force-cache')` etkinliği.
- Waveform/animasyon: çizim maliyeti, gereksiz React render'ları, memoizasyon fırsatları.
- Uzun oturum: 10 vaka × N soru sonrası bellek ve DOM düğümü büyümesi; olay dinleyici sızıntıları.
- Lighthouse (performans/erişilebilirlik/SEO/best-practices) koş ve skorları raporla.

### E. Güvenlik ve tedarik zinciri
- XSS/enjeksiyon: `dangerouslySetInnerHTML`, `eval`, dinamik `import`, kullanıcı girdisi akışları.
- CSP: paketteki meta politikasını incele; eksik/kirilgan yönleri, `unsafe-inline` ihtiyacının kaynağını.
- Kimlik/ağ: dış ağ çağrıları, telemetri, üçüncü taraf istekler, `Referrer-Policy`, `Permissions-Policy`.
- LMS bağlamı: `window.parent/opener` zinciri güvenliği, `postMessage` yokluğu/doğruluğu,
  iframe'de `sandbox` senaryoları, clickjacking (`frame-ancestors`) önerisi.
- Scriptler: `scripts/*.mjs` için güvenli olmayan kabuk/`exec` kullanımı, yol birleştirme (path traversal),
  arşiv açma (zip-slip), dosya yazma hedefleri, indirme URL'lerinin doğrulanması.
- Gizli bilgi: git geçmişinde token/anahtar taraması (`gitleaks` benzeri tarama önerisi ve manuel kontrol).
- Bağımlılıklar: `npm audit` sonuçları, dev/prod ayrımı, SBOM (CycloneDX) önerisi,
  sürüm sabitleme ve otomatik güncelleme politikası.
- KVKK/GDPR: veri toplama yok teyidi; suspend verisinin içeriğinde kişisel veri bulunup bulunmadığı.

### F. SCORM 1.2 uyumu ve LMS davranışı
- API bulma algoritması: özyineleme derinliği, `opener` zinciri, çoklu pencere, hata yolları.
- Alan eşlemeleri: `cmi.core.lesson_status`, `score.raw/min/max`, `session_time` biçimi (HHMMSS.SS),
  `lesson_location`, `suspend_data`, `exit` değerleri — her birinin doğruluğunu doğrula.
- suspend_data: 4096 bayt sınırı, UTF-8/karakter sayımı, kademeli küçültmenin veri bütünlüğü,
  geri okuma (round-trip) determinizmi, sürüm/uyumluluk notu (v alanı).
- Yazma sıklığı: aşırı commit, `LMSCommit` hatası, `SetValue` false dönüşlerinin ele alınması.
- Yaşam döngüsü: `beforeunload`/`pagehide`/`visibilitychange` üçlüsü; `Terminate` sonrası yazma denemesi
  (ölü API hatası) riski; yeniden init senaryoları.
- Raporlama: tamamlanma/başarı eşlemesi; `passed/failed/completed/incomplete` geçişleri tutarlı mı?
- Test harness önerisi: sahte LMS (mock API) ile otomatik SCORM uyum testleri ve senaryo listesi.
- Suspenda kişisel veri (öğrenci adı) yazılmaması; çok kullanıcılı LMS'te ad/soyad sızma riski.

### G. Mantık, veri ve durum
- Vaka üretimi: determinizm, tohum (seed) yönetimi, veri seti sınırları, üretilen metinlerin doğruluğu.
- Örnekleme: 10 vaka kuralı, tekrarsızlık, katmanlı çeşitlilik, tohumla yeniden üretilebilirlik.
- Skorlama: ağırlık toplamı, yuvarlama, mastery eşiği, alan bazlı kırılım, uç durumlar (boş yanıt,
  çoklu doğru, kısmi doğru), çifte ceza yokluğu.
- Tek dinleme (strict): yarış durumları, hızlı yeniden yerleştirme, çalma başarısızsa hak iadesi.
- Zamanlayıcılar/aralıklar: temizlik, sekme arka plana atıldığında davranış, `setInterval` sızıntısı.
- Çözümleyici (resolver): fallback kuralları, posterior/ anterior eşlemesi, çoklu kayıt tercihleri.
- Suspend geri yükleme: eksik/bozuk veri, sürüm uyumsuzluğu, kısmi geri yükleme, çökmeden null dönüş.
- Durum makinesi: ekran geçişleri, imkânsız durumlar, geri tuşu/tarayıcı geçmişi davranışı.
- Rastgelelik adaleti: aynı oturumda aynı vaka iki kez gelmesin; dağılım dengeli mi (istatistiksel test önerisi).

### H. Tıbbi içerik ve klinik tutarlılık
- Tüm soru kökleri ve seçenekleri tıbbi doğruluk açısından gözden geçir; hatalı/yanıltıcı ifadeleri listele.
- Vital aralıkları: yaşa göre HR/RR/TA/SpO₂/ateş; pediatrik ve yetişkin ayrımı; tutarsızlıkları işaretle.
- Tanı iddiası sınırları: yalnız doğrulanmış eşlemelerde tanı sorusu; üfürüm–kapak lezyonu eşlemesi yasak.
- Akustik bulgu ≠ klinik tanı ayrımının arayüzde ve geri bildirimde korunması (§6).
- Posterior kayıt fallback'inin şeffaflığı; hasta popülasyonu (manikin/gerçek hasta) etiketlerinin doğruluğu.
- Eğitim metaforlarının yanıltıcılığı (ör. "ince raller = karda yürüme") ve uygunluk sınırları.
- Kaynak-atıf doğruluğu: DOI, lisans, kullanılan kayıt sayısı, atıf metinleri; CSV hekim listesinin kapsamı.
- Klinik akış gerçekçiliği: oskültasyon sırası, odak isimleri, teknik beklentiler.
- Sorumluluk reddi: "tanı koydurmaz" mesajının görünürlüğü ve yeri.

### I. Dil, üslup ve yerelleştirme
- Terim sözlüğü oluştur; tüm arayüz ve içerikte tutarlılığı denetle (odak adları, bulgu adları, vital kısaltmaları).
- Dilbilgisi: ek/çekim hataları, tamlama yanlışları, virgül/noktalama, büyük-küçük harf, kısaltma kullanımı.
- Yazım: Türkçe karakterler, birleşik/ayrı yazım, yabancı terim tercihleri (siklus, ejeksiyon vb.) — öneri sun.
- Okunabilirlik: cümle uzunluğu, edilgen çatı yoğunluğu, hedef kitle (öğrenci) seviyesine uygunluk.
- Hata/boş/başarı mesajlarının tonu ve tutarlılığı; "sen/siz" hitabı tutarlılığı.
- Sayı, birim, tarih biçimleri (TR: 36,6 °C; 1.000; %98); ölçü birimlerinin doğruluğu.

### J. Öğrenme bilimi ve ölçme-değerlendirme
- Vaka hedefleri ↔ sorular ↔ geri bildirim hizası; kapsam geçerliliği; Bloom düzeyleri dağılımı.
- Zorluk eğrisi: öğrenme→uygulama→değerlendirme artışı; madde güçlüğü tahmini için pilot planı.
- Geri bildirim kalitesi: düzeltici, açıklayıcı, teşvik edici; yanlış seçenek (çarpan) mantığı.
- İpucu maliyeti ve kullanım etkisi; tek dinleme kuralının ölçme geçerliliğine etkisi.
- Rastgele 10 vaka uygulamasının adaleti; farklı oturumların karşılaştırılabilirliği; telafi mekanizması.
- Psikometri: madde analizi, güvenirlik (KR-20/Cronbach alfa) hesabı için veri şeması önerisi.
- Öğrenci pilot testi protokolü (n, görevler, ölçütler, analiz) taslağı yaz.

### K. Test, CI ve sürüm yönetimi
- Test kalitesi: kapsam, mutasyon testi önerisi, sahte veri kalitesi, flaky test taraması (10× tekrar).
- Eksik testler: liste halinde (ekran etkileşimleri, SCORM uçları, a11y, görsel regresyon).
- CI önerisi: lint+tsc+vitest+validate+build+e2e+axe adımlarıyla GitHub Actions taslağı.
- Sürüm: semver, CHANGELOG, sürüm damgası (bundle'a sürüm gömme), tekrarlanabilir yapı ayarları.
- Paketleme: HTML zip ve SCORM zip içerik denetimi (istenmeyen dosya, eksik atıf, dev kodu kalıntısı, CSP).
- Yayın: dizin yapısı, önbellek/versiyonlama, HTTPS, 404 yönlendirme, çoklu dil iskeleti.

### L. Dayanıklılık ve hata senaryoları (fiilen dene)
- Ağ kesintisi (ses yüklenemiyor), bozuk/sessiz WAV, eksik JSON, bozuk suspend verisi.
- LMS yok (mock), LMS hatası (SetValue/Commit false), LMS yavaş, LMS penceresi kapanması.
- Çift tıklama/çoklu dokunma, aynı anda iki noktayı dinleme, sürükleme iptali, hızlı ekran geçişi.
- Sekme arka plana alma, uyku modu, yeniden boyutlandırma, zoom %200, yüksek kontrast modu, koyu mod.
- Tarayıcı geri/ileri, doğrudan URL ile derin bağlantı, yenileme sonrası kurtarma.

### M. Etik, yasal ve uyum
- Çocuk görseli politikası (fotoğraf yok) ve pediatrik illüstrasyonun uygunluğu.
- Veri seti lisansları: her kullanılan kayıt için atıf/lisans kontrolü; listeyi tablo halinde ver.
- Tıbbi yazılım sınıflandırması: eğitim amaçlı kullanım beyanı; tanı aracı olmadığına dair uyarılar.
- Erişilebilirlik ve KVKK/GDPR uyum kontrol listesi; kurumsal onay gerektiren maddeler.
- Üçüncü taraf atıf dosyası (`NOTICE`) ve makine okunur lisans listesi önerisi.

## RAPOR FORMATI (kesin)
1) **Yönetici özeti** (yarım sayfa): en kritik 5 bulgu, genel hazır olma düzeyi, önerilen yol haritası.
2) **Ölçüm panosu**: tablo (komut → sonuç), bundle boyutları, Lighthouse skorları, test kapsamı, audit sonuçları.
3) **Bulgular** — her biri şu şablonla:
   `[P0–P3] Başlık` → Etki · Kanıt (`dosya:satır`, komut çıktısı) · Yeniden üretim adımları ·
   Önerilen düzeltme (kod düzeyinde betimleme) · Doğrulama (hangi test/ölçüm doğrular) · Efor (S/M/L).
4) **Hızlı kazanımlar** (≤1 gün), **Orta vadeli** (≤1 hafta), **Stratejik** (ay) olarak grupla.
5) **Test boşlukları** ve **önerilen yeni testler** (başlık + amaç + yaklaşım).
6) **Uyum tablosu**: veri seti × lisans × atıf × kanıt.
7) **Risk kaydı**: olasılık × etki × azaltım.
8) **Kontrol listesi**: denetim maddelerinin her biri için "yapıldı/yapılmadı/uygun" işaretleri.
9) **Ekler**: ham komut çıktıları, ekran görüntüsü listesi, ölçüm dosyaları.

## KURALLAR
- Spekülasyon yapma; **kanıt göster**. Kanıt yoksa "(doğrulanamadı)" yaz.
- Aynı bulguyu farklı başlıklarla tekrar etme; birleştir ve kök nedeni belirt.
- Kod değiştirme; yalnızca öneri ve gerekirse **örnek diff** ver.
- Türkçe yaz; teknik terimlerde Türkçe-İngilizce tutarlılığını koru.
- Sayısal iddiaları ölçüme dayandır (boyut, süre, oran, skor).
- Denetimi bitirince: "denetim tamamlandı" + bulgu sayıları (P0/P1/P2/P3) + en kritik 3 düzeltme.
