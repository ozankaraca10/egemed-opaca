/** OPACA v2 içerik doğrulama ekran görüntüleri (yeni konular + film bilgisi paneli).
 *  `npm run dev` açıkken çalıştırılır: `SHOTS_DIR=reports/v2 node scripts/e2e-v2-screens.mjs`
 *  scripts/e2e-screens.mjs'in genel duman testinden ayrı, yalnız v2 ile eklenen öğrenme
 *  konularına (TB, yabancı cisim, lateral, BT, film bilgisi paneli) odaklanır ve G1 (taraf işareti
 *  rozeti/film HUD çakışması) regresyon testini içerir. Konsol hatası varsa çıkış kodu 1. */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { findChromium, skipFullscreenPrompt } from './lib/e2e-common.mjs'

const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const OUT = process.env.SHOTS_DIR || 'reports/v2'
fs.mkdirSync(OUT, { recursive: true })

const errors = []
const snap = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })

async function gotoLearnTopic(page, label, tab) {
  await page.getByRole('button', { name: new RegExp(label) }).first().click()
  await page.waitForTimeout(500)
  if (tab) {
    await page.getByRole('tab', { name: new RegExp(tab) }).click()
    await page.waitForTimeout(400)
  }
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await skipFullscreenPrompt(page)
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[v2] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[v2] ${e}`))

  await page.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Simülatörü başlat/ }).click()
  await page.waitForTimeout(600)
  // öğretici turu: "Modlara geç" yalnız zoom/işaretle/pencere etkileşimleri tamamlanınca aktifleşir
  // (bkz. scripts/e2e-screens.mjs tutorial() — aynı adımlar burada tekrarlanır)
  await page.getByRole('button', { name: 'Yakınlaştır', exact: true }).click()
  await page.locator('.film-select select').selectOption('bone')
  const tutStage = await page.locator('.film-stage').boundingBox()
  await page.mouse.click(tutStage.x + tutStage.width * 0.4, tutStage.y + tutStage.height * 0.45)
  await page.waitForTimeout(1300)
  await page.getByRole('button', { name: /Modlara geç/ }).click()
  await page.waitForTimeout(400)

  // ModeSelectScreen: Öğrenme Modu kartındaki doğrudan giriş butonu
  await page.getByRole('button', { name: /Öğrenmeye başla/ }).click()
  await page.waitForTimeout(900)
  await snap(page, 'v2-01-learn-default')

  // Tüberküloz — yeni "Enfeksiyon" grubu
  await gotoLearnTopic(page, 'Tüberküloz')
  await snap(page, 'v2-02-learn-tuberculosis')

  // Yabancı cisim — pediatrik grup, pediatrik filmler dahil örnekler
  await gotoLearnTopic(page, 'Radyoopak cisim')
  await snap(page, 'v2-03-learn-foreign-body')

  // Lateral grafi anatomisi — genişletilmiş Temel okuma grubu
  await gotoLearnTopic(page, 'Lateral grafi')
  await snap(page, 'v2-04-learn-lateral')

  // Toraks BT'ye giriş — yeni grup
  await gotoLearnTopic(page, 'Aksiyel anatomi')
  await snap(page, 'v2-05-learn-ct')

  // Film bilgisi paneli — kardiyomegali örneği üzerinden "Film bilgisi" sekmesi
  await gotoLearnTopic(page, 'Kardiyomegali', 'Film bilgisi')
  await snap(page, 'v2-06-film-info-panel')

  // G1 regresyon testi: taraf işareti rozeti (.film-corner-badge) yakınlaştırma/bölge HUD'ıyla
  // (.film-hud) görsel olarak çakışmamalı (bkz. reports/v2/v2-06-film-info-panel.png eski hâli —
  // ikisi de sol üstteydi, "R)0%" gibi üst üste biniyordu). getBoundingClientRect kesişimiyle doğrulanır.
  const overlap = await page.evaluate(() => {
    const badge = document.querySelector('.film-corner-badge')
    const hud = document.querySelector('.film-hud')
    if (!badge || !hud) return { skipped: true }
    const b = badge.getBoundingClientRect()
    const h = hud.getBoundingClientRect()
    const intersects = b.left < h.right && b.right > h.left && b.top < h.bottom && b.bottom > h.top
    return { skipped: false, intersects, badge: { ...b.toJSON?.() ?? b }, hud: { ...h.toJSON?.() ?? h } }
  })
  if (overlap.skipped) {
    errors.push('[v2] .film-corner-badge veya .film-hud DOM\'da bulunamadı — G1 regresyon testi çalıştırılamadı')
  } else if (overlap.intersects) {
    errors.push(`[v2] G1 REGRESYON: .film-corner-badge ile .film-hud görsel olarak çakışıyor: ${JSON.stringify(overlap.badge)} vs ${JSON.stringify(overlap.hud)}`)
  } else {
    console.log('G1 regresyon testi geçti: taraf işareti rozeti ile film HUD çakışmıyor')
  }

  // not: bir uygulama vakası ekran görüntüsü mevcut scripts/e2e-screens.mjs çıktısında zaten var
  // (desktop-04-practice, desktop-05-feedback) — v2 verisiyle üretilen cases-auto.json'u da kapsar.

  await browser.close()
  if (errors.length) {
    console.error('Konsol hataları:\n' + errors.join('\n'))
    process.exit(1)
  }
  console.log(`v2 ekran görüntüleri: ${OUT}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
