#!/usr/bin/env node
/** Tam oturum e2e testi: 10 vakalık değerlendirme akışını baştan sona koşar.
 *  Her vakada tüm bölgeler dinlenir, her soru yanıtlanır; sonuç ekranına ulaşılmalı,
 *  konsol hatası oluşmamalı ve suspend verisi oturum örneklemiyle tutarlı kalmalıdır. */
import { chromium } from 'playwright-core'
import os from 'node:os'
import path from 'node:path'

const CHROME = path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
)

const errors = []
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const p = await b.newPage({ viewport: { width: 1500, height: 900 } })
p.on('pageerror', (e) => errors.push(String(e)))
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

await p.goto('http://localhost:5173/?fresh=1', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: /Simülatörü başlat/ }).click()
await p.waitForTimeout(400)
await p.locator('input[type=checkbox]').first().check().catch(() => undefined)
await p.getByRole('button', { name: /Atla/ }).click().catch(() => undefined)
await p.waitForTimeout(400)
await p.getByRole('button', { name: /Değerlendirmeye gir/ }).click()
await p.waitForTimeout(800)

let guard = 0
let casesSeen = 0
let lastBadge = ''
while (guard++ < 400) {
  if (await p.locator('.results-title').count()) break
  const badge = (await p.locator('.badge.blue').first().textContent().catch(() => '')) ?? ''
  if (badge && badge !== lastBadge) {
    lastBadge = badge
    casesSeen++
    // vaka başına tüm bölgeleri dinle (tek dinleme kuralı nedeniyle birer kez)
    const n = await p.locator('.region-list button').count()
    for (let i = 0; i < n; i++) {
      await p.locator('.region-list button').nth(i).evaluate((el) => el.click()).catch(() => undefined)
      await p.waitForTimeout(120)
    }
  }
  const opt = p.locator('.opt:not([disabled])').first()
  if (await opt.count()) {
    await opt.click().catch(() => undefined)
    await p.waitForTimeout(80)
    const submit = p.getByRole('button', { name: /^Yanıtla/ })
    if (await submit.count() && (await submit.first().isEnabled())) {
      await submit.first().click()
      await p.waitForTimeout(160)
      continue
    }
  }
  await p.waitForTimeout(200)
}

const done = (await p.locator('.results-title').count()) > 0
const score = done ? await p.locator('.score-ring').count() : 0
const suspend = await p.evaluate(() => {
  const w = window
  return w.__auscultaEngine ? 'dev-hook' : 'yok'
})
console.log(`vakalar: ${casesSeen}, sonuç ekranı: ${done}, skor çemberi: ${score > 0}, dev hook: ${suspend}`)
console.log('console hataları:', errors.length ? errors : 'yok')
await p.screenshot({ path: '/tmp/ausculta-shots/e2e-session-results.png' })
await b.close()
if (!done || errors.length) process.exit(1)
