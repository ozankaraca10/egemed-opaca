/** A4: tıklama kararlılığı duman testi.
 *
 *  1) Mod kartları tek tıkla açılmalı: "bas → 300 ms bekle → bırak" 20 kez tekrarlanır,
 *     hepsi TEK tıkta Uygulama moduna geçmelidir (React'in bir zamanlayıcı yüzünden kart/
 *     düğme düğümünü yeniden oluşturup tıklamayı "yutması" ihtimaline karşı regresyon testi).
 *  2) Genel "bas–300 ms bekle–imleci dışarı taşı–bırak" probu: birkaç ekrandaki görünür ana
 *     düğme, basılı tutulduğu 300 ms boyunca DOM'dan kaldırılıp yeniden oluşturulmamalı
 *     (React yeniden render'ı düğüm kimliğini bozarsa `elementHandle` bağlantısı kopar).
 *
 *  `npm run dev` açıkken çalıştırın. CHROMIUM_PATH ile tarayıcı yolu verilebilir.
 */
import { chromium } from 'playwright-core'
import { findChromium, skipFullscreenPrompt } from './lib/e2e-common.mjs'

const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const MODE_CARD_REPEATS = 20
const HOLD_MS = 300
const HOVER_REPEATS = 20

const failures = []

async function openFresh(browser) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  await skipFullscreenPrompt(page)
  page.on('pageerror', (e) => failures.push(`[pageerror] ${e}`))
  await page.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
  return page
}

async function skipTutorialIfShown(page) {
  await page.getByRole('button', { name: /Simülatörü başlat/ }).click()
  await page.waitForTimeout(300)
  const skip = page.getByRole('button', { name: 'Atla' })
  if (await skip.count()) {
    await skip.click()
    await page.waitForTimeout(300)
  }
  await page.getByRole('heading', { name: /Çalışma modunu seçin/ }).waitFor({ timeout: 5000 })
}

/** "bas → HOLD_MS bekle → bırak": tek fiziksel tıklamada hedef ekrana geçildiğini doğrular. */
async function pressHoldRelease(page, locator) {
  await locator.waitFor({ state: 'visible', timeout: 5000 })
  const box = await locator.boundingBox()
  if (!box) throw new Error('düğme görünür değil (boundingBox yok)')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(HOLD_MS)
  await page.mouse.up()
}

async function testModeCardSingleClick(page) {
  await skipTutorialIfShown(page)
  for (let i = 1; i <= MODE_CARD_REPEATS; i++) {
    const card = page.getByRole('button', { name: /Vakaları çöz/ })
    await pressHoldRelease(page, card)
    try {
      await page.waitForSelector('.film-viewer', { timeout: 2000 })
    } catch {
      failures.push(`mod kartı: ${i}. tekrarda tek tıkla Uygulama moduna geçilmedi`)
      // ortamı kurtar: yeniden mod ekranına dön ve devam et
      await page.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
      await skipTutorialIfShown(page)
      continue
    }
    // bir sonraki tekrar için mod seçim ekranına dön
    const modeSwitch = page.getByRole('button', { name: 'Mod değiştir' })
    await modeSwitch.click()
    await page.getByRole('heading', { name: /Çalışma modunu seçin/ }).waitFor({ timeout: 5000 })
  }
}

/** Bir düğmenin basılı tutulduğu 300 ms boyunca DOM'dan kaldırılmadığını (yeniden
 *  oluşturulmadığını) doğrular; ardından imleci dışarı taşıyıp bırakarak tıklamayı iptal eder. */
async function probeNodeStability(page, locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 5000 })
  const handle = await locator.elementHandle()
  if (!handle) {
    failures.push(`${label}: düğme bulunamadı`)
    return
  }
  const box = await handle.boundingBox()
  if (!box) {
    failures.push(`${label}: boundingBox alınamadı`)
    return
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(HOLD_MS)
  const stillConnected = await handle.evaluate((el) => el.isConnected).catch(() => false)
  // imleci dışarı taşı, sonra bırak — böylece tıklama tetiklenmez (ekran değişmez)
  await page.mouse.move(10, 10)
  await page.mouse.up()
  if (!stillConnected) failures.push(`${label}: düğüm 300 ms içinde DOM'dan kaldırıldı (yeniden render kimliği bozdu)`)
}

async function testGeneralStability(page) {
  // Landing
  await page.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
  await probeNodeStability(page, page.getByRole('button', { name: /Simülatörü başlat/ }), 'start: Simülatörü başlat')

  // Öğretici
  await page.getByRole('button', { name: /Simülatörü başlat/ }).click()
  await page.waitForTimeout(300)
  const skip = page.getByRole('button', { name: 'Atla' })
  if (await skip.count()) {
    await probeNodeStability(page, skip, 'tutorial: Atla')
    await skip.click()
    await page.waitForTimeout(300)
  }

  // Mod seçimi
  await page.getByRole('heading', { name: /Çalışma modunu seçin/ }).waitFor({ timeout: 5000 })
  await probeNodeStability(page, page.getByRole('button', { name: /Vakaları çöz/ }), 'modes: Vakaları çöz')

  // Uygulama (soru kartı — seçenek düğmesi + Yanıtla)
  await page.getByRole('button', { name: /Vakaları çöz/ }).click()
  await page.waitForSelector('.film-viewer', { timeout: 5000 })
  await page.waitForTimeout(500)
  const opt = page.locator('.opt-list .opt').first()
  if (await opt.count()) {
    await probeNodeStability(page, opt, 'simulation: seçenek')
    await opt.click()
  } else {
    // lokalizasyon sorusu: filmde bir noktaya tıkla, sonra Yanıtla düğmesini test et
    const stage = await page.locator('.film-stage').boundingBox()
    if (stage) await page.mouse.click(stage.x + stage.width * 0.5, stage.y + stage.height * 0.5)
  }
  await probeNodeStability(page, page.getByRole('button', { name: /Yanıtla/ }), 'simulation: Yanıtla')

  // Kaynaklar
  await page.getByRole('button', { name: 'Hakkında' }).click()
  await page.waitForTimeout(400)
  const back = page.getByRole('button', { name: /Geri/ })
  if (await back.count()) await probeNodeStability(page, back, 'sources: Geri')
}

/** V4: "bas → HOLD_MS bekle → bırak" bir fiziksel tıklamayı simüle eder; bu ise gerçek bir kullanıcının
 *  düğmeye gelip DURAKLADIKTAN sonra tıklamasını simüle eder (hover → 250 ms bekle → tıkla). Playwright'ın
 *  `hover()` + `click()` kombinasyonu, her adımda "receives events" (başka bir eleman tıklamayı yutuyor mu)
 *  dahil tam actionability denetimi yapar — popover/z-index/pointer-events sorunları burada zaman aşımıyla
 *  yakalanır. */
const HOVER_MS = 250
async function hoverThenClick(page, locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 5000 })
  await locator.hover({ timeout: 5000 })
  await page.waitForTimeout(HOVER_MS)
  try {
    await locator.click({ timeout: 3000 })
  } catch (e) {
    failures.push(`${label}: hover (${HOVER_MS} ms) sonrası tıklama başarısız — ${e.message.split('\n')[0]}`)
  }
}

/** V4 kabul kriteri: sağ sütun kartındaki düğmeler — hover(250ms)+tıkla, 20 tekrar, uygulama ekranında. */
async function testHoverClickPractice(page) {
  await page.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
  await skipTutorialIfShown(page)
  await page.getByRole('button', { name: /Vakaları çöz/ }).click()
  await page.waitForSelector('.film-viewer', { timeout: 5000 })
  await page.waitForTimeout(400)

  // 1) "Oturumu yeniden başlat" — vaka/soru değişmez (caseIndex zaten 0), tekrar tekrar güvenle test edilebilir
  for (let i = 1; i <= HOVER_REPEATS; i++) {
    await hoverThenClick(page, page.getByRole('button', { name: 'Oturumu yeniden başlat' }), `uygulama/Oturumu yeniden başlat #${i}`)
    if (!(await page.locator('.film-viewer').count())) failures.push(`uygulama/Oturumu yeniden başlat #${i}: film-viewer kayboldu`)
  }

  // 2) "Görüntü kaynağı" (popover) — her tıklama popover'ı açar/kapatır; durumun gerçekten değiştiğini doğrular
  for (let i = 1; i <= HOVER_REPEATS; i++) {
    const before = await page.locator('.popover').count()
    await hoverThenClick(page, page.getByRole('button', { name: /Görüntü kaynağı/ }), `uygulama/Görüntü kaynağı #${i}`)
    const after = await page.locator('.popover').count()
    if (after === before) failures.push(`uygulama/Görüntü kaynağı #${i}: tıklama popover durumunu değiştirmedi (yutulmuş olabilir)`)
  }
  // popover açık kaldıysa sonraki bloğu kirletmesin diye kapat
  if (await page.locator('.popover').count()) await page.getByRole('button', { name: /Görüntü kaynağı/ }).click().catch(() => {})
  await page.waitForTimeout(150)

  // 3) "Yeni 10 vaka örneklemi" — her tıklama oturumu yeniden örnekler (vaka değişir); film-viewer'ın
  //    kararlı biçimde geri geldiğini doğrular
  for (let i = 1; i <= HOVER_REPEATS; i++) {
    await hoverThenClick(page, page.getByRole('button', { name: 'Yeni 10 vaka örneklemi' }), `uygulama/Yeni 10 vaka örneklemi #${i}`)
    try {
      await page.waitForSelector('.film-viewer', { timeout: 3000 })
    } catch {
      failures.push(`uygulama/Yeni 10 vaka örneklemi #${i}: örneklem sonrası film-viewer görünmedi`)
    }
    await page.waitForTimeout(80)
  }
}

/** V4 kabul kriteri: değerlendirme ekranında ayrı — burada sağ sütunda yalnız "Yanıtla" düğmesi var
 *  (ipucu/popover/örneklem düğmeleri strict modda gizli). Her gerçek tıklama bir sonraki soruya/vakaya
 *  ilerlettiğinden (oturumu tüketmemek için) `trial: true` ile "hover sonrası tıklamayı ALIRDI mı" denetimi
 *  yapılır — bu, Playwright'ın tam actionability zincirini (hover, visible, stable, receives-events) çalıştırır
 *  ama olayı gerçekten dispatch etmez; ardından son turda gerçek bir tıklamayla işlevin de çalıştığı doğrulanır. */
async function testHoverClickAssessment(page) {
  await page.goto(`${BASE}?fresh=1`, { waitUntil: 'networkidle' })
  await skipTutorialIfShown(page)
  const assessCard = page.getByRole('button', { name: /Değerlendirmeye gir/ })
  if (!(await assessCard.count()) || (await assessCard.isDisabled())) {
    console.warn('değerlendirme: havuz boş, hover-click testi atlandı')
    return
  }
  await assessCard.click()
  await page.waitForSelector('.film-viewer', { timeout: 5000 })
  await page.waitForTimeout(400)

  for (let i = 1; i <= HOVER_REPEATS; i++) {
    // Yanıtla yalnız bir yanıt seçiliyken etkinleşir (disabled buton "receives events" denetiminde
    // hep zaman aşımına uğrar — bu app davranışı, tıklama hatası değil); trial denetiminden ÖNCE seç.
    const opt = page.locator('.opt-list .opt').first()
    if (await opt.count()) await opt.click().catch(() => {})
    else {
      const stage = await page.locator('.film-stage').boundingBox()
      if (stage) await page.mouse.click(stage.x + stage.width * 0.5, stage.y + stage.height * 0.5)
    }
    const btn = page.getByRole('button', { name: /Yanıtla/ })
    await btn.waitFor({ state: 'visible', timeout: 5000 })
    await btn.hover({ timeout: 5000 })
    await page.waitForTimeout(HOVER_MS)
    try {
      await btn.click({ trial: true, timeout: 3000 })
    } catch (e) {
      failures.push(`değerlendirme/Yanıtla #${i}: hover sonrası tıklama alınamazdı (trial) — ${e.message.split('\n')[0]}`)
    }
  }
  // son turda gerçek tıklamanın da işlevsel olduğunu doğrula (sonuç: ilerleme ya da vaka/soru değişimi)
  const before = await page.locator('.q-progress').textContent().catch(() => null)
  await page.getByRole('button', { name: /Yanıtla/ }).click({ timeout: 3000 }).catch((e) => failures.push(`değerlendirme/Yanıtla son gerçek tıklama başarısız — ${e.message.split('\n')[0]}`))
  await page.waitForTimeout(300)
  const after = await page.locator('.q-progress').textContent().catch(() => null)
  if (before !== null && after !== null && before === after) failures.push('değerlendirme/Yanıtla: gerçek tıklama sonrası ilerleme değişmedi')
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true })
  try {
    const p1 = await openFresh(browser)
    await testModeCardSingleClick(p1)

    const p2 = await openFresh(browser)
    await testGeneralStability(p2)

    const p3 = await openFresh(browser)
    await testHoverClickPractice(p3)

    const p4 = await openFresh(browser)
    await testHoverClickAssessment(p4)
  } finally {
    await browser.close()
  }

  if (failures.length) {
    console.error('Tıklama kararlılığı hataları:\n' + failures.join('\n'))
    process.exit(1)
  }
  console.log(`Tıklama kararlılığı: mod kartı ${MODE_CARD_REPEATS}/${MODE_CARD_REPEATS} tek tıkla açıldı; genel düğme probları geçti; hover(250ms)+tıkla ${HOVER_REPEATS}× (uygulama: 3 düğme, değerlendirme: Yanıtla) geçti.`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
