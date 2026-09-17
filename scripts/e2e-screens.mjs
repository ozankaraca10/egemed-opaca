/** Ekran görüntüsü doğrulaması: masaüstü 16:9, tablet, mobil. */
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OUT = '/tmp/ausculta-shots'
fs.mkdirSync(OUT, { recursive: true })

function findChromium() {
  const p = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
  if (fs.existsSync(p)) return p
  throw new Error('chromium bulunamadı')
}

const errors = []

async function shot(browser, name, vp, flow) {
  const page = await browser.newPage({ viewport: vp })
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${name}] ${e}`))
  await page.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await flow(page)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  return page
}

const toModes = async (page) => {
  await page.getByRole('button', { name: /Simülatörü başlat/ }).click()
  await page.waitForTimeout(500)
  await page.locator('input[type=checkbox]').first().check()
  await page.getByRole('button', { name: /Atla/ }).click()
  await page.waitForTimeout(500)
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true })

  // Masaüstü 16:9
  const p1 = await shot(browser, 'desktop-01-start', { width: 1600, height: 900 }, async () => {})
  await p1.getByRole('button', { name: /Simülatörü başlat/ }).click()
  await p1.waitForTimeout(500)
  await p1.screenshot({ path: `${OUT}/desktop-02-tutorial.png` })
  await p1.locator('input[type=checkbox]').first().check()
  await p1.getByRole('button', { name: /Atla/ }).click()
  await p1.waitForTimeout(500)
  await p1.screenshot({ path: `${OUT}/desktop-03-modes.png` })
  await p1.getByRole('button', { name: /Vakaları çöz/ }).click()
  await p1.waitForTimeout(800)
  await p1.screenshot({ path: `${OUT}/desktop-04-practice.png` })
  // stetoskopu apekse sürükle (mitral 0.632, 0.515)
  const stage = await p1.locator('.stage-fit').first().boundingBox()
  const wrap = await p1.locator('.body-wrap').first().boundingBox()
  const chest = await p1.locator('.steth').first().boundingBox()
  if (wrap && chest) {
    const tx = wrap.x + wrap.width * 0.632 - chest.x - chest.width / 2
    const ty = wrap.y + wrap.height * 0.515 - chest.y - chest.height / 2
    await p1.mouse.move(chest.x + chest.width / 2, chest.y + chest.height / 2)
    await p1.mouse.down()
    for (let i = 1; i <= 14; i++) {
      await p1.mouse.move(chest.x + chest.width / 2 + (tx * i) / 14, chest.y + chest.height / 2 + (ty * i) / 14)
      await p1.waitForTimeout(25)
    }
    await p1.mouse.up()
    await p1.waitForTimeout(1600)
    await p1.screenshot({ path: `${OUT}/desktop-05-practice-playing.png` })
  }
  void stage

  // Öğrenme + arka görünüm
  const p2 = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  p2.on('console', (m) => { if (m.type() === 'error') errors.push(`[learn] ${m.text()}`) })
  await p2.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
  await toModes(p2)
  await p2.getByRole('button', { name: /Öğrenmeye başla/ }).click()
  await p2.waitForTimeout(900)
  await p2.screenshot({ path: `${OUT}/desktop-06-learn-heart.png` })
  // akciğer kütüphanesi + arka görünüm
  await p2.getByRole('button', { name: /Wheezing/ }).first().click()
  await p2.waitForTimeout(400)
  await p2.getByRole('button', { name: /^Arka$/ }).first().click()
  await p2.waitForTimeout(700)
  await p2.screenshot({ path: `${OUT}/desktop-07-learn-back.png` })

  // Tablet yatay
  const p3 = await browser.newPage({ viewport: { width: 1024, height: 768 } })
  p3.on('pageerror', (e) => errors.push(`[tablet] ${e}`))
  await p3.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
  await toModes(p3)
  await p3.getByRole('button', { name: /Vakaları çöz/ }).click()
  await p3.waitForTimeout(800)
  await p3.screenshot({ path: `${OUT}/tablet-04-practice.png`, fullPage: true })

  // Mobil
  const p4 = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  p4.on('pageerror', (e) => errors.push(`[mobile] ${e}`))
  await p4.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
  await p4.waitForTimeout(400)
  await p4.screenshot({ path: `${OUT}/mobile-01-start.png` })
  await toModes(p4)
  await p4.screenshot({ path: `${OUT}/mobile-03-modes.png` })
  await p4.getByRole('button', { name: /Vakaları çöz/ }).click()
  await p4.waitForTimeout(800)
  await p4.screenshot({ path: `${OUT}/mobile-04-practice.png`, fullPage: true })

  console.log('console hataları:', errors.length ? errors : 'yok')
  await browser.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
