#!/usr/bin/env node
/** T0 maket ekran görüntüleri → docs/mockups/shots/*.png  (node scripts/shoot-gami-mockup.mjs) */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
const PW = process.env.PLAYWRIGHT_PATH ?? '/Users/ozankaraca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { chromium } = await import(PW)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(ROOT, 'docs/mockups/shots')
fs.mkdirSync(out, { recursive: true })
const url = pathToFileURL(path.join(ROOT, 'docs/mockups/gami.html')).href + '?shot=1'
const shots = [
  ['achievements', 1440], ['achievements', 768], ['achievements', 360],
  ['achievements-empty', 1440], ['badge-detail', 1440],
  ['leaderboard', 1440], ['leaderboard', 768], ['leaderboard-week', 360],
  ['results', 1440], ['results', 360],
]
const b = await chromium.launch()
const errors = []
for (const [state, w] of shots) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' })
  p.on('pageerror', (e) => errors.push(`${state}: ${e.message}`))
  await p.goto(`${url}#${state}`)
  await p.waitForTimeout(250)
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 0) errors.push(`${state}@${w}: yatay taşma ${overflow}px`)
  await p.screenshot({ path: path.join(out, `${state}-${w}.png`), fullPage: state !== 'badge-detail' })
  await p.close()
}
await b.close()
console.log(`${shots.length} görüntü → docs/mockups/shots`)
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
