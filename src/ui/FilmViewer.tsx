import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { ImageRecord, ReadingZone, ViewerTool } from '../core/types'
import { clamp, markHitsFinding, markRadiusNorm, nearestFindingBoxCenter, ratio, zonesAt, type Point } from '../core/geometry'
import { findingShort } from '../data/terminology'
import { FilmCornerBadge } from './FilmInfoPanel'

/** Film görüntüleyici (Ausculta PatientStage karşılığı).
 *  İlke: imleç/sürükleme hareketinde React ağacı yeniden çizilmez — dönüşüm ref üzerinden DOM'a yazılır.
 *  Tüm katmanlar (bölgeler, uzman kutuları, işaret, ölçüm) görüntüyle aynı dönüşümü paylaşan
 *  normalize (0–1) SVG içinde çizilir; böylece yakınlaştırmada hizalama bozulmaz. */

export type PointerTool = 'pan' | 'mark' | 'measure'

export interface WindowSetting {
  brightness: number
  contrast: number
}

export const WINDOW_PRESETS: { id: string; label: string; w: WindowSetting }[] = [
  { id: 'standard', label: 'Standart', w: { brightness: 1, contrast: 1 } },
  { id: 'lung', label: 'Akciğer', w: { brightness: 0.9, contrast: 1.35 } },
  { id: 'mediastinum', label: 'Mediasten', w: { brightness: 1.25, contrast: 0.85 } },
  { id: 'bone', label: 'Kemik', w: { brightness: 1.05, contrast: 1.7 } },
]

export interface FilmViewerHandle {
  focusZone: (zoneId: string) => void
  reset: () => void
}

interface Props {
  image: ImageRecord | undefined
  zones: ReadingZone[]
  /** okuma bölgesi katmanı görünür mü (değerlendirmede hep kapalı) */
  showZones: boolean
  /** uzman kutuları görünür mü; `annotationFinding` verilirse yalnız o bulgu */
  showAnnotations: boolean
  annotationFinding?: string | null
  /** değerlendirme: bölge katmanı, uzman kutuları ve etiketler kilitli */
  strict?: boolean
  /** işaretleme etkin (lokalizasyon sorusu yanıtlanıyor) */
  markEnabled?: boolean
  mark?: Point | null
  onMark?: (p: Point) => void
  onZoneEnter?: (zoneIds: string[]) => void
  onZoneDwell?: (zoneIds: string[], dwellMs: number) => void
  /** imlecin şu an üzerinde olduğu bölgeler (yalnız değişimde çağrılır) */
  onActiveZones?: (zoneIds: string[]) => void
  onTool?: (tool: ViewerTool) => void
  onToggleZones?: () => void
  /** kilitli (vaka geçişi / özet kartı) */
  inert?: boolean
  label?: string
  /** film bilgisi öğretim overlay'i (sentetik taraf işareti rozeti) — yalnız öğrenme modunda açılır */
  showInfoOverlay?: boolean
  /** Kesit yığınında son kesite ulaşıldığında (görüntü başına bir kez) — oyunlaştırma "BT Kaşifi" için. */
  onStackEnd?: () => void
}

const DWELL_TICK_MS = 250
const MAX_SCALE = 8

export const FilmViewer = forwardRef<FilmViewerHandle, Props>(function FilmViewer(
  {
    image, zones, showZones, showAnnotations, annotationFinding, strict = false, markEnabled = false, mark, onMark,
    onZoneEnter, onZoneDwell, onActiveZones, onTool, onToggleZones, inert = false, label, showInfoOverlay = false, onStackEnd,
  },
  ref
) {
  const stageRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const view = useRef({ scale: 1, tx: 0, ty: 0 })
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null)
  const pointerZones = useRef<string[]>([])
  const pointerInside = useRef(false)
  const [base, setBase] = useState({ w: 0, h: 0 })
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tool, setTool] = useState<PointerTool>('pan')
  const [win, setWin] = useState<WindowSetting>(WINDOW_PRESETS[0].w)
  const [preset, setPreset] = useState('standard')
  const [invert, setInvert] = useState(false)
  const [zoomPct, setZoomPct] = useState(100)
  const [measures, setMeasures] = useState<[Point, Point][]>([])
  const [pending, setPending] = useState<Point | null>(null)
  const [activeZoneLabel, setActiveZoneLabel] = useState<string | null>(null)
  const [adjustOpen, setAdjustOpen] = useState(false)
  // V3: işaret dairesi konum duyurusu (aria-live) — klavye ile ok tuşlarıyla taşırken ekran okuyucuya bildirir
  const [markAnnounce, setMarkAnnounce] = useState('')
  // V13: Toraks BT yığın kaydırma — o an gösterilen kesit (0 tabanlı)
  const [sliceIndex, setSliceIndex] = useState(0)

  const aspect = image && image.width > 0 && image.height > 0 ? image.width / image.height : 1

  // V13: Toraks BT yığın — `stack` yoksa (mevcut tekil BT görselleri) tek kareli bir yığın gibi davranır.
  // Pencere ön ayarı 'mediastinum' seçiliyse mediasten kesitleri, aksi halde (standart/akciğer/kemik)
  // akciğer penceresi kesitleri kullanılır — CT serisi yalnız iki ön ayarla (akciğer/mediasten) önceden
  // render edilir (V13 kararı); "Özel" parlaklık/kontrast bu kareler üzerine CSS filtresi olarak uygulanmaya devam eder.
  const stackWindow: 'lung' | 'mediastinum' = preset === 'mediastinum' ? 'mediastinum' : 'lung'
  const stackFrames = image?.stack?.find((s) => s.window === stackWindow)?.frames ?? (image ? [image.runtimeUrl] : [])
  const hasMultiSliceStack = stackFrames.length > 1
  const clampedSlice = Math.min(sliceIndex, Math.max(0, stackFrames.length - 1))
  const stackEndFired = useRef<string | null>(null)
  useEffect(() => {
    if (!onStackEnd || !image || stackFrames.length < 2 || clampedSlice !== stackFrames.length - 1) return
    if (stackEndFired.current === image.id) return
    stackEndFired.current = image.id
    onStackEnd()
  }, [clampedSlice, stackFrames.length, image, onStackEnd])
  const frameSrc = stackFrames[clampedSlice] ?? image?.runtimeUrl
  const goToSlice = (next: number) => setSliceIndex(clamp(next, 0, Math.max(0, stackFrames.length - 1)))

  // görüntü değişince görünüm sıfırlanır
  useEffect(() => {
    setLoaded(false)
    setFailed(false)
    setMeasures([])
    setPending(null)
    setTool('pan')
    setWin(WINDOW_PRESETS[0].w)
    setPreset(image?.stack?.length ? 'lung' : 'standard')
    setInvert(false)
    // İşaretli kesit yığını, işaretli kesit aralığının ortasından açılır (BT yalnız öğrenme modunda kullanılır).
    const marked = (image?.stack?.length ? image.annotations : []).map((a) => a.frameIndex).filter((f): f is number => typeof f === 'number').sort((a, b) => a - b)
    setSliceIndex(marked.length ? marked[Math.floor(marked.length / 2)] : 0)
    view.current = { scale: 1, tx: 0, ty: 0 }
    apply()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.id])

  useEffect(() => {
    if (markEnabled) setTool('mark')
    else setTool((t) => (t === 'mark' ? 'pan' : t))
  }, [markEnabled])

  // sahneye sığdır (contain) — yalnız boyut değişiminde yeniden çizilir
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const fit = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (!cw || !ch) return
      const w = Math.min(cw, ch * aspect)
      setBase({ w, h: w / aspect })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  const apply = useCallback(() => {
    const { scale, tx, ty } = view.current
    if (layerRef.current) layerRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
  }, [])

  const constrain = () => {
    const v = view.current
    const limX = (base.w * (v.scale - 1)) / 2 + base.w * 0.25
    const limY = (base.h * (v.scale - 1)) / 2 + base.h * 0.25
    v.tx = clamp(v.tx, -limX, limX)
    v.ty = clamp(v.ty, -limY, limY)
  }

  const zoomBy = (factor: number, origin?: { x: number; y: number }) => {
    const v = view.current
    const next = clamp(v.scale * factor, 1, MAX_SCALE)
    if (next === v.scale) return
    if (origin && stageRef.current) {
      // imleç altındaki noktayı sabit tut
      const r = stageRef.current.getBoundingClientRect()
      const ox = origin.x - (r.left + r.width / 2)
      const oy = origin.y - (r.top + r.height / 2)
      const k = next / v.scale
      v.tx = ox - (ox - v.tx) * k
      v.ty = oy - (oy - v.ty) * k
    }
    v.scale = next
    if (next === 1) {
      v.tx = 0
      v.ty = 0
    }
    constrain()
    apply()
    setZoomPct(Math.round(next * 100))
    onTool?.('zoom')
  }

  const reset = () => {
    view.current = { scale: 1, tx: 0, ty: 0 }
    apply()
    setZoomPct(100)
  }

  /** client koordinatını görüntü normalize koordinatına çevirir (dönüşüm dahil) */
  const toImage = (clientX: number, clientY: number): Point | null => {
    const layer = layerRef.current
    if (!layer) return null
    const r = layer.getBoundingClientRect()
    if (!r.width || !r.height) return null
    const x = (clientX - r.left) / r.width
    const y = (clientY - r.top) / r.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return null
    return { x, y }
  }

  const updateZones = (p: Point | null) => {
    const ids = p ? zonesAt(p, zones) : []
    const prev = pointerZones.current
    const entered = ids.filter((id) => !prev.includes(id))
    const changed = ids.length !== prev.length || entered.length > 0
    pointerZones.current = ids
    if (entered.length) onZoneEnter?.(entered)
    if (changed) onActiveZones?.(ids)
    if (!strict) {
      const top = ids.length ? zones.find((z) => z.id === ids[ids.length - 1]) : null
      setActiveZoneLabel((cur) => (cur === (top?.fullLabel ?? null) ? cur : top?.fullLabel ?? null))
    }
  }

  // inceleme süresi: imleç görüntü üzerindeyken ve sekme görünürken biriktirilir
  useEffect(() => {
    if (inert || !loaded) return
    const t = window.setInterval(() => {
      if (!pointerInside.current || document.visibilityState !== 'visible') return
      if (pointerZones.current.length) onZoneDwell?.(pointerZones.current, DWELL_TICK_MS)
    }, DWELL_TICK_MS)
    return () => window.clearInterval(t)
  }, [inert, loaded, onZoneDwell])

  useImperativeHandle(ref, () => ({
    focusZone: (zoneId: string) => {
      const z = zones.find((zz) => zz.id === zoneId)
      if (!z || !base.w) return
      const r = z.rects[0]
      const cx = r.x + r.w / 2
      const cy = r.y + r.h / 2
      const scale = clamp(Math.min(1 / r.w, 1 / r.h) * 0.8, 1.2, 3)
      view.current = { scale, tx: -(cx - 0.5) * base.w * scale, ty: -(cy - 0.5) * base.h * scale }
      constrain()
      apply()
      setZoomPct(Math.round(scale * 100))
      // klavye/çip ile odaklanma: sanal imleç bölge merkezinde kabul edilir
      pointerInside.current = true
      updateZones({ x: cx, y: cy })
      onTool?.('zoom')
    },
    reset,
  }))

  const onPointerDown = (e: React.PointerEvent) => {
    if (inert || e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, tx: view.current.tx, ty: view.current.ty, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    pointerInside.current = true
    updateZones(toImage(e.clientX, e.clientY))
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved && tool === 'mark' && markEnabled) {
      // V3: İşaretle aracında sürükleme, görünümü kaydırmak yerine daireyi sürükleyerek taşır.
      const p = toImage(e.clientX, e.clientY)
      if (p) onMark?.(p)
    } else if (d.moved && (tool === 'pan' || view.current.scale > 1)) {
      view.current.tx = d.tx + dx
      view.current.ty = d.ty + dy
      constrain()
      apply()
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || inert) return
    // V3: İşaretle aracında hem tek tık ("tıklayınca taşınır") hem sürükleyip bırakma aynı sonucu verir —
    // bırakma anındaki son konum işaretin merkezi olur.
    if (tool === 'mark' && markEnabled) {
      const p = toImage(e.clientX, e.clientY)
      if (p) onMark?.(p)
      return
    }
    if (d.moved) return
    const p = toImage(e.clientX, e.clientY)
    if (!p) return
    if (tool === 'measure') {
      if (!pending) setPending(p)
      else {
        setMeasures((m) => [...m.slice(-1), [pending, p]])
        setPending(null)
        onTool?.('measure')
      }
    }
  }

  const onPointerLeave = () => {
    pointerInside.current = false
    updateZones(null)
  }

  // tekerlek: pasif olmayan dinleyici (sayfa kaydırmasını engellemek için)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (inert) return
      e.preventDefault()
      // V13: BT yığınında (birden çok kesit) fare tekerleği yakınlaştırma yerine kesit gezinir.
      if (hasMultiSliceStack) {
        setSliceIndex((i) => clamp(i + (e.deltaY > 0 ? 1 : -1), 0, stackFrames.length - 1))
        return
      }
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, { x: e.clientX, y: e.clientY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inert, base.w, base.h, hasMultiSliceStack, stackFrames.length])

  // V3: İşaretle aracı açıkken ok tuşları görünümü kaydırmak yerine işaret dairesini taşır.
  const MARK_KEY_STEP = 0.02
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (inert) return
    const v = view.current
    const handled = true
    const markArrowMove = markEnabled && tool === 'mark' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
    if (markArrowMove) {
      const cx = 0.5 - v.tx / (base.w * v.scale)
      const cy = 0.5 - v.ty / (base.h * v.scale)
      const from = mark ?? { x: clamp(cx, 0, 1), y: clamp(cy, 0, 1) }
      const dx = e.key === 'ArrowLeft' ? -MARK_KEY_STEP : e.key === 'ArrowRight' ? MARK_KEY_STEP : 0
      const dy = e.key === 'ArrowUp' ? -MARK_KEY_STEP : e.key === 'ArrowDown' ? MARK_KEY_STEP : 0
      const next = { x: clamp(from.x + dx, 0, 1), y: clamp(from.y + dy, 0, 1) }
      onMark?.(next)
      setMarkAnnounce(`İşaret konumu: yatay %${Math.round(next.x * 100)}, dikey %${Math.round(next.y * 100)}`)
      e.preventDefault()
      return
    }
    // V13: BT yığınında ok yukarı/aşağı kesit gezinir (görünümü kaydırmaz).
    if (hasMultiSliceStack && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      goToSlice(clampedSlice + (e.key === 'ArrowDown' ? 1 : -1))
      e.preventDefault()
      return
    }
    const step = 40
    switch (e.key) {
      case '+':
      case '=':
        zoomBy(1.25)
        break
      case '-':
        zoomBy(1 / 1.25)
        break
      case '0':
        reset()
        break
      case 'ArrowLeft':
        v.tx += step
        break
      case 'ArrowRight':
        v.tx -= step
        break
      case 'ArrowUp':
        v.ty += step
        break
      case 'ArrowDown':
        v.ty -= step
        break
      case 'Enter':
      case ' ':
        if (markEnabled && tool === 'mark') {
          // görünüm merkezine işaret
          const cx = 0.5 - v.tx / (base.w * v.scale)
          const cy = 0.5 - v.ty / (base.h * v.scale)
          const p = { x: clamp(cx, 0, 1), y: clamp(cy, 0, 1) }
          onMark?.(p)
          setMarkAnnounce(`İşaret konumu: yatay %${Math.round(p.x * 100)}, dikey %${Math.round(p.y * 100)}`)
        }
        break
      default:
        return
    }
    if (handled) {
      e.preventDefault()
      if (e.key.startsWith('Arrow')) {
        constrain()
        apply()
        const cx = clamp(0.5 - v.tx / (base.w * v.scale), 0, 1)
        const cy = clamp(0.5 - v.ty / (base.h * v.scale), 0, 1)
        pointerInside.current = true
        updateZones({ x: cx, y: cy })
      }
    }
  }

  // BT yığınları önceden pencerelenmiş kareler taşır: yalnız Akciğer/Mediasten gerçek, diğerleri gösterilmez.
  const isCtStack = !!image?.stack?.length
  const presetOptions = isCtStack ? WINDOW_PRESETS.filter((x) => x.id === 'lung' || x.id === 'mediastinum') : WINDOW_PRESETS
  const choosePreset = (id: string) => {
    const p = WINDOW_PRESETS.find((x) => x.id === id)
    if (!p) return
    setPreset(id)
    setWin(isCtStack ? WINDOW_PRESETS[0].w : p.w)
    onTool?.('window')
  }

  const measureLen = (m: [Point, Point]) => {
    const w = image?.width ?? 1
    const h = image?.height ?? 1
    return Math.hypot((m[1].x - m[0].x) * w, (m[1].y - m[0].y) * h)
  }
  const measureRatio = measures.length === 2 ? ratio(measureLen(measures[0]), measureLen(measures[1])) : null

  const findingAnnotations = (image?.annotations ?? []).filter(
    (a) => a.source !== 'report_nlp' && (!annotationFinding || a.finding === annotationFinding)
  )
  // BT yığınında her işaret kendi kesitine aittir; kare dizini olmayan (grafi) işaretler her zaman görünür.
  const annotations = hasMultiSliceStack
    ? findingAnnotations.filter((a) => a.frameIndex == null || a.frameIndex === clampedSlice)
    : findingAnnotations
  const annotatedSlices = hasMultiSliceStack
    ? [...new Set(findingAnnotations.map((a) => a.frameIndex).filter((f): f is number => f != null))].sort((x, y) => x - y)
    : []
  const filter = `brightness(${win.brightness}) contrast(${win.contrast})${invert ? ' invert(1)' : ''}`
  const cursor = inert ? 'default' : tool === 'mark' && markEnabled ? 'crosshair' : tool === 'measure' ? 'copy' : 'grab'

  // V3: işaret dairesi (sabit yarıçap, görüntü kısa kenarının %8'i) — normalize eksen başına farklı
  // rx/ry ile hesaplanır ki kare olmayan görüntülerde de ekranda gerçekten daire görünsün.
  const markRadius = markRadiusNorm(image)
  // Geri bildirim: yanıt açıldığında (showAnnotations) işaret hedefin dışındaysa, en yakın uzman
  // kutusunun merkezine bir çizgi çizilir ve "işaretiniz hedef alanın dışında" mesajı gösterilir
  // (mm/piksel iddiası yok — yalnız yüzde/konum).
  const markMissTarget =
    showAnnotations && !strict && mark && annotationFinding && !markHitsFinding(mark, image, annotationFinding)
      ? nearestFindingBoxCenter(mark, image, annotationFinding)
      : null

  return (
    <div className={`film-viewer ${strict ? 'is-strict' : ''} ${inert ? 'is-inert' : ''}`}>
      <div
        ref={stageRef}
        className="film-stage"
        tabIndex={inert ? -1 : 0}
        role="application"
        aria-label={
          label ??
          (hasMultiSliceStack
            ? 'Toraks BT görüntüleyici. Fare tekerleği veya yukarı/aşağı ok tuşlarıyla kesit gezinin, artı/eksi ile yakınlaştırın, 0 ile sıfırlayın.'
            : 'Akciğer grafisi görüntüleyici. Artı/eksi ile yakınlaştırın, ok tuşlarıyla kaydırın, 0 ile sıfırlayın.')
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={onPointerLeave}
        onDoubleClick={reset}
        onKeyDown={onKeyDown}
        style={{ cursor }}
      >
        {!image && <div className="film-empty">Bu vaka için görüntü kaydı bulunamadı.</div>}
        {image && failed && (
          <div className="film-empty">
            Görüntü dosyası yüklenemedi. Veri seti henüz içe aktarılmamış olabilir: <code>npm run import:sample</code>
          </div>
        )}
        {image && (
          <div
            ref={layerRef}
            className="film-layer"
            style={{ width: base.w, height: base.h }}
          >
            <img
              key={image.id}
              src={frameSrc}
              alt={hasMultiSliceStack ? `Toraks BT — kesit ${clampedSlice + 1}/${stackFrames.length}` : 'Akciğer grafisi'}
              draggable={false}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              style={{ filter }}
              className={loaded ? 'is-loaded' : ''}
            />
            <svg className="film-overlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              {showZones && !strict &&
                zones.map((z) =>
                  z.rects.map((r, i) => (
                    <rect key={`${z.id}-${i}`} className={`zone-rect step-${z.step}`} x={r.x} y={r.y} width={r.w} height={r.h} />
                  ))
                )}
              {showAnnotations && !strict &&
                annotations.map((a, i) =>
                  a.polygon?.length ? (
                    <polygon key={`an-${i}`} className="anno-poly" points={a.polygon.map(([x, y]) => `${x},${y}`).join(' ')} />
                  ) : (
                    <rect key={`an-${i}`} className="anno-rect" x={a.x} y={a.y} width={a.w} height={a.h} />
                  )
                )}
              {measures.map((m, i) => (
                <line key={`m-${i}`} className={`measure-line m${i}`} x1={m[0].x} y1={m[0].y} x2={m[1].x} y2={m[1].y} />
              ))}
              {pending && <circle className="measure-dot" cx={pending.x} cy={pending.y} r={0.006} />}
              {markMissTarget && mark && (
                <line
                  className="mark-miss-line"
                  x1={mark.x} y1={mark.y} x2={markMissTarget.x} y2={markMissTarget.y}
                  markerEnd="url(#mark-miss-arrow)"
                />
              )}
              {markMissTarget && (
                <defs>
                  <marker id="mark-miss-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" className="mark-miss-arrowhead" />
                  </marker>
                </defs>
              )}
            </svg>
            {mark && (
              <>
                {/* V3: sabit yarıçaplı daire — yüzde tabanlı HTML katmanı (film-layer'ın en-boy oranı
                    görüntüyle birebir aynı olduğundan, eksen başına farklı rx%/ry% kullanılınca ekranda
                    gerçek bir daire oluşur). */}
                <span
                  className={`film-mark-circle ${markMissTarget ? 'is-miss' : ''}`}
                  style={{
                    left: `${mark.x * 100}%`,
                    top: `${mark.y * 100}%`,
                    width: `${markRadius.rx * 2 * 100}%`,
                    height: `${markRadius.ry * 2 * 100}%`,
                  }}
                  aria-hidden="true"
                />
                <span className="film-mark" style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }} aria-hidden="true" />
              </>
            )}
            {showAnnotations && !strict && annotations.map((a, i) => (
              <span key={`al-${i}`} className="anno-label" style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}>
                {findingShort(a.finding)}
              </span>
            ))}
          </div>
        )}
        {image && loaded && <div className="film-scan" aria-hidden="true" key={`scan-${image.id}`} />}
        {showInfoOverlay && image && loaded && !strict && <FilmCornerBadge image={image} />}
        <div className="film-hud" aria-hidden="true">
          <span>{zoomPct}%</span>
          {hasMultiSliceStack && <span className="film-hud-slice">Kesit {clampedSlice + 1}/{stackFrames.length}</span>}
          {hasMultiSliceStack && showAnnotations && !strict && annotatedSlices.length > 0 && annotations.length === 0 && (
            <span className="film-hud-zone">
              İşaret: kesit {annotatedSlices[0] + 1}–{annotatedSlices[annotatedSlices.length - 1] + 1}
            </span>
          )}
          {!strict && activeZoneLabel && <span className="film-hud-zone">{activeZoneLabel}</span>}
        </div>
        {markEnabled && !inert && <div className="film-mark-hint">Bulguyu görüntü üzerinde işaretleyin</div>}
        {/* V3: klavye ile daireyi taşırken ekran okuyucuya konum bildirimi (görsel olarak gizli) */}
        {markEnabled && !inert && <div className="sr-only" role="status" aria-live="polite">{markAnnounce}</div>}
      </div>

      <div className="film-tools" role="toolbar" aria-label="Görüntüleyici araçları">
        <div className="seg" role="group" aria-label="İmleç aracı">
          <button type="button" className={tool === 'pan' ? 'active' : ''} aria-pressed={tool === 'pan'} onClick={() => setTool('pan')}>
            Kaydır
          </button>
          <button
            type="button"
            className={tool === 'mark' ? 'active' : ''}
            aria-pressed={tool === 'mark'}
            disabled={!markEnabled}
            onClick={() => setTool('mark')}
            title={markEnabled ? 'Bulguyu işaretle' : 'İşaretleme yalnız lokalizasyon sorusunda açılır'}
          >
            İşaretle
          </button>
          <button type="button" className={tool === 'measure' ? 'active' : ''} aria-pressed={tool === 'measure'} onClick={() => { setTool('measure'); setPending(null) }}>
            Ölç
          </button>
        </div>
        <div className="seg" role="group" aria-label="Yakınlaştırma">
          <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Uzaklaştır">−</button>
          <button type="button" onClick={() => zoomBy(1.25)} aria-label="Yakınlaştır">+</button>
          <button type="button" onClick={reset}>Sığdır</button>
        </div>
        {/* V13: BT yığını — kesit kaydırıcı (fare tekerleği/ok tuşlarıyla da gezinilebilir) */}
        {hasMultiSliceStack && (
          <label className="film-select film-slice-slider">
            <span>Kesit {clampedSlice + 1}/{stackFrames.length}</span>
            <input
              type="range"
              min={0}
              max={stackFrames.length - 1}
              value={clampedSlice}
              onChange={(e) => goToSlice(Number(e.target.value))}
              aria-label="BT kesiti"
            />
          </label>
        )}
        <label className="film-select">
          <span>Pencere</span>
          <select value={preset} onChange={(e) => choosePreset(e.target.value)}>
            {presetOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
            {preset === 'custom' && <option value="custom">Özel</option>}
          </select>
        </label>
        <div className="popover-wrap">
          <button type="button" className="tool-btn" aria-expanded={adjustOpen} onClick={() => setAdjustOpen((o) => !o)}>
            Parlaklık / kontrast
          </button>
          {adjustOpen && (
            <div className="popover film-adjust" role="group" aria-label="Parlaklık ve kontrast">
              <label>
                Parlaklık <b>{Math.round(win.brightness * 100)}%</b>
                <input type="range" min={50} max={180} value={Math.round(win.brightness * 100)}
                  onChange={(e) => { setWin((w) => ({ ...w, brightness: Number(e.target.value) / 100 })); setPreset('custom'); onTool?.('window') }} />
              </label>
              <label>
                Kontrast <b>{Math.round(win.contrast * 100)}%</b>
                <input type="range" min={50} max={250} value={Math.round(win.contrast * 100)}
                  onChange={(e) => { setWin((w) => ({ ...w, contrast: Number(e.target.value) / 100 })); setPreset('custom'); onTool?.('window') }} />
              </label>
            </div>
          )}
        </div>
        <button type="button" className={`tool-btn ${invert ? 'active' : ''}`} aria-pressed={invert} onClick={() => { setInvert((v) => !v); onTool?.('invert') }}>
          Negatif
        </button>
        {!strict && onToggleZones && !isCtStack && (
          <button type="button" className={`tool-btn ${showZones ? 'active' : ''}`} aria-pressed={showZones} onClick={() => { onToggleZones(); onTool?.('overlay') }}>
            Okuma bölgeleri
          </button>
        )}
        {(measures.length > 0 || pending) && (
          <span className="film-measure-out" role="status">
            {measures.length === 2 && measureRatio != null
              ? `Oran (1. / 2. ölçüm): ${measureRatio.toFixed(2).replace('.', ',')}`
              : measures.length === 1
                ? '1. ölçüm tamam — ikinci ölçümü çizin'
                : 'Ölçüm: ikinci noktayı seçin'}
            <button type="button" className="link-btn" onClick={() => { setMeasures([]); setPending(null) }}>Temizle</button>
          </span>
        )}
      </div>
    </div>
  )
})
