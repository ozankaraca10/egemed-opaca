# Oyunlaştırma — devir notu (HANDOFF)

> Bu dosya her paket bitiminde güncellenir. Kesinti olursa buradan devam edilir (Claude, Sonnet ya da Codex).
> Tasarım spesifikasyonu: `docs/GAMIFICATION-TASARIM-PROMPT.md` · Yol haritası: `docs/GAMIFICATION-YOL-HARITASI.md` (**EKSİK**, bkz. Engeller)

Son güncelleme: 2026-09-23 · Güncelleyen: Claude Opus 5.5

## Durum özeti

| Paket | İçerik | Durum |
|---|---|---|
| P0 | Spesifikasyon repoya, devir notu | ✅ bitti |
| P1 | Faz T0 — statik tasarım referansı `docs/mockups/gami.html` + ekran görüntüleri | ✅ bitti, kullanıcı onayı bekliyor |
| — | **Kullanıcı onayı (T0) + yol haritası dosyası** | ⏸ bekleniyor |
| P2 | Yol haritası Faz 1 — saf veri katmanı + testler | ⛔ yol haritası gerekli |
| P3 | K-A1…K-A6 (Başarılarım) | ⛔ P2 + T0 onayı |
| P4 | K-B1…K-B7 (Liderlik + Ayın Ödülü) | ⛔ P2 + T0 onayı |
| P5 | K-C1 (Kazanımlar kartı), K-D1 (e2e görüntüleri) | ⛔ P3/P4 |

## Engeller / açık kararlar

1. `docs/GAMIFICATION-YOL-HARITASI.md` repoda ve bilgisayarda yok (yalnız tasarım promptu `~/Downloads`'taydı).
   §2 değişmezler, §4 veri katmanı (`xp.ts`, `ranking.ts`, `GamificationRepo`), §5 rozet listesi ve
   §7–9 çalışma kuralları bu dosyada. P2 ve sonrası buna bağlı.
2. `docs/mockups/gami-referans-ai.png` yok. T0 yalnız promptun yazılı bilgi mimarisiyle yapıldı.
3. Ödül koşulları `KARAR BEKLİYOR`: uygun kohortlar (örn. Dönem 4–6), aylık asgari değerlendirme sayısı (örn. 4).
4. T0'daki rozet adları/sayısı (28) ve XP değerleri taslak; yol haritası §5 gelince hizalanacak.

## Çalışma kuralları (Codex/Sonnet için)

- Depo: `~/Documents/EGEMED SIM/egemed-opaca` (yolda boşluk var, tırnakla). Git: `/Applications/Xcode.app/Contents/Developer/usr/bin/git`
  (`/usr/bin/git` Xcode lisansı yüzünden çalışmaz). Kimlik: `Ozan Karaca <ozandeu@yahoo.com>`.
- Doğrulama: `npx tsc -b`, `npx vitest run`, `npm run -s e2e` ve `npm run -s e2e:click-stability`
  (önce `npx vite --port 5173 --strictPort` çalışır olmalı), `OPACA_ALLOW_LICENSE_REVIEW=1 npm run build:scorm`.
- Görsel dil yalnız `src/styles.css` tokenlarından; yeni sınıflar `src/styles-gami.css` içinde `gami-` önekiyle.
- Değerlendirme simülasyonu sırasında hiçbir oyunlaştırma öğesi görünmez.
- Her kart sonunda bu dosyanın "Durum özeti" ve "Paket kayıtları" bölümleri güncellenir.

## Paket kayıtları

### P0 — bitti
- `docs/GAMIFICATION-TASARIM-PROMPT.md` (kullanıcının verdiği spesifikasyon, değiştirilmeden)
- `docs/GAMIFICATION-HANDOFF.md` (bu dosya)

### P1 — Faz T0 tasarım referansı (bitti, onay bekliyor)
- Üretim: `node scripts/build-gami-mockup.mjs` → `docs/mockups/gami.html` (tek dosya; `src/styles.css` +
  `src/styles-v2.css` birebir gömülü, `icons.tsx`'ten SVG sprite). Görüntüler: `node scripts/shoot-gami-mockup.mjs`
  → `docs/mockups/shots/*.png` (1440/768/360; yatay taşma kontrolü betikte).
- Durumlar (`gami.html#…`): `achievements`, `achievements-empty`, `badge-detail`, `leaderboard` (Bu ay, ben 12.),
  `leaderboard-week` (360 px, kompakt ödül şeridi), `results` (Kazanımlar kartı).
- Taslak CSS: `docs/mockups/gami-draft.css` → onaydan sonra `src/styles-gami.css` (K-A1) olarak kopyalanır.
- Demo verisi: `docs/mockups/gami-mock-data.mjs` (takma adlar, `rewardStandings()` prototipi — "uygunlar
  arasında ilk 3": Dönem 3'teki 2. kişi etiketsiz, ödül adaylığı 4.'ye kayar).
- Header/footer gerçek uygulamadan yakalandı: `docs/mockups/opaca-dom.json`.
- Tasarım kararları (Sonnet için bağlayıcı):
  - Grafik ölçeklenen tek `viewBox` ile YAPILMAZ: bileşen genişliği ResizeObserver ile ölçülüp o genişlikte
    çizilir (dar ekranda metin 4 px'e düşüyordu). <600 px: 180 px yükseklik, x etiketi her 4 noktada bir.
  - Liderlik tablosu `report-table report-table-v2 gami-lb-table` sınıflarının üçünü birlikte kullanır.
  - `.gami-domains` sütun geçersiz kılması yalnız ≥721 px (styles.css'in mobil domain-row düzeni korunur).
  - Mobilde profil şeridi: seviye kutusu tam genişlik + 2×2; son rozetler yatay kompakt satır.
  - Yeni ikonlar (Flame, Lock, Medal, Award, Star, Gift, ArrowUp) `build-gami-mockup.mjs` içinde; K-A2'de
    `src/ui/icons.tsx`'e aynı `base()` kalıbıyla eklenir.
  - Takma adlar yalnız; "Ece S." gibi gerçek ad izlenimi veren kısaltmalar kullanılmaz.

## Sıradaki adım (Codex/Sonnet için)

1. Kullanıcı T0'ı onaylamadıysa UI kartına başlama; geri bildirimleri `gami-draft.css` / generator'a işle,
   görüntüleri yeniden üret.
2. `docs/GAMIFICATION-YOL-HARITASI.md` gelince P2 (Faz 1 veri katmanı) — `src/gamification/` altında saf
   modüller + vitest; mock üretici `gami-mock-data.mjs` yapısıyla uyumlu olmalı.
3. Sonra tasarım promptu §8 kart sırası (K-A1 → K-D1); her kartta promptun §9 denetim listesi.
