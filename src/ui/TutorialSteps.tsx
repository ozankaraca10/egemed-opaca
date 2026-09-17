import { IconDrag, IconBell, IconDiaphragm, IconVolume, IconCompare, IconDoc, IconTarget } from './icons'

/** madde 6 (wave 2): öğretici adım listesi — hem TutorialScreen (tam ekran) hem de
 *  Header'daki Yardım modalında (TutorialModal) aynı bileşen kullanılır; içerik tekilleşir. */
export const TUTORIAL_STEPS = [
  { n: 1, title: 'Stetoskopu sürükleyin', desc: 'Ekrandaki stetoskopu tıklayıp sürükleyerek hareket ettirin.', icon: 'drag' },
  { n: 2, title: 'Oskültasyon alanını bulun', desc: 'Hastanın göğsü üzerindeki işaretli oskültasyon alanlarından birine stetoskopu yerleştirin.', icon: 'target' },
  { n: 3, title: 'Bell veya Diyaframı seçin', desc: 'Oskültasyon yapmak için stetoskopun bell veya diyafram tarafını seçin.', icon: 'heads' },
  { n: 4, title: 'Sesi dinleyin', desc: 'Gerçek klinik kayıtlardan elde edilmiş oskültasyon sesini dinleyin.', icon: 'vol' },
  { n: 5, title: 'Karşılaştırın', desc: 'Sesi normal ve patolojik örneklerle karşılaştırarak farklı bölgeleri inceleyin.', icon: 'compare' },
  { n: 6, title: 'Yorumlayın', desc: 'Duyduğunuz sese göre klinik bulguları değerlendirip yorumunuzu yapın.', icon: 'doc' },
] as const

function StepIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'drag': return <IconDrag width={20} height={20} />
    case 'target': return <IconTarget width={20} height={20} />
    case 'heads':
      return (
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <IconBell width={16} height={16} />
          <IconDiaphragm width={16} height={16} />
        </span>
      )
    case 'vol': return <IconVolume width={20} height={20} />
    case 'compare': return <IconCompare width={20} height={20} />
    default: return <IconDoc width={20} height={20} />
  }
}

export function TutorialSteps() {
  return (
    <div className="tut-steps">
      {TUTORIAL_STEPS.map((s) => (
        <div className="tut-step" key={s.n}>
          <span className="num">{s.n}</span>
          <span className="ic"><StepIcon kind={s.icon} /></span>
          <div>
            <h5>{s.title}</h5>
            <p>{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
