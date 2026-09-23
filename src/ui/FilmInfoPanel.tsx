import type { ImageRecord } from '../core/types'
import { VIEW_TEXT, LABEL_SOURCE_TEXT } from '../data/terminology'
import { IconInfo } from './icons'

/** Film bilgisi paneli (OPACA-V2 hekim geri bildirimi #2). Sistematik okumanın "0. adımı":
 *  kimlik/tarih, taraf işareti, projeksiyon, pozisyon, inspirasyon/rotasyon/penetrasyon.
 *  Kimlik/tarih ve taraf işareti SENTETİK yer tutuculardır — hiçbir gerçek hasta verisi içermez;
 *  veri setlerinde bu alanlar yoktur (kimliksizleştirilmiştir). İnspirasyon/rotasyon/penetrasyon
 *  yalnız radyolog gözden geçirmesiyle (`images.json` → `quality`) doldurulur; doldurulmadıysa
 *  "beklemede" gösterilir, uydurulmaz. */

/** Basit, bağımlılıksız dize karması — deterministik sentetik değerler için (React state değil). */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h ^ (h >>> 16)) >>> 0
}

export function sideMarkerFor(image: Pick<ImageRecord, 'id'> | undefined): 'R' | 'L' | null {
  if (!image) return null
  return hash(image.id) % 2 === 0 ? 'R' : 'L'
}

/** Yalnız görüntüleme amaçlı, tamamen kurgusal bir "çekim tarihi" — gerçek veri değildir. */
export function syntheticDateFor(image: Pick<ImageRecord, 'id'> | undefined): string {
  if (!image) return '—'
  const h = hash(image.id)
  const day = (h % 28) + 1
  const month = (Math.floor(h / 28) % 12) + 1
  const year = 2019 + (Math.floor(h / 336) % 6)
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`
}

const POSITION_HINT: Record<string, string> = {
  PA: 'Ayakta, derin inspirasyonda (standart 180 cm PA teknik varsayılır — veri setinde teyit edilmemiştir)',
  AP: 'Sıklıkla yatak başı / portatif çekim (AP teknikte kalp filme uzak olduğundan büyük görünür)',
  LAT: 'Ayakta, lateral pozisyon',
  NECK_AP: 'Boyun, AP pozisyon',
  CT_AXIAL: 'Bilgisayarlı tomografi — pozisyon kavramı geçerli değil',
  unknown: 'Belirtilmemiş',
}

function QualityRow({ label, value, help }: { label: string; value: string; help: string }) {
  const pending = value === 'beklemede'
  return (
    <div className="film-info-row">
      <dt>{label}</dt>
      <dd className={pending ? 'is-pending' : ''}>
        {value}
        <span className="film-info-help">{help}</span>
      </dd>
    </div>
  )
}

export function FilmInfoPanel({ image, annotated = true }: { image: ImageRecord | undefined; annotated?: boolean }) {
  if (!image) return <p className="small">Film seçilmedi.</p>
  if (image.modality === 'CT') return <CtInfoPanel image={image} annotated={annotated} />
  const marker = sideMarkerFor(image)
  const q = image.quality
  return (
    <div className="film-info-panel">
      <div className="film-info-synthetic-banner">
        <IconInfo width={14} height={14} />
        <span>
          <b>Ad Soyad:</b> ÖRNEK HASTA &nbsp;·&nbsp; <b>Tarih:</b> {syntheticDateFor(image)} — sentetik yer tutucu, gerçek hasta verisi değildir.
        </span>
      </div>
      <dl className="film-info-fields">
        <div className="film-info-row">
          <dt>Taraf işareti</dt>
          <dd>
            {marker ?? '—'} (sentetik overlay)
            {annotated && <span className="film-info-help">Gerçek filmlerde kurşun R/L işareti kaseteye yerleştirilerek çekilir; bu veri setlerinde fiziksel işaret bulunmadığından öğretim amaçlı sentetik olarak eklenmiştir.</span>}
          </dd>
        </div>
        <div className="film-info-row">
          <dt>Projeksiyon</dt>
          <dd>
            {VIEW_TEXT[image.viewPosition] ?? image.viewPosition}
            {annotated && <span className="film-info-help">Kaynak: {image.sourceDataset === 'nih-cxr14' ? 'DICOM meta verisi (ViewPosition)' : 'veri seti dokümantasyonu / küratör ataması'}.</span>}
          </dd>
        </div>
        <div className="film-info-row">
          <dt>Pozisyon</dt>
          <dd>
            {POSITION_HINT[image.viewPosition] ?? 'Belirtilmemiş'}
          </dd>
        </div>
        <QualityRow label="İnspirasyon derinliği" value={q?.inspiration ?? 'beklemede'} help="Arka kot sayımı ile değerlendirilir (yeterli: diyafram hizasında ~9-10 arka kot); yalnız radyolog gözden geçirmesiyle doldurulur." />
        <QualityRow label="Rotasyon" value={q?.rotation ?? 'beklemede'} help="Klavikula başlarının torasik omurga spinöz çıkıntılarına göre simetrisiyle değerlendirilir." />
        <QualityRow label="Penetrasyon" value={q?.penetration ?? 'beklemede'} help="Torasik vertebra korpuslarının kalp gölgesinin arkasında hafifçe seçilebilir olması yeterli penetrasyonu gösterir." />
        {image.population === 'pediatrik' && (
          <div className="film-info-row">
            <dt>Popülasyon</dt>
            <dd>Pediatrik — yalnız öğrenme/uygulama katmanı, değerlendirme havuzuna girmez.</dd>
          </div>
        )}
        {image.readingText && (
          <div className="film-info-row">
            <dt>Radyolog okuması</dt>
            <dd>“{image.readingText}” <span className="film-info-help">Kaynak: {LABEL_SOURCE_TEXT.expert_reading}.</span></dd>
          </div>
        )}
      </dl>
    </div>
  )
}

/** FilmViewer üstünde küçük taraf işareti rozeti — brief'teki "R/L köşe" overlay'i. */
export function FilmCornerBadge({ image }: { image: ImageRecord | undefined }) {
  const marker = sideMarkerFor(image)
  if (!marker) return null
  return (
    <span className="film-corner-badge" title="Sentetik taraf işareti (öğretim amaçlı; gerçek film markeri değil)" aria-hidden="true">
      {marker}
    </span>
  )
}

/** LIDC okuyucu ölçekleri (1–5; kalsifikasyon 1–6). Yalnız çapa uçları verilir — ara değerler için
 *  tanım uydurulmaz. `malignancy` ve `subtlety` bilinçli olarak GÖSTERİLMEZ: patoloji doğrulaması
 *  olmayan öznel izlenimdir, öğrenci tarafından tanı/olasılık olarak okunabilir (docs/TCIA-BT.md §6). */
const LIDC_SCALES: [key: string, label: string, anchors: string][] = [
  ['spiculation', 'Spikülasyon', '1 = yok, 5 = belirgin'],
  ['lobulation', 'Lobülasyon', '1 = yok, 5 = belirgin'],
  ['margin', 'Kenar', '1 = zayıf tanımlı, 5 = keskin'],
  ['texture', 'Doku', '1 = buzlu cam, 3 = kısmi solid, 5 = solid'],
  ['sphericity', 'Şekil', '1 = lineer, 3 = oval, 5 = yuvarlak'],
  ['calcification', 'Kalsifikasyon', '1–5 = kalsifikasyon tipi, 6 = kalsifikasyon yok'],
]

function CtInfoPanel({ image, annotated }: { image: ImageRecord; annotated: boolean }) {
  const frames = image.stack?.[0]?.frames.length ?? 1
  const windows = (image.stack ?? []).map((s) => s.label ?? s.window)
  const ann = image.annotations.filter((a) => a.frameIndex != null)
  const slices = [...new Set(ann.map((a) => a.frameIndex as number))].sort((a, b) => a - b)
  const readers = Math.max(0, ...ann.map((a) => a.readerCount ?? 0))
  const ch = ann[0]?.characteristics ?? null
  return (
    <div className="film-info-panel">
      <dl className="film-info-fields">
        <div className="film-info-row">
          <dt>Yöntem</dt>
          <dd>Toraks BT — aksiyel kesitler ({frames} kesit)</dd>
        </div>
        <div className="film-info-row">
          <dt>Pencere</dt>
          <dd>
            {windows.length ? windows.join(' · ') : 'Tek görüntü'}
            {annotated && <span className="film-info-help">Pencereler önceden render edilmiştir; serbest HU pencereleme yoktur. Pencere seçicisi ve fare tekerleği/kaydırıcı ile kesitler arasında gezinin.</span>}
          </dd>
        </div>
        <div className="film-info-row">
          <dt>Kaynak</dt>
          <dd>{image.sourceDataset === 'tcia-lidc-idri' ? `TCIA LIDC-IDRI · ${image.sourceFile.split(' ')[0]}` : image.sourceDataset}</dd>
        </div>
        {ann.length > 0 && (
          <div className="film-info-row">
            <dt>Radyolog işaretlemesi</dt>
            <dd>
              Nodül konturu {readers}/4 radyoloğun bağımsız işaretlemesiyle uzlaşılı; kesit {slices[0] + 1}–{slices[slices.length - 1] + 1}.
              {annotated && <span className="film-info-help">İşaretleme yalnız ilgili kesitlerde görünür; "Uzman işaretlemesini göster" ile açılır.</span>}
            </dd>
          </div>
        )}
        {ch && (
          <div className="film-info-row">
            <dt>Okuyucu morfoloji puanları</dt>
            <dd>
              <ul className="film-info-list">
                {LIDC_SCALES.filter(([k]) => ch[k] != null).map(([k, label, anchors]) => (
                  <li key={k}>
                    {label}: <b>{ch[k]}</b> <span className="film-info-help-inline">({anchors})</span>
                  </li>
                ))}
              </ul>
              <span className="film-info-help">
                LIDC-IDRI okuyucularının öznel ölçek puanlarıdır; patoloji doğrulaması yoktur. Tanı ya da malignite olasılığı olarak yorumlanmamalıdır.
              </span>
            </dd>
          </div>
        )}
        <div className="film-info-row">
          <dt>Kullanım</dt>
          <dd>Yalnız öğrenme modunda; bu seriden vaka veya soru üretilmez.</dd>
        </div>
      </dl>
    </div>
  )
}
