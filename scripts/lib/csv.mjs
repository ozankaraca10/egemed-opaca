/** Küçük, bağımlılıksız RFC 4180 CSV ayrıştırıcı (tırnaklı alan, gömülü virgül/satır sonu). */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/** Başlık satırını nesnelere dönüştürür. Aynı adlı/boş başlıklar konuma göre `_<i>` olarak adlandırılır. */
export function csvObjects(text) {
  const rows = parseCsv(text)
  if (!rows.length) return { header: [], records: [] }
  const header = rows[0].map((h, i) => (h.trim() === '' ? `_${i}` : h.trim()))
  const records = rows.slice(1).map((r) => {
    const o = { _cells: r }
    header.forEach((h, i) => {
      if (!(h in o)) o[h] = r[i] ?? ''
    })
    return o
  })
  return { header, records }
}

export function csvEscape(v) {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
