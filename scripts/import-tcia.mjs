#!/usr/bin/env node
/**
 * TCIA LIDC-IDRI toraks BT kesit yığınlarını images.json'a bağlar.
 *
 * Girdi: reports/tcia/manifest.json — scripts/tcia/prepare_ct.py çıktısı (kareler public/assets/ct/ altında,
 * akciğer ve mediasten pencereleri önceden render edilmiş). Bu betik ağa çıkmaz; yalnız manifest'i
 * ImageRecord biçimine çevirip mergeImages ile birleştirir (idempotent, --replace varsayılan).
 *
 * BT kayıtları yalnız ÖĞRENME içindir: generate-cases.mjs modality === 'CT' kayıtlardan vaka üretmez.
 * LIDC nodül işaretlemeleri (≥3 okuyucu uzlaşısı) kontur + kutu olarak taşınır; `characteristics`
 * okuyucunun öznel 1–5 ölçek puanıdır, patoloji doğrulaması YOKTUR (bkz. docs/TCIA-BT.md).
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, REPORTS_DIR, emptyRecord, mergeImages } from './lib/cxr-common.mjs'

const DATASET = 'tcia-lidc-idri'
const MANIFEST = path.join(REPORTS_DIR, 'tcia', 'manifest.json')

if (!fs.existsSync(MANIFEST)) {
  console.error(`Manifest yok: ${path.relative(ROOT, MANIFEST)} — önce scripts/tcia/prepare_ct.py çalıştırın (docs/TCIA-BT.md).`)
  process.exit(1)
}
const raw = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
const entries = Array.isArray(raw) ? raw : raw.records ?? []

const records = []
for (const m of entries) {
  const lung = m.stack?.find((s) => s.window === 'lung')
  if (!lung?.frames?.length) {
    console.warn(`${m.id}: akciğer penceresi karesi yok, atlandı`)
    continue
  }
  const missing = m.stack.flatMap((s) => s.frames).filter((f) => !fs.existsSync(path.join(ROOT, 'public', f)))
  const rec = emptyRecord(`tcia_${m.id}`, DATASET, `${m.license?.patientId ?? ''} ${m.license?.seriesUID ?? ''}`.trim())
  rec.viewPosition = 'CT_AXIAL'
  rec.modality = 'CT'
  rec.population = m.population ?? 'yetiskin'
  rec.width = 512
  rec.height = 512
  rec.stack = m.stack.map((s) => ({ window: s.window, label: s.label, frames: s.frames }))
  rec.runtimeUrl = lung.frames[Math.floor(lung.frames.length / 2)]
  rec.bytes = m.stack.flatMap((s) => s.frames).reduce((n, f) => {
    const p = path.join(ROOT, 'public', f)
    return n + (fs.existsSync(p) ? fs.statSync(p).size : 0)
  }, 0)
  rec.validationStatus = missing.length ? 'missing_asset' : 'validated'
  if (missing.length) rec.issues.push(`${missing.length} kare dosyası eksik`)
  rec.license = m.license
    ? { name: m.license.name, url: m.license.url, author: 'LIDC-IDRI (Armato ve ark.) / TCIA', attribution: m.license.attribution, sourceUrl: m.license.sourceUrl }
    : null

  // Anatomi serisinde bulgu iddiası yok (findings boş); nodül serisinde uzman konturlu bulgu.
  const ann = (m.annotations ?? []).filter((a) => (a.readerCount ?? 0) >= 3)
  for (const a of ann) {
    rec.annotations.push({
      finding: a.finding,
      source: 'expert_bbox',
      x: a.bbox.x,
      y: a.bbox.y,
      w: a.bbox.w,
      h: a.bbox.h,
      window: a.window,
      frameIndex: a.frameIndex,
      polygon: a.polygon,
      centroid: a.centroid,
      readerCount: a.readerCount,
      characteristics: a.characteristics,
    })
  }
  if (ann.length) rec.findings[ann[0].finding] = 'expert_bbox'
  if (m.topic === 'ct_intro') rec.issues.push('anatomi serisi — bulgu iddiası yok')
  records.push(rec)
}

const merged = mergeImages(records, { dataset: DATASET, replace: true })
console.log(
  `TCIA: ${records.length} BT serisi bağlandı (${records.map((r) => `${r.id}: ${r.stack[0].frames.length} kesit, ${r.annotations.length} işaret`).join('; ')}). images.json toplam ${merged.count} kayıt.`,
)
