# Oyunlaştırma — Astra (yönetici) ve Sol 6.0 (uygulayıcı) için devir kılavuzu

> Claude Opus 5.5 hazırladı, 23 Eyl 2026. Güncel durum her zaman `docs/GAMIFICATION-HANDOFF.md`'deki
> "Durum özeti" tablosundadır; bu kılavuz **nasıl** ilerleneceğini, HANDOFF ise **nerede** kalındığını söyler.
> İkisi çelişirse HANDOFF'taki durum tablosu ve "Kullanıcı kararları" bölümü geçerlidir.

## 0. Roller

| | Astra (yönetici / denetçi) | Sol 6.0 (uygulayıcı) |
|---|---|---|
| Ne yapar | Kartı hazırlar, Sol'a verir, teslimi **bağımsız** doğrular (testleri kendisi çalıştırır, ekran görüntülerine kendisi bakar), commit atar, HANDOFF'u günceller, kullanıcıya rapor verir | Yalnız verilen kartı uygular; kapsam dışına çıkmaz; commit atmaz; kısa teslim raporu yazar |
| Neye dokunmaz | Sol'un kodunu sessizce yeniden yazmaz; sorun varsa kartı düzeltmeyle geri verir (küçük düzeltmeleri kendisi yapabilir, raporda söyler) | `docs/`'taki karar belgeleri, başka kartların dosyaları, SCORM çekirdeği (`src/core/scorm.ts`, `suspend.ts`) |
| Kullanıcıyla | Türkçe, kısa, karar gerektiren şeyi açıkça sorar | Kullanıcıyla konuşmaz; belirsizliği Astra'ya raporlar |

## 1. Astra başlangıç promptu (kopyala-yapıştır)

```
Rolün: EGEMED Opaca oyunlaştırma işinin yöneticisi ve denetçisisin (Astra). Kodu Sol 6.0 yazacak.
Depo: "~/Documents/EGEMED SIM/egemed-opaca" (yolda boşluk var).

Önce sırayla oku:
1) docs/GAMIFICATION-HANDOFF.md          — nerede kalındı, kullanıcı kararları (tasarım promptunu geçersiz kılar)
2) docs/GAMIFICATION-DEVIR-ASTRA-SOL.md  — bu kılavuz (roller, kartlar, denetim, tuzaklar)
3) docs/GAMIFICATION-YOL-HARITASI.md     — veri katmanı ve kurallar (taslak v0.1)
4) docs/GAMIFICATION-TASARIM-PROMPT.md   — ekran tasarımı (§3–§9)
5) docs/mockups/gami.html + docs/mockups/shots/*.png — ONAYLI tasarım referansı (T0)

Sonra HANDOFF'taki durum tablosunda ilk bitmemiş paketi bul, bu kılavuzun §4 kartını Sol'a ver,
teslimi §5'e göre denetle, geçerse commit at ve HANDOFF'u güncelle. Kullanıcıya her paket sonunda
2–4 satırlık Türkçe rapor ver. Kararı kullanıcıya ait olan konuyu tahminle kapatma, sor.
```

## 2. Kullanıcı kararları (özet — tam hali HANDOFF'ta)

- T0 tasarımı **onaylı**. Tek geri bildirim rozet renkleriydi; kategori renkleriyle düzeltildi ve onaylı sayılır.
- **Gerçek isimler gösterilir** (SCORM `cmi.core.student_name`, "Soyad, Ad" → "Ad Soyad"); öğrenci isterse
  "Anonim öğrenci". Takma ad alanı **yok**. Ödül koşulu `requirePublicName`.
- **Ödül tüm sınıflara açık: Dönem 1–6.** Kohort tipi `1|2|3|4|5|6`.
- Rozet kategorileri/renkleri: konu mavi, beceri mor, seri amber, öğrenme yeşil, kilometre taşı lacivert.
- Açık karar: **aylık asgari değerlendirme sayısı** (taslak 4). UI kartlarını engellemez; rules.ts'te tek sabit.
- Gerçek sınıf sıralaması sunucu gerektirir; v1 = kendi sonuçların + deterministik demo akranlar, "Demo verisi" etiketli.

## 3. Ortam ve komutlar

- Git: `/Applications/Xcode.app/Contents/Developer/usr/bin/git` (`/usr/bin/git` Xcode lisansı nedeniyle çalışmaz).
  Kimlik: `-c user.name="Ozan Karaca" -c user.email="ozandeu@yahoo.com"`. Mesaj İngilizce, kısa başlık + madde.
  Push yalnız kullanıcı isterse (origin `https://github.com/ozankaraca10/egemed-opaca.git`, dal `main`).
- Tip + birim: `npx tsc -b` · `npx vitest run`
- E2E: önce `npx vite --port 5173 --strictPort` (arka planda), sonra `npm run -s e2e`, `npm run -s e2e:click-stability`,
  `node scripts/e2e-v3-screens.mjs`. İş bitince vite'ı kapat (`pkill -f "vite --port 5173"`).
- Playwright npm'de kurulu değil; betikler şu yoldan import eder:
  `/Users/ozankaraca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`
- Paket: `OPACA_ALLOW_LICENSE_REVIEW=1 npm run build:scorm` ve `build:html` (Google panel etiket lisansı açık
  karar; bayraksız validate durur — bilinçli). Masaüstü kopyası: `~/Desktop/EGEMED_SCORM_paketleri/`.
- Tasarım referansı yeniden üretimi: `node scripts/build-gami-mockup.mjs && node scripts/shoot-gami-mockup.mjs`.

## 4. Kart sırası ve kartlar

Her kartın **Kabul** maddeleri Astra'nın denetim listesidir. Sol'a kartı verirken §4.0 şablonunu kullan.

### 4.0 Sol'a kart verme şablonu

```
Görev kartı <KİMLİK> — EGEMED Opaca oyunlaştırma. Uygulayıcı sensin (Sol 6.0); denetçi Astra.
Depo: "~/Documents/EGEMED SIM/egemed-opaca". COMMIT YAPMA. Yalnız bu kartın dosyalarına dokun.
Önce oku: docs/GAMIFICATION-HANDOFF.md ("Kullanıcı kararları"), docs/GAMIFICATION-YOL-HARITASI.md,
docs/GAMIFICATION-TASARIM-PROMPT.md (<ilgili §>), docs/mockups/gami.html (#<durum>), docs/mockups/gami-draft.css.
İş: <kart tablosundaki İş>
Kabul: <kart tablosundaki Kabul> + `npx tsc -b` hatasız + `npx vitest run` tümü geçer.
Rapor: değişen/eklenen dosyalar, test sayısı, varsayımlar, doğrulamadığın şeyler (doğrulamadığını doğrulandı yazma).
```

### 4.1 P2 — veri katmanı (Faz 1)

Durum HANDOFF'ta. Sonnet'e verilmişti; **Astra devraldığında önce `src/gamification/` ve `tests/gamification/`
var mı, `npx vitest run` geçiyor mu bak.** Eksikse Sol'a aynı kartla tamamlat. Kart metni (özet):
yol haritası §4'teki 14 dosya (`types, rules, time, xp, streak, goals, stats, badges, ranking, rewards, storage,
repo, mock, demo`), yalnız yeni dosyalar, mevcut dosyalara dokunulmaz.

Kabul (Astra kendisi çalıştırır):
- Saf fonksiyon: `grep -rn "Date.now\|new Date()" src/gamification` yalnız `storage.ts`/`repo.ts` sınırında çıkmalı.
- TR saat sınırları testli: gece yarısı (UTC 20:59 ↔ 21:00), Pazartesi 00:00, ay son saniyesi.
- `rewardStandings`: ilk 3'te uygun olmayan (asgari deneme / anonim) → ödül sırası kayar; kohort reddi ayrı test.
- `recordAttempt` idempotent; bozuk `opaca.gami.v1` JSON → boş durum, istisna yok.
- `formatLmsName("Çelik, Selin") === "Selin Çelik"`; `initials` Türkçe (İ, Ş, Ç, Ö).
- Kohort tipi 1–6; `requirePublicName` (nickname yok).
- `git status`: yalnız yeni dosyalar (vitest config değiştiyse gerekçesi raporda).

### 4.2 P3 — Başarılarım (K-A1 … K-A6)

| Kart | İş | Kabul |
|---|---|---|
| K-A1 | `docs/mockups/gami-draft.css` → `src/styles-gami.css` (main.tsx'te `styles-v2.css`'ten sonra import). `src/core/types.ts` `Screen` birleşimine `'achievements' \| 'leaderboard'`; `src/App.tsx` `DOC_SCREENS`'e ikisi ve render dalları; bayrak `src/gamification/flag.ts` (`?gami=1` veya `import.meta.env.VITE_GAMI === '1'`); `src/ui/chrome.tsx` `Header()` içinde Tam ekran'dan önce "Başarılarım" çipi (+ `divider-v`), yalnız bayrak açıkken ve `state.screen !== 'simulation'`; `GamiPageTabs`; `src/ui/icons.tsx`'e Flame, Lock, Medal, Award, Star, Gift, ArrowUp (maket generator'ındaki path'ler, aynı `base()` kalıbı) | Bayrak kapalı: mevcut e2e + görüntüler birebir; açık: iki ekran arasında sekme, simülasyonda çip yok, değerlendirmede çip yok |
| K-A2 | `src/ui/gami/`: `GamiAvatar` (baş harf + kimlikten ton; yalnız t-blue/t-purple/t-green/t-amber, anonim t-anon), `GamiSeg`, `GamiDemoBanner`, `domainMeta.ts` (ResultsScreen'deki 7 alan etiketi+ikonu; ResultsScreen'e dokunma) | Birim test: aynı kimlik → aynı ton; İ/Ş/Ç baş harf |
| K-A3 | `GamiProfileStrip` (seviye halkası, seri, değerlendirme sayısı, ortalama, sıralama kutusu → Liderlik) + boş durum kartı | Değerler `xp.ts`/`streak.ts`'ten; `?gami=1&demo=empty` boş durum; mobilde seviye tam genişlik + 2×2 |
| K-A4 | `GamiProgressChart` saf SVG + dönem seçici + `sr-only` tablo | **Genişlik ResizeObserver ile ölçülür, o genişlikte çizilir** (tek viewBox ölçekleme YASAK — metin 4 px'e düşüyordu); <600 px 180 px yükseklik; 0, 1, 60 nokta; 360 px'de taşma yok |
| K-A5 | `GamiWeeklyGoals` (`goals.ts`) + `GamiDomainPanel` | Pazartesi TR 00:00 sıfırlama testi; `<60` → "zayıf" rozeti |
| K-A6 | `GamiBadgeCard`, `GamiBadgeGrid` (filtre + kategori lejantı), rozet detay penceresi (`modal-overlay`/`modal-card` kalıbı, ConfirmModal odak tuzağı gibi), "Bu konuyu öğrenme modunda çalış" → `dispatch({type:'setLearnFocus', key})` + learn | Klavye ile ızgara ve pencere; Esc kapatır; odak karta döner; kategori renkleri maketle aynı |

### 4.3 P4 — Liderlik Tahtası + Ayın Ödülü (K-B1 … K-B7)

| Kart | İş | Kabul |
|---|---|---|
| K-B1 | `GamiPeriodTabs` (mor seçili, `role="tablist"`, ok tuşları) + kohort `<select>` (Tümü, Dönem 1–6) + tarih aralığı | 4 dönem × 7 kohort hatasız |
| K-B2 | `GamiPodium` | DOM 1-2-3, görsel 2-1-3 (`order`); <3 kişi → gizli; "ben" podyumdaysa mor çerçeve |
| K-B3 | `GamiLeaderboardTable`: tablo sınıfları **`report-table report-table-v2 gami-lb-table` üçü birlikte**; mobilde kart listesi (ilk 3 podyumda, liste 4'ten başlar); ayırıcı; "ben" vurgusu; değişim oku + metin | "ben" ilk 10'da / dışında / sıralamaya girmemiş (asgari 2 deneme) üç durum |
| K-B4 | `GamiPrivacyCard`: yalnız "Sıralamada adımı göster" anahtarı (takma ad alanı YOK), ad LMS'ten | Anahtar değişince tablo anında "Anonim öğrenci"ye döner; ödül çipi nedeni gösterir |
| K-B5 | `rewards.ts` bağlantısı, repo `getMonthlyReward/getRewardWinners` (P2'de yoksa ekle) | Uygun olmayan ilk-3 → sıra kayar; ay sınırı TR |
| K-B6 | `GamiRewardBanner` tam (Bu ay) + kompakt (diğer sekmeler), dakikalık geri sayım (`aria-live` kapalı), "Senin durumun" çipi (ilk 3 / aday / uygun değil: asgari deneme, anonim) , podyum "Ödül adayı" | Durum metinleri doğru; kohort nedeni artık üretilmez (tüm sınıflar uygun) ama kod yolu kalır |
| K-B7 | Katılım koşulları penceresi (maddeler yapılandırmadan), geçmiş kazananlar `<details>`, Başarılarım tebrik kartı (`?gami=1&demo=winner`), ModeSelect değerlendirme kartına "Bu ayın ödülü · N gün kaldı" satırı (`ModeCard` `rules` dizisine; bayrak açıkken) | Klavye/Esc; metinler yapılandırmadan |

### 4.4 P5 — Kazanımlar + görüntüler (K-C1, K-D1)

| Kart | İş | Kabul |
|---|---|---|
| K-C1 | `ResultsScreen`'de `.results-summary-strip`'in hemen altına Kazanımlar kartı (bayrak açıkken). **Kayıt:** ResultsScreen mount'unda `repo.recordAttempt(buildAttempt(state))` — id = mod + `state.session.seed` + vaka kimlikleri (idempotent; yeniden render/yenilemede çift kayıt yok). Öğrenme etkinliği: LearnScreen konu seçimi (`setSelectedKey`) → `learn.topics`; FilmViewer yığında son kesite ulaşınca → `ctStacksCompleted` (bir kez). Ad: `runtime.get('cmi.learner_name')` → `formatLmsName` | Mevcut sonuç öğelerinin sırası/metni aynı; reduced-motion'da animasyon yok; SCORM çağrıları değişmedi (e2e SCORM testleri geçer) |
| K-D1 | `scripts/e2e-gami-screens.mjs`: `?gami=1&demo=full|empty|winner` ile 6 durum × 1440/768/360; README'ye "Oyunlaştırma (bayrak)" notu | Görüntüler `docs/mockups/shots` ile görsel tutarlı; yatay taşma 0 |

## 5. Astra denetim listesi (her UI kartında)

1. `npx tsc -b`, `npx vitest run`, üç e2e betiği geçer; **bayrak kapalıyken** görüntüler öncekiyle aynı.
2. Kendi Playwright betiğinle 1440/768/360 görüntü al, `docs/mockups/shots` ile yan yana karşılaştır; göz at, geçti deme.
3. Renk yalnız `var(--…)`; yeni sınıf `gami-` önekli ve `styles-gami.css`'te; mevcut sınıfla yapılabilecek iş için yeni sınıf yok.
4. Anlam → renk: XP mavi, sıralama mor, ödül amber, tamam yeşil; rozetlerde kategori renkleri.
5. Sayılar `tabular-nums`, TR biçim (`toLocaleString('tr-TR')`: ondalık virgül, binlik nokta), tarihler TR.
6. Bilgi yalnız renkle verilmez (ok + metin, kilit ikonu + metin).
7. Değerlendirme simülasyonu sırasında hiçbir oyunlaştırma öğesi yok (çip dahil).
8. "Demo verisi" şeridi her iki ekranda ve Kazanımlar kartında.
9. Ödül metni/koşulları kodda sabit değil (yapılandırma).
10. Klavye: sekmeler ok tuşu, pencereler Esc + odak geri dönüşü; `click-stability` gibi tek tık testi.
11. Paket: `build:scorm` sonrası boyut ve e2e; SCORM `suspend_data` şeması değişmedi.

## 6. Öğrenilmiş tuzaklar (T0'da yaşandı — tekrar etme)

- Tek `viewBox`'u `preserveAspectRatio="none"` ile ölçeklemek dar ekranda metni ezer → ölçülen genişlikte çiz.
- `report-table-v2` tek başına genişlik/kenarlık vermez; `report-table` ile birlikte kullanılmalı.
- `styles.css` 720 px altı `.domain-row` ızgarasını değiştirir; `gami-` geçersiz kılmaları yalnız ≥721 px'te.
- Genel seçiciler (`.x span`) iç öğeleri (madalya) bozar → doğrudan çocuk (`> span`) kullan.
- CSS değişkenlerinde varsayılanı, kategori sınıflarından **sonra** gelen bir kuralda tanımlama (üstüne yazar).
- Maket CSS'i gerçek `styles.css`'i birebir gömdüğü için sınıflar uygulamada aynı davranır; farklılık görürsen
  önce kaskad sırasını (`styles.css` → `styles-v2.css` → `styles-gami.css`) kontrol et.

## 7. Paket bitince (Astra)

1. Commit (yalnız o kartın dosyaları; `git add` ile tek tek).
2. `docs/GAMIFICATION-HANDOFF.md`: durum tablosu + "Paket kayıtları"na 3–6 satır (ne yapıldı, testler, sapmalar).
3. Kullanıcıya Türkçe 2–4 satır: ne bitti, nasıl bakılır (`?gami=1`), sıradaki kart, varsa karar sorusu.
