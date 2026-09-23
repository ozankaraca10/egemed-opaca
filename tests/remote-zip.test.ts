import { describe, expect, it, afterAll, beforeAll } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import JSZip from 'jszip'
// @ts-expect-error — JS modülü
import { readCentralDirectory, fetchEntryData, fetchRange, pMap } from '../scripts/lib/remote-zip.mjs'
// @ts-expect-error — JS modülü
import { isAcceptableLicense } from '../scripts/lib/license.mjs'
// @ts-expect-error — JS modülü
import { allowPediatric } from '../scripts/lib/pediatric-ratio.mjs'

/** scripts/lib/remote-zip.mjs birim testi: küçük bir ZIP fikstürünü Range destekli yerel bir
 *  HTTP sunucusundan sunar (gerçek ağ erişimi olmadan). Merkezî dizinin doğru okunduğunu ve
 *  seçilen girdinin (sıkıştırılmış + sıkıştırmasız) doğru şekilde çözüldüğünü doğrular. */
describe('remote-zip: küçük fikstürle Range tabanlı okuma', () => {
  let server: http.Server
  let base: string
  let zipBuf: Buffer

  beforeAll(async () => {
    const zip = new JSZip()
    zip.file('a.txt', 'merhaba dünya — sıkıştırılabilir tekrar tekrar tekrar tekrar metin'.repeat(20), { compression: 'DEFLATE' })
    zip.file('b.txt', 'kısa', { compression: 'STORE' })
    zipBuf = await zip.generateAsync({ type: 'nodebuffer' })

    server = http.createServer((req, res) => {
      const range = req.headers.range
      if (!range) {
        res.writeHead(200, { 'content-length': zipBuf.length, 'accept-ranges': 'bytes' })
        res.end(zipBuf)
        return
      }
      const m = /bytes=(\d+)-(\d+)?/.exec(range)
      const start = Number(m![1])
      const end = m![2] ? Number(m![2]) : zipBuf.length - 1
      const chunk = zipBuf.subarray(start, end + 1)
      res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${zipBuf.length}`, 'content-length': chunk.length, 'accept-ranges': 'bytes' })
      res.end(chunk)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address() as AddressInfo
    base = `http://127.0.0.1:${addr.port}/fixture.zip`
  })

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('merkezî dizini okur ve iki girdiyi listeler', async () => {
    const { entries, totalSize } = await readCentralDirectory(base)
    expect(totalSize).toBe(zipBuf.length)
    expect(entries.map((e: { name: string }) => e.name).sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('sıkıştırılmış (DEFLATE) girdiyi doğru çözer', async () => {
    const { entries } = await readCentralDirectory(base)
    const a = entries.find((e: { name: string }) => e.name === 'a.txt')
    const buf = await fetchEntryData(base, a)
    expect(buf.toString('utf8')).toBe('merhaba dünya — sıkıştırılabilir tekrar tekrar tekrar tekrar metin'.repeat(20))
  })

  it('sıkıştırmasız (STORE) girdiyi doğru döner', async () => {
    const { entries } = await readCentralDirectory(base)
    const b = entries.find((e: { name: string }) => e.name === 'b.txt')
    const buf = await fetchEntryData(base, b)
    expect(buf.toString('utf8')).toBe('kısa')
  })

  it('fetchRange: kısmi içerik doğru dönüyor', async () => {
    const buf = await fetchRange(base, 0, 3)
    expect(buf.length).toBe(4)
    expect(buf.readUInt32LE(0)).toBe(0x04034b50) // ZIP yerel başlık imzası
  })

  it('pMap: eşzamanlılık sınırına uyar, sırayı korur', async () => {
    let active = 0
    let maxActive = 0
    const out = await pMap([1, 2, 3, 4, 5, 6], 2, async (n: number) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
      return n * 2
    })
    expect(out).toEqual([2, 4, 6, 8, 10, 12])
    expect(maxActive).toBeLessThanOrEqual(2)
  })
})

describe('license: Wikimedia Commons lisans filtresi', () => {
  it('CC0/Public domain/CC BY/CC BY-SA kabul edilir', () => {
    for (const ok of ['CC0', 'Public domain', 'CC BY 2.0', 'CC BY-SA 3.0', 'CC BY 4.0', 'CC BY-SA', 'cc by-sa 4.0']) {
      expect(isAcceptableLicense(ok)).toBe(true)
    }
  })
  it('NC/ND ve tanınmayan lisanslar reddedilir', () => {
    for (const bad of ['CC BY-NC 2.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 4.0', 'All rights reserved', '', undefined as unknown as string]) {
      expect(isAcceptableLicense(bad)).toBe(false)
    }
  })
})

describe('pediatrik katman: oran sınırı', () => {
  it('ilk vaka her zaman izinlidir', () => {
    expect(allowPediatric(0, 0)).toBe(true)
  })
  it('oran %20 sınırını aşınca reddeder', () => {
    // 8 yetişkin + 2 pediatrik zaten emitted (2/10 = %20) → bir sonraki pediatrik (3/11) reddedilmeli
    expect(allowPediatric(2, 10)).toBe(false)
    expect(allowPediatric(1, 10)).toBe(true)
  })
  it('yalnız yetişkin vakalar birikirken pediatrik için yer açılır', () => {
    expect(allowPediatric(0, 10)).toBe(true)
  })
  it('V1 (BRIEF_OPACA_V3): 200 vakalık havuzda generate-cases.mjs maxRatio=0.15 ile çağırır', () => {
    // 200 vakalık havuzda ≤%15 pediatrik: 29/199 kabul, 30/199 reddedilmeli (30/200=0.15 sınırda kabul)
    expect(allowPediatric(29, 199, 0.15)).toBe(true)
    expect(allowPediatric(30, 199, 0.15)).toBe(false)
    expect(allowPediatric(1, 10, 0.15)).toBe(false) // %20 kuralında izinliydi, %15'te artık değil
  })
})
