#!/usr/bin/env node
/** Bağımsız HTML çıktısı üretir (SCORM'sız kullanım için).
 *  dist/ içeriğini release/EGEMED-Ausculta-HTML/ altına kopyalar ve zip üretir.
 *  Çıktı herhangi bir web sunucusunda ya da yerel klasörden çalıştırılabilir;
 *  LMS/SCORM gerekmez (SCORM 1.2 paketi ayrıca `npm run build:scorm` ile üretilir). */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { injectCsp } from './lib/inject-csp.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const RELEASE = path.join(ROOT, 'release')
const OUT_DIR = path.join(RELEASE, 'EGEMED-Ausculta-HTML')

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ boş — önce `npm run build` çalıştırın.')
  process.exit(1)
}

function listFiles(dir, base = '') {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, e.name)
    if (e.isDirectory()) out.push(...listFiles(path.join(dir, e.name), rel))
    else out.push(rel)
  }
  return out
}

fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const files = listFiles(DIST).filter((f) => !f.endsWith('.zip'))
for (const f of files) {
  const dest = path.join(OUT_DIR, f)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(path.join(DIST, f), dest)
}

// D11: SCORM paketiyle aynı CSP meta'sı bağımsız HTML çıktısına da enjekte edilir
const outIndexPath = path.join(OUT_DIR, 'index.html')
if (fs.existsSync(outIndexPath)) {
  const { html, injected } = injectCsp(fs.readFileSync(outIndexPath, 'utf8'))
  if (injected) {
    fs.writeFileSync(outIndexPath, html)
    console.log('CSP meta enjekte edildi')
  }
}

// bağımsız kullanım notu
fs.writeFileSync(
  path.join(OUT_DIR, 'NASIL-CALISTIRILIR.txt'),
  [
    'EGEMED Ausculta — Kardiyopulmoner Oskültasyon Simülatörü (bağımsız HTML çıktı)',
    '',
    'Bu klasörü bir web sunucusunda yayınlayın (ör. okul/intranet sunucusu):',
    '  python3 -m http.server 8080   veya   npx serve .',
    'ya da tüm klasörü bir web alanına yükleyip index.html adresini açın.',
    '',
    'Notlar:',
    '- SCORM/LMS gerekmez; çevrimdışı çalışır, tüm sesler ve görseller klasördedir.',
    '- Sesler tarayıcı politikaları nedeniyle file:// ile değil, HTTP üzerinden en iyi çalışır.',
    '- İlk açılışta "Nasıl Kullanılır?" ekranı görünür; kulaklık önerilir.',
    '- Ses kayıtları: HLS-CMDS v3 (CC BY 4.0) ve CirCor (ODC-BY 1.0); ayrıntı "Kaynaklar" ekranında.',
    '',
    'EGEMED Ausculta © 2026',
  ].join('\n')
)

const zip = new JSZip()
for (const f of listFiles(OUT_DIR)) {
  zip.file(f.replace(/\\/g, '/'), fs.readFileSync(path.join(OUT_DIR, f)))
}
const zipPath = path.join(RELEASE, 'EGEMED-Ausculta-HTML.zip')
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
fs.writeFileSync(zipPath, buf)

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`
const zipMb = mb(buf.length)
console.log(`HTML klasörü: ${OUT_DIR} (${files.length} dosya)`)
console.log(`HTML zip: ${zipPath} (${zipMb})`)
