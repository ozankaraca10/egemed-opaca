/** NLM TB (Montgomery/Shenzhen) okuma metni → bulgu anahtar sözcük eşlemesi.
 *
 *  TEK KAYNAK (BRIEF_OPACA_DISTRACTORS §2): import-nlm-tb.mjs bu haritayı pozitif bulgu çıkarımı için
 *  kullanır (readingText'te anahtar sözcük geçiyorsa expert_reading kaynaklı pozitif bulgu eklenir);
 *  scripts/lib/case-selection.mjs (safeDistractors) AYNI haritayı negatif çıkarım için kullanır — bir
 *  Montgomery filminin readingText'inde bir bulgunun anahtar sözcüğü hiç geçmiyorsa, o bulgu (yalnız bu
 *  haritada listeliyse) çeldirici adayı olarak "güvenli" sayılabilir. İki kullanım da aynı diziden
 *  okuduğundan tutarsızlık riski yok.
 */
export const NLM_READING_FINDING_KEYWORDS = {
  tuberculosis_cavity: /cavit/,
  miliary_pattern: /miliary|milliary/,
  tuberculosis_fibrosis: /fibro|calcifi|scar|granuloma/,
  airspace_opacity: /infiltrat|consolidat/,
  pleural_effusion: /pleura?l?\s*effusion|pleuritis/,
  nodule_mass: /nodul|\bmass(es)?\b/,
  pneumothorax: /pneumothorax/,
  cardiomegaly: /cardiomegaly/,
  atelectasis: /atelectasis/,
  emphysema: /emphysema/,
}

/** readingText'te geçen anahtar sözcüklere göre bulgu listesi döndürür (küçük/büyük harf duyarsız). */
export function findingsFromReadingText(text) {
  if (!text) return []
  const r = String(text).toLowerCase()
  return Object.entries(NLM_READING_FINDING_KEYWORDS)
    .filter(([, re]) => re.test(r))
    .map(([finding]) => finding)
}
