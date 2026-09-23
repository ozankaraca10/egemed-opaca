/** e2e betikleri arasında paylaşılan yardımcılar (A1). */
import fs from 'node:fs'

/** Yerel/CI ortamında Chromium ikili yolunu bulur (CHROMIUM_PATH öncelikli). */
export function findChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  ].filter(Boolean)
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) throw new Error('Chromium bulunamadı (CHROMIUM_PATH verin)')
  return found
}

/** A1: "Tam ekran önerilir" popup'ı e2e akışlarını (tıklama/screenshot sırasını) bozmasın diye
 *  `opaca.fsPromptDone` bayrağı sayfa yüklenmeden önce yazılır — üretim davranışına dokunmadan
 *  yalnızca test ortamında popup'ı atlar. */
export async function skipFullscreenPrompt(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('opaca.fsPromptDone', '1')
    } catch {
      /* localStorage erişilemez — sessizce yut */
    }
  })
}
