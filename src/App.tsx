import { useEffect } from 'react'
import { StoreProvider, useStore } from './core/store'
import { ALL_CASES } from './data/pool'
import { validateCase } from './core/validation'
import { getImage } from './core/images'
import { ZONE_IDS } from './data/zones'
import { FINDINGS } from './data/terminology'
import { Header } from './ui/chrome'
import { StartScreen } from './screens/StartScreen'
import { ModeSelectScreen } from './screens/ModeSelectScreen'
import { TutorialScreen } from './screens/TutorialScreen'
import { LearnScreen } from './screens/LearnScreen'
import { SimulationScreen } from './screens/SimulationScreen'
import { ResultsScreen } from './screens/ResultsScreen'
import { SourcesScreen } from './screens/SourcesScreen'
import { DevPanel } from './screens/DevPanel'
import { AchievementsScreen } from './screens/AchievementsScreen'
import { LeaderboardScreen } from './screens/LeaderboardScreen'
import { GAMI_ENABLED } from './gamification/flag'

/** Doküman ekranları sayfa düzeyinde kaydırılır; çalışma ekranları (learn/simulation) 100dvh kalır. */
const DOC_SCREENS = new Set(['start', 'modes', 'tutorial', 'results', 'sources', 'achievements', 'leaderboard'])

if (import.meta.env.DEV) {
  const findingIds = new Set(Object.keys(FINDINGS))
  const errors = ALL_CASES.flatMap((c) => validateCase(c, ZONE_IDS, getImage, findingIds)).filter((i) => i.severity === 'error')
  if (errors.length) console.error('[Opaca] vaka doğrulama hataları:', errors)
}

function Shell() {
  const { state, dispatch } = useStore()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [state.screen])
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
        {GAMI_ENABLED && state.screen === 'achievements' && <AchievementsScreen />}
        {GAMI_ENABLED && state.screen === 'leaderboard' && <LeaderboardScreen />}
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
