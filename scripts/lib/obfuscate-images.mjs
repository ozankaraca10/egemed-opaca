import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * Yanıt sızıntısı düzeltmesi (Ausculta `obfuscate-audio.mjs` ile aynı yöntem): kaynak görüntü
 * dosya adları bulguyu açık ediyordu — ör. `kermany_person12_bacteria_3.webp` (pnömoni),
 * `nlm_montgomery_mcucxr_0104_1.webp` (son hane 1 = TB), `commons_croup_steeple.webp`.
 * Değerlendirmede "görüntüyü yeni sekmede aç" ya da Ağ sekmesi yanıtı gösteriyordu.
 *
 * `vite build` SONRASI, paketlemeden ÖNCE `dist/`i değiştirir:
 *  - `assets/xray/runtime/*` içindeki her dosya içerik sha1'inin ilk 12 hex karakteriyle
 *    `assets/xray/r/<hash><uzantı>` olarak kopyalanır, eski klasör silinir.
 *  - `dist/` altındaki metin dosyalarında (JS bundle dahil) eski yol dizgisi yenisiyle değiştirilir.
 * BT kareleri (`assets/ct/`) yalnız öğrenme modunda kullanıldığı için kapsam dışıdır.
 * `npm run dev` ve `public/` etkilenmez.
 */
export function obfuscateImagesInDist(distDir) {
  const xrayRoot = path.join(distDir, 'assets', 'xray')
  const runtimeRoot = path.join(xrayRoot, 'runtime')
  if (!fs.existsSync(runtimeRoot)) return { renamed: 0, patchedFiles: 0 }

  const opaqueDir = path.join(xrayRoot, 'r')
  fs.mkdirSync(opaqueDir, { recursive: true })

  const map = new Map()
  const usedHashes = new Set()
  for (const e of fs.readdirSync(runtimeRoot, { withFileTypes: true })) {
    if (!e.isFile()) continue
    const abs = path.join(runtimeRoot, e.name)
    const buf = fs.readFileSync(abs)
    const digest = crypto.createHash('sha1').update(buf).digest('hex')
    let len = 12
    while (usedHashes.has(digest.slice(0, len)) && len < 40) len += 4
    const hash = digest.slice(0, len)
    usedHashes.add(hash)
    const relNew = `assets/xray/r/${hash}${path.extname(e.name).toLowerCase()}`
    map.set(`assets/xray/runtime/${e.name}`, relNew)
    fs.copyFileSync(abs, path.join(distDir, relNew))
  }
  fs.rmSync(runtimeRoot, { recursive: true, force: true })

  const textExts = new Set(['.js', '.html', '.css', '.json', '.xml', '.txt'])
  let patchedFiles = 0
  function patchTextFiles(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { patchTextFiles(full); continue }
      if (!textExts.has(path.extname(e.name).toLowerCase())) continue
      const text = fs.readFileSync(full, 'utf8')
      let next = text
      for (const [oldRel, newRel] of map) if (next.includes(oldRel)) next = next.split(oldRel).join(newRel)
      if (next !== text) {
        fs.writeFileSync(full, next)
        patchedFiles++
      }
    }
  }
  patchTextFiles(distDir)

  return { renamed: map.size, patchedFiles }
}
