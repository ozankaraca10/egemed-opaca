# NIH ChestX-ray14 — geliştirme örneği

İki görüntü ve `Data_Entry_2017_v2020.csv` dosyasının bu iki görüntüye ait satırları, NIH ChestX-ray14 veri setinden
alınmıştır (512×512'ye küçültülmüş kopyalar; torchxrayvision test varlıkları üzerinden, Apache-2.0 depo).

- Veri sağlayıcı: NIH Clinical Center — https://nihcc.app.box.com/v/ChestXray-NIHCC
- Kullanım: kısıtlama yok; atıf koşullu.
- Atıf: Wang X, Peng Y, Lu L, Lu Z, Bagheri M, Summers RM. ChestX-ray8: Hospital-scale Chest X-ray Database and
  Benchmarks on Weakly-Supervised Classification and Localization of Common Thorax Diseases. IEEE CVPR 2017, s. 3462–3471.

Bu görüntülerin etiketleri yalnız rapor tabanlıdır (NLP); `npm run import:sample` onları yalnız öğrenme ve
uygulama için içe aktarır. Değerlendirme havuzu için radyolog etiketli veri (`import:nih`, `import:rsna`) gerekir.
