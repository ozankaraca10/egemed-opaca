import { IconArrowRight, IconAward, IconChart, IconStar, IconTarget } from '../icons'

/** İlk ziyaret / hiç deneme yok (tasarım promptu §4 "boş durum"). */
export function GamiEmptyCard({ onAssessment }: { onAssessment: () => void }) {
  return (
    <div className="card gami-empty">
      <h2>Başarılarım burada birikecek</h2>
      <p>Değerlendirme ve uygulama oturumların XP ve rozet olarak burada toplanır. İlk değerlendirmeni tamamladığında sıralamaya da girebilirsin.</p>
      <div className="gami-empty-steps">
        <div><span className="ic gami-tone-blue"><IconStar width={24} height={24} /></span><b>XP kazan</b><span>Her oturum ve doğru yanıt XP getirir.</span></div>
        <div><span className="ic gami-tone-amber"><IconAward width={24} height={24} /></span><b>Rozet topla</b><span>28 rozet: konu, beceri, seri ve öğrenme.</span></div>
        <div><span className="ic gami-tone-purple"><IconChart /></span><b>Sıralamada yüksel</b><span>En iyi 3 değerlendirmenin ortalaması sayılır.</span></div>
        <div><span className="ic gami-tone-green"><IconTarget width={24} height={24} /></span><b>İlerlemeni izle</b><span>Alan bazlı güçlü ve zayıf yönlerin.</span></div>
      </div>
      <button className="btn purple" type="button" onClick={onAssessment}>Değerlendirmeye gir <IconArrowRight width={16} height={16} /></button>
    </div>
  )
}
