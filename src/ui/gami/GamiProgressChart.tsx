import { useEffect, useRef, useState } from 'react'
import { labelEvery, niceMax, type ChartPoint } from '../../gamification/chart'

const tr = (n: number) => n.toLocaleString('tr-TR')

/** Saf SVG ilerleme grafiği. Genişlik ResizeObserver ile ölçülür ve SVG o genişlikte çizilir — tek viewBox'u
 *  ölçeklemek dar ekranda metni ezer (T0 bulgusu). <600 px: 180 px yükseklik. */
export function GamiProgressChart({ points, rangeLabel }: { points: ChartPoint[]; rangeLabel: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    setWidth(Math.floor(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])

  if (points.length === 0) {
    return <div className="gami-chart-empty" role="img" aria-label="Bu dönemde değerlendirme yok">Bu dönemde değerlendirme oturumu yok.</div>
  }

  const H = width < 600 ? 180 : 240
  const L = 32, R = 44, T = 16, B = 26
  const W = Math.max(width, 240)
  const n = points.length
  const plotW = W - L - R
  const x = (i: number) => (n === 1 ? L + plotW / 2 : L + (i * plotW) / (n - 1))
  const minScore = Math.min(40, Math.floor(Math.min(...points.map((p) => p.score)) / 20) * 20)
  const yS = (v: number) => T + ((100 - v) / (100 - minScore)) * (H - T - B)
  const xpMax = niceMax(Math.max(...points.map((p) => p.cumulativeXp)))
  const yX = (v: number) => T + (1 - v / xpMax) * (H - T - B)
  const ticks: number[] = []
  for (let v = minScore; v <= 100; v += 20) ticks.push(v)
  const every = labelEvery(n, plotW)
  const last = active ?? n - 1
  const tip = points[last]
  const tipW = 118
  const tipX = Math.min(Math.max(L, x(last) - tipW / 2), W - R - tipW)
  const tipY = Math.max(0, yS(tip.score) - 44)
  const scorePts = points.map((p, i) => `${x(i).toFixed(1)},${yS(p.score).toFixed(1)}`).join(' ')

  return (
    <div ref={wrap}>
      {width > 0 && (
        <svg className="gami-chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Değerlendirme puanı ve toplam XP, ${rangeLabel}`}>
          <g className="grid">{ticks.map((v) => <line key={v} x1={L} x2={W - R} y1={yS(v)} y2={yS(v)} />)}</g>
          <g className="axis">
            {ticks.map((v) => <text key={v} x={L - 8} y={yS(v) + 4} textAnchor="end">{v}</text>)}
            {points.map((p, i) => ((i % every === 0 && i < n - Math.ceil(every / 2)) || i === n - 1 ? (
              <text key={p.at} x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>
            ) : null))}
            {[0, xpMax / 2, xpMax].map((v) => <text key={v} x={W - R + 8} y={yX(v) + 4}>{tr(v)}</text>)}
          </g>
          <line className="threshold" x1={L} x2={W - R} y1={yS(80)} y2={yS(80)} />
          <text className="threshold-lbl" x={W - R - 6} y={yS(80) + 14} textAnchor="end">Eşik 80</text>
          {n > 1 && <path className="score-area" opacity={0.7} d={`M${x(0)},${H - B} L${scorePts.split(' ').join(' L')} L${x(n - 1)},${H - B} Z`} />}
          {n > 1 && <polyline className="xp" points={points.map((p, i) => `${x(i).toFixed(1)},${yX(p.cumulativeXp).toFixed(1)}`).join(' ')} />}
          {n > 1 && <polyline className="score" points={scorePts} />}
          {points.map((p, i) => (
            <circle
              key={p.at}
              className={`score-pt${i === last ? ' active' : ''}`}
              cx={x(i)} cy={yS(p.score)} r={i === last ? 5 : 3.5}
              tabIndex={0}
              aria-label={`${p.label}: puan ${p.score}, toplam ${tr(p.cumulativeXp)} XP`}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}
            />
          ))}
          <g className="tip" aria-hidden="true">
            <rect x={tipX} y={tipY} width={tipW} height={34} rx={6} />
            <text x={tipX + 10} y={tipY + 14}>{tip.label} · Puan {tr(tip.score)}</text>
            <text x={tipX + 10} y={tipY + 27}>Toplam {tr(tip.cumulativeXp)} XP</text>
          </g>
        </svg>
      )}
      <div className="gami-legend">
        <span><i /> Değerlendirme puanı</span><span><i className="xp" /> Toplam XP (sağ eksen)</span><span><i className="th" /> Başarı eşiği</span>
      </div>
      <table className="sr-only">
        <caption>Değerlendirme puanı ve toplam XP, {rangeLabel}</caption>
        <thead><tr><th>Tarih</th><th>Puan</th><th>Toplam XP</th></tr></thead>
        <tbody>{points.map((p) => <tr key={p.at}><td>{p.label}</td><td>{tr(p.score)}</td><td>{tr(p.cumulativeXp)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
