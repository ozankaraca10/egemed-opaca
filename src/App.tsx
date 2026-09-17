import { useEffect } from 'react'
import { StoreProvider, useStore } from './core/store'
import { engine } from './audio/engineSingleton'
import { ALL_CASES } from './data/pool'
import { validateCase } from './core/validation'
import { RECORDS } from './core/resolver'
import pointsData from './data/auscultation-points.json'
import { Header } from './ui/chrome'
import { StartScreen } from './screens/StartScreen'
import { ModeSelectScreen } from './screens/ModeSelectScreen'
import { TutorialScreen } from './screens/TutorialScreen'
import { LearnScreen } from './screens/LearnScreen'
import { SimulationScreen } from './screens/SimulationScreen'
import { ResultsScreen } from './screens/ResultsScreen'
import { SourcesScreen } from './screens/SourcesScreen'
import { DevPanel } from './screens/DevPanel'

/** madde 7: doküman ekranları sayfa düzeyinde kaydırılır (footer içeriğin sonunda akar);
 *  uygulama ekranları (learn/simulation) 100dvh kaydırmasız kalır. */
const DOC_SCREENS = new Set(['start', 'modes', 'tutorial', 'results', 'sources'])

const pointIds = (pointsData.points as { id: string }[]).map((p) => p.id)
const soundKeys = new Set(RECORDS.map((r) => `${r.category}.${r.acousticFinding}`))

// build sırasında malformed vakalar reddedilir (§36, §19) — geliştirmede konsola uyarı
const validationIssues = ALL_CASES.flatMap((c) => validateCase(c, pointIds, soundKeys))
if (import.meta.env.DEV) {
  const errors = validationIssues.filter((i) => i.severity === 'error')
  if (errors.length) console.error('[Ausculta] vaka doğrulama hataları:', errors)
}

function Shell() {
  const { state, dispatch } = useStore()
  // ekran değişiminde önceki ekrandan kalan sesi durdur
  useEffect(() => {
    engine.stop()
  }, [state.screen])
  // wave 3: SPA gezinmesi sayfa yenilemez — önceki ekrandan kalan kaydırma konumu taşınırsa
  // mobilde (≤1080, sayfa düzeyinde kaydırma) position:sticky ögeleri (header, kütüphane
  // şeridi, toolbar) yanlış/negatif konumda "sıkışmış" görünüyordu. Her ekran değişiminde tepeye dön.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [state.screen])
  // öğretici: ilk kullanımda göster (§45)
  useEffect(() => {
    if (state.screen === 'modes' && !state.tutorialDone && !state.tutorialSeen) dispatch({ type: 'goto', screen: 'tutorial' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen, state.tutorialDone, state.tutorialSeen])

  return (
    <div className={`app-shell${DOC_SCREENS.has(state.screen) ? ' app-shell--doc' : ''}`}>
      <Header />
      <main className="app-content">
        {state.screen === 'start' && <StartScreen />}
        {state.screen === 'modes' && <ModeSelectScreen />}
        {state.screen === 'tutorial' && <TutorialScreen />}
        {state.screen === 'learn' && <LearnScreen />}
        {state.screen === 'simulation' && <SimulationScreen />}
        {state.screen === 'results' && <ResultsScreen />}
        {state.screen === 'sources' && <SourcesScreen />}
      </main>
      <DevPanel />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider cases={ALL_CASES}>
      <Shell />
    </StoreProvider>
  )
}
