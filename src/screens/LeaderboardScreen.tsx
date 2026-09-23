import { Footer } from '../ui/chrome'
import { GamiDemoBanner } from '../ui/gami/GamiDemoBanner'
import { GamiPageTabs } from '../ui/gami/GamiPageTabs'

/** Liderlik Tahtası (tasarım promptu §5). K-A1 iskeleti — ödül şeridi, dönem sekmeleri, podyum, tablo ve
 *  gizlilik kartı K-B1…K-B7'de eklenir. Yalnız oyunlaştırma bayrağı açıkken erişilir. */
export function LeaderboardScreen() {
  return (
    <>
      <div className="screen">
        <div className="results-wrap-v2 gami-page">
          <GamiDemoBanner />
          <GamiPageTabs active="leaderboard" />
          <div className="results-title-row">
            <div>
              <h1 className="results-title-v2">Liderlik Tahtası</h1>
              <p className="results-sub-v2">Değerlendirme modundaki en iyi 3 denemenin ortalamasıyla sıralanır (en az 2 deneme).</p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
