#!/usr/bin/env node
/**
 * Faz T0 — statik tasarım referansı: docs/mockups/gami.html
 *   node scripts/build-gami-mockup.mjs
 * Tek dosya üretir: src/styles.css + src/styles-v2.css BİREBİR gömülür (tokenlar gerçek uygulamayla
 * aynı kalsın diye), üstüne docs/mockups/gami-draft.css (gami-* taslak kuralları). İkonlar
 * src/ui/icons.tsx'ten SVG sprite'a çevrilir; yeni ikonlar (Flame, Lock, Medal, Award, Star, Gift)
 * aynı stroke dilinde burada tanımlanır ve K-A2'de icons.tsx'e taşınır.
 * Durumlar (#hash): achievements · achievements-empty · badge-detail · leaderboard · leaderboard-week · results
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as D from '../docs/mockups/gami-mock-data.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/* ---------- ikon sprite'ı ---------- */
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const jsxToSvg = (s) => s.replace(/\s([a-z]+[A-Z][a-zA-Z]*)=/g, (_, a) => ` ${kebab(a)}=`).replace(/=\{([^}]+)\}/g, '="$1"')
const icons = {}
for (const m of read('src/ui/icons.tsx').matchAll(/export const Icon(\w+) = \((?:p: P)?\) =>\s*\(?\s*<svg \{\.\.\.base\((?:p|\{\})\)\}([^>]*)>([\s\S]*?)<\/svg>/g)) {
  icons[m[1]] = { extra: jsxToSvg(m[2]), inner: jsxToSvg(m[3]) }
}
Object.assign(icons, {
  Flame: { extra: '', inner: '<path d="M12 3c.5 3 3.5 4.5 3.5 8.5a3.5 3.5 0 0 1-7 0c0-1.5.6-2.6 1.5-3.5.2 1.5 1 2.3 2 2.5-.8-2.5-.5-5 0-7.5z"/><path d="M8.2 13.5A6 6 0 1 0 18 10"/>' },
  Lock: { extra: '', inner: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>' },
  Medal: { extra: '', inner: '<circle cx="12" cy="15" r="6"/><path d="M8.5 10 6 3h4l2 5 2-5h4l-2.5 7"/><path d="M12 12.5v5"/>' },
  Award: { extra: '', inner: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>' },
  Star: { extra: '', inner: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>' },
  Gift: { extra: '', inner: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/><path d="M12 8v13"/><path d="M12 8c-1.5-3-5-3.5-5-1.2C7 8 9 8 12 8zM12 8c1.5-3 5-3.5 5-1.2C17 8 15 8 12 8z"/>' },
  ArrowUp: { extra: '', inner: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>' },
})
const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${Object.entries(icons)
  .map(([n, { extra, inner }]) => `<symbol id="i-${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${inner}</symbol>`)
  .join('')}</svg>`
const I = (name, size = 18) => {
  if (!icons[name]) throw new Error(`ikon yok: ${name}`)
  return `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#i-${name}"/></svg>`
}

/* ---------- yardımcılar ---------- */
const tr1 = (n) => n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const trInt = (n) => n.toLocaleString('tr-TR')
const TONES = ['t-blue', 't-purple', 't-green', 't-amber']
const tone = (id) => TONES[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TONES.length]
const initials = (name) => {
  if (!name) return 'AÖ'
  const parts = name.split(/[_\s.-]+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toLocaleUpperCase('tr-TR')
}
const displayName = (r) => (r.public && r.name ? r.name : 'Anonim öğrenci')
const avatar = (r, cls = '') => `<span class="gami-avatar ${r.public && r.name ? tone(r.id) : 't-anon'} ${cls}" aria-hidden="true">${initials(r.public ? r.name : null)}</span>`
const bar = (pct) => `<span class="domain-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>`

/* ---------- ortak kabuk ---------- */
const headerRaw = JSON.parse(fs.readFileSync(process.env.OPACA_DOM ?? path.join(ROOT, 'docs/mockups/opaca-dom.json'), 'utf8')).header
const header = (active) => {
  let h = headerRaw.replace(/<span class="eg-dev-badge"[\s\S]*?<\/span>/, '').replaceAll('src="brand/', 'src="../../public/brand/')
  const chip = `<button class="eg-header-chip clickable gami-chip"${active ? ' aria-current="page"' : ''} aria-label="Başarılarım" title="Başarılarım">${I('Trophy')} <span class="chip-text">Başarılarım</span></button><span class="divider-v"></span>`
  return h.replace(/<button class="eg-header-chip clickable hide-mobile"/, `${chip}<button class="eg-header-chip clickable hide-mobile"`)
}
const footer = JSON.parse(fs.readFileSync(process.env.OPACA_DOM ?? path.join(ROOT, 'docs/mockups/opaca-dom.json'), 'utf8')).footer.replaceAll('src="brand/', 'src="../../public/brand/')
const demo = `<div class="gami-demo" role="note">${I('Info', 16)} Demo verisi — gösterilen kişiler, puanlar ve sıralamalar örnektir; gerçek öğrenci verisi değildir.</div>`
const pageTabs = (which) => `<div class="gami-pagetabs" role="tablist" aria-label="Oyunlaştırma">
  <button role="tab" aria-selected="${which === 'a'}">${I('Award', 16)} Başarılarım</button>
  <button role="tab" aria-selected="${which === 'b'}">${I('Chart', 16)} Liderlik Tahtası</button></div>`

/* ---------- Ekran A — Başarılarım ---------- */
const levelRing = (pct, who) => {
  const c = 2 * Math.PI * 28
  return `<div class="gami-level-ring"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="track" cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="6"/>
  <circle class="prog" cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * pct).toFixed(1)} 999" transform="rotate(-90 32 32)"/></svg>${who}</div>`
}
const profileStrip = () => {
  const m = D.me
  return `<div class="results-summary-strip gami-profile">
  <div class="rs-box"><div class="gami-level">${levelRing(m.levelXp / m.levelXpMax, avatar({ id: m.id, name: m.name, public: true }))}
    <div><b>Seviye ${m.level}</b><small>${trInt(m.levelXp)} / ${trInt(m.levelXpMax)} XP</small></div></div>
    <span class="rs-lbl">Sonraki seviyeye ${trInt(m.levelXpMax - m.levelXp)} XP</span></div>
  <div class="rs-box gami-streak"><div class="rs-num">${I('Flame', 20)} ${m.streakDays} gün</div><span class="gami-sub">En uzun seri ${m.bestStreak} gün</span><span class="rs-lbl">Günlük seri</span></div>
  <div class="rs-box"><div class="rs-num">${m.assessments}</div><span class="gami-sub">+${m.practice} uygulama vakası</span><span class="rs-lbl">Değerlendirme oturumu</span></div>
  <div class="rs-box"><div class="rs-status pass">${I('CheckCircle', 16)} %${m.avgScore}</div><span class="gami-sub">Eşik 80 · son 30 gün</span><span class="rs-lbl">Ortalama başarı</span></div>
  <button class="rs-box gami-rank-box" type="button"><div class="rs-num">${m.weekRank}. <span class="gami-sub">/ ${m.weekOf}</span></div><span class="gami-sub">İlk %15'tesin</span><span class="gami-link">Liderlik Tahtası ${I('ChevronRight', 14)}</span></button>
</div>`
}
/** Gerçek bileşen genişliği ölçerek çizer (ResizeObserver); makette geniş/dar iki çizim medya sorgusuyla seçilir. */
const chart = () => `<div class="gami-chart-wide">${chartSvg(760, 240, 2)}</div><div class="gami-chart-narrow">${chartSvg(320, 180, 4)}</div>${chartExtras()}`
const chartSvg = (W, H, every) => {
  const L = 30, R = 38, T = 16, B = 26
  const s = D.series, n = s.length
  const x = (i) => L + (i * (W - L - R)) / (n - 1)
  const yScore = (v) => T + ((100 - v) / 60) * (H - T - B)
  const xpMax = 1000
  const yXp = (v) => T + (1 - v / xpMax) * (H - T - B)
  const pts = s.map(([, sc], i) => `${x(i).toFixed(1)},${yScore(sc).toFixed(1)}`)
  const area = `M${x(0)},${H - B} L${pts.join(' L')} L${x(n - 1)},${H - B} Z`
  const grid = [40, 60, 80, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${yScore(v)}" y2="${yScore(v)}"/>`).join('')
  const yl = [40, 60, 80, 100].map((v) => `<text x="${L - 8}" y="${yScore(v) + 4}" text-anchor="end">${v}</text>`).join('')
  const xl = s.map(([d], i) => ((i % every === 0 && i < n - 2) || i === n - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${d}</text>` : '')).join('')
  const xr = [0, 500, 1000].map((v) => `<text x="${W - R + 8}" y="${yXp(v) + 4}">${trInt(v)}</text>`).join('')
  const last = n - 1
  const tipX = Math.max(L, x(last) - 118), tipY = Math.max(0, yScore(s[last][1]) - 44)
  return `<svg class="gami-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="gami-chart-t-${W}">
  <title id="gami-chart-t-${W}">Son 30 günde değerlendirme puanı 62'den 86'ya yükseldi; toplam XP 920.</title>
  <g class="grid">${grid}</g><g class="axis">${yl}${xl}${xr}</g>
  <line class="threshold" x1="${L}" x2="${W - R}" y1="${yScore(80)}" y2="${yScore(80)}"/><text class="threshold-lbl" x="${L + 6}" y="${yScore(80) - 6}">Eşik 80</text>
  <path class="score-area" d="${area}" opacity=".7"/>
  <polyline class="xp" points="${s.map(([, , xp], i) => `${x(i).toFixed(1)},${yXp(xp).toFixed(1)}`).join(' ')}"/>
  <polyline class="score" points="${pts.join(' ')}"/>
  ${s.map(([, sc], i) => `<circle class="score-pt${i === last ? ' active' : ''}" cx="${x(i)}" cy="${yScore(sc)}" r="${i === last ? 5 : 3.5}" tabindex="0"/>`).join('')}
  <g class="tip"><rect x="${tipX}" y="${tipY}" width="112" height="34" rx="6"/><text x="${tipX + 10}" y="${tipY + 14}">22 Eyl · Puan 86</text><text x="${tipX + 10}" y="${tipY + 27}">Toplam 920 XP</text></g>
</svg>`
}
const chartExtras = () => `<div class="gami-legend"><span><i></i> Değerlendirme puanı</span><span><i class="xp"></i> Toplam XP (sağ eksen)</span><span><i class="th"></i> Başarı eşiği</span></div>
<table class="sr-only"><caption>Değerlendirme puanı ve XP, son 30 gün</caption><thead><tr><th>Tarih</th><th>Puan</th><th>Toplam XP</th></tr></thead><tbody>${D.series.map(([d, sc, xp]) => `<tr><td>${d}</td><td>${sc}</td><td>${xp}</td></tr>`).join('')}</tbody></table>`
const goals = () => `<div class="gami-goals">${D.goals.map((g) => `<div class="gami-goal${g.done ? ' done' : ''}">
  <span class="dr-ic">${I(g.done ? 'Check' : g.icon, 16)}</span><span class="dr-lbl">${g.label}</span>
  ${g.done ? '<span class="badge green dr-pct">Tamamlandı</span>' : `<span class="dr-pct">${g.value} / ${g.max}</span>`}${bar((g.value / g.max) * 100)}</div>`).join('')}</div>
  <p class="gami-note">Hedefler her Pazartesi 00:00'da (TSİ) yenilenir.</p>`
const domainsPanel = () => `<div class="domain-rows gami-domains">${D.domains.map(([ic, lbl, v]) => `<div class="domain-row"><span class="dr-ic">${I(ic)}</span>
  <span class="dr-lbl">${lbl}${v < 60 ? ' <span class="badge orange">zayıf</span>' : ''}</span>${bar(v)}<span class="dr-pct">%${v}</span></div>`).join('')}</div>`
const TIER = { bronze: 'Bronz', silver: 'Gümüş', gold: 'Altın' }
const badgeCard = (b) => {
  const locked = b.state === 'locked'
  const ft = b.state === 'earned'
    ? `${I('Check', 13)} ${b.date}`
    : b.state === 'progress' ? `${bar((b.value / b.max) * 100)}<span>${b.value}/${b.max}</span>` : `${I('Lock', 13)} ${b.rule}`
  const name = b.tier ? `${b.name} · ${TIER[b.tier]}` : b.name
  const stateCls = b.state === 'earned' ? 'is-earned' : b.state === 'progress' ? 'is-progress' : 'is-locked'
  const icCls = b.state === 'earned' ? (b.tier ? ` tier-${b.tier}` : '') : b.state === 'progress' ? ' progress' : ' locked'
  return `<button class="gami-badge c-${b.cat} ${stateCls}" type="button" aria-label="${name} (${D.CATEGORIES[b.cat]}) — ${b.state === 'earned' ? `kazanıldı ${b.date}` : b.state === 'progress' ? `ilerleme ${b.value}/${b.max}` : `kilitli, koşul: ${b.rule}`}">
  <span class="gami-badge-ic c-${b.cat}${icCls}">${I(b.icon, 28)}${locked ? `<span class="lock">${I('Lock', 12)}</span>` : ''}</span>
  <span class="cat">${D.CATEGORIES[b.cat]}</span><span class="nm">${name}</span><span class="ds">${b.desc}</span><span class="ft">${ft}</span></button>`
}
const earned = D.badges.filter((b) => b.state === 'earned')
const badgeGrid = (all = D.badges, filter = 'Tümü') => `<div class="card">
  <div class="gami-card-head"><h3>Rozet koleksiyonu</h3>
    <div class="gami-seg" role="group" aria-label="Rozet filtresi">${['Tümü', 'Kazanılanlar', 'Devam edenler', 'Kilitli'].map((f) => `<button type="button" aria-pressed="${f === filter}">${f}</button>`).join('')}</div>
    <span class="gami-count">${all.filter((b) => b.state === 'earned').length} / ${all.length} kazanıldı</span></div>
  <div class="gami-cat-legend" aria-label="Rozet kategorileri">${Object.entries(D.CATEGORIES).map(([k, v]) => `<span class="c-${k}"><i></i>${v}</span>`).join('')}</div>
  <div class="gami-badge-grid">${all.map(badgeCard).join('')}</div></div>`
const recent = () => `<div class="gami-recent">${earned.slice(0, 3).map(badgeCard).join('')}</div>
  <p class="gami-note"><button class="gami-link" type="button">Tümünü gör ${I('ChevronRight', 14)}</button></p>`

const achievementsHead = (withPeriod = true) => `${demo}${pageTabs('a')}
  <div class="results-title-row"><div><h1 class="results-title-v2">Başarılarım</h1>
  <p class="results-sub-v2">Değerlendirme ve uygulama oturumlarından kazandığın ilerleme.</p></div>
  ${withPeriod ? '<select class="gami-select" aria-label="Dönem"><option>Son 30 gün</option><option>Son 12 hafta</option><option>Akademik yıl</option></select>' : ''}</div>`

const achievements = () => `${achievementsHead()}
  ${profileStrip()}
  <div class="gami-grid">
    <div class="card gami-span-8"><div class="gami-card-head"><h3>İlerleme</h3><span class="gami-range">24 Ağu – 22 Eyl 2026</span></div>${chart()}</div>
    <div class="card gami-span-4"><div class="gami-card-head"><h3>Bu haftanın hedefleri</h3><span class="gami-range">22–28 Eyl</span></div>${goals()}</div>
    <div class="card gami-span-6"><div class="gami-card-head"><h3>Alan bazlı performans</h3><span class="gami-range">Son 30 gün · değerlendirme</span></div>${domainsPanel()}</div>
    <div class="card gami-span-6"><div class="gami-card-head"><h3>Son kazanılan rozetler</h3></div>${recent()}</div>
    <div class="gami-span-12">${badgeGrid()}</div>
  </div>`

const achievementsEmpty = () => `${achievementsHead(false)}
  <div class="card gami-empty"><h2>Başarılarım burada birikecek</h2>
    <p>Değerlendirme ve uygulama oturumların XP ve rozet olarak burada toplanır. İlk değerlendirmeni tamamladığında sıralamaya da girebilirsin.</p>
    <div class="gami-empty-steps">
      <div><span class="ic gami-tone-blue">${I('Star', 24)}</span><b>XP kazan</b><span>Her oturum ve doğru yanıt XP getirir.</span></div>
      <div><span class="ic gami-tone-amber">${I('Award', 24)}</span><b>Rozet topla</b><span>28 rozet: konu, seri ve beceri rozetleri.</span></div>
      <div><span class="ic gami-tone-purple">${I('Chart', 24)}</span><b>Sıralamada yüksel</b><span>En iyi 3 değerlendirmenin ortalaması sayılır.</span></div>
      <div><span class="ic gami-tone-green">${I('Target', 24)}</span><b>İlerlemeni izle</b><span>Alan bazlı güçlü ve zayıf yönlerin.</span></div>
    </div>
    <button class="btn purple" type="button">Değerlendirmeye gir ${I('ArrowRight', 16)}</button></div>
  ${badgeGrid(D.badges.map((b) => ({ ...b, state: 'locked', rule: b.rule ?? 'Kilitli' })))}`

const badgeDetail = () => {
  const b = D.badges.find((x) => x.state === 'progress' && x.topic === 'Nodül / kitle')
  return `${achievements()}
  <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gami-bd-t"><div class="modal-card">
    <div class="modal-head"><h3 id="gami-bd-t">Rozet</h3><button class="modal-close" type="button" aria-label="Kapat">${I('Close')}</button></div>
    <div class="modal-body"><div class="gami-badge-detail c-${b.cat}">
      <span class="gami-badge-ic c-${b.cat} progress">${I(b.icon, 40)}</span><span class="cat">${D.CATEGORIES[b.cat]} rozeti</span><h4>${b.name}</h4>
      <p class="rule">${b.desc} Yalnız değerlendirme modundaki doğru yanıtlar sayılır.</p>
      ${bar((b.value / b.max) * 100)}<span class="gami-count">${b.value} / ${b.max} — ${b.max - b.value} vaka kaldı</span>
      <button class="btn green small" type="button">${I('Book', 16)} Bu konuyu öğrenme modunda çalış</button>
    </div></div></div></div>`
}

/* ---------- Ekran B — Liderlik Tahtası ---------- */
const standings = D.rewardStandings(D.monthly, D.reward)
const meRow = standings.rows.find((r) => r.id === D.ME_ID)
const rewardFull = () => {
  const gap = standings.cutoff - meRow.score
  return `<section class="card gami-reward" aria-labelledby="gami-rw-t">
  <span class="gami-badge-ic c-streak">${I('Gift', 30)}</span>
  <div><span class="rs-lbl">${D.reward.monthLabel.toLocaleUpperCase('tr-TR')} ÖDÜLÜ · ${D.reward.sponsor}</span>
    <h2 id="gami-rw-t">${D.reward.title}</h2><p>${D.reward.description}</p></div>
  <div class="gami-reward-meta">
    <span class="badge gray">${I('Clock', 14)} Kapanışa ${D.reward.closesIn}</span>
    <span class="badge gami-chip-purple">Senin durumun: ${D.monthly.indexOf(D.monthly.find((r) => r.id === D.ME_ID)) + 1}. sıra · ödül sırasına ${tr1(gap)} puan</span>
    <button class="btn outline small" type="button">Katılım koşulları</button></div></section>`
}
const rewardCompact = () => `<div class="card gami-reward compact"><span class="gami-badge-ic c-streak">${I('Gift', 16)}</span>
  <span class="txt">Bu ayın ödülü: <b>${D.reward.title}</b> · 8 gün kaldı</span><button class="gami-link" type="button">Aylık sıralamayı gör ${I('ChevronRight', 14)}</button></div>`
const periodRow = (sel) => `<div class="gami-period-row">
  <div class="gami-seg purple" role="tablist" aria-label="Dönem">${['Bugün', 'Bu hafta', 'Bu ay', 'Akademik yıl'].map((p) => `<button role="tab" type="button" aria-selected="${p === sel}">${p}</button>`).join('')}</div>
  <select class="gami-select" aria-label="Kohort"><option>Tüm dönemler</option><option>Dönem 3</option><option>Dönem 4</option><option>Dönem 5</option><option>Dönem 6</option></select>
  <span class="gami-range">${sel === 'Bu ay' ? '1–30 Eyl 2026' : '22–28 Eyl 2026'}</span></div>`
const podium = (rows, showCandidates) => `<div class="gami-podium" aria-label="İlk 3">${rows.slice(0, 3).map((r, i) => `
  <div class="card gami-podium-card r${i + 1}${r.id === D.ME_ID ? ' me' : ''}"><span class="gami-medal m${i + 1}" aria-label="${i + 1}. sıra">${i + 1}</span>
  ${showCandidates && r.candidate ? '<span class="badge orange">Ödül adayı</span>' : ''}
  ${avatar(r, 'lg')}<span class="nm">${displayName(r)}</span><span class="sc">${tr1(r.score)}</span><span class="sc-lbl">Dönem puanı</span>
  <span class="sub">Seviye ${r.level} · ${r.attempts} deneme</span></div>`).join('')}</div>`
const tableRows = (rows, showCandidates) => {
  const out = []
  rows.slice(3).forEach((r, i) => {
    const rank = i + 4
    if (rank === 11) out.push('<tr class="gap" aria-hidden="true"><td colspan="6">⋯</td></tr>')
    const me = r.id === D.ME_ID
    out.push(`<tr class="${me ? 'me' : ''}"${me ? ' aria-current="true"' : ''}><td class="rank">${rank}</td>
    <td><span class="user">${avatar(r)}${me ? `Sen <small>· ${displayName(r)}</small>` : displayName(r)}${showCandidates && r.candidate ? ' <span class="badge orange" style="font-size:var(--fs-xs);padding:1px 8px">Ödül adayı</span>' : ''}</span></td>
    <td class="num score">${tr1(r.score)}${me && r.delta ? `<span class="gami-delta up" aria-label="önceki döneme göre ${r.delta} sıra yukarı">${I('ArrowUp', 12)}${r.delta}</span>` : ''}</td>
    <td class="num">${r.attempts}</td><td class="num">${r.level}</td><td class="num">${trInt(r.xp)}</td></tr>`)
  })
  return out.join('')
}
const cardRows = (rows) => rows.slice(3).map((r, idx) => {
  const i = idx + 3
  const me = r.id === D.ME_ID
  return `${i === 10 ? '<li class="gap" aria-hidden="true">⋯</li>' : ''}<li class="${me ? 'me' : ''}"><span class="rank">${i + 1}</span>${avatar(r)}
  <span class="nm">${me ? `Sen · ${displayName(r)}` : displayName(r)}</span><span class="sub">Seviye ${r.level} · ${r.attempts} deneme · ${trInt(r.xp)} XP</span>
  <span class="sc">${tr1(r.score)}${me && r.delta ? `<span class="gami-delta up">${I('ArrowUp', 12)}${r.delta}</span>` : ''}</span></li>`
}).join('')
const table = (rows, showCandidates) => `<div class="card">
  <div class="table-scroll gami-lb-table-wrap"><table class="report-table report-table-v2 gami-lb-table"><caption class="sr-only">Liderlik tablosu</caption>
  <thead><tr><th>#</th><th>Kullanıcı</th><th class="num">Dönem puanı</th><th class="num">Deneme</th><th class="num">Seviye</th><th class="num">Toplam XP</th></tr></thead>
  <tbody>${tableRows(rows, showCandidates)}</tbody></table></div>
  <ol class="gami-lb-cards" aria-label="Liderlik tablosu">${cardRows(rows)}</ol>
  <p class="gami-note">Puan: dönemdeki en iyi 3 değerlendirmenin ortalaması · sıralamaya girmek için en az 2 deneme.</p></div>`
const privacy = (on) => `<div class="card gami-privacy">${I('Lock', 22)}
  <div class="txt"><b>${on ? 'Sıralamada adınla görünüyorsun.' : 'Sıralamada "Anonim öğrenci" olarak görünüyorsun.'}</b>
  <span>Adın Moodle kaydından alınır (Selin Çelik). İstersen sıralamada anonim görünebilirsin; ayın ödülüne aday olmak için adınla görünmelisin.</span></div>
  <div class="form"><label><button class="gami-switch" role="switch" type="button" aria-checked="${on}" aria-label="Sıralamada adımı göster"></button> Sıralamada adımı göster</label></div></div>`
const historyBlock = () => `<details class="card gami-history" open><summary>${I('ChevronRight', 16)} Önceki ayların kazananları</summary>
  <div class="gami-history-list">${D.history.map((h) => `<div class="gami-history-month"><b>${h.month}</b><span>${h.title}</span>
  <ol>${h.winners.map((w, i) => `<li><span class="gami-medal m${i + 1}" aria-label="${i + 1}.">${i + 1}</span>${w}</li>`).join('')}</ol></div>`).join('')}</div></details>`

const lbHead = `${demo}${pageTabs('b')}
  <div class="results-title-row"><div><h1 class="results-title-v2">Liderlik Tahtası</h1>
  <p class="results-sub-v2">Değerlendirme modundaki en iyi 3 denemenin ortalamasıyla sıralanır (en az 2 deneme).</p></div></div>`
const leaderboard = () => `${lbHead}${rewardFull()}${periodRow('Bu ay')}${podium(standings.rows, true)}${table(standings.rows, true)}${privacy(true)}${historyBlock()}`
const weekRows = standings.rows.map((r) => ({ ...r }))
const leaderboardWeek = () => `${lbHead}${rewardCompact()}${periodRow('Bu hafta')}${podium(weekRows, false)}${table(weekRows, false)}${privacy(true)}`

/* ---------- Sonuç ekranı — Kazanımlar kartı ---------- */
const results = () => `<h1 class="results-title-v2 results-title">Değerlendirme Raporu</h1>
  <p class="results-sub-v2">Hedef puanı geçtiniz. Ayrıntılı vaka raporu aşağıdadır.</p>
  <div class="results-summary-strip"><div class="rs-box"><div class="rs-ring-sm score-ring pass"><svg viewBox="0 0 80 80"><circle class="track" cx="40" cy="40" r="34" fill="none" stroke="currentColor" stroke-width="8"></circle><circle class="prog" cx="40" cy="40" r="34" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-dasharray="187.9 999" transform="rotate(-90 40 40)"></circle></svg><b>88</b></div><span class="rs-lbl">Bu deneme: 88 · En iyi puan: 88</span></div>
  <div class="rs-box"><div class="rs-status pass">${I('CheckCircle', 16)} Başarılı</div><span class="rs-lbl">Durum (eşik 80)</span></div>
  <div class="rs-box"><div class="rs-num">${I('Clock', 16)} 14:32</div><span class="rs-lbl">Toplam süre</span></div>
  <div class="rs-box"><div class="rs-num">10</div><span class="rs-lbl">Vaka sayısı</span></div></div>
  <section class="card gami-gains" aria-labelledby="gami-gains-t"><div class="gami-card-head"><h3 id="gami-gains-t">Bu oturumda kazandıkların</h3><span class="badge orange">Demo verisi</span></div>
    <div class="gami-gains-row">
      <div class="gami-gain"><span class="gami-badge-ic sm c-skill tier-bronze">${I('Target', 22)}</span><div><b>Keskin Göz</b><span>Yeni rozet · Bronz</span></div></div>
      <div class="gami-gain"><span class="gami-badge-ic sm c-topic progress">${I('Star', 22)}</span><div><b class="xp">+120 XP</b><span>+20 başarı bonusu dahil</span></div></div>
      <div class="gami-gain"><div class="grow"><b>Seviye 5</b><span>320 / 500 XP · sonrakine 180</span>${bar(64)}</div></div>
      <div class="gami-gain"><span class="gami-badge-ic sm c-skill progress">${I('Chart', 22)}</span><div><b class="rank">Bu hafta 12. <span class="gami-delta up">${I('ArrowUp', 12)}3</span></b><span>84 kişi arasında</span></div></div>
    </div>
    <div class="gami-gains-actions"><button class="btn outline small" type="button">Sıralamaya bak</button><button class="btn primary small" type="button">Başarılarımı gör ${I('ArrowRight', 14)}</button></div></section>
  <div class="card"><h3 style="margin-top:0">Alan bazlı performans</h3>${domainsPanel()}</div>`

/* ---------- sayfa ---------- */
const STATES = [
  ['achievements', 'Başarılarım (dolu)', achievements, true],
  ['achievements-empty', 'Başarılarım (boş durum)', achievementsEmpty, true],
  ['badge-detail', 'Rozet detayı', badgeDetail, true],
  ['leaderboard', 'Liderlik — Bu ay (ben 12.)', leaderboard, true],
  ['leaderboard-week', 'Liderlik — Bu hafta (360 px için)', leaderboardWeek, true],
  ['results', 'Sonuç: Kazanımlar kartı', results, false],
]
const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>EGEMED Opaca — Oyunlaştırma T0 tasarım referansı</title>
<!-- ÜRETİLMİŞ DOSYA: scripts/build-gami-mockup.mjs. src/styles.css + src/styles-v2.css birebir gömülüdür. -->
<style>
${read('src/styles.css')}
${read('src/styles-v2.css')}
</style>
<style>
${read('docs/mockups/gami-draft.css')}
</style>
<style>
/* yalnız maket gezinmesi — uygulamaya girmez */
.mock-nav { position: sticky; top: 0; z-index: 90; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; padding: 6px 12px; background: var(--ink-900); font: 12px/1.4 var(--font); }
.mock-nav b { color: var(--orange-100); margin-right: 8px; }
.mock-nav a { color: var(--blue-100); text-decoration: none; padding: 3px 8px; border-radius: 6px; }
.mock-nav a.on { background: var(--blue-600); color: var(--card); }
.shot .mock-nav { display: none; }
.mock-state { display: none; }
.mock-state.on { display: block; }
</style></head>
<body>${sprite}
<nav class="mock-nav" aria-label="Maket durumları"><b>T0 maket</b>${STATES.map(([id, label]) => `<a href="#${id}" data-s="${id}">${label}</a>`).join('')}</nav>
${STATES.map(([id, , render, gamiActive]) => `<div class="mock-state" id="s-${id}"><div class="app-shell app-shell--doc"><div class="app-bg"><div class="bg-wash"></div></div><div class="app-content">
${header(gamiActive && id !== 'results')}
<main class="screen"><div class="results-wrap-v2 ${id === 'results' ? '' : 'gami-page'}">${render()}</div></main>
${footer}</div></div></div>`).join('\n')}
<script>
(function(){var show=function(){var id=(location.hash||'#achievements').slice(1);document.querySelectorAll('.mock-state').forEach(function(s){s.classList.toggle('on',s.id==='s-'+id)});document.querySelectorAll('.mock-nav a').forEach(function(a){a.classList.toggle('on',a.dataset.s===id)})};
if(new URLSearchParams(location.search).get('shot')==='1')document.body.classList.add('shot');addEventListener('hashchange',show);show();})();
</script>
</body></html>
`
fs.writeFileSync(path.join(ROOT, 'docs/mockups/gami.html'), html)
console.log(`docs/mockups/gami.html (${(html.length / 1024).toFixed(0)} KB, ${Object.keys(icons).length} ikon, ${STATES.length} durum)`)
