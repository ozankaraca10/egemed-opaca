import { useStore } from '../core/store'
import { Footer, EcgDeco } from '../ui/chrome'
import { IconGraduation, IconFilm, IconChart, IconCheck, IconGift } from '../ui/icons'
import type { Mode } from '../core/types'
import { poolFor } from '../data/pool'
import { LIBRARY_ITEMS } from '../data/terminology'
import { sampleSession, SESSION_SIZE } from '../core/session'
import { GAMI_ENABLED } from '../gamification/flag'
import { daysLeft } from '../gamification/leaderboardView'

/** Mod seçim ekranı: Öğrenme / Uygulama / Değerlendirme. */
export function ModeSelectScreen() {
  const { state, dispatch } = useStore()
  const practiceCount = poolFor('practice').length
  const assessmentCount = poolFor('assessment').length
  const pick = (mode: Mode) => {
    if (mode !== 'learn') {
      const seed = (Date.now() % 2147483647) | 0
      dispatch({
        type: 'startSession',
        practiceIds: sampleSession(poolFor('practice'), seed, SESSION_SIZE),
        assessmentIds: sampleSession(poolFor('assessment'), seed + 1, SESSION_SIZE),
        seed,
      })
    }
    dispatch({ type: 'startMode', mode })
    if (mode === 'learn') dispatch({ type: 'goto', screen: 'learn' })
  }
  return (
    <>
      <EcgDeco />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container screen-body">
          <Stepper active={1} labels={['Mod seçimi', 'Çalışma', 'Tamamla']} />
          <h1 className="mode-title">Çalışma modunu seçin</h1>
          <p className="mode-sub">Önce öğrenme modunda okuma sırasını oturtmanız önerilir.</p>
          <div className="mode-cards">
            <ModeCard
              kind="learn"
              icon={<IconGraduation />}
              title="Öğrenme Modu"
              text={`${LIBRARY_ITEMS.length} konuyu örnek filmler, okuma bölgeleri ve uzman işaretlemeleriyle inceleyin.`}
              items={['ABCDE okuma rehberi', 'Uzman işaretlemesi açılıp kapanır', 'Süre ve puan yok']}
              cta="Öğrenmeye başla"
              onPick={() => pick('learn')}
            />
            <ModeCard
              kind="practice"
              icon={<IconFilm />}
              title="Uygulama Modu"
              text={practiceCount ? `${practiceCount} vakalık havuzdan her oturumda rastgele ${Math.min(SESSION_SIZE, practiceCount)} vaka; ipucu ve geri bildirimle.` : 'Uygulama havuzu boş: önce veri setini içe aktarın.'}
              items={['Görüntü üzerinde işaretleme', 'İpucu desteği', 'Yanıttan sonra uzman işaretlemesi']}
              cta="Vakaları çöz"
              disabled={!practiceCount}
              onPick={() => pick('practice')}
              bestScore={state.bestScore.practice}
            />
            <ModeCard
              kind="assessment"
              icon={<IconChart />}
              title="Değerlendirme Modu"
              text={assessmentCount ? `${assessmentCount} radyolog etiketli vakalık havuzdan rastgele ${Math.min(SESSION_SIZE, assessmentCount)} vaka.` : 'Değerlendirme havuzu boş: radyolog etiketli veri seti içe aktarılmalı.'}
              items={['Okuma bölgesi ve uzman katmanı yok', 'Vaka başına süre sınırı', 'SCORM puanı']}
              rules="İpucu yok · geri bildirim yalnız sonunda · puan LMS'e yazılır"
              cta="Değerlendirmeye gir"
              disabled={!assessmentCount}
              onPick={() => pick('assessment')}
              bestScore={state.bestScore.assessment}
              extra={GAMI_ENABLED ? (
                <p className="mode-rules">
                  <button type="button" className="gami-link" style={{ color: 'var(--amber-700)' }} onClick={() => dispatch({ type: 'goto', screen: 'leaderboard' })}>
                    <IconGift width={14} height={14} /> Bu ayın ödülü · {daysLeft(new Date())} gün kaldı
                  </button>
                </p>
              ) : undefined}
            />
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}

export function Stepper({ active, labels }: { active: number; labels: string[] }) {
  return (
    <div className="stepper" aria-label="İlerleme">
      {labels.map((l, i) => (
        <div key={l} className={`step ${i + 1 === active ? 'active' : i + 1 < active ? 'done' : ''}`}>
          {i > 0 && <span className="line" />}
          <span className="dot">{i + 1 < active ? '✓' : i + 1}</span>
          <span className="lbl">{l}</span>
        </div>
      ))}
    </div>
  )
}

function ModeCard({ kind, icon, title, text, items, cta, onPick, rules, disabled, bestScore, extra }: {
  kind: Mode
  icon: React.ReactNode
  title: string
  text: string
  items: string[]
  cta: string
  onPick: () => void
  rules?: string
  /** Oyunlaştırma bayrağı açıkken ek satır (ör. ayın ödülü); kapalıyken verilmez. */
  extra?: React.ReactNode
  disabled?: boolean
  /** yalnız Uygulama/Değerlendirme kartlarında: mod başına kalıcı en iyi toplam puan (0 = henüz denenmedi) */
  bestScore?: number
}) {
  return (
    <div className={`mode-card ${kind}`}>
      <div className="ic">{icon}</div>
      <h3>{title}</h3>
      <p className="desc">{text}</p>
      <ul>
        {items.map((i) => (
          <li key={i}>
            <span className="ck"><IconCheck /></span>
            {i}
          </li>
        ))}
      </ul>
      {rules && <p className="mode-rules">{rules}</p>}
      {extra}
      {typeof bestScore === 'number' && (
        <p className="mode-rules">
          {bestScore > 0 ? <>En iyi puan: <b>{bestScore}</b></> : 'Henüz denenmedi'}
        </p>
      )}
      <button className={`btn ${kind === 'learn' ? 'green' : kind === 'assessment' ? 'purple' : 'primary'}`} onClick={onPick} disabled={disabled}>
        {cta}
      </button>
    </div>
  )
}
