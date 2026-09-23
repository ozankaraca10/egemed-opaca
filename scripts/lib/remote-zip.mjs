/** Uzak ZIP okuyucu — dosyayı indirmeden HTTP Range ile merkezî dizini okur ve yalnız seçilen
 *  girdileri çeker. Node'un yerleşik `fetch`i kullanılır (yönlendirmeleri Range başlığıyla birlikte
 *  izler — Hugging Face `resolve` → CDN yönlendirmesinde doğrulandı). Büyük ZIP64 alanları
 *  desteklenir ama bu projedeki kaynaklar (≤ 3.8 GB) hiçbirinde zip64 gerekmez; yine de EOCD
 *  bulunamazsa güvenlik için uygulanır.
 *
 *  Kullanım:
 *    const { entries, totalSize } = await readCentralDirectory(url)
 *    const buf = await fetchEntryData(url, entries.find(e => e.name === 'a.png'))
 */
import zlib from 'node:zlib'

const EOCD_SIG = 0x06054b50
const CDIR_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50
const ZIP64_LOCATOR_SIG = 0x07064b50
const ZIP64_EOCD_SIG = 0x06064b50

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** HTTP Range GET; 302 zincirlerinde Range başlığını korur (Node fetch varsayılanı). Yeniden dener.
 *  Her deneme için zaman aşımı uygulanır (varsayılan 25 sn) — bazı sunucular (archive.org gibi)
 *  bağlantıyı yanıt vermeden açık tutabiliyor; timeout olmadan bu tüm indirmeyi süresiz kilitler. */
export async function fetchRange(url, start, end, opts = {}) {
  const retries = opts.retries ?? 5
  const timeoutMs = opts.timeoutMs ?? 25000
  const range = end == null ? `bytes=${start}-` : `bytes=${start}-${end}`
  let lastErr
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { Range: range, ...(opts.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) })
      if (res.status !== 206 && res.status !== 200) {
        throw new Error(`HTTP ${res.status} (${range})`)
      }
      const buf = Buffer.from(await res.arrayBuffer())
      return buf
    } catch (e) {
      lastErr = e
      if (i < retries - 1) await sleep(400 * 2 ** i + Math.random() * 200)
    }
  }
  throw new Error(`${url}: Range indirilemedi (${range}): ${lastErr?.message ?? lastErr}`)
}

/** Toplam dosya boyutu (HEAD; başarısızsa bytes=0-0 Range ile content-range'den). */
export async function remoteSize(url, opts = {}) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: opts.headers ?? {} })
    const len = res.headers.get('content-length')
    if (res.ok && len) return Number(len)
  } catch {
    // devam: Range denemesi
  }
  const res = await fetch(url, { headers: { Range: 'bytes=0-0', ...(opts.headers ?? {}) } })
  const cr = res.headers.get('content-range')
  const m = cr && /\/(\d+)$/.exec(cr)
  if (m) return Number(m[1])
  const len = res.headers.get('content-length')
  if (len) return Number(len)
  throw new Error(`${url}: toplam boyut alınamadı (Range/Accept-Ranges desteklenmiyor olabilir)`)
}

function findEocd(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i
  }
  return -1
}

/** Zip64 uzatılmış alanı (varsa) merkezi dizin girdisinden ayrıştırır. */
function applyZip64Extra(entry, extra) {
  if (!extra || !extra.length) return
  let off = 0
  while (off + 4 <= extra.length) {
    const id = extra.readUInt16LE(off)
    const size = extra.readUInt16LE(off + 2)
    if (id === 0x0001) {
      let p = off + 4
      if (entry.uncompressedSize === 0xffffffff && p + 8 <= off + 4 + size) {
        entry.uncompressedSize = Number(extra.readBigUInt64LE(p))
        p += 8
      }
      if (entry.compressedSize === 0xffffffff && p + 8 <= off + 4 + size) {
        entry.compressedSize = Number(extra.readBigUInt64LE(p))
        p += 8
      }
      if (entry.localHeaderOffset === 0xffffffff && p + 8 <= off + 4 + size) {
        entry.localHeaderOffset = Number(extra.readBigUInt64LE(p))
        p += 8
      }
    }
    off += 4 + size
  }
}

/** Merkezî dizini okur: kuyruktan (varsayılan 1 MB, EOCD bulunamazsa 64 MB'a kadar büyür) EOCD'yi
 *  bulur, gerekirse zip64 EOCD'ye atlar, sonra merkezî dizini tek bir Range isteğiyle çeker. */
export async function readCentralDirectory(url, opts = {}) {
  const totalSize = opts.totalSize ?? (await remoteSize(url, opts))
  let tailBytes = opts.tailBytes ?? 1024 * 1024
  const maxTail = opts.maxTailBytes ?? 64 * 1024 * 1024
  let eocdOff = -1
  let tail
  let tailStart
  for (;;) {
    tailStart = Math.max(0, totalSize - tailBytes)
    tail = await fetchRange(url, tailStart, totalSize - 1, opts)
    eocdOff = findEocd(tail)
    if (eocdOff >= 0 || tailBytes >= maxTail || tailBytes >= totalSize) break
    tailBytes = Math.min(maxTail, tailBytes * 8)
  }
  if (eocdOff < 0) throw new Error(`${url}: EOCD imzası bulunamadı (kuyruk ${tailBytes} bayt tarandı)`)

  let cdirSize = tail.readUInt32LE(eocdOff + 12)
  let cdirOffset = tail.readUInt32LE(eocdOff + 16)
  let totalEntries = tail.readUInt16LE(eocdOff + 10)

  const needsZip64 = cdirOffset === 0xffffffff || cdirSize === 0xffffffff || totalEntries === 0xffff
  if (needsZip64) {
    const locatorOff = eocdOff - 20
    if (locatorOff < 0 || tail.readUInt32LE(locatorOff) !== ZIP64_LOCATOR_SIG) {
      throw new Error(`${url}: zip64 belirtileri var ama EOCD locator bulunamadı`)
    }
    const zip64EocdOffset = Number(tail.readBigUInt64LE(locatorOff + 8))
    const rec = await fetchRange(url, zip64EocdOffset, zip64EocdOffset + 55, opts)
    if (rec.readUInt32LE(0) !== ZIP64_EOCD_SIG) throw new Error(`${url}: zip64 EOCD imzası geçersiz`)
    totalEntries = Number(rec.readBigUInt64LE(32))
    cdirSize = Number(rec.readBigUInt64LE(40))
    cdirOffset = Number(rec.readBigUInt64LE(48))
  }

  // Merkezi dizin kuyruk penceresinin içindeyse tekrar indirme; değilse tam aralığı çek.
  const cdirInTail = cdirOffset >= tailStart && cdirOffset + cdirSize <= totalSize
  const cdirBuf = cdirInTail ? tail.subarray(cdirOffset - tailStart, cdirOffset - tailStart + cdirSize)
    : await fetchRange(url, cdirOffset, cdirOffset + cdirSize - 1, opts)

  const entries = []
  let off = 0
  while (off + 46 <= cdirBuf.length) {
    if (cdirBuf.readUInt32LE(off) !== CDIR_SIG) break
    const method = cdirBuf.readUInt16LE(off + 10)
    const crc32 = cdirBuf.readUInt32LE(off + 16)
    let compressedSize = cdirBuf.readUInt32LE(off + 20)
    let uncompressedSize = cdirBuf.readUInt32LE(off + 24)
    const nameLen = cdirBuf.readUInt16LE(off + 28)
    const extraLen = cdirBuf.readUInt16LE(off + 30)
    const commentLen = cdirBuf.readUInt16LE(off + 32)
    let localHeaderOffset = cdirBuf.readUInt32LE(off + 42)
    const nameStart = off + 46
    const name = cdirBuf.toString('utf8', nameStart, nameStart + nameLen)
    const extra = cdirBuf.subarray(nameStart + nameLen, nameStart + nameLen + extraLen)
    const entry = { name, method, crc32, compressedSize, uncompressedSize, localHeaderOffset, isDir: name.endsWith('/') }
    applyZip64Extra(entry, extra)
    entries.push(entry)
    off = nameStart + nameLen + extraLen + commentLen
  }
  return { entries, totalSize, cdirOffset, cdirSize, totalEntries }
}

/** Tek bir girdinin ham verisini indirir ve açar (deflate/store). */
export async function fetchEntryData(url, entry, opts = {}) {
  if (entry.isDir) return Buffer.alloc(0)
  let headBuf = await fetchRange(url, entry.localHeaderOffset, entry.localHeaderOffset + 512, opts)
  if (headBuf.readUInt32LE(0) !== LOCAL_SIG) throw new Error(`${entry.name}: yerel başlık imzası geçersiz`)
  const nameLen = headBuf.readUInt16LE(26)
  const extraLen = headBuf.readUInt16LE(28)
  const headerLen = 30 + nameLen + extraLen
  if (headerLen > headBuf.length) {
    headBuf = await fetchRange(url, entry.localHeaderOffset, entry.localHeaderOffset + headerLen - 1, opts)
  }
  const dataStart = entry.localHeaderOffset + headerLen
  const dataEnd = dataStart + entry.compressedSize - 1
  const compressed = entry.compressedSize === 0 ? Buffer.alloc(0) : await fetchRange(url, dataStart, dataEnd, opts)
  if (entry.method === 0) return compressed
  if (entry.method === 8) return zlib.inflateRawSync(compressed)
  throw new Error(`${entry.name}: desteklenmeyen sıkıştırma yöntemi ${entry.method}`)
}

/** Birden çok girdiyi sırayla indirir; ilerleme geri çağrısı her girdiden sonra çağrılır. */
export async function fetchEntries(url, entries, opts = {}) {
  const out = new Map()
  let i = 0
  for (const entry of entries) {
    out.set(entry.name, await fetchEntryData(url, entry, opts))
    i++
    opts.onProgress?.(i, entries.length, entry)
  }
  return out
}

/** Sınırlı eşzamanlılıkla eşleme (ağ isteklerini hızlandırır, sunucuyu boğmaz). */
export async function pMap(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() {
    for (;;) {
      const idx = i++
      if (idx >= items.length) return
      out[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** archive.org "/download/…" bazen paylaşımlı yönlendiricide geçici 5xx verebiliyor; kalıcı düğüm
 *  adresini metadata API'sinden çözer (daha güvenilir Range davranışı). */
export async function resolveArchiveOrgUrl(itemId, filename, opts = {}) {
  const res = await fetch(`https://archive.org/metadata/${itemId}`, { headers: opts.headers ?? {} })
  if (!res.ok) throw new Error(`archive.org metadata alınamadı (${itemId}): HTTP ${res.status}`)
  const meta = await res.json()
  if (!meta.server || !meta.dir) throw new Error(`archive.org metadata beklenmedik biçimde (${itemId})`)
  return `https://${meta.server}${meta.dir}/${filename}`
}
