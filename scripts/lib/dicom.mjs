/** Minimal DICOM okuyucu — yalnız akciğer grafisi içe aktarımı için gereken alanlar.
 *  Desteklenen: Part 10 dosyası; açık (explicit) ve örtük (implicit) VR little endian;
 *  sıkıştırmasız piksel verisi (8/16 bit, MONOCHROME1/2) ve kapsüllü JPEG (baseline/extended).
 *  Sıkıştırmalı veri çözülmez; JPEG parça baytları döndürülür, çözümü sharp yapar. */

const TS_IMPLICIT_LE = '1.2.840.10008.1.2'
const TS_EXPLICIT_LE = '1.2.840.10008.1.2.1'
const TS_JPEG = new Set(['1.2.840.10008.1.2.4.50', '1.2.840.10008.1.2.4.51'])
const LONG_VR = new Set(['OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT', 'OV'])

const TAGS = {
  '00020010': 'TransferSyntaxUID',
  '00100010': 'PatientName',
  '00101010': 'PatientAge',
  '00100040': 'PatientSex',
  '00185101': 'ViewPosition',
  '00280002': 'SamplesPerPixel',
  '00280004': 'PhotometricInterpretation',
  '00280010': 'Rows',
  '00280011': 'Columns',
  '00280100': 'BitsAllocated',
  '00280101': 'BitsStored',
  '00280103': 'PixelRepresentation',
  '00281050': 'WindowCenter',
  '00281051': 'WindowWidth',
  '00281052': 'RescaleIntercept',
  '00281053': 'RescaleSlope',
}

const hex = (g, e) => g.toString(16).padStart(4, '0') + e.toString(16).padStart(4, '0')
const str = (buf) => buf.toString('latin1').replace(/[\0 ]+$/, '').trim()

export function parseDicom(buf) {
  if (buf.length < 132 || buf.toString('latin1', 128, 132) !== 'DICM') throw new Error('DICOM Part 10 başlığı yok (DICM)')
  const out = { pixel: null }
  let off = 132
  let ts = TS_EXPLICIT_LE
  let explicit = true
  let metaEnd = Infinity
  while (off + 8 <= buf.length) {
    if (off >= metaEnd) {
      explicit = ts !== TS_IMPLICIT_LE
      metaEnd = Infinity
    }
    const group = buf.readUInt16LE(off)
    const elem = buf.readUInt16LE(off + 2)
    const inMeta = group === 0x0002
    const isExplicit = inMeta ? true : explicit
    let vr = ''
    let len
    let hdr
    if (group === 0xfffe) {
      // item / delimiter (örtük uzunluklu dizilerde)
      len = buf.readUInt32LE(off + 4)
      hdr = 8
      off += hdr + (elem === 0xe000 && len !== 0xffffffff ? len : 0)
      continue
    }
    if (isExplicit) {
      vr = buf.toString('latin1', off + 4, off + 6)
      if (LONG_VR.has(vr)) {
        len = buf.readUInt32LE(off + 8)
        hdr = 12
      } else {
        len = buf.readUInt16LE(off + 6)
        hdr = 8
      }
    } else {
      len = buf.readUInt32LE(off + 4)
      hdr = 8
    }
    const tag = hex(group, elem)
    const start = off + hdr
    if (tag === '7fe00010') {
      if (len === 0xffffffff) out.pixel = { encapsulated: true, fragments: readFragments(buf, start) }
      else out.pixel = { encapsulated: false, data: buf.subarray(start, start + len) }
      break
    }
    if (len === 0xffffffff) {
      // tanımsız uzunluklu dizi: içine gir (öğeler ayrı ayrı atlanır)
      off = start
      continue
    }
    const name = TAGS[tag]
    if (name) {
      const v = buf.subarray(start, start + len)
      if (['Rows', 'Columns', 'BitsAllocated', 'BitsStored', 'PixelRepresentation', 'SamplesPerPixel'].includes(name)) out[name] = v.readUInt16LE(0)
      else out[name] = str(v)
      if (name === 'TransferSyntaxUID') ts = out[name]
    }
    if (tag === '00020000') metaEnd = start + len + buf.readUInt32LE(start)
    off = start + len
  }
  out.TransferSyntaxUID = ts
  out.isJpeg = TS_JPEG.has(ts)
  out.supported = ts === TS_IMPLICIT_LE || ts === TS_EXPLICIT_LE || out.isJpeg
  return out
}

function readFragments(buf, off) {
  const frags = []
  let first = true
  while (off + 8 <= buf.length) {
    const g = buf.readUInt16LE(off)
    const e = buf.readUInt16LE(off + 2)
    const len = buf.readUInt32LE(off + 4)
    off += 8
    if (g !== 0xfffe) break
    if (e === 0xe0dd) break
    if (e === 0xe000) {
      if (!first) frags.push(buf.subarray(off, off + len))
      first = false
      off += len
    }
  }
  return frags
}

/** DICOM yaş dizesi ("043Y", "006M") → yıl */
export function dicomAgeYears(v) {
  if (!v) return null
  const m = /^(\d{1,3})([DWMY])?$/.exec(v.trim())
  if (!m) return null
  const n = Number(m[1])
  switch (m[2] ?? 'Y') {
    case 'D':
      return Math.floor(n / 365)
    case 'W':
      return Math.floor(n / 52)
    case 'M':
      return Math.floor(n / 12)
    default:
      return n
  }
}

/** Sıkıştırmasız piksel verisini 8 bit gri tonlamalı Buffer'a çevirir (MONOCHROME1 ters çevrilir). */
export function toGray8(d) {
  const rows = d.Rows
  const cols = d.Columns
  const n = rows * cols
  const bits = d.BitsAllocated ?? 8
  const src = d.pixel.data
  const out = Buffer.alloc(n)
  if (bits === 8) src.copy(out, 0, 0, n)
  else if (bits === 16) {
    const signed = d.PixelRepresentation === 1
    let min = Infinity
    let max = -Infinity
    const vals = new Float64Array(n)
    const slope = Number(d.RescaleSlope ?? 1) || 1
    const icpt = Number(d.RescaleIntercept ?? 0) || 0
    for (let i = 0; i < n; i++) {
      const raw = signed ? src.readInt16LE(i * 2) : src.readUInt16LE(i * 2)
      const v = raw * slope + icpt
      vals[i] = v
      if (v < min) min = v
      if (v > max) max = v
    }
    let lo = min
    let hi = max
    const wc = Number(String(d.WindowCenter ?? '').split('\\')[0])
    const ww = Number(String(d.WindowWidth ?? '').split('\\')[0])
    if (Number.isFinite(wc) && Number.isFinite(ww) && ww > 1) {
      lo = wc - ww / 2
      hi = wc + ww / 2
    }
    const span = hi - lo || 1
    for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round(((vals[i] - lo) / span) * 255)))
  } else throw new Error(`Desteklenmeyen BitsAllocated: ${bits}`)
  if (d.PhotometricInterpretation === 'MONOCHROME1') for (let i = 0; i < n; i++) out[i] = 255 - out[i]
  return out
}

/** Test yardımcısı: sıkıştırmasız 8 bit, açık VR little endian küçük DICOM üretir. */
export function writeTestDicom({ rows, cols, pixels, age = '045Y', sex = 'F', view = 'PA', photometric = 'MONOCHROME2' }) {
  const el = (g, e, vr, value) => {
    let v = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'latin1')
    if (v.length % 2) v = Buffer.concat([v, Buffer.from(vr === 'UI' ? [0] : [0x20])])
    const long = LONG_VR.has(vr)
    const h = Buffer.alloc(long ? 12 : 8)
    h.writeUInt16LE(g, 0)
    h.writeUInt16LE(e, 2)
    h.write(vr, 4, 'latin1')
    if (long) h.writeUInt32LE(v.length, 8)
    else h.writeUInt16LE(v.length, 6)
    return Buffer.concat([h, v])
  }
  const us = (n) => {
    const b = Buffer.alloc(2)
    b.writeUInt16LE(n)
    return b
  }
  const metaBody = el(0x0002, 0x0010, 'UI', TS_EXPLICIT_LE)
  const glen = Buffer.alloc(4)
  glen.writeUInt32LE(metaBody.length)
  const meta = Buffer.concat([el(0x0002, 0x0000, 'UL', glen), metaBody])
  const body = Buffer.concat([
    el(0x0010, 0x0040, 'CS', sex),
    el(0x0010, 0x1010, 'AS', age),
    el(0x0018, 0x5101, 'CS', view),
    el(0x0028, 0x0002, 'US', us(1)),
    el(0x0028, 0x0004, 'CS', photometric),
    el(0x0028, 0x0010, 'US', us(rows)),
    el(0x0028, 0x0011, 'US', us(cols)),
    el(0x0028, 0x0100, 'US', us(8)),
    el(0x0028, 0x0101, 'US', us(8)),
    el(0x0028, 0x0103, 'US', us(0)),
    el(0x7fe0, 0x0010, 'OB', pixels),
  ])
  return Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), meta, body])
}
