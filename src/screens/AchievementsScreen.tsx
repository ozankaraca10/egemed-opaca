import { Footer } from '../ui/chrome'
import { GamiDemoBanner } from '../ui/gami/GamiDemoBanner'
import { GamiPageTabs } from '../ui/gami/GamiPageTabs'

/** Başarılarım (tasarım promptu §4). K-A1 iskeleti — profil şeridi, grafik, hedefler, alanlar ve rozetler
 *  sonraki kartlarda (K-A3…K-A6) eklenir. Yalnız oyunlaştırma bayrağı açıkken erişilir. */
export function AchievementsScreen() {
  return (
    <>
      <div className="screen">
        <div className="results-wrap-v2 gami-page">
          <GamiDemoBanner />
          <GamiPageTabs active="achievements" />
          <div className="results-title-row">
            <div>
              <h1 className="results-title-v2">Başarılarım</h1>
              <p className="results-sub-v2">Değerlendirme ve uygulama oturumlarından kazandığın ilerleme.</p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
