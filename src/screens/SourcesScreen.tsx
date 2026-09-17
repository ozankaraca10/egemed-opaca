import { useStore } from '../core/store'
import { Footer, EcgDeco } from '../ui/chrome'
import sourcesData from '../data/sources.json'
import { IconInfo, IconBook, IconHeart, IconDoc } from '../ui/icons'

/** Kaynaklar ve Katkıda Bulunanlar (§33). Tüm metinler makine okunur `sources.json`'dan gelir:
 *  geliştiriciler (`credits`, Ünisis bağlantılı), kurum (`module`), veri setleri (`datasets`),
 *  görsel varlıklar (`assets`) ve sorumluluk notu (`disclaimer`). */

interface CreditPerson {
  name: string
  url?: string
}
interface CreditGroup {
  role: string
  people: CreditPerson[]
}
interface Dataset {
  id: string
  title: string
  authors: string[]
  datasetDoi: string
  articleDoi?: string
  license: string
  licenseUrl?: string
  usage?: string
  attributionText: string
}
interface Asset {
  id: string
  title: string
  authors: string[]
  source: string
  license: string
  licenseUrl?: string
  usage: string
  attributionText: string
}

const data = sourcesData as unknown as {
  module: {
    product: string; subtitle: string; developedBy: string; copyright: string
    evidence?: { statement: string; citation: string; doi: string; url: string }
  }
  credits: CreditGroup[]
  datasets: Dataset[]
  assets?: Asset[]
  inventory: { id: string; status: string; recordings: number; population: string }[]
  disclaimer: string
}

/** "Doç. Dr. Ozan KARACA" → "OK"; unvanlar (Dr., Prof., Doç.) atlanır */
function initials(name: string): string {
  const parts = name
    .replace(/\./g, '')
    .split(/\s+/)
    .filter((p) => p && !/^(Prof|Doç|Dr|Uzm|Öğr|Gör|Arş)$/i.test(p))
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase()
}

/** DOI kısaltması → tam bağlantı; zaten URL ise dokunmaz */
function doiHref(v: string): string {
  return /^https?:\/\//i.test(v) ? v : `https://doi.org/${v}`
}

/** Lisans metninden kısa çip etiketi ("CC BY 4.0", "ODC-BY 1.0", "CC0 1.0") */
function licenseShort(license: string): string {
  const m = license.match(/CC BY(?:-SA)? \d\.\d|ODC-BY \d\.\d|CC0 \d\.\d/i)
  return m ? m[0] : license
}

export function SourcesScreen() {
  const { dispatch } = useStore()
  const invById = new Map(data.inventory.map((i) => [i.id, i]))

  return (
    <>
      <EcgDeco />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="src-wrap screen-body">
          <h1 className="src-title">EGEMED Ausculta<sup className="tm">™</sup> Hakkında</h1>
          <p className="src-sub">
            {data.module.product}
            <sup className="tm">™</sup> {data.module.subtitle}'nü geliştiren ekip, kurum bilgisi ve modülde kullanılan
            klinik ses kayıtlarının atıf ve lisans bilgileri.
          </p>

          {/* ---- Geliştiriciler ---- */}
          <section className="src-section" aria-labelledby="credits-h" style={{ marginTop: 0 }}>
            <h2 id="credits-h"><IconHeart /> Geliştiriciler</h2>
            <div className="credit-groups">
              {data.credits.map((g) => (
                <div className="credit-group lead" key={g.role}>
                  <div className="credit-role">{g.role}</div>
                  <ul className="credit-people">
                    {g.people.map((p) =>
                      p.url ? (
                        <li key={p.name}>
                          <a className="credit-person" href={p.url} target="_blank" rel="noreferrer" title={`${p.name} — Ünisis profili`}>
                            <span className="credit-avatar" aria-hidden="true">{initials(p.name)}</span>
                            <span>{p.name}</span>
                            <span className="ext" aria-hidden="true">↗</span>
                          </a>
                        </li>
                      ) : (
                        <li key={p.name}>
                          <span className="credit-person placeholder">
                            <span className="credit-avatar" aria-hidden="true">{initials(p.name)}</span>
                            <span>{p.name}</span>
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* ---- Kurum ---- */}
          <section className="src-section" aria-labelledby="inst-h">
            <h2 id="inst-h"><IconDoc /> Kurum</h2>
            <div className="inst-card">
              <img src="brand/ege-tip-logo.png" alt="Ege Üniversitesi Tıp Fakültesi amblemi" />
              <div>
                <h3>
                  {data.module.product}<sup className="tm">™</sup> — {data.module.subtitle}
                </h3>
                <p>
                  {data.module.developedBy} tarafından, tıp fakültesi öğrencilerinin kardiyopulmoner oskültasyon
                  becerilerini geliştirmek amacıyla hazırlanmıştır. {data.module.copyright}.
                </p>
                {data.module.evidence && (
                  <p className="inst-evidence">
                    {data.module.evidence.statement}
                    <sup><a href={data.module.evidence.url} target="_blank" rel="noreferrer" aria-label="Kaynak: McKinney ve ark., 2013">[1]</a></sup>
                    <br />
                    <span className="inst-cite">
                      [1] {data.module.evidence.citation}{' '}
                      <a href={data.module.evidence.url} target="_blank" rel="noreferrer">doi:{data.module.evidence.doi}</a>
                    </span>
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ---- Veri setleri ---- */}
          <section className="src-section" aria-labelledby="ds-h">
            <h2 id="ds-h"><IconBook /> Ses Veri Setleri</h2>
            <p className="src-sub">
              Yalnız lisansı doğrulanmış ve etiketleri oskültasyon taksonomisine birebir eşlenen açık veri setleri
              kullanılır; uymayan etiketler uydurulmaz.
            </p>
            <div className="ds-grid">
              {data.datasets.map((d) => {
                const inv = invById.get(d.id)
                return (
                  <article className="ds-card" key={d.id}>
                    <h3>{d.title}</h3>
                    <div className="auth">{d.authors.join(', ')}</div>
                    <div className="ds-chips">
                      <span className="ds-chip lic">{licenseShort(d.license)}</span>
                      {inv && (
                        <span className="ds-chip">
                          {inv.status === 'bundled' ? 'pakete dahil' : 'örnek kayıtlar'} · {inv.recordings.toLocaleString('tr-TR')} kayıt
                        </span>
                      )}
                      {inv?.population && <span className={`ds-chip ${/pediatrik|gerçek/i.test(inv.population) ? 'real' : ''}`}>{inv.population}</span>}
                    </div>
                    <div className="src-kv">
                      <span className="k">Veri seti</span>
                      <span className="v"><a href={doiHref(d.datasetDoi)} target="_blank" rel="noreferrer">{d.datasetDoi}</a></span>
                      {d.articleDoi && (
                        <>
                          <span className="k">Makale</span>
                          <span className="v"><a href={doiHref(d.articleDoi)} target="_blank" rel="noreferrer">{d.articleDoi}</a></span>
                        </>
                      )}
                      <span className="k">Lisans</span>
                      <span className="v">
                        {d.licenseUrl ? <a href={d.licenseUrl} target="_blank" rel="noreferrer">{d.license}</a> : d.license}
                      </span>
                      {d.usage && (
                        <>
                          <span className="k">Kullanım</span>
                          <span className="v">{d.usage}</span>
                        </>
                      )}
                    </div>
                    <p className="ds-cite">{d.attributionText}</p>
                  </article>
                )
              })}
            </div>
          </section>

          {/* ---- Görsel varlıklar ---- */}
          {data.assets && data.assets.length > 0 && (
            <section className="src-section" aria-labelledby="assets-h">
              <h2 id="assets-h"><IconDoc /> Görsel Varlıklar</h2>
              <div className="ds-grid">
                {data.assets.map((a) => (
                  <article className="ds-card" key={a.id}>
                    <h3>{a.title}</h3>
                    <div className="auth">{a.authors.join(', ')} — {a.source}</div>
                    <div className="ds-chips"><span className="ds-chip lic">{licenseShort(a.license)}</span></div>
                    <div className="src-kv">
                      <span className="k">Lisans</span>
                      <span className="v">{a.licenseUrl ? <a href={a.licenseUrl} target="_blank" rel="noreferrer">{a.license}</a> : a.license}</span>
                      <span className="k">Kullanım</span>
                      <span className="v">{a.usage}</span>
                    </div>
                    <p className="ds-cite">{a.attributionText}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* ---- Sorumluluk notu ---- */}
          <section className="src-section" aria-label="Sorumluluk notu">
            <div className="src-disclaimer">
              <IconInfo />
              <div>
                <p style={{ margin: 0 }}>{data.disclaimer}</p>
                <p className="small" style={{ margin: '6px 0 0' }}>
                  Atıf ve katkı verileri makine okunur biçimde <code>src/data/sources.json</code> dosyasında saklanır.
                </p>
              </div>
            </div>
          </section>

          <div className="results-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn outline" onClick={() => dispatch({ type: 'goto', screen: 'start' })}>
              ← Geri
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
