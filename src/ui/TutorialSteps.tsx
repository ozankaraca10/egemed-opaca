/** Yardım modalı ve öğretici ekranının ortak adım listesi. */
export const TUTORIAL_STEPS = [
  { n: 1, title: 'Filmi yakınlaştırın', desc: 'Fare tekerleği, + / − düğmeleri ya da klavyedeki + ve − tuşlarıyla yakınlaştırın; sürükleyerek kaydırın, çift tıklayarak sığdırın.' },
  { n: 2, title: 'Pencereyi ayarlayın', desc: 'Akciğer, mediasten ve kemik pencereleri ya da parlaklık/kontrast ile aradığınız yapıyı belirginleştirin.' },
  { n: 3, title: 'ABCDE sırasıyla okuyun', desc: 'İmleci sırasıyla hava yolu, akciğerler, kalp, diyafram ve kemikler üzerinde gezdirin; incelenen bölgeler listede işaretlenir.' },
  { n: 4, title: 'Bulguyu işaretleyin', desc: 'Lokalizasyon sorularında İşaretle aracıyla bulgunun üzerine tıklayın; işareti değiştirmek için yeniden tıklayın.' },
  { n: 5, title: 'Ölçün ve karşılaştırın', desc: 'Ölç aracıyla iki çizgi çizin; kalp ve toraks genişliği için oran otomatik hesaplanır.' },
  { n: 6, title: 'Yorumlayın', desc: 'Soruları yanıtlayın; uygulama modunda her yanıttan sonra geri bildirim ve uzman işaretlemesi gösterilir.' },
] as const

export function TutorialSteps() {
  return (
    <div className="tut-steps">
      {TUTORIAL_STEPS.map((s) => (
        <div className="tut-step" key={s.n}>
          <span className="num">{s.n}</span>
          <div>
            <h5>{s.title}</h5>
            <p>{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
