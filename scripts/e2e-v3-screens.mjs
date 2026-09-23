/** BRIEF_OPACA_V3 kabul ekran görüntüleri: landing (amblemsiz), kaynaklar (envanter yok, yeni
 *  credits), hotspot dairesi (yanıt öncesi/sonrası), sağ sütun düğmeleri, ABCDE çipleri (1366/390px).
 *  `npm run dev` açıkken çalıştırın. CHROMIUM_PATH ile tarayıcı yolu verilebilir. */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { findChromium, skipFullscreenPrompt } from './lib/e2e-common.mjs'

const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const OUT = process.env.SHOTS_DIR || 'reports/v3'
fs.mkdirSync(OUT, { recursive: true })
const snap = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })

async function openFresh(browser, viewport) {
  const page = await browser.newPage({ viewport })
  await skipFullscreenPrompt(page)
  await page.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  return page
}

async function skipTutorial(page) {
  await page.getByRole('button', { name: /Simülatörü başlat/ }).click()
  await page.waitForTimeout(300)
  const skip = page.getByRole('button', { name: 'Atla' })
  if (await skip.count()) {
    await skip.click()
    await page.waitForTimeout(300)
  }
}

/** Havuzda bir lokalizasyon sorusuna rastlayana kadar vaka/soru ilerletir; bulunca o soruyu
 *  YANITLAMADAN (öncesi ekran görüntüsü alınabilsin diye) durur. */
async function seekLocalizationQuestion(page, maxCases = 12) {
  for (let c = 0; c < maxCases; c++) {
    for (let q = 0; q < 6; q++) {
      if (await page.locator('.mark-status').count()) return true
      const opt = page.locator('.opt-list .opt').first()
      if (!(await opt.count())) break // bu soru tipi ne seçmeli ne lokalizasyon (beklenmez) — vakayı atla
      await opt.click()
      await page.getByRole('button', { name: /Yanıtla/ }).click()
      await page.waitForTimeout(200)
      const cont = page.getByRole('button', { name: /Devam et|Vakayı tamamla/ })
      if (await cont.count()) {
        await cont.click()
        await page.waitForTimeout(200)
      }
    }
    if (await page.locator('.mark-status').count()) return true
    const end = page.locator('.case-end-card')
    if (await end.count()) {
      const next = page.getByRole('button', { name: /Sonraki vaka/ })
      if (await next.count()) {
        await next.click()
        await page.waitForTimeout(300)
      } else break
    }
  }
  return (await page.locator('.mark-status').count()) > 0
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true })

  // 1) Landing — amblem yok
  {
    const page = await openFresh(browser, { width: 1366, height: 768 })
    await snap(page, 'v3-01-landing-no-emblem')
    await page.close()
  }

  // 2) Kaynaklar — envanter bölümü yok, yeni credits
  {
    const page = await openFresh(browser, { width: 1366, height: 900 })
    await page.getByRole('button', { name: /Hakkında ve kaynaklar/ }).click()
    await page.waitForTimeout(400)
    await snap(page, 'v3-02-kaynaklar-ust-credits')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(200)
    await snap(page, 'v3-03-kaynaklar-alt-envantersiz')
    await page.close()
  }

  // 3) Uygulama: hotspot dairesi — yanıt öncesi/sonrası + sağ sütun düğmeleri
  {
    const page = await openFresh(browser, { width: 1366, height: 900 })
    await skipTutorial(page)
    await page.getByRole('button', { name: /Vakaları çöz/ }).click()
    await page.waitForSelector('.film-viewer', { timeout: 5000 })
    await page.waitForTimeout(500)
    await snap(page, 'v3-06-sag-sutun-dugmeler')

    const found = await seekLocalizationQuestion(page)
    if (found) {
      const stage = await page.locator('.film-stage').boundingBox()
      if (stage) await page.mouse.click(stage.x + stage.width * 0.55, stage.y + stage.height * 0.45)
      await page.waitForTimeout(300)
      await snap(page, 'v3-04-hotspot-daire-yanit-oncesi')
      await page.getByRole('button', { name: /Yanıtla/ }).click()
      await page.waitForTimeout(400)
      await snap(page, 'v3-05-hotspot-daire-yanit-sonrasi')
    } else {
      console.warn('lokalizasyon sorusu bulunamadı (10 vaka denendi)')
    }
    await page.close()
  }

  // 4) ABCDE çipleri — 1366 ve 390px
  for (const [label, width] of [['1366', 1366], ['390', 390]]) {
    const page = await openFresh(browser, { width, height: width === 390 ? 844 : 900 })
    await skipTutorial(page)
    await page.getByRole('button', { name: /Vakaları çöz/ }).click()
    await page.waitForSelector('.film-viewer', { timeout: 5000 })
    await page.waitForTimeout(400)
    // birkaç bölgeye dokun ki bazı çipler "incelendi" (yeşil) rengini alsın
    const stage = await page.locator('.film-stage').boundingBox()
    if (stage) {
      await page.mouse.move(stage.x + stage.width * 0.5, stage.y + stage.height * 0.15)
      await page.waitForTimeout(700)
      await page.mouse.move(stage.x + stage.width * 0.5, stage.y + stage.height * 0.5)
      await page.waitForTimeout(700)
    }
    await snap(page, `v3-07-abcde-chips-${label}`)
    await page.close()
  }

  await browser.close()
  console.log(`V3 ekran görüntüleri: ${OUT}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
