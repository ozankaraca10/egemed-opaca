/** Üretim çıktısına (SCORM ve bağımsız HTML) ortak CSP meta enjeksiyonu (§D11).
 *  Dev sunucusunda HMR bozulmaması için yalnız paketleme script'lerinde kullanılır. */

export const CSP_META =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'\">"

/** index.html içeriğine CSP meta'sını <head> hemen sonrasına ekler (zaten varsa dokunmaz). */
export function injectCsp(html) {
  if (/Content-Security-Policy/.test(html)) return { html, injected: false }
  return { html: html.replace(/<head([^>]*)>/i, `<head$1>\n    ${CSP_META}`), injected: true }
}
