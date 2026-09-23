#!/usr/bin/env node
/** Oyunlaştırma ekran görüntüleri (K-D1): 6 durum × 1440/768/360, yatay taşma ve sayfa hatası denetimi.
 *  Önce: npx vite --port 5173 --strictPort   Sonra: node scripts/e2e-gami-screens.mjs
 *  Çıktı: $SHOTS_DIR ya da /tmp/opaca-gami-shots. Referans: docs/mockups/shots (onaylı T0). */
import fs from 'node:fs'
const PW = process.env.PLAYWRIGHT_PATH ?? '/Users/ozankaraca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { chromium } = await import(PW)
const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = process.env.SHOTS_DIR ?? '/tmp/opaca-gami-shots'
fs.mkdirSync(OUT, { recursive: true })

const STATES = [
  ['achievements', 'full', async (p) => {}],
  ['achievements-empty', 'empty', async (p) => {}],
  ['badge-detail', 'full', async (p) => { await p.locator('#gami-badges .gami-badge.is-progress').first().click(); await p.waitForTimeout(200) }],
  ['leaderboard-month', 'full', async (p) => { await p.getByRole('tab', { name: /Liderlik Tahtası/ }).click(); await p.waitForTimeout(400); await p.getByRole('tab', { name: 'Bu ay' }).click(); await p.waitForTimeout(500) }],
  ['leaderboard-week', 'full', async (p) => { await p.getByRole('tab', { name: /Liderlik Tahtası/ }).click(); await p.waitForTimeout(600) }],
  ['winner', 'winner', async (p) => {}],
]
const failures = []
const b = await chromium.launch()
for (const [name, demo, act] of STATES) {
  for (const width of [1440, 768, 360]) {
    const p = await b.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    p.on('pageerror', (e) => failures.push(`${name}@${width}: ${e.message}`))
    await p.addInitScript(() => { try { localStorage.setItem('opaca.fsPromptDone', '1') } catch {} })
    await p.goto(`${BASE}?fresh=1&gami=1&demo=${demo}`, { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: 'Başarılarım' }).click()
    await p.waitForTimeout(700)
    await act(p)
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (overflow > 0) failures.push(`${name}@${width}: yatay taşma ${overflow}px`)
    await p.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: name !== 'badge-detail' })
    await p.close()
  }
}
await b.close()
console.log(`Oyunlaştırma görüntüleri: ${STATES.length * 3} → ${OUT}`)
if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
