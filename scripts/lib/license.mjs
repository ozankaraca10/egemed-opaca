/** Wikimedia Commons lisans filtresi — yalnız CC0 / Public domain / CC BY( x.x) / CC BY-SA( x.x)
 *  kabul edilir; NC (ticari olmayan) ve ND (türetilemez) lisanslar reddedilir. Bağımsız test edilebilir
 *  olması için scripts/import-commons.mjs'den ayrıldı. */
export const LICENSE_OK = /^(CC0|Public domain|CC[- ]?BY(?:[- ]\d(?:\.\d)?)?|CC[- ]?BY[- ]SA(?:[- ]\d(?:\.\d)?)?)\s*$/i

export function isAcceptableLicense(shortName) {
  if (!shortName) return false
  if (/\bNC\b|\bND\b/i.test(shortName)) return false
  return LICENSE_OK.test(shortName.trim())
}
