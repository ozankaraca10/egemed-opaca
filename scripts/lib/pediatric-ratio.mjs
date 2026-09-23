/** Pediatrik vaka katmanı oran sınırı (genel amaçlı; varsayılan %20 önceki tur davranışını korur).
 *  V1 (BRIEF_OPACA_V3): 200 vakalık havuz seçiminde generate-cases.mjs bunu AÇIKÇA `maxRatio=0.15`
 *  ile çağırır (≤%15) — burada varsayılanı değiştirmek mevcut testleri/çağrıları bozar.
 *  Bağımsız test edilebilir olması için scripts/generate-cases.mjs'den ayrıldı. */
export function allowPediatric(pediatricEmitted, totalEmitted, maxRatio = 0.2) {
  if (totalEmitted === 0) return true
  return (pediatricEmitted + 1) / (totalEmitted + 1) <= maxRatio
}
