/** Ekran görüntüsü duman testi: masaüstü ve mobil akışlar. `npm run dev` açıkken çalıştırın.
 *  CHROMIUM_PATH ile tarayıcı yolu verilebilir. Konsol hatası varsa çıkış kodu 1. */
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const OUT = process.env.SHOTS_DIR || '/tmp/opaca-shots'
fs.mkdirSync(OUT, { recursive: true })

function findChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  ].filter(Boolean)
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) throw new Error('Chromium bulunamadı (CHROMIUM_PATH verin)')
  return found
}

const errors = []
const snap = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })

async function open(browser, name, viewport) {
  const page = await browser.newPage({ viewport })
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${name}] ${e}`))
  await page.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  return page
}

async function tutorial(page, prefix) {
  await page.getByRole('button', { name: /Simülatörü başlat/ }).click()
  await page.waitForTimeout(600)
  const plus = page.getByRole('button', { name: 'Yakınlaştır', exact: true })
  await plus.click()
  await page.locator('.film-select select').selectOption('bone')
  const stage = await page.locator('.film-stage').boundingBox()
  await page.mouse.click(stage.x + stage.width * 0.4, stage.y + stage.height * 0.45)
  await page.waitForTimeout(1300)
  await snap(page, `${prefix}-02-tutorial`)
  await page.getByRole('button', { name: /Modlara geç/ }).click()
  await page.waitForTimeout(400)
}

async function answerAll(page, prefix) {
  for (let i = 0; i < 12; i++) {
    const end = page.locator('.case-end-card')
    if (await end.count()) break
    const opt = page.locator('.opt-list .opt').first()
    if (await opt.count()) await opt.click()
    else {
      const stage = await page.locator('.film-stage').boundingBox()
      await page.mouse.click(stage.x + stage.width * 0.5, stage.y + stage.height * 0.5)
    }
    await page.getByRole('button', { name: /Yanıtla/ }).click()
    await page.waitForTimeout(250)
    if (i === 0) await snap(page, `${prefix}-05-feedback`)
    const next = page.getByRole('button', { name: /Devam et|Vakayı tamamla/ })
    if (await next.count()) await next.click()
    await page.waitForTimeout(250)
  }
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true })

  const d = await open(browser, 'desktop', { width: 1600, height: 900 })
  await snap(d, 'desktop-01-start')
  await tutorial(d, 'desktop')
  await snap(d, 'desktop-03-modes')
  await d.getByRole('button', { name: /Vakaları çöz/ }).click()
  await d.waitForTimeout(1400)
  // sistematik okuma: imleci bölgelerde gezdir
  const st = await d.locator('.film-stage').boundingBox()
  const layer = await d.locator('.film-layer').boundingBox()
  for (const [x, y] of [[0.5, 0.15], [0.25, 0.2], [0.75, 0.2], [0.25, 0.6], [0.75, 0.6], [0.55, 0.55], [0.2, 0.72], [0.8, 0.72], [0.04, 0.4]]) {
    await d.mouse.move(layer.x + layer.width * x, layer.y + layer.height * y)
    await d.waitForTimeout(700)
  }
  await d.mouse.move(st.x + 5, st.y + 5)
  await snap(d, 'desktop-04-practice')
  await answerAll(d, 'desktop')
  await snap(d, 'desktop-06-case-end')
  await d.getByRole('button', { name: /Sonraki vaka|Sonuçları gör/ }).click()
  await d.waitForTimeout(500)
  await answerAll(d, 'desktop-b')
  const res = d.getByRole('button', { name: /Sonuçları gör/ })
  if (await res.count()) await res.click()
  await d.waitForTimeout(600)
  await snap(d, 'desktop-07-results')
  await d.getByRole('button', { name: /Öğrenme modunda çalış/ }).click()
  await d.waitForTimeout(900)
  await snap(d, 'desktop-08-learn')
  await d.getByRole('button', { name: /Kardiyomegali/ }).first().click()
  await d.waitForTimeout(600)
  await d.getByRole('tab', { name: /Film bilgisi/ }).click()
  await d.waitForTimeout(900)
  await snap(d, 'desktop-09-learn-film')
  await d.getByRole('button', { name: 'Hakkında' }).click()
  await d.waitForTimeout(500)
  await d.screenshot({ path: `${OUT}/desktop-10-sources.png`, fullPage: true })

  const m = await open(browser, 'mobile', { width: 390, height: 844 })
  await snap(m, 'mobile-01-start')
  await tutorial(m, 'mobile')
  await m.getByRole('button', { name: /Vakaları çöz/ }).click()
  await m.waitForTimeout(1400)
  await snap(m, 'mobile-04-practice')

  await browser.close()
  if (errors.length) {
    console.error('Konsol hataları:\n' + errors.join('\n'))
    process.exit(1)
  }
  console.log(`Ekran görüntüleri: ${OUT}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
