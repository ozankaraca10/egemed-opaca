# EGEMED Opaca — Denetim bilgilendirmesi

Denetime başlamadan önce `README.md` ve `docs/OPACA.md` okunmalıdır.

## Komutlar
```bash
npm install
npm run import:sample && npm test
npx tsc -b && npm run lint
npm run validate
npm run build:scorm && npm run build:html
npm run dev & npm run e2e
```

## Denetlenmesi gereken değişmezler
1. `report_nlp` kaynaklı hiçbir etiket değerlendirme vakasının ana bulgusu olamaz
   (`src/core/validation.ts`, `scripts/validate-images.mjs`, `tests/core.test.ts › paketlenen veri`).
2. Lokalizasyon puanı yalnız uzman kutusuna göre verilir (`src/core/geometry.ts › markHitsFinding`).
3. Değerlendirmede uzman kutusu, okuma bölgesi katmanı ve ipucu görünmez (`SimulationScreen`, `FilmViewer strict`).
4. Otomatik vakalar klinik öykü, vital bulgu ya da tanı üretmez (`scripts/generate-cases.mjs`).
5. Lisansı doğrulanmamış ya da dağıtılamaz veri setinden gelen kayıt paketlemeyi durdurur (`validate-images.mjs`).
6. Suspend verisi SCORM 1.2 sınırına (4000 karakter) sığar; tamamlanmış LMS durumu ezilmez.

## Ausculta'dan devralınan düzeltme kodları
K1 seçenek karıştırma · K2 ulaşılamaz ağırlık · K3 aktif mod oturum listesi · K4 yeni oturumda sıfırlama ·
O1 tamamlanmış durumu koruma · O2 SCORM etkileşim alanları · O3 çıkış değeri · O6 değerlendirmeden çıkış onayı ve
`?fresh=1` yalnız DEV · O9 uygulama ipucu cezası · D2/D3 odak yönetimi ve ok tuşu gezinmesi · D11 CSP ve XML kaçışı ·
D12 sonlandırma sonrası yazmama.
