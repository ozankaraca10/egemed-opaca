# EGEMED Ausculta

**Kardiyopulmoner Oskültasyon Simülatörü** — SCORM 1.2 uyumlu, çevrimdışı çalışan tıp fakültesi eğitim modülü.

- Gerçek klinik sesler: HLS-CMDS v3 (klinik manikin, dijital stetoskop) — DOI `10.17632/8972jxbpmp.3`, CC BY 4.0
  + CirCor DigiScope (gerçek pediatrik hasta kayıtları, ODC-BY 1.0)
- Gerçekçi hasta gövdesi: CC0 anterior/posterior fotoğraf (yalnız gövde bölgesi kırpılmış); pediatrik gövde şematik SVG'dir
- Üç mod: Öğrenme · Uygulama · Değerlendirme — SCORM 1.2 (tek hedef; SCORM 2004 kapsam dışı)
- Sürüklenebilir sanal stetoskop, Bell/Diyafram seçimi, ön/arka görünüm (etiketli posterior noktalar), konum-duyarlı ses
- Veri setinin sınırlarına kadar genişletilen vaka havuzu (`scripts/generate-cases.mjs` ile üretilir); her
  oturumda havuzdan rastgele 10 vaka örneklenir (deterministik tohum, SCORM devam ettirmede korunur)
- 17 oskültasyon noktası, alan bazlı deterministik skor (eşik 80/100), uygulamada ipucu cezası (−5/adet)
- Veri seti ↔ kütüphane ↔ uygulama ↔ değerlendirme **tam senkron** (otomatik denetimli)
- İzleme modunda her ses için klinik **metafor** (ör. ince raller = "karda yürüme sesi")
- **Veri seti envanteri**: yalnız fiilen kullanılan veri setleri listelenir (HLS-CMDS v3, CirCor); ikisinin de
  lisansı doğrulanmıştır. Kadın gövde/cinsiyet seçici yoktur (gövde erkek; pediatrik vakalarda çocuk gövdesi).
- 16:9 uyumlu kaydırmasız yerleşim, tam ekran düğmesi, mobil/tablet responsive
- Kayıtlar ortak RMS düzeyine normalize edilir (medyan ≈ 20× daha yüksek çıkış) + güvenlik limiter'ı

## Hızlı başlangıç

```bash
npm install
npm run import:hls-cmds   # birincil ses veri setini içe aktarır (yol: /tmp/egemed-ausculta/hls-cmds veya SOUNDS_DIR)
node scripts/generate-cases.mjs  # ses veri setinden otomatik vaka havuzunu üretir (cases-auto.json)
npm run validate          # ses + vaka doğrulaması (fatal hata → build durur)
npm run dev               # http://localhost:5173 (SCORM yoksa bağımsız/mock mod)
npm test                  # vitest — SCORM, suspend, skor, şema, eşleme testleri
npm run build:html        # release/EGEMED-Ausculta-HTML(.zip) — bağımsız, LMS/SCORM gerekmez
npm run build:scorm       # dist/EGEMED-Ausculta-SCORM12.zip
```

Veri seti arşivleri yoksa: `./scripts/download-hls-cmds.sh` ile indirin (public kaynak).
Ayrıntılı mimari ve içerik rehberi: [`docs/AUSCULTA.md`](docs/AUSCULTA.md)
